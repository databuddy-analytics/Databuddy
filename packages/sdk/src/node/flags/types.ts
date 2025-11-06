// Node.js server-side feature flags types

export type FlagVariantValue = boolean | string | number | object;

export interface FlagVariant {
	/** Variant value (can be boolean, string, number, or object) */
	value: FlagVariantValue;
	/** Distribution percentage (0-100) */
	weight?: number;
	/** Variant name/identifier */
	name?: string;
}

export interface FlagDependency {
	/** Flag key that this flag depends on */
	flagKey: string;
	/** Required state of the dependency (true/false or specific variant value) */
	requiredValue?: FlagVariantValue;
}

export interface FlagSchedule {
	/** Start time for the flag change */
	startAt?: Date | string;
	/** End time for the flag change */
	endAt?: Date | string;
	/** Gradual rollout schedule */
	rollout?: {
		/** Percentage at each step (e.g., [10, 50, 100]) */
		steps: number[];
		/** Duration between steps in milliseconds */
		stepDuration: number;
	};
	/** Timezone for schedule (IANA timezone identifier) */
	timezone?: string;
}

export interface NodeFlagResult {
	/** Whether the flag is enabled */
	enabled: boolean;
	/** The variant value */
	value: FlagVariantValue;
	/** Additional payload data */
	payload?: any;
	/** Reason for the evaluation result */
	reason: string;
	/** Flag unique identifier */
	flagId?: string;
	/** Flag type */
	flagType?: "boolean" | "multivariant" | "rollout";
	/** Selected variant name (for multivariant flags) */
	variantName?: string;
	/** Dependencies that affected this evaluation */
	dependencies?: string[];
}

export interface NodeFlagsConfig {
	/** Client ID for flag evaluation */
	clientId: string;
	/** API base URL */
	apiUrl?: string;
	/** User context for evaluation */
	user?: {
		userId?: string;
		email?: string;
		properties?: Record<string, any>;
	};
	/** Environment context (dev, staging, production, etc.) */
	environment?: string;
	/** Enable debug logging */
	debug?: boolean;
	/** Cache TTL in milliseconds (default: 60000 / 1 minute) */
	cacheTtl?: number;
	/** Enable automatic cache refresh */
	enableAutoRefresh?: boolean;
	/** Auto refresh interval in milliseconds (default: 60000) */
	refreshInterval?: number;
	/** Server-side cache strategy */
	cacheStrategy?: "memory" | "redis" | "none";
	/** Redis connection config (if using redis cache) */
	redis?: {
		url: string;
		ttl?: number;
	};
}

export interface CacheEntry<T> {
	value: T;
	expiresAt: number;
	createdAt: number;
}

export interface FlagEvaluationContext {
	/** User identifier */
	userId?: string;
	/** User email */
	email?: string;
	/** Custom user properties */
	properties?: Record<string, any>;
	/** Environment */
	environment?: string;
	/** Current timestamp */
	timestamp?: number;
}

export interface BulkFlagResponse {
	flags: Record<string, NodeFlagResult>;
	/** Cache metadata */
	cached?: boolean;
	/** Cache timestamp */
	cachedAt?: number;
}

export interface NodeFlagsManager {
	/** Get a single flag value */
	getFlag(key: string, context?: FlagEvaluationContext): Promise<NodeFlagResult>;

	/** Get all flags for the current context */
	getAllFlags(context?: FlagEvaluationContext): Promise<BulkFlagResponse>;

	/** Check if a flag is enabled (shorthand) */
	isEnabled(key: string, context?: FlagEvaluationContext): Promise<boolean>;

	/** Get flag variant value */
	getVariant<T = FlagVariantValue>(key: string, context?: FlagEvaluationContext): Promise<T | null>;

	/** Refresh flags cache */
	refresh(): Promise<void>;

	/** Clear cache */
	clearCache(): void;

	/** Shutdown and cleanup resources */
	shutdown(): Promise<void>;
}
