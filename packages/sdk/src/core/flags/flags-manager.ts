import { logger } from "@/logger";
import {
	buildQueryParams,
	type CacheEntry,
	createCacheEntry,
	DEFAULT_RESULT,
	fetchAllFlags as fetchAllFlagsApi,
	getCacheKey,
	isCacheStale,
	isCacheValid,
	RequestBatcher,
} from "./shared";
import type {
	FlagResult,
	FlagState,
	FlagsConfig,
	FlagsManager,
	FlagsManagerOptions,
	StorageInterface,
	UserContext,
} from "./types";

/**
 * Core flags manager - lightweight API client with best practices:
 * - Stale-while-revalidate caching
 * - Request batching (multiple flags → single request)
 * - Request deduplication
 * - Visibility API awareness (pause when hidden)
 * - Optimistic storage hydration
 */
export class CoreFlagsManager implements FlagsManager {
	private config: FlagsConfig;
	private readonly storage?: StorageInterface;
	private readonly onFlagsUpdate?: (flags: Record<string, FlagResult>) => void;
	private readonly onConfigUpdate?: (config: FlagsConfig) => void;
	private readonly onReady?: () => void;

	/** In-memory cache with stale tracking */
	private readonly cache = new Map<string, CacheEntry>();

	/** In-flight requests for deduplication */
	private readonly inFlight = new Map<string, Promise<FlagResult>>();

	/** Request batcher for batching multiple flag requests */
	private batcher: RequestBatcher | null = null;

	/** Ready state */
	private ready = false;

	/** Visibility state */
	private isVisible = true;

	/** Visibility listener cleanup */
	private visibilityCleanup?: () => void;

	constructor(options: FlagsManagerOptions) {
		this.config = this.withDefaults(options.config);
		this.storage = options.storage;
		this.onFlagsUpdate = options.onFlagsUpdate;
		this.onConfigUpdate = options.onConfigUpdate;
		this.onReady = options.onReady;

		logger.setDebug(this.config.debug ?? false);
		logger.debug("FlagsManager initialized", {
			clientId: this.config.clientId,
			hasUser: Boolean(this.config.user),
		});

		this.setupVisibilityListener();
		this.initialize();
	}

	private withDefaults(config: FlagsConfig): FlagsConfig {
		return {
			clientId: config.clientId,
			apiUrl: config.apiUrl ?? "https://api.databuddy.cc",
			user: config.user,
			disabled: config.disabled ?? false,
			debug: config.debug ?? false,
			skipStorage: config.skipStorage ?? false,
			isPending: config.isPending,
			autoFetch: config.autoFetch !== false,
			environment: config.environment,
			cacheTtl: config.cacheTtl ?? 60_000, // 1 minute
			staleTime: config.staleTime ?? 30_000, // 30 seconds - revalidate after this
		};
	}

	private setupVisibilityListener(): void {
		if (typeof document === "undefined") {
			return;
		}

		const handleVisibility = (): void => {
			this.isVisible = document.visibilityState === "visible";

			// Revalidate stale entries when becoming visible
			if (this.isVisible) {
				this.revalidateStale();
			}
		};

		document.addEventListener("visibilitychange", handleVisibility);
		this.visibilityCleanup = () => {
			document.removeEventListener("visibilitychange", handleVisibility);
		};
	}

	private removeStaleKeys(validCacheKeys: Set<string>): void {
		for (const key of this.cache.keys()) {
			if (!validCacheKeys.has(key)) {
				this.cache.delete(key);
			}
		}
	}

	private async initialize(): Promise<void> {
		// Load from persistent storage first (instant hydration)
		if (!this.config.skipStorage && this.storage) {
			this.loadFromStorage();
		}

		// Auto-fetch if enabled and not pending
		if (this.config.autoFetch && !this.config.isPending) {
			await this.fetchAllFlags();
		}

		this.ready = true;
		this.onReady?.();
	}

	private loadFromStorage(): void {
		if (!this.storage) {
			return;
		}

		try {
			const stored = this.storage.getAll();
			const ttl = this.config.cacheTtl ?? 60_000;
			const staleTime = this.config.staleTime ?? ttl / 2;

			for (const [key, value] of Object.entries(stored)) {
				if (value && typeof value === "object") {
					this.cache.set(
						key,
						createCacheEntry(value as FlagResult, ttl, staleTime)
					);
				}
			}

			if (this.cache.size > 0) {
				logger.debug(`Loaded ${this.cache.size} flags from storage`);
				this.notifyUpdate();
			}
		} catch (err) {
			logger.warn("Failed to load from storage:", err);
		}
	}

	private saveToStorage(): void {
		if (!this.storage || this.config.skipStorage) {
			return;
		}

		try {
			const flags: Record<string, FlagResult> = {};
			for (const [key, entry] of this.cache) {
				flags[key] = entry.result;
			}
			this.storage.setAll(flags);
		} catch (err) {
			logger.warn("Failed to save to storage:", err);
		}
	}

	private getFromCache(key: string): CacheEntry | null {
		const cached = this.cache.get(key);
		if (isCacheValid(cached)) {
			return cached;
		}
		if (cached) {
			this.cache.delete(key);
		}
		return null;
	}

	private getBatcher(): RequestBatcher {
		if (!this.batcher) {
			const apiUrl = this.config.apiUrl ?? "https://api.databuddy.cc";
			const params = buildQueryParams(this.config);
			this.batcher = new RequestBatcher(apiUrl, params);
		}
		return this.batcher;
	}

	/**
	 * Revalidate stale entries in background
	 */
	private revalidateStale(): void {
		const staleKeys: string[] = [];

		for (const [key, entry] of this.cache) {
			if (isCacheStale(entry)) {
				staleKeys.push(key.split(":")[0]); // Get original flag key
			}
		}

		if (staleKeys.length > 0) {
			logger.debug(`Revalidating ${staleKeys.length} stale flags`);
			this.fetchAllFlags().catch((err) =>
				logger.error("Revalidation error:", err)
			);
		}
	}

	/**
	 * Fetch a single flag from API with deduplication and batching
	 */
	async getFlag(key: string, user?: UserContext): Promise<FlagResult> {
		if (this.config.disabled) {
			return DEFAULT_RESULT;
		}

		if (this.config.isPending) {
			return { ...DEFAULT_RESULT, reason: "SESSION_PENDING" };
		}

		const cacheKey = getCacheKey(key, user ?? this.config.user);

		// Check cache first - stale-while-revalidate
		const cached = this.getFromCache(cacheKey);
		if (cached) {
			// Return immediately, but revalidate if stale
			if (isCacheStale(cached) && this.isVisible) {
				this.revalidateFlag(key, cacheKey);
			}
			return cached.result;
		}

		// Deduplicate in-flight requests
		const existing = this.inFlight.get(cacheKey);
		if (existing) {
			logger.debug(`Deduplicating request: ${key}`);
			return existing;
		}

		// Use batcher for efficient batching of multiple simultaneous requests
		const promise = this.getBatcher().request(key);
		this.inFlight.set(cacheKey, promise);

		try {
			const result = await promise;
			const ttl = this.config.cacheTtl ?? 60_000;
			const staleTime = this.config.staleTime ?? ttl / 2;
			this.cache.set(cacheKey, createCacheEntry(result, ttl, staleTime));
			this.notifyUpdate();
			this.saveToStorage();
			return result;
		} finally {
			this.inFlight.delete(cacheKey);
		}
	}

	private async revalidateFlag(key: string, cacheKey: string): Promise<void> {
		// Skip if already in-flight
		if (this.inFlight.has(cacheKey)) {
			return;
		}

		const promise = this.getBatcher().request(key);
		this.inFlight.set(cacheKey, promise);

		try {
			const result = await promise;
			const ttl = this.config.cacheTtl ?? 60_000;
			const staleTime = this.config.staleTime ?? ttl / 2;
			this.cache.set(cacheKey, createCacheEntry(result, ttl, staleTime));
			this.notifyUpdate();
			this.saveToStorage();
			logger.debug(`Revalidated flag: ${key}`);
		} catch (err) {
			logger.error(`Revalidation error: ${key}`, err);
		} finally {
			this.inFlight.delete(cacheKey);
		}
	}

	/**
	 * Fetch all flags for current user
	 */
	async fetchAllFlags(user?: UserContext): Promise<void> {
		if (this.config.disabled || this.config.isPending) {
			return;
		}

		// Skip if not visible (battery/bandwidth saving)
		if (!this.isVisible && this.cache.size > 0) {
			logger.debug("Skipping fetch - tab hidden");
			return;
		}

		const apiUrl = this.config.apiUrl ?? "https://api.databuddy.cc";
		const params = buildQueryParams(this.config, user);

		const ttl = this.config.cacheTtl ?? 60_000;
		const staleTime = this.config.staleTime ?? ttl / 2;

		try {
			const flags = await fetchAllFlagsApi(apiUrl, params);
			const flagCacheEntries = Object.entries(flags).map(([key, result]) => ({
				cacheKey: getCacheKey(key, user ?? this.config.user),
				cacheEntry: createCacheEntry(result, ttl, staleTime),
			}));

			this.removeStaleKeys(
				new Set(flagCacheEntries.map(({ cacheKey }) => cacheKey))
			);

			for (const { cacheKey, cacheEntry } of flagCacheEntries) {
				this.cache.set(cacheKey, cacheEntry);
			}

			this.ready = true;
			this.notifyUpdate();
			this.saveToStorage();

			logger.debug(`Fetched ${Object.keys(flags).length} flags`);
		} catch (err) {
			logger.error("Bulk fetch error:", err);
		}
	}

	/**
	 * Check if flag is enabled (synchronous, returns cached value)
	 * Uses stale-while-revalidate pattern
	 */
	isEnabled(key: string): FlagState {
		const cacheKey = getCacheKey(key, this.config.user);
		const cached = this.getFromCache(cacheKey);

		if (cached) {
			// Trigger background revalidation if stale
			if (isCacheStale(cached) && this.isVisible) {
				this.revalidateFlag(key, cacheKey);
			}

			return {
				on: cached.result.enabled,
				enabled: cached.result.enabled,
				status: cached.result.reason === "ERROR" ? "error" : "ready",
				loading: false,
				isLoading: false,
				isReady: true,
				value: cached.result.value,
				variant: cached.result.variant,
			};
		}

		// Check if request is in flight
		if (this.inFlight.has(cacheKey)) {
			return {
				on: false,
				enabled: false,
				status: "loading",
				loading: true,
				isLoading: true,
				isReady: false,
			};
		}

		// Trigger background fetch
		this.getFlag(key).catch((err) =>
			logger.error(`Background fetch error: ${key}`, err)
		);

		return {
			on: false,
			enabled: false,
			status: "loading",
			loading: true,
			isLoading: true,
			isReady: false,
		};
	}

	/**
	 * Get flag value with type (synchronous, returns cached or default)
	 */
	getValue<T = boolean | string | number>(key: string, defaultValue?: T): T {
		const cacheKey = getCacheKey(key, this.config.user);
		const cached = this.getFromCache(cacheKey);

		if (cached) {
			// Trigger background revalidation if stale
			if (isCacheStale(cached) && this.isVisible) {
				this.revalidateFlag(key, cacheKey);
			}
			return cached.result.value as T;
		}

		// Trigger background fetch
		if (!this.inFlight.has(cacheKey)) {
			this.getFlag(key).catch((err) =>
				logger.error(`Background fetch error: ${key}`, err)
			);
		}

		return (defaultValue ?? false) as T;
	}

	/**
	 * Update user context and refresh flags
	 */
	updateUser(user: UserContext): void {
		this.config = { ...this.config, user };

		// Recreate batcher with new user params
		this.batcher?.destroy();
		this.batcher = null;

		this.onConfigUpdate?.(this.config);
		this.refresh().catch((err) => logger.error("Refresh error:", err));
	}

	/**
	 * Refresh all flags
	 */
	async refresh(forceClear = false): Promise<void> {
		if (forceClear) {
			this.cache.clear();
			this.storage?.clear();
			this.notifyUpdate();
		}

		await this.fetchAllFlags();
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: FlagsConfig): void {
		const wasDisabled = this.config.disabled;
		const wasPending = this.config.isPending;

		this.config = this.withDefaults(config);

		// Recreate batcher with new config
		this.batcher?.destroy();
		this.batcher = null;

		this.onConfigUpdate?.(this.config);

		// Fetch if we went from disabled/pending to enabled
		if (
			(wasDisabled || wasPending) &&
			!this.config.disabled &&
			!this.config.isPending
		) {
			this.fetchAllFlags().catch((err) => logger.error("Fetch error:", err));
		}
	}

	/**
	 * Get all cached flags
	 */
	getMemoryFlags(): Record<string, FlagResult> {
		const flags: Record<string, FlagResult> = {};
		for (const [key, entry] of this.cache) {
			// Extract just the flag key (remove user suffix)
			const flagKey = key.split(":")[0];
			flags[flagKey] = entry.result;
		}
		return flags;
	}

	/**
	 * Check if manager is ready
	 */
	isReady(): boolean {
		return this.ready;
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		this.batcher?.destroy();
		this.visibilityCleanup?.();
		this.cache.clear();
		this.inFlight.clear();
	}

	private notifyUpdate(): void {
		this.onFlagsUpdate?.(this.getMemoryFlags());
	}
}
