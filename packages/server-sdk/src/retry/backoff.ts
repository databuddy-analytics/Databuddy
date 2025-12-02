import type { JitterMode } from "../types";

/**
 * Calculate delay with exponential backoff and jitter
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param baseDelay - Base delay in ms
 * @param maxDelay - Maximum delay cap in ms
 * @param jitter - Jitter mode
 * @returns Delay in ms to wait before retry
 */
export function calculateBackoff(
	attempt: number,
	baseDelay: number,
	maxDelay: number,
	jitter: JitterMode,
): number {
	// Exponential: baseDelay * 2^attempt
	const exponentialDelay = baseDelay * Math.pow(2, attempt);
	const cappedDelay = Math.min(exponentialDelay, maxDelay);

	return applyJitter(cappedDelay, jitter);
}

/**
 * Apply jitter to delay value
 *
 * - 'full': Random between 0 and delay (best for thundering herd prevention)
 * - 'equal': Half delay + random half (balance between spread and minimum wait)
 * - 'none': No jitter, exact delay
 */
function applyJitter(delay: number, mode: JitterMode): number {
	switch (mode) {
		case "full":
			// Full jitter: random(0, delay)
			return Math.floor(Math.random() * delay);

		case "equal":
			// Equal jitter: delay/2 + random(0, delay/2)
			return Math.floor(delay / 2 + Math.random() * (delay / 2));

		case "none":
		default:
			return delay;
	}
}
