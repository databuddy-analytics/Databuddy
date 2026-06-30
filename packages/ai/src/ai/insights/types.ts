export interface InsightMetricRow {
	current: number;
	format: "number" | "percent" | "duration_ms" | "duration_s";
	label: string;
	previous?: number;
}

export interface WebPeriodData {
	browsers: Record<string, unknown>[];
	countries: Record<string, unknown>[];
	errorSummary: Record<string, unknown>[];
	summary: Record<string, unknown>[];
	topPages: Record<string, unknown>[];
	topReferrers: Record<string, unknown>[];
	vitalsOverview: Record<string, unknown>[];
}

export interface WeekOverWeekPeriod {
	current: { from: string; to: string };
	previous: { from: string; to: string };
}
