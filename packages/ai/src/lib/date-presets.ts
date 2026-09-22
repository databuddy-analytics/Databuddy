export const DatePresets = {
	today: "today",
	yesterday: "yesterday",
	last_7d: "last_7d",
	last_14d: "last_14d",
	last_30d: "last_30d",
	last_90d: "last_90d",
	this_week: "this_week",
	last_week: "last_week",
	this_month: "this_month",
	last_month: "last_month",
	this_year: "this_year",
} as const;

export type DatePreset = keyof typeof DatePresets;

export const MCP_DATE_PRESETS = Object.keys(DatePresets) as DatePreset[];

const ROLLING_DATE_OFFSETS: Partial<
	Record<DatePreset, readonly [start: number, end: number]>
> = {
	today: [0, 0],
	yesterday: [-1, -1],
	last_7d: [-6, 0],
	last_14d: [-13, 0],
	last_30d: [-29, 0],
	last_90d: [-89, 0],
};

function getCalendarDate(timezone: string, now: Date): Date {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("en-CA", {
			day: "2-digit",
			month: "2-digit",
			timeZone: timezone,
			year: "numeric",
		})
			.formatToParts(now)
			.map(({ type, value }) => [type, value])
	);
	return new Date(
		Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
	);
}

function shiftCalendarDate(date: Date, days: number): Date {
	const shifted = new Date(date);
	shifted.setUTCDate(shifted.getUTCDate() + days);
	return shifted;
}

export function resolveDatePreset(
	preset: DatePreset,
	timezone: string,
	now = new Date()
): { from: string; to: string; startDate: string; endDate: string } {
	const today = getCalendarDate(timezone, now);
	const fmt = (d: Date) => d.toISOString().split("T")[0] as string;
	const result = (from: string, to: string) => ({
		from,
		to,
		startDate: from,
		endDate: to,
	});
	const rollingOffsets = ROLLING_DATE_OFFSETS[preset];
	if (rollingOffsets) {
		return result(
			fmt(shiftCalendarDate(today, rollingOffsets[0])),
			fmt(shiftCalendarDate(today, rollingOffsets[1]))
		);
	}

	switch (preset) {
		case "this_week": {
			return result(
				fmt(shiftCalendarDate(today, -today.getUTCDay())),
				fmt(today)
			);
		}
		case "last_week": {
			const end = shiftCalendarDate(today, -today.getUTCDay() - 1);
			const start = shiftCalendarDate(end, -6);
			return result(fmt(start), fmt(end));
		}
		case "this_month": {
			const d = new Date(
				Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)
			);
			return result(fmt(d), fmt(today));
		}
		case "last_month": {
			const end = new Date(
				Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)
			);
			const start = new Date(
				Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)
			);
			return result(fmt(start), fmt(end));
		}
		case "this_year": {
			const d = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
			return result(fmt(d), fmt(today));
		}
		default:
			return result(fmt(today), fmt(today));
	}
}
