// These Redis errors are transient during failover or server upgrades. BullMQ
// reconnects automatically with maxRetriesPerRequest: null, so they should not
// inflate ERROR-level incidents.
const TRANSIENT_REDIS_ERROR_PATTERNS = [
	/^READONLY /,
	/^ERR caller gone/,
	/ECONNRESET/,
	/Connection is closed/,
	/Socket closed unexpectedly/,
];

function isTransientRedisError(error: Error): boolean {
	return TRANSIENT_REDIS_ERROR_PATTERNS.some((pattern) =>
		pattern.test(error.message)
	);
}

export function getInsightsWorkerErrorLevel(error: Error): "warn" | "error" {
	return isTransientRedisError(error) ? "warn" : "error";
}
