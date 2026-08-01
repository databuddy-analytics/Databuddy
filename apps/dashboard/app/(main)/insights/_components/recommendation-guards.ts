import type {
	InsightMeasurementRecommendation,
	InsightRecommendation,
} from "@databuddy/shared/insights";

type Recommendation = NonNullable<InsightRecommendation>;

export type GoalRecommendation = Extract<
	Recommendation,
	{ operation: "delete" | "edit" }
>;

type ConversionDraftRecommendation = Extract<
	InsightMeasurementRecommendation,
	{ kind: "goal_draft" | "funnel_draft" }
>;

type InstrumentationRecommendation = Extract<
	InsightMeasurementRecommendation,
	{ kind: "instrumentation" }
>;

export function isGoalRecommendation(
	recommendation: Recommendation
): recommendation is GoalRecommendation {
	return (
		"operation" in recommendation &&
		(recommendation.operation === "delete" ||
			recommendation.operation === "edit")
	);
}

export function isConversionDraftRecommendation(
	recommendation: Recommendation
): recommendation is ConversionDraftRecommendation {
	return (
		"kind" in recommendation &&
		(recommendation.kind === "goal_draft" ||
			recommendation.kind === "funnel_draft")
	);
}

export function isInstrumentationRecommendation(
	recommendation: Recommendation
): recommendation is InstrumentationRecommendation {
	return "kind" in recommendation && recommendation.kind === "instrumentation";
}
