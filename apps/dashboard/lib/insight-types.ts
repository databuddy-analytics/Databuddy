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
	| "uptime_issue"
	| "conversion_leak"
	| "funnel_regression"
	| "channel_concentration"
	| "reliability_improved"
	| "persistent_error_hotspot"
	| "quality_shift"
	| "cross_property_dependency"
	| "performance_improved"
	| "deploy_correlation"
	| "segment_regression"
	| "error_impact"
	| "cross_signal";

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

export interface InsightEvidence {
	description: string;
	type: string;
}

export type InvestigationDepth = "surface" | "investigated" | "deep";

export type InsightActionType =
	| "fix_goal"
	| "create_funnel"
	| "add_custom_event"
	| "create_annotation"
	| "update_config"
	| "add_tracking"
	| "investigate_further"
	| "code_fix";

export interface InsightAction {
	label: string;
	params: Record<string, string>;
	type: InsightActionType;
}

export interface Insight {
	actions?: InsightAction[] | null;
	changePercent?: number;
	createdAt?: string;
	currentPeriodFrom?: string | null;
	currentPeriodTo?: string | null;
	description: string;
	evidence?: InsightEvidence[] | null;
	id: string;
	insightSource?: InsightSource;
	investigationDepth?: InvestigationDepth | null;
	link: string;
	metrics?: InsightMetric[];
	previousPeriodFrom?: string | null;
	previousPeriodTo?: string | null;
	priority: number;
	rootCause?: string | null;
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
	actions?: InsightAction[] | null;
	changePercent?: number | null;
	createdAt?: string;
	currentPeriodFrom?: string | null;
	currentPeriodTo?: string | null;
	description: string;
	evidence?: InsightEvidence[] | null;
	id: string;
	investigationDepth?: InvestigationDepth | null;
	link: string;
	metrics?: InsightMetric[];
	previousPeriodFrom?: string | null;
	previousPeriodTo?: string | null;
	priority: number;
	rootCause?: string | null;
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

export function mapHistoryRowToInsight(row: HistoryInsightRow): Insight {
	return {
		id: row.id,
		type: row.type,
		severity: row.severity,
		sentiment: row.sentiment,
		priority: row.priority,
		websiteId: row.websiteId,
		websiteName: row.websiteName,
		websiteDomain: row.websiteDomain,
		title: row.title,
		description: row.description,
		suggestion: row.suggestion,
		metrics: row.metrics ?? [],
		changePercent: row.changePercent ?? undefined,
		rootCause: row.rootCause,
		evidence: row.evidence,
		investigationDepth: row.investigationDepth,
		actions: row.actions,
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
