export const UNMANAGED_CLICKHOUSE_OBJECTS: ReadonlySet<string> = new Set([
	"analytics.web_vitals_hourly",
	"analytics.web_vitals_hourly_mv",
]);

export function isUnmanagedClickHouseObject(name: string): boolean {
	return UNMANAGED_CLICKHOUSE_OBJECTS.has(name);
}
