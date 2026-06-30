import type {
	FeatureLimit,
	GatedFeatureId,
	PlanId,
} from "@databuddy/shared/types/features";
import {
	getNextPlanForFeature,
	getPlanFeatureLimit,
	isFeatureAvailable,
	isWithinLimit,
	PLAN_HIERARCHY,
	PLAN_IDS,
} from "@databuddy/shared/types/features";
import { rpcError } from "../errors";

export interface BillingContext {
	canUserUpgrade: boolean;
	customerId: string;
	isOrganization: boolean;
	planId: string;
}

export function hasPlan(
	currentPlan: string | undefined,
	requiredPlan: PlanId
): boolean {
	if (!currentPlan) {
		return requiredPlan === PLAN_IDS.FREE;
	}

	const currentIndex = PLAN_HIERARCHY.indexOf(currentPlan as PlanId);
	const requiredIndex = PLAN_HIERARCHY.indexOf(requiredPlan);

	if (currentIndex === -1) {
		return false;
	}

	return currentIndex >= requiredIndex;
}

export function isFreePlan(planId: string | undefined): boolean {
	return !planId || planId.toLowerCase() === PLAN_IDS.FREE;
}

export function getFeatureLimit(
	planId: string | undefined,
	feature: GatedFeatureId
): FeatureLimit {
	return getPlanFeatureLimit(planId ?? null, feature);
}

export function isUsageWithinLimit(
	planId: string | undefined,
	feature: GatedFeatureId,
	currentUsage: number
): boolean {
	return isWithinLimit(planId ?? null, feature, currentUsage);
}

export function requireFeature(
	planId: string | undefined,
	feature: GatedFeatureId
): void {
	if (!isFeatureAvailable(planId ?? null, feature)) {
		const nextPlan = getNextPlanForFeature(planId ?? null, feature);
		throw rpcError.featureUnavailable(feature, nextPlan ?? undefined);
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
			throw rpcError.featureUnavailable(feature, nextPlan ?? undefined);
		}
		if (limit === "unlimited") {
			return;
		}

		throw rpcError.planLimitExceeded(
			limit,
			currentUsage,
			nextPlan ?? undefined,
			nextPlan
				? `Limit of ${limit} reached. Upgrade to ${nextPlan} for more.`
				: `Limit of ${limit} reached`
		);
	}
}
