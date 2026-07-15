import type {
	Insight,
	InsightAction,
	InsightActionType,
	InsightEvidence,
	InsightMetric,
	InsightType,
} from "@/lib/insight-types";

const DEFAULT_PRIMARY_ACTION_LABEL = "Open analytics";

const SUPPORTED_ACTION_TYPES = new Set<InsightActionType>([
	"code_fix",
	"investigate_further",
	"create_annotation",
	"create_funnel",
	"fix_goal",
	"add_custom_event",
	"add_tracking",
]);

const PRIMARY_ACTION_LABELS: Partial<Record<InsightType, string>> = {
	bounce_rate_change: "Review traffic quality",
	channel_concentration: "Compare channels",
	conversion_leak: "Inspect funnel",
	cross_property_dependency: "Review traffic path",
	engagement_change: "Review sessions",
	error_spike: "Review errors",
	funnel_regression: "Inspect funnel",
	new_errors: "Review errors",
	page_trend: "Review page",
	performance: "Review speed",
	performance_improved: "Review speed",
	persistent_error_hotspot: "Review errors",
	quality_shift: "Review sessions",
	referrer_change: "Compare referrers",
	reliability_improved: "Review errors",
	traffic_drop: "Review traffic",
	traffic_spike: "Review traffic",
	uptime_issue: "Review uptime",
	vitals_degraded: "Review speed",
};

export interface InsightCardViewModel {
	actions: InsightAction[];
	headline: string;
	investigationEvidence: InsightEvidence[];
	metaLabel: string;
	metrics: InsightMetric[];
	nextStep: string;
	primaryActionLabel: string;
	rootCause: string | null;
	whatChanged: string;
}

export function toInsightCardViewModel(insight: Insight): InsightCardViewModel {
	return {
		actions: (insight.actions ?? []).filter((action) =>
			SUPPORTED_ACTION_TYPES.has(action.type)
		),
		headline: insight.title,
		investigationEvidence: insight.evidence ?? [],
		metaLabel: insight.websiteName ?? insight.websiteDomain,
		metrics: insight.metrics ?? [],
		nextStep: insight.suggestion,
		primaryActionLabel:
			PRIMARY_ACTION_LABELS[insight.type] ?? DEFAULT_PRIMARY_ACTION_LABEL,
		rootCause: insight.rootCause ?? null,
		whatChanged: insight.description,
	};
}
