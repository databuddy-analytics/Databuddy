import type { GatedFeatureId } from "@databuddy/shared/types/features";
import {
	getFeatureUnavailableMessage,
	getNextPlanForFeature,
	getPlanFeatureLimit,
	getPlanLimitMessage,
	isFeatureAvailable,
	isWithinLimit,
} from "@databuddy/shared/types/features";
import { rpcError } from "../errors";

function requireFeature(
	planId: string | undefined,
	feature: GatedFeatureId
): void {
	if (!isFeatureAvailable(planId ?? null, feature)) {
		const nextPlan = getNextPlanForFeature(planId ?? null, feature);
		throw rpcError.featureUnavailable(
			feature,
			nextPlan ?? undefined,
			getFeatureUnavailableMessage(feature, nextPlan)
		);
	}
}

export function requireFeatureWithLimit(
	planId: string | undefined,
	feature: GatedFeatureId,
	currentUsage: number
): void {
	requireFeature(planId, feature);
	requireUsageWithinLimit(planId, feature, currentUsage);
}

export function requireUsageWithinLimit(
	planId: string | undefined,
	feature: GatedFeatureId,
	currentUsage: number
): void {
	if (!isWithinLimit(planId ?? null, feature, currentUsage)) {
		const limit = getPlanFeatureLimit(planId ?? null, feature);
		const nextPlan = getNextPlanForFeature(planId ?? null, feature);

		if (limit === false) {
			throw rpcError.featureUnavailable(
				feature,
				nextPlan ?? undefined,
				getFeatureUnavailableMessage(feature, nextPlan)
			);
		}
		if (limit === "unlimited") {
			return;
		}

		throw rpcError.planLimitExceeded({
			feature,
			limit,
			current: currentUsage,
			nextPlan: nextPlan ?? undefined,
			message: getPlanLimitMessage(planId ?? null, feature, limit, nextPlan),
		});
	}
}
