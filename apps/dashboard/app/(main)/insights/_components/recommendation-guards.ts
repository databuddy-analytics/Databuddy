import type {
	InsightMeasurementRecommendation,
	InsightNativeRecommendationAction,
	InsightRecommendation,
} from "@databuddy/shared/insights";
import type { InsightRecommendation as InsightRecommendationItem } from "@/lib/insight-api";

type Recommendation = NonNullable<InsightRecommendation>;

type DatabuddySetupRecommendation = Extract<
	Recommendation,
	{ kind: "databuddy_setup" }
>;

type GoalRecommendation = Extract<
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

type MeasurementGapRecommendation = Extract<
	InsightMeasurementRecommendation,
	{ kind: "measurement_gap" }
>;

export type NativeRecommendationIntent =
	| InsightNativeRecommendationAction
	| {
			recommendation: InstrumentationRecommendation;
			type: "instrumentation.guide";
	  }
	| {
			recommendation: MeasurementGapRecommendation;
			type: "measurement_gap.guide";
	  }
	| {
			recommendation: DatabuddySetupRecommendation;
			type: "databuddy_setup.guide";
	  };

export function isGoalRecommendation(
	recommendation: Recommendation
): recommendation is GoalRecommendation {
	return (
		"operation" in recommendation &&
		(recommendation.operation === "delete" ||
			recommendation.operation === "edit")
	);
}

export function isDatabuddySetupRecommendation(
	recommendation: Recommendation
): recommendation is DatabuddySetupRecommendation {
	return "kind" in recommendation && recommendation.kind === "databuddy_setup";
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

export function isMeasurementGapRecommendation(
	recommendation: Recommendation
): recommendation is MeasurementGapRecommendation {
	return "kind" in recommendation && recommendation.kind === "measurement_gap";
}

export function getNativeRecommendationIntent(
	insight: InsightRecommendationItem
): NativeRecommendationIntent | null {
	const { recommendation } = insight;
	if ("nativeAction" in recommendation) {
		return recommendation.nativeAction;
	}
	if (isConversionDraftRecommendation(recommendation)) {
		return recommendation.kind === "goal_draft"
			? { draft: recommendation.draft, type: "goal.create" }
			: { draft: recommendation.draft, type: "funnel.create" };
	}
	if (
		insight.signal.entity.type === "goal" &&
		isGoalRecommendation(recommendation)
	) {
		return recommendation.operation === "edit"
			? {
					changes: recommendation.changes,
					goalId: insight.signal.entity.id,
					type: "goal.update",
				}
			: {
					goalId: insight.signal.entity.id,
					type: "goal.delete",
				};
	}
	if (isInstrumentationRecommendation(recommendation)) {
		return { recommendation, type: "instrumentation.guide" };
	}
	if (isMeasurementGapRecommendation(recommendation)) {
		return { recommendation, type: "measurement_gap.guide" };
	}
	if (isDatabuddySetupRecommendation(recommendation)) {
		return { recommendation, type: "databuddy_setup.guide" };
	}
	return null;
}
