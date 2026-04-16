import type { ParsedInsight } from "../schemas/smart-insights-output";

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

export interface InsightSignalMetric {
	current?: number;
	format: InsightMetricRow["format"];
	label: string;
	previous?: number;
}

export interface InsightSignal {
	changePercent?: number;
	current?: number;
	label: string;
	metadata?: Record<string, unknown>;
	previous?: number;
	source: "business" | "ops" | "product" | "web";
	subjectKey: string;
	type: ParsedInsight["type"];
}
