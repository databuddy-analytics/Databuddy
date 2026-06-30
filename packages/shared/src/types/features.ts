export const PLAN_IDS = {
	FREE: "free",
	HOBBY: "hobby",
	PRO: "pro",
	SCALE: "scale",
} as const;

export type PlanId = (typeof PLAN_IDS)[keyof typeof PLAN_IDS];

export const PLAN_HIERARCHY: PlanId[] = [
	PLAN_IDS.FREE,
	PLAN_IDS.HOBBY,
	PLAN_IDS.PRO,
	PLAN_IDS.SCALE,
];

export const FEATURE_IDS = {
	EVENTS: "events",
	AGENT_CREDITS: "agent_credits",
} as const;

export type FeatureId = (typeof FEATURE_IDS)[keyof typeof FEATURE_IDS];

export const GATED_FEATURES = {
	FUNNELS: "funnels",
	GOALS: "goals",
	USERS: "users",
	FEATURE_FLAGS: "feature_flags",
	WEB_VITALS: "web_vitals",
	ERROR_TRACKING: "error_tracking",
	GEOGRAPHIC: "geographic",
} as const;

export type GatedFeatureId =
	(typeof GATED_FEATURES)[keyof typeof GATED_FEATURES];

export const HIDDEN_PRICING_FEATURES: GatedFeatureId[] = [];

export type FeatureLimit = number | "unlimited" | false;

export const PLAN_FEATURE_LIMITS: Record<
	PlanId,
	Record<GatedFeatureId, FeatureLimit>
> = {
	[PLAN_IDS.FREE]: {
		[GATED_FEATURES.FUNNELS]: 1, // 1 funnel to try it out
		[GATED_FEATURES.GOALS]: 2, // 2 goals
		[GATED_FEATURES.USERS]: "unlimited", // unlimited user tracking
		[GATED_FEATURES.FEATURE_FLAGS]: 3, // 3 flags for testing
		[GATED_FEATURES.WEB_VITALS]: "unlimited",
		[GATED_FEATURES.ERROR_TRACKING]: false, // Hobby+
		[GATED_FEATURES.GEOGRAPHIC]: "unlimited",
	},
	[PLAN_IDS.HOBBY]: {
		[GATED_FEATURES.FUNNELS]: 5, // 5 funnels
		[GATED_FEATURES.GOALS]: 10, // 10 goals
		[GATED_FEATURES.USERS]: "unlimited",
		[GATED_FEATURES.FEATURE_FLAGS]: 10, // 10 flags
		[GATED_FEATURES.WEB_VITALS]: "unlimited",
		[GATED_FEATURES.ERROR_TRACKING]: "unlimited",
		[GATED_FEATURES.GEOGRAPHIC]: "unlimited",
	},
	[PLAN_IDS.PRO]: {
		[GATED_FEATURES.FUNNELS]: 50, // 50 funnels
		[GATED_FEATURES.GOALS]: "unlimited",
		[GATED_FEATURES.USERS]: "unlimited",
		[GATED_FEATURES.FEATURE_FLAGS]: 100, // 100 flags
		[GATED_FEATURES.WEB_VITALS]: "unlimited",
		[GATED_FEATURES.ERROR_TRACKING]: "unlimited",
		[GATED_FEATURES.GEOGRAPHIC]: "unlimited",
	},
	[PLAN_IDS.SCALE]: {
		[GATED_FEATURES.FUNNELS]: "unlimited",
		[GATED_FEATURES.GOALS]: "unlimited",
		[GATED_FEATURES.USERS]: "unlimited",
		[GATED_FEATURES.FEATURE_FLAGS]: "unlimited",
		[GATED_FEATURES.WEB_VITALS]: "unlimited",
		[GATED_FEATURES.ERROR_TRACKING]: "unlimited",
		[GATED_FEATURES.GEOGRAPHIC]: "unlimited",
	},
};

const PLAN_FEATURES: Record<
	PlanId,
	Record<GatedFeatureId, boolean>
> = Object.fromEntries(
	PLAN_HIERARCHY.map((planId) => [
		planId,
		Object.fromEntries(
			Object.values(GATED_FEATURES).map((f) => [
				f,
				PLAN_FEATURE_LIMITS[planId][f] !== false,
			])
		),
	])
) as Record<PlanId, Record<GatedFeatureId, boolean>>;

export interface PlanCapabilities {
	features: Record<GatedFeatureId, boolean>;
	limits: Record<GatedFeatureId, FeatureLimit>;
}

export function normalizePlanId(planId: PlanId | string | null): PlanId {
	const normalized = (planId ?? PLAN_IDS.FREE).toLowerCase();
	return PLAN_HIERARCHY.includes(normalized as PlanId)
		? (normalized as PlanId)
		: PLAN_IDS.FREE;
}

export const PLAN_CAPABILITIES: Record<PlanId, PlanCapabilities> = {
	[PLAN_IDS.FREE]: {
		features: PLAN_FEATURES[PLAN_IDS.FREE],
		limits: PLAN_FEATURE_LIMITS[PLAN_IDS.FREE],
	},
	[PLAN_IDS.HOBBY]: {
		features: PLAN_FEATURES[PLAN_IDS.HOBBY],
		limits: PLAN_FEATURE_LIMITS[PLAN_IDS.HOBBY],
	},
	[PLAN_IDS.PRO]: {
		features: PLAN_FEATURES[PLAN_IDS.PRO],
		limits: PLAN_FEATURE_LIMITS[PLAN_IDS.PRO],
	},
	[PLAN_IDS.SCALE]: {
		features: PLAN_FEATURES[PLAN_IDS.SCALE],
		limits: PLAN_FEATURE_LIMITS[PLAN_IDS.SCALE],
	},
};

interface FeatureMeta {
	description: string;
	minPlan?: PlanId;
	name: string;
	unit?: string; // e.g., "funnels", "flags", "exports/month"
	upgradeMessage: string;
}

export const FEATURE_METADATA: Record<FeatureId | GatedFeatureId, FeatureMeta> =
	{
		[FEATURE_IDS.EVENTS]: {
			name: "Events",
			description: "Track pageviews and custom events",
			upgradeMessage: "Upgrade to track more events",
		},
		[FEATURE_IDS.AGENT_CREDITS]: {
			name: "Agent Credits",
			description:
				"Credits power Databunny conversations. Heavier questions consume more credits.",
			upgradeMessage: "Upgrade for more agent credits",
			unit: "credits",
		},
		[GATED_FEATURES.FUNNELS]: {
			name: "Funnels",
			description: "Create conversion funnels to track user flows",
			upgradeMessage: "Upgrade for more funnels",
			unit: "funnels",
		},
		[GATED_FEATURES.GOALS]: {
			name: "Goals",
			description: "Set and track conversion goals",
			upgradeMessage: "Upgrade for more goals",
			unit: "goals",
		},
		[GATED_FEATURES.USERS]: {
			name: "Users",
			description: "Track individual user behavior and sessions",
			upgradeMessage: "Users is available on all plans",
		},
		[GATED_FEATURES.FEATURE_FLAGS]: {
			name: "Feature Flags",
			description: "Control feature rollouts with targeting rules",
			upgradeMessage: "Upgrade for more feature flags",
			unit: "flags",
		},
		[GATED_FEATURES.WEB_VITALS]: {
			name: "Web Vitals",
			description: "Monitor Core Web Vitals and performance",
			upgradeMessage: "Web Vitals is available on all plans",
		},
		[GATED_FEATURES.ERROR_TRACKING]: {
			name: "Error Tracking",
			description: "Capture and analyze JavaScript errors",
			upgradeMessage: "Upgrade to Hobby for error tracking",
			minPlan: PLAN_IDS.HOBBY,
		},
		[GATED_FEATURES.GEOGRAPHIC]: {
			name: "Geographic",
			description: "View visitor locations on a map",
			upgradeMessage: "Geographic is available on all plans",
		},
	};

export function isPlanFeatureEnabled(
	planId: PlanId | string | null,
	feature: GatedFeatureId
): boolean {
	const plan = normalizePlanId(planId);
	return PLAN_FEATURES[plan][feature];
}

export function getPlanFeatureLimit(
	planId: PlanId | string | null,
	feature: GatedFeatureId
): FeatureLimit {
	const plan = normalizePlanId(planId);
	return PLAN_FEATURE_LIMITS[plan][feature];
}

export function isFeatureAvailable(
	planId: PlanId | string | null,
	feature: GatedFeatureId
): boolean {
	const limit = getPlanFeatureLimit(planId, feature);
	return limit === "unlimited" || (typeof limit === "number" && limit > 0);
}

export function isWithinLimit(
	planId: PlanId | string | null,
	feature: GatedFeatureId,
	currentUsage: number
): boolean {
	const limit = getPlanFeatureLimit(planId, feature);
	if (limit === "unlimited") {
		return true;
	}
	if (limit === false) {
		return false;
	}
	return currentUsage < limit;
}

export function getNextPlanForFeature(
	currentPlan: PlanId | string | null,
	feature: GatedFeatureId
): PlanId | null {
	const plan = normalizePlanId(currentPlan);
	const currentIndex = PLAN_HIERARCHY.indexOf(plan);
	const currentLimit = PLAN_FEATURE_LIMITS[plan][feature];

	for (let i = currentIndex + 1; i < PLAN_HIERARCHY.length; i++) {
		const nextPlan = PLAN_HIERARCHY[i];
		if (!nextPlan) {
			continue;
		}
		const nextLimit = PLAN_FEATURE_LIMITS[nextPlan][feature];

		if (nextLimit === "unlimited") {
			return nextPlan;
		}
		if (
			typeof nextLimit === "number" &&
			typeof currentLimit === "number" &&
			nextLimit > currentLimit
		) {
			return nextPlan;
		}
		if (typeof nextLimit === "number" && currentLimit === false) {
			return nextPlan;
		}
	}

	return null;
}

export function getMinimumPlanForFeature(
	feature: GatedFeatureId
): PlanId | null {
	for (const plan of PLAN_HIERARCHY) {
		if (PLAN_FEATURES[plan][feature]) {
			return plan;
		}
	}
	return null;
}

export function getPlanCapabilities(
	planId: PlanId | string | null
): PlanCapabilities {
	return PLAN_CAPABILITIES[normalizePlanId(planId)];
}
