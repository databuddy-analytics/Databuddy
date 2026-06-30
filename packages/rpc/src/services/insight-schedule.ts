import dayjs from "dayjs";
import timezonePlugin from "dayjs/plugin/timezone";
import utcPlugin from "dayjs/plugin/utc";

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

export type InsightScheduleFrequency = "hourly" | "daily" | "weekly" | "custom";

export interface InsightScheduleConfig {
	cron: string | null;
	enabled: boolean;
	frequency: InsightScheduleFrequency;
	timezone?: string;
}

const CRON_FIELD_SEPARATOR = /\s+/;
const CRON_INTEGER_REGEX = /^\d+$/;
const DEFAULT_TIMEZONE = "UTC";

function normalizeTimezone(timezone: string | undefined): string {
	if (!timezone) {
		return DEFAULT_TIMEZONE;
	}
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: timezone });
		return timezone;
	} catch {
		return DEFAULT_TIMEZONE;
	}
}

export function isValidTimezone(timezone: string): boolean {
	if (timezone.length === 0) {
		return false;
	}
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: timezone });
		return true;
	} catch {
		return false;
	}
}

export function isValidCron(cron: string): boolean {
	const parts = cron.trim().split(CRON_FIELD_SEPARATOR);
	if (parts.length !== 5) {
		return false;
	}
	const [minutePart, hourPart, dayPart, monthPart, weekdayPart] = parts;
	return Boolean(
		parseCronField(minutePart ?? "", 0, 59) &&
			parseCronField(hourPart ?? "", 0, 23) &&
			parseCronField(dayPart ?? "", 1, 31) &&
			parseCronField(monthPart ?? "", 1, 12) &&
			parseCronField(weekdayPart ?? "", 0, 7)
	);
}

function parseCronToken(
	token: string,
	min: number,
	max: number
): number[] | null {
	if (token.length === 0) {
		return null;
	}

	const slashIndex = token.indexOf("/");
	const base = slashIndex === -1 ? token : token.slice(0, slashIndex);
	const stepPart = slashIndex === -1 ? null : token.slice(slashIndex + 1);

	let step = 1;
	if (stepPart !== null) {
		if (!CRON_INTEGER_REGEX.test(stepPart)) {
			return null;
		}
		step = Number(stepPart);
		if (!Number.isSafeInteger(step) || step <= 0) {
			return null;
		}
	}

	let start: number;
	let end: number;
	if (base === "*") {
		start = min;
		end = max;
	} else if (base.includes("-")) {
		const dashIndex = base.indexOf("-");
		const startStr = base.slice(0, dashIndex);
		const endStr = base.slice(dashIndex + 1);
		if (
			!(CRON_INTEGER_REGEX.test(startStr) && CRON_INTEGER_REGEX.test(endStr))
		) {
			return null;
		}
		start = Number(startStr);
		end = Number(endStr);
		if (start > end) {
			return null;
		}
	} else {
		if (!CRON_INTEGER_REGEX.test(base)) {
			return null;
		}
		start = Number(base);
		end = stepPart === null ? start : max;
	}

	if (start < min || end > max) {
		return null;
	}

	const out: number[] = [];
	for (let n = start; n <= end; n += step) {
		out.push(n);
	}
	return out;
}

function parseCronField(
	value: string,
	min: number,
	max: number
): number[] | null {
	if (value.length === 0) {
		return null;
	}
	const out = new Set<number>();
	for (const token of value.split(",")) {
		const parsed = parseCronToken(token, min, max);
		if (!parsed) {
			return null;
		}
		for (const n of parsed) {
			out.add(n);
		}
	}
	return [...out].sort((a, b) => a - b);
}

function nextRunFromCron(
	cron: string | null,
	from: Date,
	timezone: string
): Date | null {
	if (!cron) {
		return null;
	}

	const parts = cron.trim().split(CRON_FIELD_SEPARATOR);
	if (parts.length !== 5) {
		return null;
	}

	const [minutePart, hourPart, dayPart, monthPart, weekdayPart] = parts;
	const minutes = parseCronField(minutePart ?? "", 0, 59);
	const hours = parseCronField(hourPart ?? "", 0, 23);
	const days = parseCronField(dayPart ?? "", 1, 31);
	const months = parseCronField(monthPart ?? "", 1, 12);
	const weekdays = parseCronField(weekdayPart ?? "", 0, 7);
	if (!(minutes && hours && days && months && weekdays)) {
		return null;
	}

	const minuteSet = new Set(minutes);
	const hourSet = new Set(hours);
	const daySet = new Set(days);
	const monthSet = new Set(months);
	const weekdaySet = new Set(weekdays.map((day) => (day === 7 ? 0 : day)));
	let candidate = dayjs(from)
		.tz(timezone)
		.add(1, "minute")
		.second(0)
		.millisecond(0);

	const maxMinutes = 5 * 366 * 24 * 60;
	for (let i = 0; i < maxMinutes; i += 1) {
		if (
			minuteSet.has(candidate.minute()) &&
			hourSet.has(candidate.hour()) &&
			daySet.has(candidate.date()) &&
			monthSet.has(candidate.month() + 1) &&
			weekdaySet.has(candidate.day())
		) {
			return candidate.toDate();
		}
		candidate = candidate.add(1, "minute");
	}

	return null;
}

export function getNextInsightRunAt(
	config: InsightScheduleConfig,
	from = new Date()
): Date | null {
	if (!config.enabled) {
		return null;
	}

	const timezone = normalizeTimezone(config.timezone);
	const now = dayjs(from).tz(timezone);
	if (config.frequency === "hourly") {
		return now.add(1, "hour").minute(0).second(0).millisecond(0).toDate();
	}

	if (config.frequency === "daily") {
		const next = now.hour(9).minute(0).second(0).millisecond(0);
		return (next.isAfter(now) ? next : next.add(1, "day")).toDate();
	}

	if (config.frequency === "weekly") {
		const next = now.hour(9).minute(0).second(0).millisecond(0);
		return (next.isAfter(now) ? next : next.add(7, "day")).toDate();
	}

	return nextRunFromCron(config.cron, from, timezone);
}
