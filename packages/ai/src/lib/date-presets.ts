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

export function resolveDatePreset(
	preset: DatePreset,
	timezone: string
): { from: string; to: string; startDate: string; endDate: string } {
	const today = new Date(
		new Date().toLocaleDateString("en-CA", { timeZone: timezone })
	);
	const fmt = (d: Date) => d.toISOString().split("T")[0] as string;

	const result = (from: string, to: string) => ({
		from,
		to,
		startDate: from,
		endDate: to,
	});

	switch (preset) {
		case "today":
			return result(fmt(today), fmt(today));
		case "yesterday": {
			const d = new Date(today);
			d.setDate(d.getDate() - 1);
			return result(fmt(d), fmt(d));
		}
		case "last_7d": {
			const d = new Date(today);
			d.setDate(d.getDate() - 6);
			return result(fmt(d), fmt(today));
		}
		case "last_14d": {
			const d = new Date(today);
			d.setDate(d.getDate() - 13);
			return result(fmt(d), fmt(today));
		}
		case "last_30d": {
			const d = new Date(today);
			d.setDate(d.getDate() - 29);
			return result(fmt(d), fmt(today));
		}
		case "last_90d": {
			const d = new Date(today);
			d.setDate(d.getDate() - 89);
			return result(fmt(d), fmt(today));
		}
		case "this_week": {
			const d = new Date(today);
			d.setDate(d.getDate() - d.getDay());
			return result(fmt(d), fmt(today));
		}
		case "last_week": {
			const end = new Date(today);
			end.setDate(end.getDate() - end.getDay() - 1);
			const start = new Date(end);
			start.setDate(start.getDate() - 6);
			return result(fmt(start), fmt(end));
		}
		case "this_month": {
			const d = new Date(today.getFullYear(), today.getMonth(), 1);
			return result(fmt(d), fmt(today));
		}
		case "last_month": {
			const end = new Date(today.getFullYear(), today.getMonth(), 0);
			const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
			return result(fmt(start), fmt(end));
		}
		case "this_year": {
			const d = new Date(today.getFullYear(), 0, 1);
			return result(fmt(d), fmt(today));
		}
		default:
			return result(fmt(today), fmt(today));
	}
}
