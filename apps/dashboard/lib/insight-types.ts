export type InsightType =
	| "error_spike"
	| "new_errors"
	| "vitals_degraded"
	| "custom_event_spike"
	| "traffic_drop"
	| "traffic_spike"
	| "bounce_rate_change"
	| "engagement_change"
	| "referrer_change"
	| "page_trend"
	| "positive_trend"
	| "performance"
	| "uptime_issue";

export type InsightSeverity = "critical" | "warning" | "info";

export type InsightSentiment = "positive" | "neutral" | "negative";

export type InsightSource = "ai" | "history";

export type InsightMetricFormat =
	| "number"
	| "percent"
	| "duration_ms"
	| "duration_s";

export interface InsightMetric {
	current: number;
	format: InsightMetricFormat;
	label: string;
	previous?: number;
}

export interface Insight {
	changePercent?: number;
	createdAt?: string;
	currentPeriodFrom?: string | null;
	currentPeriodTo?: string | null;
	description: string;
	id: string;
	insightSource?: InsightSource;
	link: string;
	metrics?: InsightMetric[];
	previousPeriodFrom?: string | null;
	previousPeriodTo?: string | null;
	priority: number;
	sentiment: InsightSentiment;
	severity: InsightSeverity;
	suggestion: string;
	timezone?: string | null;
	title: string;
	type: InsightType;
	websiteDomain: string;
	websiteId: string;
	websiteName: string | null;
}

export interface HistoryInsightRow {
	changePercent?: number | null;
	createdAt?: string;
	currentPeriodFrom?: string | null;
	currentPeriodTo?: string | null;
	description: string;
	id: string;
	link: string;
	metrics?: InsightMetric[];
	previousPeriodFrom?: string | null;
	previousPeriodTo?: string | null;
	priority: number;
	sentiment: string;
	severity: string;
	suggestion: string;
	timezone?: string | null;
	title: string;
	type: string;
	websiteDomain: string;
	websiteId: string;
	websiteName: string | null;
}

export function mapHistoryRowToInsight(row: HistoryInsightRow): Insight {
	return {
		id: row.id,
		type: row.type as InsightType,
		severity: row.severity as InsightSeverity,
		sentiment: row.sentiment as InsightSentiment,
		priority: row.priority,
		websiteId: row.websiteId,
		websiteName: row.websiteName,
		websiteDomain: row.websiteDomain,
		title: row.title,
		description: row.description,
		suggestion: row.suggestion,
		metrics: row.metrics ?? [],
		changePercent: row.changePercent ?? undefined,
		link: row.link,
		insightSource: "history",
		createdAt: row.createdAt ?? undefined,
		currentPeriodFrom: row.currentPeriodFrom,
		currentPeriodTo: row.currentPeriodTo,
		previousPeriodFrom: row.previousPeriodFrom,
		previousPeriodTo: row.previousPeriodTo,
		timezone: row.timezone,
	};
}
