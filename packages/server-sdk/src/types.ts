/**
 * Deduplication strategy
 * - 'memory': In-memory LRU cache (default)
 * - 'none': Disable deduplication
 */
export type DedupStrategy = "memory" | "none";

/**
 * Jitter mode for retry backoff
 * - 'full': Random between 0 and calculated delay (best for thundering herd)
 * - 'equal': Half delay + random half (balance between spread and minimum wait)
 * - 'none': No jitter, use exact calculated delay
 */
export type JitterMode = "full" | "equal" | "none";

/**
 * Circuit breaker state
 * - 'closed': Normal operation, requests flow through
 * - 'open': Circuit tripped, requests fail fast
 * - 'half-open': Testing if service recovered
 */
export type CircuitState = "closed" | "open" | "half-open";

/**
 * Compression algorithm
 */
export type CompressionAlgorithm = "gzip" | "brotli";

/**
 * Retry configuration
 */
export interface RetryConfig {
	/** Maximum retry attempts (default: 5) */
	maxRetries?: number;
	/** Base delay in ms (default: 200) */
	baseDelay?: number;
	/** Maximum delay cap in ms (default: 30000) */
	maxDelay?: number;
	/** Jitter mode (default: 'full') */
	jitter?: JitterMode;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
	/** Failures before opening circuit (default: 5) */
	failureThreshold?: number;
	/** Success count to close from half-open (default: 2) */
	successThreshold?: number;
	/** Cooldown in ms before half-open (default: 30000) */
	cooldownMs?: number;
	/** Callback on state change */
	onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
	/** Maximum requests per interval (required) */
	maxRequests: number;
	/** Interval in ms (default: 60000) */
	intervalMs?: number;
}

/**
 * Compression configuration
 */
export interface CompressionConfig {
	/** Minimum payload size for compression in bytes (default: 1024) */
	threshold?: number;
	/** Compression algorithm (default: 'gzip') */
	algorithm?: CompressionAlgorithm;
	/** Compression level (1-9 for gzip, 0-11 for brotli, default: 6) */
	level?: number;
}

/**
 * Logger interface - matches existing SDK pattern
 */
export interface Logger {
	debug(msg: string, data?: Record<string, unknown>): void;
	info(msg: string, data?: Record<string, unknown>): void;
	warn(msg: string, data?: Record<string, unknown>): void;
	error(msg: string, data?: Record<string, unknown>): void;
}

/**
 * Event to be tracked
 */
export interface TrackedEvent {
	/** Event name (required) */
	name: string;
	/** Unique event ID for deduplication */
	eventId?: string;
	/** Anonymous user identifier */
	anonymousId?: string;
	/** Session identifier */
	sessionId?: string;
	/** Event timestamp in ms (auto-generated if not provided) */
	timestamp?: number;
	/** Custom properties */
	properties?: Record<string, unknown>;
}

/**
 * Internal event representation with metadata
 */
export interface InternalEvent extends TrackedEvent {
	/** Event ID (always present internally) */
	eventId: string;
	/** Timestamp (always present internally) */
	timestamp: number;
	/** Event type marker */
	type: "custom";
	/** Internal metadata */
	_metadata: {
		queuedAt: number;
		attempts: number;
	};
}

/**
 * Batch event format for API
 */
export interface BatchEventPayload {
	type: "custom";
	name: string;
	eventId?: string;
	anonymousId?: string | null;
	sessionId?: string | null;
	timestamp?: number | null;
	properties?: Record<string, unknown> | null;
}

/**
 * Flush response from server
 */
export interface FlushResponse {
	success: boolean;
	processed?: number;
	results?: Array<{
		status: string;
		type?: string;
		eventId?: string;
		message?: string;
		error?: string;
	}>;
	error?: string;
}

/**
 * Single event response
 */
export interface EventResponse {
	success: boolean;
	eventId?: string;
	error?: string;
}

/**
 * SDK metrics for observability
 */
export interface Metrics {
	/** Total events added to queue */
	eventsQueued: number;
	/** Total events successfully sent */
	eventsProcessed: number;
	/** Total events that failed to send */
	eventsFailed: number;
	/** Total events dropped (by middleware, rate limit, etc.) */
	eventsDropped: number;
	/** Total retry attempts */
	retriesTotal: number;
	/** Total deduplication cache hits */
	dedupHits: number;
	/** Total circuit breaker trips */
	circuitBreakerTrips: number;
	/** Total rate limit hits */
	rateLimitHits: number;
	/** Total bytes saved by compression */
	compressionSavedBytes: number;
	/** Total flush operations */
	flushCount: number;
	/** Average flush duration in ms */
	avgFlushDurationMs: number;
	/** Last flush timestamp */
	lastFlushTime: number | null;
}

/**
 * Middleware next function (Koa-style)
 */
export type MiddlewareNext = (
	event: TrackedEvent,
) => Promise<TrackedEvent | null>;

/**
 * Koa-style middleware with next function
 */
export type KoaMiddleware = (
	event: TrackedEvent,
	next: MiddlewareNext,
) => Promise<TrackedEvent | null>;

/**
 * Simple middleware (backward compatible with old SDK)
 */
export type SimpleMiddleware = (
	event: TrackedEvent,
) => TrackedEvent | null | Promise<TrackedEvent | null>;

/**
 * Unified middleware type (supports both patterns)
 */
export type Middleware = KoaMiddleware | SimpleMiddleware;

/**
 * Main SDK configuration
 */
export interface DatabuddyConfig {
	// Required
	/** Client ID from Databuddy dashboard */
	clientId: string;

	// API
	/** API endpoint (default: https://basket.databuddy.cc) */
	apiUrl?: string;

	// Batching
	/** Number of events before auto-flush (default: 20) */
	batchSize?: number;
	/** Milliseconds before auto-flush (default: 2000) */
	flushInterval?: number;
	/** Maximum queue size (default: 1000) */
	maxQueueSize?: number;

	// Deduplication
	/** Deduplication backend (default: 'memory') */
	dedup?: DedupStrategy;
	/** Dedup cache TTL in seconds (default: 3600) */
	dedupTTL?: number;
	/** Max entries for memory cache (default: 10000) */
	dedupMaxSize?: number;

	// Retry (enabled by default)
	/** Retry configuration, or false to disable */
	retry?: RetryConfig | false;

	// Circuit Breaker (enabled by default)
	/** Circuit breaker configuration, or false to disable */
	circuitBreaker?: CircuitBreakerConfig | false;

	// Rate Limiting (enabled by default)
	/** Rate limiting configuration, or false to disable */
	rateLimit?: RateLimitConfig | false;

	// Compression (enabled by default)
	/** Compression configuration, or false to disable */
	compression?: CompressionConfig | false;

	// Network
	/** Request timeout in ms (default: 5000) */
	timeout?: number;

	// Observability
	/** Enable debug logging */
	debug?: boolean;
	/** Custom logger instance */
	logger?: Logger;

	// Lifecycle callbacks
	/** Callback on successful flush */
	onFlush?: (events: TrackedEvent[], response: FlushResponse) => void;
	/** Callback on error */
	onError?: (error: Error, events?: TrackedEvent[]) => void;

	// Backward compatibility (deprecated)
	/** @deprecated Use flushInterval instead */
	batchTimeout?: number;
	/** @deprecated Batching is always enabled */
	enableBatching?: boolean;
	/** @deprecated Use dedup: 'memory' | 'none' instead */
	enableDeduplication?: boolean;
	/** @deprecated Use dedupMaxSize instead */
	maxDeduplicationCacheSize?: number;
	/** @deprecated Use use() method instead */
	middleware?: Middleware[];
}

/**
 * Resolved configuration with all defaults applied
 */
export interface ResolvedConfig {
	clientId: string;
	apiUrl: string;
	batchSize: number;
	flushInterval: number;
	maxQueueSize: number;
	dedup: DedupStrategy;
	dedupTTL: number;
	dedupMaxSize: number;
	retry: Required<RetryConfig> | false;
	circuitBreaker:
		| (Required<Omit<CircuitBreakerConfig, "onStateChange">> & {
				onStateChange?: CircuitBreakerConfig["onStateChange"];
		  })
		| false;
	rateLimit: Required<RateLimitConfig> | false;
	compression: Required<CompressionConfig> | false;
	timeout: number;
	debug: boolean;
	logger: Logger;
	onFlush?: DatabuddyConfig["onFlush"];
	onError?: DatabuddyConfig["onError"];
}
