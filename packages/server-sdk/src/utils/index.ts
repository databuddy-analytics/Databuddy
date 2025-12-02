export { createLogger, createNoopLogger } from "./logger";
export { EventQueue } from "./queue";

/**
 * Generate a unique event ID
 */
export function generateEventId(): string {
	// Use crypto.randomUUID if available (Node 19+), fallback to timestamp + random
	if (typeof crypto !== "undefined" && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Sleep for specified duration
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
