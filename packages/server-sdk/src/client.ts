import type {
	DatabuddyConfig,
	ResolvedConfig,
	TrackedEvent,
	InternalEvent,
	BatchEventPayload,
	FlushResponse,
	Middleware,
	Metrics,
	CircuitState,
	Logger,
} from "./types";
import { resolveConfig } from "./config";
import { EventQueue, generateEventId } from "./utils";
import { MiddlewarePipeline } from "./middleware";
import { withRetry, type RetryCallbacks } from "./retry";
import { CircuitBreaker, CircuitOpenError } from "./circuit-breaker";
import { createDeduplicationCache, type DeduplicationCache } from "./cache";
import { HttpTransport } from "./transport";
import { createRateLimiter, type RateLimiter } from "./rate-limiter";
import { MetricsCollector } from "./metrics";

/**
 * Databuddy Server SDK Client
 *
 * Production-grade analytics SDK with:
 * - Automatic batching
 * - Retry with exponential backoff
 * - Circuit breaker
 * - Deduplication (in-memory LRU)
 * - Compression
 * - Rate limiting
 * - Observability metrics
 */
export class Databuddy {
	private readonly config: ResolvedConfig;
	private readonly logger: Logger;
	private readonly queue: EventQueue;
	private readonly middleware: MiddlewarePipeline;
	private readonly dedupCache: DeduplicationCache;
	private readonly transport: HttpTransport;
	private readonly rateLimiter: RateLimiter;
	private readonly circuitBreaker: CircuitBreaker | null;
	private readonly metrics: MetricsCollector;

	private globalProperties: Record<string, unknown> = {};
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private isShuttingDown = false;
	private shutdownPromise: Promise<void> | null = null;

	constructor(config: DatabuddyConfig) {
		this.config = resolveConfig(config);
		this.logger = this.config.logger;

		// Initialize components
		this.queue = new EventQueue(this.config.maxQueueSize);
		this.middleware = new MiddlewarePipeline(this.logger);
		this.metrics = new MetricsCollector();

		// Initialize dedup cache
		this.dedupCache = createDeduplicationCache(this.config.dedup, {
			maxSize: this.config.dedupMaxSize,
			ttlSeconds: this.config.dedupTTL,
		});

		// Initialize HTTP transport
		this.transport = new HttpTransport({
			apiUrl: this.config.apiUrl,
			clientId: this.config.clientId,
			timeout: this.config.timeout,
			compression: this.config.compression,
			logger: this.logger,
		});

		// Initialize rate limiter
		this.rateLimiter = createRateLimiter(this.config.rateLimit, this.logger);

		// Initialize circuit breaker
		if (this.config.circuitBreaker !== false) {
			this.circuitBreaker = new CircuitBreaker(
				{
					...this.config.circuitBreaker,
					onStateChange: (from, to) => {
						if (to === "open") {
							this.metrics.incrementCircuitBreakerTrips();
						}
						this.config.circuitBreaker !== false &&
							this.config.circuitBreaker.onStateChange?.(from, to);
					},
				},
				this.logger,
			);
		} else {
			this.circuitBreaker = null;
		}

		// Add initial middleware from config (backward compatibility)
		if (config.middleware) {
			for (const mw of config.middleware) {
				this.middleware.use(mw);
			}
		}

		this.logger.info("Databuddy initialized", {
			clientId: this.config.clientId,
			apiUrl: this.config.apiUrl,
			batchSize: this.config.batchSize,
			dedup: this.config.dedup,
		});
	}

	/**
	 * Track an event
	 * Supports both object form and shorthand (name, properties)
	 */
	track(event: TrackedEvent): void;
	track(name: string, properties?: Record<string, unknown>): void;
	track(
		eventOrName: TrackedEvent | string,
		properties?: Record<string, unknown>,
	): void {
		if (this.isShuttingDown) {
			this.logger.warn("Cannot track events during shutdown");
			return;
		}

		// Normalize input
		const event: TrackedEvent =
			typeof eventOrName === "string"
				? { name: eventOrName, properties }
				: eventOrName;

		// Validate
		if (!event.name || typeof event.name !== "string") {
			this.logger.error("Event name is required and must be a string");
			return;
		}

		// Create internal event
		const internalEvent: InternalEvent = {
			...event,
			eventId: event.eventId ?? generateEventId(),
			timestamp: event.timestamp ?? Date.now(),
			type: "custom",
			properties: {
				...this.globalProperties,
				...(event.properties ?? {}),
			},
			_metadata: {
				queuedAt: Date.now(),
				attempts: 0,
			},
		};

		// Process asynchronously (don't block track call)
		this.processEvent(internalEvent).catch((error) => {
			this.logger.error("Error processing event", {
				error: error instanceof Error ? error.message : String(error),
			});
		});
	}

	/**
	 * Process an event through the pipeline
	 */
	private async processEvent(event: InternalEvent): Promise<void> {
		// Run through middleware
		const processed = await this.middleware.execute(event);
		if (processed === null) {
			this.logger.debug("Event dropped by middleware", { name: event.name });
			this.metrics.incrementDropped();
			return;
		}

		// Check deduplication
		if (this.config.dedup !== "none") {
			const isDuplicate = await this.dedupCache.isDuplicate(event.eventId);
			if (isDuplicate) {
				this.logger.debug("Event deduplicated", { eventId: event.eventId });
				this.metrics.incrementDedupHits();
				return;
			}
		}

		// Add to queue
		const shouldFlush = this.queue.add(event);
		this.metrics.incrementQueued();
		this.logger.debug("Event queued", { queueSize: this.queue.size() });

		// Schedule auto-flush
		this.scheduleFlush();

		// Immediate flush if queue is at batch size or capacity
		if (shouldFlush || this.queue.size() >= this.config.batchSize) {
			await this.flush();
		}
	}

	/**
	 * Add middleware to the pipeline
	 * @returns this for chaining
	 */
	use(middleware: Middleware): this {
		this.middleware.use(middleware);
		this.logger.debug("Middleware added", {
			totalMiddleware: this.middleware.length,
		});
		return this;
	}

	/**
	 * Flush all queued events
	 */
	async flush(): Promise<FlushResponse> {
		// Clear scheduled flush
		this.cancelFlushTimer();

		// Check if queue is empty
		if (this.queue.isEmpty()) {
			return {
				success: true,
				processed: 0,
				results: [],
			};
		}

		// Check circuit breaker
		if (this.circuitBreaker && !this.circuitBreaker.canExecute()) {
			const waitTime = this.circuitBreaker.getTimeUntilHalfOpen();
			this.logger.warn("Circuit breaker open, skipping flush", { waitTime });
			return {
				success: false,
				error: `Circuit breaker open. Retry after ${waitTime}ms`,
			};
		}

		// Check rate limiter
		const canProceed = await this.rateLimiter.tryAcquire();
		if (!canProceed) {
			const waitTime = await this.rateLimiter.getWaitTime();
			this.logger.warn("Rate limited, skipping flush", { waitTime });
			this.metrics.incrementRateLimitHits();
			// Re-schedule flush after rate limit
			this.scheduleFlush(waitTime);
			return {
				success: false,
				error: `Rate limited. Retry after ${waitTime}ms`,
			};
		}

		// Drain queue
		const events = this.queue.getAll();
		this.queue.clear();

		const startTime = Date.now();
		this.logger.info("Flushing events", { count: events.length });

		// Convert to batch payload
		const payload: BatchEventPayload[] = events.map((e) => ({
			type: e.type,
			name: e.name,
			eventId: e.eventId,
			anonymousId: e.anonymousId,
			sessionId: e.sessionId,
			timestamp: e.timestamp,
			properties: e.properties,
		}));

		// Send with retry
		const retryCallbacks: RetryCallbacks = {
			onRetry: () => this.metrics.incrementRetries(),
			onSuccess: () => this.circuitBreaker?.recordSuccess(),
			onFailure: () => this.circuitBreaker?.recordFailure(),
		};

		let response: FlushResponse;

		if (this.config.retry !== false) {
			const result = await withRetry(
				async () => {
					const { response, compressionResult } =
						await this.transport.sendBatch(payload);

					// Track compression savings
					if (compressionResult?.encoding) {
						const saved =
							compressionResult.originalSize - compressionResult.compressedSize;
						this.metrics.addCompressionSavedBytes(saved);
					}

					if (!response.success) {
						throw new Error(response.error ?? "Unknown error");
					}

					return response;
				},
				this.config.retry,
				this.logger,
				retryCallbacks,
			);

			if (result.success && result.result) {
				response = result.result;
			} else {
				response = {
					success: false,
					error: result.error?.message ?? "Unknown error",
				};
			}
		} else {
			// No retry, single attempt
			try {
				const { response: resp, compressionResult } =
					await this.transport.sendBatch(payload);
				response = resp;

				if (compressionResult?.encoding) {
					const saved =
						compressionResult.originalSize - compressionResult.compressedSize;
					this.metrics.addCompressionSavedBytes(saved);
				}

				if (response.success) {
					this.circuitBreaker?.recordSuccess();
				} else {
					this.circuitBreaker?.recordFailure();
				}
			} catch (error) {
				this.circuitBreaker?.recordFailure();
				response = {
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}

		// Record metrics
		const duration = Date.now() - startTime;
		this.metrics.recordFlush(duration);

		if (response.success) {
			this.metrics.incrementProcessed(events.length);
			this.config.onFlush?.(events, response);
		} else {
			this.metrics.incrementFailed(events.length);
			this.config.onError?.(
				new Error(response.error ?? "Flush failed"),
				events,
			);
		}

		return response;
	}

	/**
	 * Set global properties that will be merged with all events
	 */
	setGlobalProperties(properties: Record<string, unknown>): void {
		this.globalProperties = { ...this.globalProperties, ...properties };
		this.logger.debug("Global properties updated", {
			properties: this.globalProperties,
		});
	}

	/**
	 * Get current global properties
	 */
	getGlobalProperties(): Record<string, unknown> {
		return { ...this.globalProperties };
	}

	/**
	 * Clear all global properties
	 */
	clearGlobalProperties(): void {
		this.globalProperties = {};
		this.logger.debug("Global properties cleared");
	}

	/**
	 * Get current metrics
	 */
	getMetrics(): Metrics {
		return this.metrics.getMetrics();
	}

	/**
	 * Get circuit breaker state
	 */
	getCircuitState(): CircuitState {
		return this.circuitBreaker?.getState() ?? "closed";
	}

	/**
	 * Gracefully shutdown the client
	 * Flushes remaining events and closes resources
	 */
	async shutdown(): Promise<void> {
		if (this.shutdownPromise) {
			return this.shutdownPromise;
		}

		this.isShuttingDown = true;
		this.logger.info("Shutting down Databuddy client");

		this.shutdownPromise = (async () => {
			// Cancel scheduled flush
			this.cancelFlushTimer();

			// Final flush
			try {
				await this.flush();
			} catch (error) {
				this.logger.error("Error during shutdown flush", {
					error: error instanceof Error ? error.message : String(error),
				});
			}

			// Close resources
			await Promise.all([
				this.dedupCache.close(),
				this.transport.close(),
				this.rateLimiter.close(),
			]);

			this.logger.info("Databuddy shutdown complete");
		})();

		return this.shutdownPromise;
	}

	/**
	 * Schedule an auto-flush
	 */
	private scheduleFlush(delayMs?: number): void {
		if (this.flushTimer) {
			return; // Already scheduled
		}

		const delay = delayMs ?? this.config.flushInterval;

		this.flushTimer = setTimeout(() => {
			this.flushTimer = null;
			this.flush().catch((error) => {
				this.logger.error("Auto-flush error", {
					error: error instanceof Error ? error.message : String(error),
				});
			});
		}, delay);
	}

	/**
	 * Cancel scheduled flush
	 */
	private cancelFlushTimer(): void {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
	}
}
