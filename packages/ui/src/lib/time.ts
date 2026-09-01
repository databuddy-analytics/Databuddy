import dayjs, { guessTimezone } from "./dayjs";

const localTz = guessTimezone();

export function toLocalTime(date: string | Date | dayjs.Dayjs): dayjs.Dayjs {
	return dayjs.utc(date).tz(localTz);
}

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

export function formatTime(
	date: string | Date | dayjs.Dayjs | undefined | null
): string {
	return formatLocalTime(date, "HH:mm:ss");
}

export function formatDateTime(
	date: string | Date | dayjs.Dayjs | undefined | null
): string {
	return formatLocalTime(date, "MMM D, YYYY HH:mm:ss");
}

export function formatDateOnly(
	date: string | Date | dayjs.Dayjs | undefined | null
): string {
	return formatLocalTime(date, "MMM D, YYYY");
}

export function localDayjs(date?: string | Date | dayjs.Dayjs): dayjs.Dayjs {
	if (!date) {
		return dayjs().tz(localTz);
	}
	return dayjs.utc(date).tz(localTz);
}
