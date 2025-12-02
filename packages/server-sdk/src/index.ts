// Main client export
export { Databuddy } from "./client";

// Type exports
export type {
	// Config
	DatabuddyConfig,
	ResolvedConfig,
	RetryConfig,
	CircuitBreakerConfig,
	RateLimitConfig,
	CompressionConfig,
	// Events
	TrackedEvent,
	InternalEvent,
	BatchEventPayload,
	FlushResponse,
	EventResponse,
	// Middleware
	Middleware,
	KoaMiddleware,
	SimpleMiddleware,
	MiddlewareNext,
	// State
	CircuitState,
	DedupStrategy,
	JitterMode,
	CompressionAlgorithm,
	// Observability
	Metrics,
	Logger,
} from "./types";

// Default configuration
export { DEFAULTS } from "./config";

// Cache exports (for advanced usage)
export type { DeduplicationCache } from "./cache";
export { MemoryLRUCache } from "./cache";

// Circuit breaker exports (for advanced usage)
export { CircuitBreaker, CircuitOpenError } from "./circuit-breaker";

// Rate limiter exports (for advanced usage)
export type { RateLimiter } from "./rate-limiter";
export { TokenBucketLimiter } from "./rate-limiter";

// Retry exports (for advanced usage)
export { isRetryableError, calculateBackoff } from "./retry";
export type { RetryableError } from "./retry";

// Metrics exports (for advanced usage)
export { MetricsCollector } from "./metrics";
