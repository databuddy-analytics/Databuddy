"use client";

import type { InsightRecommendation } from "@/lib/insight-api";
import { ConversionDraftRecommendationAction } from "./conversion-draft-recommendation";
import { FeatureFlagRecommendationAction } from "./feature-flag-recommendation-action";
import { GoalRecommendationAction } from "./goal-recommendation-action";
import { RecommendationGuideAction } from "./recommendation-guide-action";
import { getNativeRecommendationIntent } from "./recommendation-guards";
import { TargetGroupRecommendationAction } from "./target-group-recommendation-action";

export function NativeRecommendationAction({
	insight,
}: {
	insight: InsightRecommendation;
}) {
	const action = getNativeRecommendationIntent(insight);
	if (!action) {
		return null;
	}

	switch (action.type) {
		case "goal.create":
		case "funnel.create":
			return (
				<ConversionDraftRecommendationAction
					action={action}
					recommendationId={insight.id}
					websiteId={insight.websiteId}
				/>
			);
		case "goal.update":
		case "goal.delete":
			return (
				<GoalRecommendationAction
					action={action}
					goalLabel={insight.signal.entity.label}
					recommendationId={insight.id}
					websiteId={insight.websiteId}
				/>
			);
		case "feature_flag.create":
			return (
				<FeatureFlagRecommendationAction
					action={action}
					recommendationId={insight.id}
					websiteId={insight.websiteId}
				/>
			);
		case "target_group.create":
			return (
				<TargetGroupRecommendationAction
					action={action}
					recommendationId={insight.id}
					websiteId={insight.websiteId}
				/>
			);
		case "instrumentation.guide":
		case "measurement_gap.guide":
		case "databuddy_setup.guide":
			return <RecommendationGuideAction action={action} />;
		default:
			return null;
	}
}

export function hasNativeRecommendationAction(
	insight: InsightRecommendation
): boolean {
	return getNativeRecommendationIntent(insight) !== null;
}
