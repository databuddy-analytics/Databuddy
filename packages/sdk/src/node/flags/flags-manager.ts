// Node.js server-side feature flags manager
import type { Logger } from "../logger";
import { createLogger, createNoopLogger } from "../logger";
import type {
	BulkFlagResponse,
	CacheEntry,
	FlagEvaluationContext,
	NodeFlagResult,
	NodeFlagsConfig,
	NodeFlagsManager,
} from "./types";

export class ServerFlagsManager implements NodeFlagsManager {
	private config: Required<NodeFlagsConfig>;
	private logger: Logger;
	private memoryCache: Map<string, CacheEntry<NodeFlagResult>> = new Map();
	private bulkCache: CacheEntry<BulkFlagResponse> | null = null;
	private refreshTimer: NodeJS.Timeout | null = null;

	constructor(config: NodeFlagsConfig) {
		this.config = this.withDefaults(config);
		this.logger = config.debug ? createLogger(true) : createNoopLogger();

		this.logger.info("ServerFlagsManager initialized", {
			clientId: this.config.clientId,
			environment: this.config.environment,
			cacheTtl: this.config.cacheTtl,
			autoRefresh: this.config.enableAutoRefresh,
		});

		if (this.config.enableAutoRefresh) {
			this.startAutoRefresh();
		}
	}

	private withDefaults(config: NodeFlagsConfig): Required<NodeFlagsConfig> {
		return {
			clientId: config.clientId,
			apiUrl: config.apiUrl ?? "https://api.databuddy.cc",
			user: config.user,
			environment: config.environment ?? "production",
			debug: config.debug ?? false,
			cacheTtl: config.cacheTtl ?? 60000, // 1 minute default
			enableAutoRefresh: config.enableAutoRefresh ?? false,
			refreshInterval: config.refreshInterval ?? 60000,
			cacheStrategy: config.cacheStrategy ?? "memory",
			redis: config.redis,
		};
	}

	private startAutoRefresh(): void {
		this.refreshTimer = setInterval(() => {
			this.refresh().catch((err) => {
				this.logger.error("Auto-refresh failed", err);
			});
		}, this.config.refreshInterval);
	}

	async getFlag(
		key: string,
		context?: FlagEvaluationContext
	): Promise<NodeFlagResult> {
		this.logger.debug("Getting flag", { key, context });

		// Check memory cache first
		if (this.config.cacheStrategy !== "none") {
			const cached = this.getCachedFlag(key);
			if (cached) {
				this.logger.debug("Flag from cache", { key });
				return cached;
			}
		}

		// Fetch from API
		return this.fetchFlag(key, context);
	}

	async getAllFlags(context?: FlagEvaluationContext): Promise<BulkFlagResponse> {
		this.logger.debug("Getting all flags", { context });

		// Check bulk cache first
		if (this.config.cacheStrategy !== "none" && this.bulkCache) {
			if (Date.now() < this.bulkCache.expiresAt) {
				this.logger.debug("Bulk flags from cache");
				return {
					...this.bulkCache.value,
					cached: true,
					cachedAt: this.bulkCache.createdAt,
				};
			}
		}

		// Fetch all flags from API
		return this.fetchAllFlags(context);
	}

	async isEnabled(
		key: string,
		context?: FlagEvaluationContext
	): Promise<boolean> {
		const flag = await this.getFlag(key, context);
		return flag.enabled;
	}

	async getVariant<T = any>(
		key: string,
		context?: FlagEvaluationContext
	): Promise<T | null> {
		const flag = await this.getFlag(key, context);
		return flag.enabled ? (flag.value as T) : null;
	}

	async refresh(): Promise<void> {
		this.logger.debug("Refreshing flags cache");
		this.clearCache();
		// Optionally pre-fetch all flags
		try {
			await this.fetchAllFlags();
		} catch (err) {
			this.logger.error("Refresh failed", err);
		}
	}

	clearCache(): void {
		this.memoryCache.clear();
		this.bulkCache = null;
		this.logger.debug("Cache cleared");
	}

	async shutdown(): Promise<void> {
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer);
			this.refreshTimer = null;
		}
		this.clearCache();
		this.logger.info("ServerFlagsManager shut down");
	}

	private getCachedFlag(key: string): NodeFlagResult | null {
		const entry = this.memoryCache.get(key);
		if (!entry) {
			return null;
		}

		if (Date.now() >= entry.expiresAt) {
			this.memoryCache.delete(key);
			return null;
		}

		return entry.value;
	}

	private setCachedFlag(key: string, value: NodeFlagResult): void {
		const entry: CacheEntry<NodeFlagResult> = {
			value,
			expiresAt: Date.now() + this.config.cacheTtl,
			createdAt: Date.now(),
		};
		this.memoryCache.set(key, entry);
	}

	private async fetchFlag(
		key: string,
		context?: FlagEvaluationContext
	): Promise<NodeFlagResult> {
		const params = this.buildQueryParams(key, context);
		const url = `${this.config.apiUrl}/public/v1/flags/evaluate?${params}`;

		this.logger.debug("Fetching flag from API", { key, url });

		try {
			const response = await fetch(url, {
				headers: {
					"Content-Type": "application/json",
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const result: NodeFlagResult = await response.json();

			// Cache the result
			if (this.config.cacheStrategy !== "none") {
				this.setCachedFlag(key, result);
			}

			return result;
		} catch (err) {
			this.logger.error("Flag fetch failed", { key, err });
			// Return fallback
			return {
				enabled: false,
				value: false,
				reason: "ERROR",
				payload: null,
			};
		}
	}

	private async fetchAllFlags(
		context?: FlagEvaluationContext
	): Promise<BulkFlagResponse> {
		const params = this.buildQueryParams(undefined, context);
		const url = `${this.config.apiUrl}/public/v1/flags/bulk?${params}`;

		this.logger.debug("Fetching all flags from API", { url });

		try {
			const response = await fetch(url, {
				headers: {
					"Content-Type": "application/json",
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const result: BulkFlagResponse = await response.json();

			// Cache all individual flags
			if (this.config.cacheStrategy !== "none" && result.flags) {
				for (const [key, flag] of Object.entries(result.flags)) {
					this.setCachedFlag(key, flag);
				}

				// Cache bulk response
				this.bulkCache = {
					value: result,
					expiresAt: Date.now() + this.config.cacheTtl,
					createdAt: Date.now(),
				};
			}

			return result;
		} catch (err) {
			this.logger.error("Bulk flags fetch failed", { err });
			return { flags: {} };
		}
	}

	private buildQueryParams(
		key?: string,
		context?: FlagEvaluationContext
	): URLSearchParams {
		const params = new URLSearchParams();

		if (key) {
			params.set("key", key);
		}

		params.set("clientId", this.config.clientId);
		params.set("environment", context?.environment ?? this.config.environment);

		const userId = context?.userId ?? this.config.user?.userId;
		if (userId) {
			params.set("userId", userId);
		}

		const email = context?.email ?? this.config.user?.email;
		if (email) {
			params.set("email", email);
		}

		const properties = {
			...this.config.user?.properties,
			...context?.properties,
		};
		if (Object.keys(properties).length > 0) {
			params.set("properties", JSON.stringify(properties));
		}

		return params;
	}
}

/**
 * Create a new server-side flags manager
 * @param config Configuration options
 * @returns Flags manager instance
 * @example
 * ```typescript
 * const flags = createFlagsManager({
 *   clientId: 'your-client-id',
 *   environment: 'production',
 *   cacheTtl: 60000, // 1 minute
 *   enableAutoRefresh: true
 * });
 *
 * // In Next.js server component
 * const isEnabled = await flags.isEnabled('new-feature');
 *
 * // In API route
 * const variant = await flags.getVariant('pricing-tier');
 * ```
 */
export function createFlagsManager(
	config: NodeFlagsConfig
): NodeFlagsManager {
	return new ServerFlagsManager(config);
}
