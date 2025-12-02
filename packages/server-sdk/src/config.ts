import type {
	DatabuddyConfig,
	ResolvedConfig,
	RetryConfig,
	CircuitBreakerConfig,
	RateLimitConfig,
	CompressionConfig,
	Logger,
} from "./types";
import { createLogger, createNoopLogger } from "./utils/logger";

/**
 * Default configuration values
 */
export const DEFAULTS = {
	apiUrl: "https://basket.databuddy.cc",
	batchSize: 20,
	flushInterval: 2000,
	maxQueueSize: 1000,
	timeout: 5000,
	dedup: "memory" as const,
	dedupTTL: 3600,
	dedupMaxSize: 10000,
	retry: {
		maxRetries: 5,
		baseDelay: 200,
		maxDelay: 30000,
		jitter: "full" as const,
	},
	circuitBreaker: {
		failureThreshold: 5,
		successThreshold: 2,
		cooldownMs: 30000,
	},
	rateLimit: {
		maxRequests: 1000,
		intervalMs: 60000,
	},
	compression: {
		threshold: 1024,
		algorithm: "gzip" as const,
		level: 6,
	},
} as const;

/**
 * Validate and resolve configuration with defaults
 */
export function resolveConfig(config: DatabuddyConfig): ResolvedConfig {
	// Validate required fields
	if (!config.clientId || typeof config.clientId !== "string") {
		throw new Error("clientId is required and must be a string");
	}

	const clientId = config.clientId.trim();
	if (clientId.length === 0) {
		throw new Error("clientId cannot be empty");
	}

	// Create logger
	let logger: Logger;
	if (config.logger) {
		logger = config.logger;
	} else if (config.debug) {
		logger = createLogger(true);
	} else {
		logger = createNoopLogger();
	}

	// Handle deprecated options with warnings
	if (config.enableBatching !== undefined) {
		logger.warn(
			"DEPRECATED: enableBatching is deprecated. Batching is always enabled.",
		);
	}

	if (config.batchTimeout !== undefined) {
		logger.warn("DEPRECATED: batchTimeout renamed to flushInterval");
	}

	if (config.enableDeduplication !== undefined) {
		logger.warn("DEPRECATED: enableDeduplication replaced by dedup option");
	}

	if (config.maxDeduplicationCacheSize !== undefined) {
		logger.warn(
			"DEPRECATED: maxDeduplicationCacheSize renamed to dedupMaxSize",
		);
	}

	if (config.middleware !== undefined) {
		logger.warn(
			"DEPRECATED: middleware in config deprecated. Use use() method instead.",
		);
	}

	// Resolve flushInterval (with backward compat for batchTimeout)
	const flushInterval =
		config.flushInterval ?? config.batchTimeout ?? DEFAULTS.flushInterval;

	// Resolve dedup strategy (with backward compat for enableDeduplication)
	let dedup = config.dedup ?? DEFAULTS.dedup;
	if (config.enableDeduplication === false) {
		dedup = "none";
	}

	// Resolve dedupMaxSize (with backward compat)
	const dedupMaxSize =
		config.dedupMaxSize ??
		config.maxDeduplicationCacheSize ??
		DEFAULTS.dedupMaxSize;

	// Resolve retry config
	const retry = resolveRetryConfig(config.retry);

	// Resolve circuit breaker config
	const circuitBreaker = resolveCircuitBreakerConfig(config.circuitBreaker);

	// Resolve rate limit config
	const rateLimit = resolveRateLimitConfig(config.rateLimit);

	// Resolve compression config
	const compression = resolveCompressionConfig(config.compression);

	return {
		clientId,
		apiUrl: config.apiUrl?.trim() || DEFAULTS.apiUrl,
		batchSize: Math.min(
			Math.max(config.batchSize ?? DEFAULTS.batchSize, 1),
			100,
		),
		flushInterval: Math.max(flushInterval, 100),
		maxQueueSize: Math.max(config.maxQueueSize ?? DEFAULTS.maxQueueSize, 10),
		dedup,
		dedupTTL: Math.max(config.dedupTTL ?? DEFAULTS.dedupTTL, 1),
		dedupMaxSize: Math.max(dedupMaxSize, 100),
		retry,
		circuitBreaker,
		rateLimit,
		compression,
		timeout: Math.max(config.timeout ?? DEFAULTS.timeout, 100),
		debug: config.debug ?? false,
		logger,
		onFlush: config.onFlush,
		onError: config.onError,
	};
}

function resolveRetryConfig(
	config: DatabuddyConfig["retry"],
): ResolvedConfig["retry"] {
	if (config === false) {
		return false;
	}

	const merged = { ...DEFAULTS.retry, ...config };

	return {
		maxRetries: Math.max(merged.maxRetries, 0),
		baseDelay: Math.max(merged.baseDelay, 10),
		maxDelay: Math.max(merged.maxDelay, merged.baseDelay),
		jitter: merged.jitter,
	};
}

function resolveCircuitBreakerConfig(
	config: DatabuddyConfig["circuitBreaker"],
): ResolvedConfig["circuitBreaker"] {
	if (config === false) {
		return false;
	}

	const merged = { ...DEFAULTS.circuitBreaker, ...config };

	return {
		failureThreshold: Math.max(merged.failureThreshold, 1),
		successThreshold: Math.max(merged.successThreshold, 1),
		cooldownMs: Math.max(merged.cooldownMs, 1000),
		onStateChange: config?.onStateChange,
	};
}

function resolveRateLimitConfig(
	config: DatabuddyConfig["rateLimit"],
): ResolvedConfig["rateLimit"] {
	if (config === false) {
		return false;
	}

	// Rate limit has required maxRequests, use default if not provided
	const maxRequests = config?.maxRequests ?? DEFAULTS.rateLimit.maxRequests;
	const intervalMs = config?.intervalMs ?? DEFAULTS.rateLimit.intervalMs;

	return {
		maxRequests: Math.max(maxRequests, 1),
		intervalMs: Math.max(intervalMs, 1000),
	};
}

function resolveCompressionConfig(
	config: DatabuddyConfig["compression"],
): ResolvedConfig["compression"] {
	if (config === false) {
		return false;
	}

	const merged = { ...DEFAULTS.compression, ...config };

	// Validate compression level based on algorithm
	let level = merged.level;
	if (merged.algorithm === "brotli") {
		level = Math.min(Math.max(level, 0), 11);
	} else {
		level = Math.min(Math.max(level, 1), 9);
	}

	return {
		threshold: Math.max(merged.threshold, 0),
		algorithm: merged.algorithm,
		level,
	};
}
