import type { Metrics } from "../types";

/**
 * Metrics collector for SDK observability
 * Tracks internal counters for events, retries, circuit breaker, etc.
 */
export class MetricsCollector {
	private _eventsQueued = 0;
	private _eventsProcessed = 0;
	private _eventsFailed = 0;
	private _eventsDropped = 0;
	private _retriesTotal = 0;
	private _dedupHits = 0;
	private _circuitBreakerTrips = 0;
	private _rateLimitHits = 0;
	private _compressionSavedBytes = 0;
	private _flushCount = 0;
	private _lastFlushTime: number | null = null;
	private _flushDurations: number[] = [];

	/**
	 * Increment events queued counter
	 */
	incrementQueued(count = 1): void {
		this._eventsQueued += count;
	}

	/**
	 * Increment events processed counter
	 */
	incrementProcessed(count = 1): void {
		this._eventsProcessed += count;
	}

	/**
	 * Increment events failed counter
	 */
	incrementFailed(count = 1): void {
		this._eventsFailed += count;
	}

	/**
	 * Increment events dropped counter
	 */
	incrementDropped(count = 1): void {
		this._eventsDropped += count;
	}

	/**
	 * Increment retries counter
	 */
	incrementRetries(): void {
		this._retriesTotal++;
	}

	/**
	 * Increment dedup hits counter
	 */
	incrementDedupHits(): void {
		this._dedupHits++;
	}

	/**
	 * Increment circuit breaker trips counter
	 */
	incrementCircuitBreakerTrips(): void {
		this._circuitBreakerTrips++;
	}

	/**
	 * Increment rate limit hits counter
	 */
	incrementRateLimitHits(): void {
		this._rateLimitHits++;
	}

	/**
	 * Add compression saved bytes
	 */
	addCompressionSavedBytes(bytes: number): void {
		this._compressionSavedBytes += bytes;
	}

	/**
	 * Record a flush operation
	 */
	recordFlush(durationMs: number): void {
		this._flushCount++;
		this._lastFlushTime = Date.now();
		this._flushDurations.push(durationMs);

		// Keep only last 100 flush durations for average calculation
		if (this._flushDurations.length > 100) {
			this._flushDurations.shift();
		}
	}

	/**
	 * Get all metrics
	 */
	getMetrics(): Metrics {
		const avgFlushDurationMs =
			this._flushDurations.length > 0
				? this._flushDurations.reduce((a, b) => a + b, 0) /
					this._flushDurations.length
				: 0;

		return {
			eventsQueued: this._eventsQueued,
			eventsProcessed: this._eventsProcessed,
			eventsFailed: this._eventsFailed,
			eventsDropped: this._eventsDropped,
			retriesTotal: this._retriesTotal,
			dedupHits: this._dedupHits,
			circuitBreakerTrips: this._circuitBreakerTrips,
			rateLimitHits: this._rateLimitHits,
			compressionSavedBytes: this._compressionSavedBytes,
			flushCount: this._flushCount,
			avgFlushDurationMs,
			lastFlushTime: this._lastFlushTime,
		};
	}

	/**
	 * Reset all metrics
	 */
	reset(): void {
		this._eventsQueued = 0;
		this._eventsProcessed = 0;
		this._eventsFailed = 0;
		this._eventsDropped = 0;
		this._retriesTotal = 0;
		this._dedupHits = 0;
		this._circuitBreakerTrips = 0;
		this._rateLimitHits = 0;
		this._compressionSavedBytes = 0;
		this._flushCount = 0;
		this._lastFlushTime = null;
		this._flushDurations = [];
	}
}
