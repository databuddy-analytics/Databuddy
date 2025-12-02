import type { RetryConfig, Logger } from "../types";
import { calculateBackoff } from "./backoff";
import {
	isRetryableError,
	getRetryAfterMs,
	type RetryableError,
} from "./errors";
import { sleep } from "../utils";

export { calculateBackoff } from "./backoff";
export {
	isRetryableError,
	getRetryAfterMs,
	createHttpError,
	isRetryableStatusCode,
	type RetryableError,
} from "./errors";

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
	success: boolean;
	result?: T;
	error?: Error;
	attempts: number;
}

/**
 * Callbacks for retry integration
 */
export interface RetryCallbacks {
	onRetry?: (attempt: number, error: Error) => void;
	onSuccess?: () => void;
	onFailure?: () => void;
}

/**
 * Execute an operation with retry logic
 *
 * @param operation - Async function to execute
 * @param config - Retry configuration
 * @param logger - Logger instance
 * @param callbacks - Optional callbacks for metrics/circuit breaker integration
 */
export async function withRetry<T>(
	operation: () => Promise<T>,
	config: Required<RetryConfig>,
	logger: Logger,
	callbacks?: RetryCallbacks,
): Promise<RetryResult<T>> {
	let lastError: Error | undefined;

	for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
		try {
			const result = await operation();
			callbacks?.onSuccess?.();
			return { success: true, result, attempts: attempt + 1 };
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			logger.warn("Operation failed", {
				attempt: attempt + 1,
				maxRetries: config.maxRetries,
				error: lastError.message,
			});

			// Check if we should retry
			if (attempt >= config.maxRetries || !isRetryableError(lastError)) {
				callbacks?.onFailure?.();
				break;
			}

			// Notify callback about retry
			callbacks?.onRetry?.(attempt + 1, lastError);

			// Calculate delay (respect Retry-After header if present)
			const retryAfterMs = getRetryAfterMs(lastError as RetryableError);
			const backoffMs = calculateBackoff(
				attempt,
				config.baseDelay,
				config.maxDelay,
				config.jitter,
			);
			const delayMs =
				retryAfterMs !== null ? Math.max(retryAfterMs, backoffMs) : backoffMs;

			logger.debug("Retrying after delay", {
				delayMs,
				attempt: attempt + 1,
			});

			await sleep(delayMs);
		}
	}

	return {
		success: false,
		error: lastError,
		attempts: config.maxRetries + 1,
	};
}
