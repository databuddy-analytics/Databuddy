import type {
	AiCapabilityId,
	FeatureLimit,
	GatedFeatureId,
	PlanId,
} from "@databuddy/shared/types/features";
import {
	getMinimumPlanForAiCapability,
	getNextPlanForFeature,
	getPlanCapabilities,
	getPlanFeatureLimit,
	getRemainingUsage,
	isFeatureAvailable,
	isPlanAiCapabilityEnabled,
	isPlanFeatureEnabled,
	isWithinLimit,
	PLAN_HIERARCHY,
	PLAN_IDS,
} from "@databuddy/shared/types/features";
import { ORPCError } from "@orpc/server";

/**
 * Billing context included in the RPC context
 * This is automatically populated when a user is authenticated
 */
export interface BillingContext {
	/** Whether the current user can upgrade the plan */
	canUserUpgrade: boolean;
	/** The customer ID for billing (user ID or org owner ID) */
	customerId: string;
	/** Whether the billing is based on an organization */
	isOrganization: boolean;
	/** The current plan ID (e.g., 'free', 'hobby', 'pro', 'scale') */
	planId: string;
}

/**
 * Helper to check if a user has a specific plan or higher
 *
 * @example
 * ```ts
 * if (hasPlan((await context.getBilling())?.planId, PLAN_IDS.PRO)) {
 *   // User has pro or higher
 * }
 * ```
 */
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

/**
 * Helper to check if a user is on the free plan
 *
 * @example
 * ```ts
 * if (isFreePlan((await context.getBilling())?.planId)) {
 *   throw errors.FEATURE_UNAVAILABLE({ data: { feature: "export" } });
 * }
 * ```
 */
export function isFreePlan(planId: string | undefined): boolean {
	return !planId || planId.toLowerCase() === PLAN_IDS.FREE;
}

/**
 * Check if a feature is enabled for the user's plan
 *
 * @example
 * ```ts
 * if (!canAccessFeature((await context.getBilling())?.planId, GATED_FEATURES.AI_AGENT)) {
 *   throw errors.FEATURE_UNAVAILABLE({ data: { feature: "ai_agent", requiredPlan: "pro" } });
 * }
 * ```
 */
export function canAccessFeature(
	planId: string | undefined,
	feature: GatedFeatureId
): boolean {
	return isPlanFeatureEnabled(planId ?? null, feature);
}

/**
 * Check if an AI capability is enabled for the user's plan
 *
 * @example
 * ```ts
 * if (!canAccessAiCapability((await context.getBilling())?.planId, AI_CAPABILITIES.AUTO_INSIGHTS)) {
 *   throw errors.FEATURE_UNAVAILABLE({ data: { feature: "auto_insights", requiredPlan: "pro" } });
 * }
 * ```
 */
export function canAccessAiCapability(
	planId: string | undefined,
	capability: AiCapabilityId
): boolean {
	return isPlanAiCapabilityEnabled(planId ?? null, capability);
}

/**
 * Get the feature limit for the user's plan
 *
 * @example
 * ```ts
 * const limit = getFeatureLimit((await context.getBilling())?.planId, GATED_FEATURES.FUNNELS);
 * if (limit === false) {
 *   throw errors.FEATURE_UNAVAILABLE({ data: { feature: "funnels" } });
 * }
 * ```
 */
export function getFeatureLimit(
	planId: string | undefined,
	feature: GatedFeatureId
): FeatureLimit {
	return getPlanFeatureLimit(planId ?? null, feature);
}

/**
 * Check if current usage is within the plan's limit for a feature
 *
 * @example
 * ```ts
 * const funnelCount = await getFunnelCount(websiteId);
 * if (!isUsageWithinLimit((await context.getBilling())?.planId, GATED_FEATURES.FUNNELS, funnelCount)) {
 *   throw errors.PLAN_LIMIT_EXCEEDED({ data: { limit: 5, current: funnelCount } });
 * }
 * ```
 */
export function isUsageWithinLimit(
	planId: string | undefined,
	feature: GatedFeatureId,
	currentUsage: number
): boolean {
	return isWithinLimit(planId ?? null, feature, currentUsage);
}

/**
 * Get how much usage is remaining for a feature
 *
 * @example
 * ```ts
 * const remaining = getUsageRemaining((await context.getBilling())?.planId, GATED_FEATURES.GOALS, currentGoalCount);
 * if (remaining === 0) {
 *   throw errors.PLAN_LIMIT_EXCEEDED({ data: { limit: 3, current: currentGoalCount } });
 * }
 * ```
 */
export function getUsageRemaining(
	planId: string | undefined,
	feature: GatedFeatureId,
	currentUsage: number
): number | "unlimited" {
	return getRemainingUsage(planId ?? null, feature, currentUsage);
}

/**
 * Throws an error if the feature is not available on the user's plan.
 * Uses FEATURE_UNAVAILABLE error code for type-safe client handling.
 *
 * @example
 * ```ts
 * requireFeature((await context.getBilling())?.planId, GATED_FEATURES.AI_AGENT);
 * // Throws if user doesn't have access
 * ```
 */
export function requireFeature(
	planId: string | undefined,
	feature: GatedFeatureId
): void {
	if (!isFeatureAvailable(planId ?? null, feature)) {
		const nextPlan = getNextPlanForFeature(planId ?? null, feature);
		throw new ORPCError("FEATURE_UNAVAILABLE", {
			message: nextPlan
				? `This feature requires ${nextPlan} plan or higher`
				: "This feature is not available on your current plan",
			data: { feature, requiredPlan: nextPlan ?? undefined },
		});
	}
}

/**
 * Checks feature availability AND usage limit in one call.
 * Throws FEATURE_UNAVAILABLE if the feature isn't on the plan,
 * or PLAN_LIMIT_EXCEEDED if the usage limit is reached.
 *
 * @example
 * ```ts
 * requireFeatureWithLimit(workspace.plan, GATED_FEATURES.FUNNELS, existingCount);
 * ```
 */
export function requireFeatureWithLimit(
	planId: string | undefined,
	feature: GatedFeatureId,
	currentUsage: number
): void {
	requireFeature(planId, feature);
	requireUsageWithinLimit(planId, feature, currentUsage);
}

/**
 * Throws an error if current usage exceeds the plan's limit.
 * Uses PLAN_LIMIT_EXCEEDED error code for type-safe client handling.
 *
 * @example
 * ```ts
 * const funnelCount = await db.query.funnels.findMany({ where: eq(funnels.websiteId, websiteId) }).length;
 * requireUsageWithinLimit(workspace.plan, GATED_FEATURES.FUNNELS, funnelCount);
 * ```
 */
export function requireUsageWithinLimit(
	planId: string | undefined,
	feature: GatedFeatureId,
	currentUsage: number
): void {
	if (!isWithinLimit(planId ?? null, feature, currentUsage)) {
		const limit = getPlanFeatureLimit(planId ?? null, feature);
		const nextPlan = getNextPlanForFeature(planId ?? null, feature);

		if (limit === false) {
			throw new ORPCError("FEATURE_UNAVAILABLE", {
				message: nextPlan
					? `This feature requires ${nextPlan} plan or higher`
					: "This feature is not available on your current plan",
				data: { feature, requiredPlan: nextPlan ?? undefined },
			});
		}

		throw new ORPCError("PLAN_LIMIT_EXCEEDED", {
			message: nextPlan
				? `Limit of ${limit} reached. Upgrade to ${nextPlan} for more.`
				: `Limit of ${limit} reached`,
			data: { limit, current: currentUsage, nextPlan: nextPlan ?? undefined },
		});
	}
}

/**
 * Get all capabilities for the user's plan
 *
 * @example
 * ```ts
 * const capabilities = getUserCapabilities((await context.getBilling())?.planId);
 * console.log(capabilities.features, capabilities.limits, capabilities.ai);
 * ```
 */
export function getUserCapabilities(planId: string | undefined) {
	return getPlanCapabilities(planId ?? null);
}

/**
 * Throws an error if the AI capability is not available.
 * Uses FEATURE_UNAVAILABLE error code for type-safe client handling.
 *
 * @example
 * ```ts
 * requireAiCapability((await context.getBilling())?.planId, AI_CAPABILITIES.AUTO_INSIGHTS);
 * ```
 */
export function requireAiCapability(
	planId: string | undefined,
	capability: AiCapabilityId
): void {
	if (!isPlanAiCapabilityEnabled(planId ?? null, capability)) {
		const minPlan = getMinimumPlanForAiCapability(capability);
		throw new ORPCError("FEATURE_UNAVAILABLE", {
			message: minPlan
				? `This AI capability requires ${minPlan} plan or higher`
				: "This AI capability is not available on your current plan",
			data: { feature: capability, requiredPlan: minPlan ?? undefined },
		});
	}
}
