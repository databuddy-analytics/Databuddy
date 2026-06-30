export const CLICKHOUSE_TRACKING_HEALTH_TIMEOUT_MESSAGE =
	"ClickHouse query timeout";

export type TrackingHealthErrorLogLevel = "error" | "warn";

export function getTrackingHealthErrorLogLevel(
	error: unknown
): TrackingHealthErrorLogLevel {
	return error instanceof Error &&
		error.message === CLICKHOUSE_TRACKING_HEALTH_TIMEOUT_MESSAGE
		? "warn"
		: "error";
}
