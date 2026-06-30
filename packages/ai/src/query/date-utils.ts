const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME_RE =
	/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;
const TZ_DATE_TIME_RE =
	/^(\d{4}-\d{2}-\d{2})[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;
const DOUBLE_TIME_END_RE = /^(.+\d{2}:\d{2}:\d{2}) 23:59:59$/;
const NORMALIZED_QUERY_DATE_RE = /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/;

function pad(value: number): string {
	return value.toString().padStart(2, "0");
}

function formatUtcDateTime(date: Date): string {
	return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
		date.getUTCDate()
	)} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(
		date.getUTCSeconds()
	)}`;
}

export function isNormalizedQueryDate(input: string): boolean {
	return NORMALIZED_QUERY_DATE_RE.test(input);
}

export function normalizeClickHouseDateTime(
	input: string,
	options: { endOfDay?: boolean } = {}
): string {
	const value = input.trim();
	const doubleTime = value.match(DOUBLE_TIME_END_RE);
	if (doubleTime?.[1]) {
		return normalizeClickHouseDateTime(doubleTime[1], options);
	}

	if (DATE_ONLY_RE.test(value)) {
		return options.endOfDay ? `${value} 23:59:59` : value;
	}

	if (TZ_DATE_TIME_RE.test(value)) {
		const parsed = new Date(value.replace(" ", "T"));
		if (!Number.isNaN(parsed.getTime())) {
			return formatUtcDateTime(parsed);
		}
	}

	const local = value.match(LOCAL_DATE_TIME_RE);
	if (local) {
		const date = local[1];
		const hour = local[2];
		const minute = local[3];
		const second = local[4] ?? "00";
		if (date && hour && minute) {
			return `${date} ${hour}:${minute}:${second}`;
		}
	}

	const parsed = new Date(value);
	if (!Number.isNaN(parsed.getTime())) {
		return formatUtcDateTime(parsed);
	}

	return value.replace("T", " ");
}

export function padToClickHouseDateTime(value: string): string {
	return DATE_ONLY_RE.test(value) ? `${value} 00:00:00` : value;
}

export function todayInTimeZone(
	timeZone: string,
	now: Date = new Date()
): string {
	try {
		return new Intl.DateTimeFormat("en-CA", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).format(now);
	} catch {
		return now.toISOString().slice(0, 10);
	}
}

export function shiftDate(date: string, deltaDays: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + deltaDays);
	return d.toISOString().slice(0, 10);
}
