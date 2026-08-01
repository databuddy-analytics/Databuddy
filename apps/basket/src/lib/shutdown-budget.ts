export const PRODUCER_DRAIN_TIMEOUT_MS = 5000;
export const BASKET_SHUTDOWN_TIMEOUT_MS = 20_000;

/**
 * Keep enough process-level headroom after producer admission closes for
 * Kafka disconnect, Redis/Postgres shutdown, and the final telemetry drain.
 */
export const SHUTDOWN_CLEANUP_HEADROOM_MS =
	BASKET_SHUTDOWN_TIMEOUT_MS - PRODUCER_DRAIN_TIMEOUT_MS;
