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

export function parseUptimeGranularity(
	value: unknown
): UptimeGranularity | null {
	const parsed = uptimeGranularitySchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}
