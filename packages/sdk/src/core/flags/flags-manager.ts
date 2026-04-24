import { logger } from "@/logger";
import {
	buildQueryParams,
	DEFAULT_RESULT,
	fetchAllFlags as fetchAllFlagsApi,
	getCacheKey,
	RequestBatcher,
} from "./shared";
import type {
	FlagResult,
	FlagsConfig,
	FlagsManager,
	FlagsManagerOptions,
	FlagsSnapshot,
	FlagState,
	StorageInterface,
	UserContext,
} from "./types";

const ANON_ID_KEY = "did";
const OVERRIDES_KEY = "databuddy:flag-overrides:v1";
const DEFAULT_API = "https://api.databuddy.cc";

interface CacheEntry {
	expiresAt: number;
	promise: Promise<FlagResult>;
	result: FlagResult | null;
	staleAt: number;
}

function resolved(
	result: FlagResult,
	ttl: number,
	staleTime: number
): CacheEntry {
	const now = Date.now();
	return {
		promise: Promise.resolve(result),
		result,
		expiresAt: now + ttl,
		staleAt: now + staleTime,
	};
}

function isValid(entry: CacheEntry | undefined): entry is CacheEntry {
	return entry !== undefined && Date.now() <= entry.expiresAt;
}

function isStale(entry: CacheEntry): boolean {
	return Date.now() > entry.staleAt;
}

export abstract class BaseFlagsManager implements FlagsManager {
	protected config: FlagsConfig;
	protected readonly storage?: StorageInterface;

	private readonly cache = new Map<string, CacheEntry>();
	protected readonly overrides = new Map<string, FlagResult>();
	private batcher: RequestBatcher | null = null;
	private ready = false;
	private readonly listeners = new Set<() => void>();
	private snapshot: FlagsSnapshot = { flags: {}, isReady: false };

	constructor(options: FlagsManagerOptions) {
		this.config = {
			apiUrl: DEFAULT_API,
			disabled: false,
			debug: false,
			autoFetch: true,
			cacheTtl: 60_000,
			staleTime: 30_000,
			...options.config,
		};
		this.storage = options.storage;
		logger.setDebug(this.config.debug ?? false);
	}

	protected shouldSkipFetch(): boolean {
		return false;
	}

	protected onCacheUpdated(): void {}

	protected onFlagEvaluated(_key: string, _result: FlagResult): void {}

	protected async runInit(): Promise<void> {
		if (this.storage) {
			this.hydrate();
		}
		if (this.config.autoFetch && !this.config.isPending) {
			await this.fetchAllFlags();
		}
		this.ready = true;
	}

	private hydrate(): void {
		if (!this.storage) {
			return;
		}
		try {
			const stored = this.storage.getAll();
			const { ttl, stale } = this.ttls();
			for (const [key, value] of Object.entries(stored)) {
				if (value && typeof value === "object") {
					this.cache.set(key, resolved(value, ttl, stale));
				}
			}
			if (this.cache.size > 0) {
				this.emit();
			}
		} catch (err) {
			logger.warn("Failed to load from storage:", err);
		}
	}

	protected persist(): void {
		if (!this.storage) {
			return;
		}
		try {
			const flags: Record<string, FlagResult> = {};
			for (const [key, entry] of this.cache) {
				if (entry.result) {
					flags[key] = entry.result;
				}
			}
			this.storage.setAll(flags);
		} catch (err) {
			logger.warn("Failed to save to storage:", err);
		}
	}

	private ttls() {
		const ttl = this.config.cacheTtl ?? 60_000;
		return { ttl, stale: this.config.staleTime ?? ttl / 2 };
	}

	private validEntry(cacheKey: string): CacheEntry | null {
		const entry = this.cache.get(cacheKey);
		if (isValid(entry)) {
			return entry;
		}
		if (entry) {
			this.cache.delete(cacheKey);
		}
		return null;
	}

	private ensureBatcher(): RequestBatcher {
		if (!this.batcher) {
			const params = buildQueryParams(this.config);
			this.batcher = new RequestBatcher(
				this.config.apiUrl ?? DEFAULT_API,
				params,
				this.batchDelay()
			);
		}
		return this.batcher;
	}

	protected batchDelay(): number {
		return 10;
	}

	private pruneStaleKeys(validKeys: Set<string>, user?: UserContext): void {
		const ctx = user ?? this.config.user;
		const suffix =
			ctx?.userId || ctx?.email
				? `:${ctx.userId ?? ""}:${ctx.email ?? ""}`
				: "";

		for (const key of this.cache.keys()) {
			const belongsToUser = suffix ? key.endsWith(suffix) : !key.includes(":");
			if (belongsToUser && !validKeys.has(key)) {
				this.cache.delete(key);
			}
		}
	}

	private revalidate(key: string, cacheKey: string): void {
		const existing = this.cache.get(cacheKey);
		if (existing && !existing.result) {
			return;
		}

		const { ttl, stale } = this.ttls();
		const promise = this.ensureBatcher().request(key);

		this.cache.set(cacheKey, {
			promise,
			result: existing?.result ?? null,
			expiresAt: existing?.expiresAt ?? Date.now() + ttl,
			staleAt: existing?.staleAt ?? Date.now() + stale,
		});

		promise
			.then((result) => {
				this.cache.set(cacheKey, resolved(result, ttl, stale));
				this.emit();
				this.onCacheUpdated();
			})
			.catch((err) => {
				logger.error(`Revalidation error: ${key}`, err);
			});
	}

	async getFlag(key: string, user?: UserContext): Promise<FlagResult> {
		const override = this.overrides.get(key);
		if (override) {
			return override;
		}
		if (this.config.disabled) {
			return DEFAULT_RESULT;
		}
		if (this.config.isPending) {
			return { ...DEFAULT_RESULT, reason: "SESSION_PENDING" };
		}

		const cacheKey = getCacheKey(key, user ?? this.config.user);
		const entry = this.validEntry(cacheKey);

		if (entry) {
			if (isStale(entry) && !this.shouldSkipFetch()) {
				this.revalidate(key, cacheKey);
			}
			return entry.result ?? entry.promise;
		}

		const pending = this.cache.get(cacheKey);
		if (pending) {
			return pending.promise;
		}

		const { ttl, stale } = this.ttls();
		const promise = this.ensureBatcher().request(key);

		this.cache.set(cacheKey, {
			promise,
			result: null,
			expiresAt: Date.now() + ttl,
			staleAt: Date.now() + stale,
		});

		try {
			const result = await promise;
			this.cache.set(cacheKey, resolved(result, ttl, stale));
			this.emit();
			this.onCacheUpdated();
			this.onFlagEvaluated(key, result);
			return result;
		} catch (err) {
			this.cache.delete(cacheKey);
			throw err;
		}
	}

	async fetchAllFlags(
		user?: UserContext,
		options?: { force?: boolean }
	): Promise<void> {
		if (!options?.force && (this.config.disabled || this.config.isPending)) {
			return;
		}
		if (!options?.force && this.shouldSkipFetch() && this.cache.size > 0) {
			return;
		}

		const params = buildQueryParams(this.config, user);
		const { ttl, stale } = this.ttls();

		try {
			const flags = await fetchAllFlagsApi(
				this.config.apiUrl ?? DEFAULT_API,
				params
			);
			const entries = Object.entries(flags).map(([key, result]) => ({
				cacheKey: getCacheKey(key, user ?? this.config.user),
				entry: resolved(result, ttl, stale),
			}));

			this.pruneStaleKeys(
				new Set(entries.map(({ cacheKey }) => cacheKey)),
				user
			);

			for (const { cacheKey, entry } of entries) {
				this.cache.set(cacheKey, entry);
			}

			this.ready = true;
			this.emit();
			this.onCacheUpdated();
		} catch (err) {
			logger.error("Bulk fetch error:", err);
		}
	}

	isEnabled(key: string): FlagState {
		const override = this.overrides.get(key);
		if (override) {
			return {
				on: override.enabled,
				status: "ready",
				loading: false,
				value: override.value,
				variant: override.variant,
			};
		}
		const cacheKey = getCacheKey(key, this.config.user);
		const entry = this.validEntry(cacheKey);

		if (entry?.result) {
			if (isStale(entry) && !this.shouldSkipFetch()) {
				this.revalidate(key, cacheKey);
			}
			return {
				on: entry.result.enabled,
				status: entry.result.reason === "ERROR" ? "error" : "ready",
				loading: false,
				value: entry.result.value,
				variant: entry.result.variant,
			};
		}

		if (!entry) {
			this.getFlag(key).catch((err) =>
				logger.error(`Background fetch error: ${key}`, err)
			);
		}

		return { on: false, status: "loading", loading: true };
	}

	getValue<T = boolean | string | number>(key: string, defaultValue?: T): T {
		const override = this.overrides.get(key);
		if (override) {
			return override.value as T;
		}
		const cacheKey = getCacheKey(key, this.config.user);
		const entry = this.validEntry(cacheKey);

		if (entry?.result) {
			if (isStale(entry) && !this.shouldSkipFetch()) {
				this.revalidate(key, cacheKey);
			}
			return entry.result.value as T;
		}

		if (!entry) {
			this.getFlag(key).catch((err) =>
				logger.error(`Background fetch error: ${key}`, err)
			);
		}

		return (defaultValue ?? this.config.defaults?.[key] ?? false) as T;
	}

	updateUser(user: UserContext): void {
		this.config = { ...this.config, user: this.enrichUser(user) };
		this.resetBatcher();
		this.refresh().catch((err) => logger.error("Refresh error:", err));
	}

	async refresh(
		forceClear = false,
		options?: { force?: boolean }
	): Promise<void> {
		if (forceClear) {
			this.cache.clear();
			this.storage?.clear();
			this.emit();
		}
		await this.fetchAllFlags(undefined, options);
	}

	updateConfig(config: FlagsConfig): void {
		const wasInactive = this.config.disabled || this.config.isPending;
		this.config = { ...this.config, ...config };
		this.resetBatcher();
		this.emit();

		if (wasInactive && !this.config.disabled && !this.config.isPending) {
			this.fetchAllFlags().catch((err) => logger.error("Fetch error:", err));
		}
	}

	getMemoryFlags(): Record<string, FlagResult> {
		const flags: Record<string, FlagResult> = {};
		for (const [key, entry] of this.cache) {
			if (entry.result) {
				flags[key.split(":").at(0) ?? key] = entry.result;
			}
		}
		for (const [key, override] of this.overrides) {
			flags[key] = override;
		}
		return flags;
	}

	setOverride(key: string, override: FlagResult | null): void {
		if (override === null) {
			if (!this.overrides.delete(key)) {
				return;
			}
		} else {
			this.overrides.set(key, { ...override, reason: "OVERRIDE" });
		}
		this.onOverridesChanged();
		this.emit();
	}

	protected onOverridesChanged(): void {}

	getDevtoolsConfig(): {
		apiUrl: string | null;
		autoFetch: boolean;
		cacheSize: number;
		cacheTtl: number | null;
		clientId: string | null;
		defaults: Record<string, boolean | string | number>;
		disabled: boolean;
		environment: string | null;
		isPending: boolean;
		skipStorage: boolean;
		staleTime: number | null;
		user: {
			email: string | null;
			organizationId: string | null;
			teamId: string | null;
			userId: string | null;
		} | null;
	} {
		const user = this.config.user;
		return {
			apiUrl: this.config.apiUrl ?? null,
			autoFetch: this.config.autoFetch ?? true,
			cacheSize: this.cache.size,
			cacheTtl: this.config.cacheTtl ?? null,
			clientId: this.config.clientId ?? null,
			defaults: this.config.defaults ?? {},
			disabled: Boolean(this.config.disabled),
			environment: this.config.environment ?? null,
			isPending: Boolean(this.config.isPending),
			skipStorage: Boolean(this.storage === undefined),
			staleTime: this.config.staleTime ?? null,
			user: user
				? {
						email: user.email ?? null,
						organizationId: user.organizationId ?? null,
						teamId: user.teamId ?? null,
						userId: user.userId ?? null,
					}
				: null,
		};
	}

	isReady(): boolean {
		return this.ready;
	}

	destroy(): void {
		this.batcher?.destroy();
		this.cache.clear();
		this.listeners.clear();
	}

	subscribe = (cb: () => void): (() => void) => {
		this.listeners.add(cb);
		return () => {
			this.listeners.delete(cb);
		};
	};

	getSnapshot = (): FlagsSnapshot => this.snapshot;

	protected enrichUser(user: UserContext): UserContext {
		return user;
	}

	protected emit(): void {
		this.snapshot = { flags: this.getMemoryFlags(), isReady: this.ready };
		for (const listener of this.listeners) {
			listener();
		}
	}

	private resetBatcher(): void {
		this.batcher?.destroy();
		this.batcher = null;
	}

	protected revalidateStale(): void {
		for (const entry of this.cache.values()) {
			if (isStale(entry)) {
				this.fetchAllFlags().catch((err) =>
					logger.error("Revalidation error:", err)
				);
				return;
			}
		}
	}
}

export class BrowserFlagsManager extends BaseFlagsManager {
	private isVisible = true;
	private visibilityCleanup?: () => void;
	private readonly trackedFlags = new Set<string>();

	constructor(options: FlagsManagerOptions) {
		super(options);
		this.config.user = this.enrichUser(this.config.user ?? {});
		this.config.autoFetch = options.config.autoFetch !== false;
		this.loadOverrides();
		this.setupVisibilityListener();
		this.runInit();
	}

	protected override onOverridesChanged(): void {
		if (typeof localStorage === "undefined") {
			return;
		}
		try {
			if (this.overrides.size === 0) {
				localStorage.removeItem(OVERRIDES_KEY);
				return;
			}
			localStorage.setItem(
				OVERRIDES_KEY,
				JSON.stringify(Object.fromEntries(this.overrides))
			);
		} catch {
			// storage blocked
		}
	}

	private loadOverrides(): void {
		if (typeof localStorage === "undefined") {
			return;
		}
		try {
			const raw = localStorage.getItem(OVERRIDES_KEY);
			if (!raw) {
				return;
			}
			const stored = JSON.parse(raw) as Record<string, FlagResult>;
			for (const [k, v] of Object.entries(stored)) {
				this.overrides.set(k, v);
			}
		} catch {
			// ignore corrupt storage
		}
	}

	protected override shouldSkipFetch(): boolean {
		return !this.isVisible;
	}

	protected override onCacheUpdated(): void {
		this.persist();
	}

	protected override onFlagEvaluated(key: string, result: FlagResult): void {
		const dedupeKey = `${key}:${String(result.value)}`;
		if (this.trackedFlags.has(dedupeKey)) {
			return;
		}
		this.trackedFlags.add(dedupeKey);

		try {
			if (typeof window !== "undefined" && (window.databuddy || window.db)) {
				const tracker = window.databuddy ?? window.db;
				tracker?.track?.("$flag_evaluated", {
					flag: key,
					value: result.value,
					variant: result.variant,
					enabled: result.enabled,
				});
			}
		} catch {
			// Tracker may not be available
		}
	}

	protected override enrichUser(user: UserContext): UserContext {
		if (user.userId || user.email) {
			return user;
		}
		const anonId = this.getOrCreateAnonId();
		if (!anonId) {
			return user;
		}
		return { ...user, userId: anonId };
	}

	override updateConfig(config: FlagsConfig): void {
		if (!("user" in config)) {
			super.updateConfig(config);
			return;
		}
		const incoming = config.user;
		const incomingHasIdentity = Boolean(incoming?.userId || incoming?.email);
		const isPending = config.isPending ?? this.config.isPending ?? false;
		const currentIsReal = this.isRealIdentity(this.config.user);
		let resolvedUser: UserContext;
		if (incomingHasIdentity) {
			resolvedUser = this.enrichUser(incoming as UserContext);
		} else if (isPending && currentIsReal) {
			resolvedUser = this.config.user as UserContext;
		} else {
			resolvedUser = this.enrichUser(incoming ?? {});
		}
		super.updateConfig({ ...config, user: resolvedUser });
	}

	private isRealIdentity(user: UserContext | undefined): boolean {
		if (!user) {
			return false;
		}
		if (user.email) {
			return true;
		}
		return Boolean(user.userId && !user.userId.startsWith("anon_"));
	}

	override destroy(): void {
		super.destroy();
		this.visibilityCleanup?.();
		this.trackedFlags.clear();
	}

	private getOrCreateAnonId(): string | null {
		if (typeof localStorage === "undefined") {
			return null;
		}
		try {
			let id = localStorage.getItem(ANON_ID_KEY);
			if (id) {
				return id;
			}
			id = `anon_${crypto.randomUUID()}`;
			localStorage.setItem(ANON_ID_KEY, id);
			return id;
		} catch {
			return null;
		}
	}

	private setupVisibilityListener(): void {
		if (typeof document === "undefined") {
			return;
		}
		const handler = (): void => {
			this.isVisible = document.visibilityState === "visible";
			if (this.isVisible) {
				this.revalidateStale();
			}
		};
		document.addEventListener("visibilitychange", handler);
		this.visibilityCleanup = () => {
			document.removeEventListener("visibilitychange", handler);
		};
	}
}
