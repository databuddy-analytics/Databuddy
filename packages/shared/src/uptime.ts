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
