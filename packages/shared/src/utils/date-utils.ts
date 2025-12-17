import dayjs from "dayjs";
import relativeTimePlugin from "dayjs/plugin/relativeTime";
import timezonePlugin from "dayjs/plugin/timezone";
import utcPlugin from "dayjs/plugin/utc";
import { TIMEZONES } from "../lists/timezones";

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);
dayjs.extend(relativeTimePlugin);

const DEFAULT_DATE_FORMAT = "MMM D, YYYY";
const DEFAULT_TIME_FORMAT = "h:mm A";

type DateFormatOptions = {
	timezone?: string;
	dateFormat?: string;
	timeFormat?: string;
	showTime?: boolean;
	customFormat?: string;
}

type DateInput = Date | string | number | null;

/**
 * Formats a date according to specified options
 * @param date - Date to format
 * @param options - Formatting options
 * @returns Formatted date string
 */
export function formatDate(
	date: DateInput,
	options?: DateFormatOptions
): string {
	if (!date) {
		return "";
	}

	const timezone = options?.timezone || "UTC";
	const dayjsDate = dayjs(date).tz(timezone);

	if (options?.customFormat) {
		return dayjsDate.format(options.customFormat);
	}

	const dateFormat = options?.dateFormat || DEFAULT_DATE_FORMAT;
	const timeFormat = options?.timeFormat || DEFAULT_TIME_FORMAT;
	const format = options?.showTime ? `${dateFormat} ${timeFormat}` : dateFormat;

	return dayjsDate.format(format);
}

/**
 * Converts a date to specified timezone
 * @param date - Date to convert
 * @param timezone - Target timezone
 * @returns Date in target timezone
 */
export function convertToTimezone(
	date: Exclude<DateInput, null>,
	timezone = "UTC"
): Date {
	return dayjs(date).tz(timezone).toDate();
}

/**
 * Gets the browser's timezone
 * @returns Browser timezone string
 */
export function getBrowserTimezone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Finds timezone info by region name
 * @param region - Timezone region to find
 * @returns Timezone info or undefined
 */
export function findTimezoneByRegion(region: string) {
	return TIMEZONES.find((tz) => tz.region === region);
}

/**
 * Formats a date as relative time (e.g. "2 hours ago")
 * @param date - Date to format
 * @returns Relative time string
 */
export function formatRelativeTime(date: DateInput): string {
	if (!date) {
		return "";
	}
	return dayjs(date).fromNow();
}
