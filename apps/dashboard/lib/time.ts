/**
 * Centralized dayjs configuration with timezone support
 *
 * Always import dayjs from this file instead of 'dayjs' directly
 * to ensure consistent timezone handling across the application.
 */
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { getUserTimezone } from "./timezone";

// Configure dayjs plugins once
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

// Get the user's timezone
const userTimezone = getUserTimezone();

/**
 * Parse a date string (UTC) and convert to user's local timezone
 */
export function toLocalTime(date: string | Date | dayjs.Dayjs): dayjs.Dayjs {
	return dayjs.utc(date).tz(userTimezone);
}

/**
 * Format a UTC date string to local time with the given format
 */
export function formatLocalTime(
	date: string | Date | dayjs.Dayjs | undefined | null,
	format: string
): string {
	if (!date) {
		return "";
	}
	const localTime = toLocalTime(date);
	if (!localTime.isValid()) {
		return "";
	}
	return localTime.format(format);
}

/**
 * Get relative time from now (e.g., "2 hours ago") in local timezone
 */
export function fromNow(
	date: string | Date | dayjs.Dayjs | undefined | null
): string {
	if (!date) {
		return "";
	}
	const localTime = toLocalTime(date);
	if (!localTime.isValid()) {
		return "";
	}
	return localTime.fromNow();
}

/**
 * Format date as time only (HH:mm:ss) in local timezone
 */
export function formatTime(
	date: string | Date | dayjs.Dayjs | undefined | null
): string {
	return formatLocalTime(date, "HH:mm:ss");
}

/**
 * Format date with full datetime in local timezone
 */
export function formatDateTime(
	date: string | Date | dayjs.Dayjs | undefined | null
): string {
	return formatLocalTime(date, "MMM D, YYYY HH:mm:ss");
}

/**
 * Format date only (no time) in local timezone
 */
export function formatDateOnly(
	date: string | Date | dayjs.Dayjs | undefined | null
): string {
	return formatLocalTime(date, "MMM D, YYYY");
}

/**
 * Create a dayjs instance in local timezone
 * Use this when you need direct dayjs access with timezone support
 */
export function localDayjs(date?: string | Date | dayjs.Dayjs): dayjs.Dayjs {
	if (!date) {
		return dayjs().tz(userTimezone);
	}
	return dayjs.utc(date).tz(userTimezone);
}
