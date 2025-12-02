import type { CircuitState, CircuitBreakerConfig, Logger } from "../types";

/**
 * Configuration with defaults resolved
 */
interface ResolvedCircuitBreakerConfig {
	failureThreshold: number;
	successThreshold: number;
	cooldownMs: number;
	onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

/**
 * Error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
	readonly retryAfterMs: number;

	constructor(retryAfterMs: number) {
		super("Circuit breaker is open");
		this.name = "CircuitOpenError";
		this.retryAfterMs = retryAfterMs;
	}
}

/**
 * Circuit Breaker State Machine
 *
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Circuit tripped, requests fail fast
 * - HALF_OPEN: Testing if service recovered
 *
 * Transitions:
 * - CLOSED -> OPEN: When failures >= failureThreshold
 * - OPEN -> HALF_OPEN: After cooldown period
 * - HALF_OPEN -> CLOSED: When successes >= successThreshold
 * - HALF_OPEN -> OPEN: On any failure
 */
export class CircuitBreaker {
	private state: CircuitState = "closed";
	private failureCount = 0;
	private successCount = 0;
	private lastFailureTime = 0;
	private readonly config: ResolvedCircuitBreakerConfig;
	private readonly logger: Logger;

	constructor(config: ResolvedCircuitBreakerConfig, logger: Logger) {
		this.config = config;
		this.logger = logger;
	}

	/**
	 * Check if requests can proceed
	 * @returns true if circuit allows requests
	 */
	canExecute(): boolean {
		if (this.state === "closed") {
			return true;
		}

		if (this.state === "open") {
			const elapsed = Date.now() - this.lastFailureTime;
			if (elapsed >= this.config.cooldownMs) {
				this.transitionTo("half-open");
				return true;
			}
			return false;
		}

		// half-open: allow limited requests for testing
		return true;
	}

	/**
	 * Get time until circuit can transition to half-open
	 * Returns 0 if not in open state
	 */
	getTimeUntilHalfOpen(): number {
		if (this.state !== "open") {
			return 0;
		}
		const elapsed = Date.now() - this.lastFailureTime;
		return Math.max(0, this.config.cooldownMs - elapsed);
	}

	/**
	 * Record a successful operation
	 */
	recordSuccess(): void {
		if (this.state === "half-open") {
			this.successCount++;
			this.logger.debug("Circuit breaker success in half-open", {
				successCount: this.successCount,
				threshold: this.config.successThreshold,
			});
			if (this.successCount >= this.config.successThreshold) {
				this.transitionTo("closed");
			}
		} else if (this.state === "closed") {
			// Reset failure count on success
			this.failureCount = 0;
		}
	}

	/**
	 * Record a failed operation
	 */
	recordFailure(): void {
		this.lastFailureTime = Date.now();

		if (this.state === "half-open") {
			// Any failure in half-open immediately trips the circuit
			this.transitionTo("open");
			return;
		}

		if (this.state === "closed") {
			this.failureCount++;
			this.logger.debug("Circuit breaker failure", {
				failureCount: this.failureCount,
				threshold: this.config.failureThreshold,
			});
			if (this.failureCount >= this.config.failureThreshold) {
				this.transitionTo("open");
			}
		}
	}

	/**
	 * Get current circuit state
	 */
	getState(): CircuitState {
		// Check if we should auto-transition from open to half-open
		if (this.state === "open") {
			const elapsed = Date.now() - this.lastFailureTime;
			if (elapsed >= this.config.cooldownMs) {
				this.transitionTo("half-open");
			}
		}
		return this.state;
	}

	/**
	 * Force reset the circuit to closed state
	 */
	reset(): void {
		this.transitionTo("closed");
	}

	/**
	 * Transition to a new state
	 */
	private transitionTo(newState: CircuitState): void {
		if (newState === this.state) {
			return;
		}

		const oldState = this.state;
		this.state = newState;
		this.failureCount = 0;
		this.successCount = 0;

		this.logger.info("Circuit breaker state change", {
			from: oldState,
			to: newState,
		});

		this.config.onStateChange?.(oldState, newState);
	}
}
