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

interface DateFormatOptions {
	customFormat?: string;
	dateFormat?: string;
	showTime?: boolean;
	timeFormat?: string;
	timezone?: string;
}

type DateInput = Date | string | number | null;

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

export function convertToTimezone(
	date: Exclude<DateInput, null>,
	timezone = "UTC"
): Date {
	return dayjs(date).tz(timezone).toDate();
}

export function getBrowserTimezone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function findTimezoneByRegion(region: string) {
	return TIMEZONES.find((tz) => tz.region === region);
}

export function formatRelativeTime(date: DateInput): string {
	if (!date) {
		return "";
	}
	return dayjs(date).fromNow();
}
