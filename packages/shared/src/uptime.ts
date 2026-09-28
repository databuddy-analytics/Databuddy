import { z } from "zod";

export const uptimeGranularitySchema = z.enum([
	"minute",
	"five_minutes",
	"ten_minutes",
	"thirty_minutes",
	"hour",
	"six_hours",
	"twelve_hours",
	"day",
]);

export type UptimeGranularity = z.infer<typeof uptimeGranularitySchema>;

export const CRON_GRANULARITIES = {
	minute: "* * * * *",
	five_minutes: "*/5 * * * *",
	ten_minutes: "*/10 * * * *",
	thirty_minutes: "*/30 * * * *",
	hour: "0 * * * *",
	six_hours: "0 */6 * * *",
	twelve_hours: "0 */12 * * *",
	day: "0 0 * * *",
} as const satisfies Record<UptimeGranularity, string>;

export function parseUptimeGranularity(
	value: unknown
): UptimeGranularity | null {
	const parsed = uptimeGranularitySchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}

export const UPTIME_GRANULARITY_LABELS = {
	minute: "1m",
	five_minutes: "5m",
	ten_minutes: "10m",
	thirty_minutes: "30m",
	hour: "1h",
	six_hours: "6h",
	twelve_hours: "12h",
	day: "24h",
} as const satisfies Record<UptimeGranularity, string>;

export const UPTIME_GRANULARITY_FREQUENCY = {
	minute: "Every minute",
	five_minutes: "Every 5 minutes",
	ten_minutes: "Every 10 minutes",
	thirty_minutes: "Every 30 minutes",
	hour: "Hourly",
	six_hours: "Every 6 hours",
	twelve_hours: "Every 12 hours",
	day: "Daily",
} as const satisfies Record<UptimeGranularity, string>;

export const UPTIME_GRANULARITY_OPTIONS = uptimeGranularitySchema.options.map(
	(value) => ({ value, label: UPTIME_GRANULARITY_LABELS[value] })
);

export function formatUptimeGranularity(value: string): string {
	const granularity = parseUptimeGranularity(value);
	return granularity ? UPTIME_GRANULARITY_LABELS[granularity] : value;
}

export const SLACK_WEBHOOK_PATTERN =
	/^https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+$/;

export const RESERVED_STATUS_PAGE_SLUGS: ReadonlySet<string> = new Set([
	"health",
]);
