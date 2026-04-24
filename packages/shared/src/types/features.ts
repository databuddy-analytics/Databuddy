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
	RETENTION: "retention",
	USERS: "users",
	FEATURE_FLAGS: "feature_flags",
	WEB_VITALS: "web_vitals",
	ERROR_TRACKING: "error_tracking",
	GEOGRAPHIC: "geographic",
	AI_ASSISTANT: "ai_assistant",
	AI_AGENT: "ai_agent",
	TEAM_ROLES: "team_roles",
	TARGET_GROUPS: "target_groups",
} as const;

export type GatedFeatureId =
	(typeof GATED_FEATURES)[keyof typeof GATED_FEATURES];

export const HIDDEN_PRICING_FEATURES: GatedFeatureId[] = [
	GATED_FEATURES.RETENTION,
	GATED_FEATURES.ERROR_TRACKING,
	GATED_FEATURES.AI_AGENT,
	GATED_FEATURES.TEAM_ROLES,
	GATED_FEATURES.TARGET_GROUPS,
];

export type FeatureLimit = number | "unlimited" | false;

export const PLAN_FEATURE_LIMITS: Record<
	PlanId,
	Record<GatedFeatureId, FeatureLimit>
> = {
	[PLAN_IDS.FREE]: {
		[GATED_FEATURES.FUNNELS]: 1, // 1 funnel to try it out
		[GATED_FEATURES.GOALS]: 2, // 2 goals
		[GATED_FEATURES.RETENTION]: false, // Hobby+
		[GATED_FEATURES.USERS]: "unlimited", // unlimited user tracking
		[GATED_FEATURES.FEATURE_FLAGS]: 3, // 3 flags for testing
		[GATED_FEATURES.WEB_VITALS]: "unlimited",
		[GATED_FEATURES.ERROR_TRACKING]: false, // Hobby+
		[GATED_FEATURES.GEOGRAPHIC]: "unlimited",
		[GATED_FEATURES.AI_ASSISTANT]: "unlimited",
		[GATED_FEATURES.AI_AGENT]: "unlimited", // gated by agent_credits budget, not a hard lock
		[GATED_FEATURES.TEAM_ROLES]: "unlimited",
		[GATED_FEATURES.TARGET_GROUPS]: false, // Hobby+
	},
	[PLAN_IDS.HOBBY]: {
		[GATED_FEATURES.FUNNELS]: 5, // 5 funnels
		[GATED_FEATURES.GOALS]: 10, // 10 goals
		[GATED_FEATURES.RETENTION]: "unlimited",
		[GATED_FEATURES.USERS]: "unlimited",
		[GATED_FEATURES.FEATURE_FLAGS]: 10, // 10 flags
		[GATED_FEATURES.WEB_VITALS]: "unlimited",
		[GATED_FEATURES.ERROR_TRACKING]: "unlimited",
		[GATED_FEATURES.GEOGRAPHIC]: "unlimited",
		[GATED_FEATURES.AI_ASSISTANT]: "unlimited",
		[GATED_FEATURES.AI_AGENT]: "unlimited", // gated by agent_credits budget, not a hard lock
		[GATED_FEATURES.TEAM_ROLES]: "unlimited",
		[GATED_FEATURES.TARGET_GROUPS]: 5, // 5 target groups
	},
	[PLAN_IDS.PRO]: {
		[GATED_FEATURES.FUNNELS]: 50, // 50 funnels
		[GATED_FEATURES.GOALS]: "unlimited",
		[GATED_FEATURES.RETENTION]: "unlimited",
		[GATED_FEATURES.USERS]: "unlimited",
		[GATED_FEATURES.FEATURE_FLAGS]: 100, // 100 flags
		[GATED_FEATURES.WEB_VITALS]: "unlimited",
		[GATED_FEATURES.ERROR_TRACKING]: "unlimited",
		[GATED_FEATURES.GEOGRAPHIC]: "unlimited",
		[GATED_FEATURES.AI_ASSISTANT]: "unlimited",
		[GATED_FEATURES.AI_AGENT]: "unlimited",
		[GATED_FEATURES.TEAM_ROLES]: "unlimited",
		[GATED_FEATURES.TARGET_GROUPS]: 25, // 25 target groups
	},
	[PLAN_IDS.SCALE]: {
		[GATED_FEATURES.FUNNELS]: "unlimited",
		[GATED_FEATURES.GOALS]: "unlimited",
		[GATED_FEATURES.RETENTION]: "unlimited",
		[GATED_FEATURES.USERS]: "unlimited",
		[GATED_FEATURES.FEATURE_FLAGS]: "unlimited",
		[GATED_FEATURES.WEB_VITALS]: "unlimited",
		[GATED_FEATURES.ERROR_TRACKING]: "unlimited",
		[GATED_FEATURES.GEOGRAPHIC]: "unlimited",
		[GATED_FEATURES.AI_ASSISTANT]: "unlimited",
		[GATED_FEATURES.AI_AGENT]: "unlimited",
		[GATED_FEATURES.TEAM_ROLES]: "unlimited",
		[GATED_FEATURES.TARGET_GROUPS]: "unlimited",
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

export const AI_CAPABILITIES = {
	SUMMARIZATION: "summarization",
	WORKSPACE_QA: "workspace_qa",
	GLOBAL_SEARCH: "global_search",
	AUTO_INSIGHTS: "auto_insights",
	ANOMALY_DETECTION: "anomaly_detection",
	CORRELATION_ENGINE: "correlation_engine",
	SQL_TOOLING: "sql_tooling",
} as const;

export type AiCapabilityId =
	(typeof AI_CAPABILITIES)[keyof typeof AI_CAPABILITIES];

export type PlanAiCapabilities = Record<AiCapabilityId, boolean>;

export interface PlanCapabilities {
	ai: PlanAiCapabilities;
	features: Record<GatedFeatureId, boolean>;
	limits: Record<GatedFeatureId, FeatureLimit>;
}

export const PLAN_CAPABILITIES: Record<PlanId, PlanCapabilities> = {
	[PLAN_IDS.FREE]: {
		features: PLAN_FEATURES[PLAN_IDS.FREE],
		limits: PLAN_FEATURE_LIMITS[PLAN_IDS.FREE],
		ai: {
			[AI_CAPABILITIES.SUMMARIZATION]: true,
			[AI_CAPABILITIES.WORKSPACE_QA]: true,
			[AI_CAPABILITIES.GLOBAL_SEARCH]: false,
			[AI_CAPABILITIES.AUTO_INSIGHTS]: false,
			[AI_CAPABILITIES.ANOMALY_DETECTION]: false,
			[AI_CAPABILITIES.CORRELATION_ENGINE]: false,
			[AI_CAPABILITIES.SQL_TOOLING]: false,
		},
	},
	[PLAN_IDS.HOBBY]: {
		features: PLAN_FEATURES[PLAN_IDS.HOBBY],
		limits: PLAN_FEATURE_LIMITS[PLAN_IDS.HOBBY],
		ai: {
			[AI_CAPABILITIES.SUMMARIZATION]: true,
			[AI_CAPABILITIES.WORKSPACE_QA]: true,
			[AI_CAPABILITIES.GLOBAL_SEARCH]: true,
			[AI_CAPABILITIES.AUTO_INSIGHTS]: false,
			[AI_CAPABILITIES.ANOMALY_DETECTION]: false,
			[AI_CAPABILITIES.CORRELATION_ENGINE]: false,
			[AI_CAPABILITIES.SQL_TOOLING]: false,
		},
	},
	[PLAN_IDS.PRO]: {
		features: PLAN_FEATURES[PLAN_IDS.PRO],
		limits: PLAN_FEATURE_LIMITS[PLAN_IDS.PRO],
		ai: {
			[AI_CAPABILITIES.SUMMARIZATION]: true,
			[AI_CAPABILITIES.WORKSPACE_QA]: true,
			[AI_CAPABILITIES.GLOBAL_SEARCH]: true,
			[AI_CAPABILITIES.AUTO_INSIGHTS]: true,
			[AI_CAPABILITIES.ANOMALY_DETECTION]: true,
			[AI_CAPABILITIES.CORRELATION_ENGINE]: false,
			[AI_CAPABILITIES.SQL_TOOLING]: true,
		},
	},
	[PLAN_IDS.SCALE]: {
		features: PLAN_FEATURES[PLAN_IDS.SCALE],
		limits: PLAN_FEATURE_LIMITS[PLAN_IDS.SCALE],
		ai: {
			[AI_CAPABILITIES.SUMMARIZATION]: true,
			[AI_CAPABILITIES.WORKSPACE_QA]: true,
			[AI_CAPABILITIES.GLOBAL_SEARCH]: true,
			[AI_CAPABILITIES.AUTO_INSIGHTS]: true,
			[AI_CAPABILITIES.ANOMALY_DETECTION]: true,
			[AI_CAPABILITIES.CORRELATION_ENGINE]: true,
			[AI_CAPABILITIES.SQL_TOOLING]: true,
		},
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
		[GATED_FEATURES.RETENTION]: {
			name: "Retention",
			description: "Analyze user retention over time",
			upgradeMessage: "Upgrade to Hobby for retention analysis",
			minPlan: PLAN_IDS.HOBBY,
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
		[GATED_FEATURES.TARGET_GROUPS]: {
			name: "Target Groups",
			description: "Create target groups to target your users",
			upgradeMessage: "Upgrade for more target groups",
			unit: "groups",
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
		[GATED_FEATURES.AI_ASSISTANT]: {
			name: "AI Assistant",
			description: "Chat-based analytics assistant",
			upgradeMessage: "AI Assistant is available on all plans",
		},
		[GATED_FEATURES.AI_AGENT]: {
			name: "AI Agent",
			description: "Autonomous AI agent for advanced analytics insights",
			upgradeMessage: "Upgrade for more agent credits",
		},
		[GATED_FEATURES.TEAM_ROLES]: {
			name: "Team Roles",
			description: "Assign roles and permissions to team members",
			upgradeMessage: "Team members are unlimited on all plans",
			unit: "members",
		},
	};

export function isPlanFeatureEnabled(
	planId: PlanId | string | null,
	feature: GatedFeatureId
): boolean {
	const plan = (planId ?? PLAN_IDS.FREE) as PlanId;
	return PLAN_FEATURES[plan]?.[feature] ?? false;
}

export function getPlanFeatureLimit(
	planId: PlanId | string | null,
	feature: GatedFeatureId
): FeatureLimit {
	const plan = (planId ?? PLAN_IDS.FREE) as PlanId;
	return PLAN_FEATURE_LIMITS[plan]?.[feature] ?? false;
}

export function isFeatureUnlimited(
	planId: PlanId | string | null,
	feature: GatedFeatureId
): boolean {
	return getPlanFeatureLimit(planId, feature) === "unlimited";
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

export function getRemainingUsage(
	planId: PlanId | string | null,
	feature: GatedFeatureId,
	currentUsage: number
): number | "unlimited" {
	const limit = getPlanFeatureLimit(planId, feature);
	if (limit === "unlimited") {
		return "unlimited";
	}
	if (limit === false) {
		return 0;
	}
	return Math.max(0, limit - currentUsage);
}

export function getNextPlanForFeature(
	currentPlan: PlanId | string | null,
	feature: GatedFeatureId
): PlanId | null {
	const plan = (currentPlan ?? PLAN_IDS.FREE) as PlanId;
	const currentIndex = PLAN_HIERARCHY.indexOf(plan);
	const currentLimit = PLAN_FEATURE_LIMITS[plan][feature];

	for (let i = currentIndex + 1; i < PLAN_HIERARCHY.length; i++) {
		const nextPlan = PLAN_HIERARCHY[i];
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

export function isPlanAiCapabilityEnabled(
	planId: PlanId | string | null,
	capability: AiCapabilityId
): boolean {
	const plan = (planId ?? PLAN_IDS.FREE) as PlanId;
	return PLAN_CAPABILITIES[plan]?.ai[capability] ?? false;
}

export function getMinimumPlanForAiCapability(
	capability: AiCapabilityId
): PlanId | null {
	for (const plan of PLAN_HIERARCHY) {
		if (PLAN_CAPABILITIES[plan]?.ai[capability]) {
			return plan;
		}
	}
	return null;
}

export function getPlanCapabilities(
	planId: PlanId | string | null
): PlanCapabilities {
	const plan = (planId ?? PLAN_IDS.FREE) as PlanId;
	return PLAN_CAPABILITIES[plan] ?? PLAN_CAPABILITIES[PLAN_IDS.FREE];
}
