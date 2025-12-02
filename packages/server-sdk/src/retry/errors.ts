/**
 * HTTP status codes that warrant retry
 */
const RETRYABLE_STATUS_CODES = new Set([
	408, // Request Timeout
	429, // Too Many Requests
	500, // Internal Server Error
	502, // Bad Gateway
	503, // Service Unavailable
	504, // Gateway Timeout
]);

/**
 * Network error patterns that warrant retry
 */
const NETWORK_ERROR_PATTERNS = [
	"ECONNRESET",
	"ECONNREFUSED",
	"ETIMEDOUT",
	"ENOTFOUND",
	"EAI_AGAIN",
	"EPIPE",
	"network",
	"socket hang up",
	"fetch failed",
	"aborted",
];

/**
 * Error with additional retry metadata
 */
export interface RetryableError extends Error {
	statusCode?: number;
	retryAfter?: number; // seconds from Retry-After header
}

/**
 * Determine if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	const retryable = error as RetryableError;

	// Check HTTP status code
	if (retryable.statusCode !== undefined) {
		return RETRYABLE_STATUS_CODES.has(retryable.statusCode);
	}

	// Check network error patterns
	const message = error.message.toLowerCase();
	return NETWORK_ERROR_PATTERNS.some((pattern) =>
		message.includes(pattern.toLowerCase()),
	);
}

/**
 * Extract Retry-After header value in milliseconds
 */
export function getRetryAfterMs(error: RetryableError): number | null {
	if (error.retryAfter === undefined) {
		return null;
	}
	return error.retryAfter * 1000;
}

/**
 * Create an error from HTTP response
 */
export async function createHttpError(
	response: Response,
): Promise<RetryableError> {
	const error = new Error(
		`HTTP ${response.status}: ${response.statusText}`,
	) as RetryableError;
	error.statusCode = response.status;

	// Parse Retry-After header if present
	const retryAfter = response.headers.get("Retry-After");
	if (retryAfter) {
		const seconds = parseInt(retryAfter, 10);
		if (!isNaN(seconds)) {
			error.retryAfter = seconds;
		}
	}

	return error;
}

/**
 * Check if status code indicates retryable error
 */
export function isRetryableStatusCode(statusCode: number): boolean {
	return RETRYABLE_STATUS_CODES.has(statusCode);
}
