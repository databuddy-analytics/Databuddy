import { validateTimezone } from "@databuddy/validation";
import dayjs from "dayjs";
import timezonePlugin from "dayjs/plugin/timezone";
import utcPlugin from "dayjs/plugin/utc";

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

export type InsightScheduleFrequency = "daily" | "weekly";

export interface InsightScheduleConfig {
	enabled: boolean;
	frequency: InsightScheduleFrequency;
	timezone?: string;
}

const DEFAULT_TIMEZONE = "UTC";

export function normalizeInsightTimezone(timezone: string | undefined): string {
	const trimmed = timezone?.trim() ?? "";
	return trimmed && validateTimezone(trimmed) === trimmed
		? trimmed
		: DEFAULT_TIMEZONE;
}

export function isValidTimezone(timezone: string): boolean {
	const trimmed = timezone.trim();
	return trimmed.length > 0 && validateTimezone(trimmed) === trimmed;
}

export function normalizeInsightScheduleFrequency(
	frequency: string
): InsightScheduleFrequency {
	return frequency === "daily" ? "daily" : "weekly";
}

export function getNextInsightRunAt(
	config: InsightScheduleConfig,
	from = new Date()
): Date | null {
	if (!config.enabled) {
		return null;
	}

	const timezone = normalizeInsightTimezone(config.timezone);
	const now = dayjs(from).tz(timezone);
	const daysUntilRun =
		now.hour() < 9 ? 0 : config.frequency === "daily" ? 1 : 7;
	const date = now.add(daysUntilRun, "day").format("YYYY-MM-DD");
	return dayjs.tz(`${date} 09:00`, timezone).toDate();
}
