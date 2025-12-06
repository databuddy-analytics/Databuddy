/**
 * Plan tiers - ordered from lowest to highest
 */
export const PLAN_IDS = {
    FREE: "free",
    HOBBY: "hobby",
    PRO: "pro",
    SCALE: "scale",
} as const;

export type PlanId = (typeof PLAN_IDS)[keyof typeof PLAN_IDS];

/** Plan tier hierarchy (index = tier level, higher = more features) */
export const PLAN_HIERARCHY: PlanId[] = [
    PLAN_IDS.FREE,
    PLAN_IDS.HOBBY,
    PLAN_IDS.PRO,
    PLAN_IDS.SCALE,
];

/** Usage-based features tracked by Autumn billing */
export const FEATURE_IDS = {
    EVENTS: "events",
    ASSISTANT_MESSAGES: "assistant_message",
} as const;

export type FeatureId = (typeof FEATURE_IDS)[keyof typeof FEATURE_IDS];

/** Gated features - locked behind specific plans (not usage-based) */
export const GATED_FEATURES = {
    // Product Analytics
    FUNNELS: "funnels",
    GOALS: "goals",
    RETENTION: "retention",
    USERS: "users",
    FEATURE_FLAGS: "feature_flags",
    // Web Analytics
    WEB_VITALS: "web_vitals",
    ERROR_TRACKING: "error_tracking",
    GEOGRAPHIC: "geographic",
    // AI
    AI_ASSISTANT: "ai_assistant",
    AI_AGENT: "ai_agent",
    // Export & API
    DATA_EXPORT: "data_export",
    API_ACCESS: "api_access",
    // Enterprise
    TEAM_ROLES: "team_roles",
} as const;

export type GatedFeatureId =
    (typeof GATED_FEATURES)[keyof typeof GATED_FEATURES];

/**
 * Plan feature matrix - edit this to control which features are enabled per plan
 */
export const PLAN_FEATURES: Record<PlanId, Record<GatedFeatureId, boolean>> = {
    [PLAN_IDS.FREE]: {
        [GATED_FEATURES.FUNNELS]: false,
        [GATED_FEATURES.GOALS]: false,
        [GATED_FEATURES.RETENTION]: false,
        [GATED_FEATURES.USERS]: true,
        [GATED_FEATURES.FEATURE_FLAGS]: false,
        [GATED_FEATURES.WEB_VITALS]: true,
        [GATED_FEATURES.ERROR_TRACKING]: false,
        [GATED_FEATURES.GEOGRAPHIC]: true,
        [GATED_FEATURES.AI_ASSISTANT]: true,
        [GATED_FEATURES.AI_AGENT]: false,
        [GATED_FEATURES.DATA_EXPORT]: true,
        [GATED_FEATURES.API_ACCESS]: false,
        [GATED_FEATURES.TEAM_ROLES]: false,
    },
    [PLAN_IDS.HOBBY]: {
        [GATED_FEATURES.FUNNELS]: false,
        [GATED_FEATURES.GOALS]: true,
        [GATED_FEATURES.RETENTION]: true,
        [GATED_FEATURES.USERS]: true,
        [GATED_FEATURES.FEATURE_FLAGS]: false,
        [GATED_FEATURES.WEB_VITALS]: true,
        [GATED_FEATURES.ERROR_TRACKING]: true,
        [GATED_FEATURES.GEOGRAPHIC]: true,
        [GATED_FEATURES.AI_ASSISTANT]: true,
        [GATED_FEATURES.AI_AGENT]: false,
        [GATED_FEATURES.DATA_EXPORT]: true,
        [GATED_FEATURES.API_ACCESS]: false,
        [GATED_FEATURES.TEAM_ROLES]: false,
    },
    [PLAN_IDS.PRO]: {
        [GATED_FEATURES.FUNNELS]: true,
        [GATED_FEATURES.GOALS]: true,
        [GATED_FEATURES.RETENTION]: true,
        [GATED_FEATURES.USERS]: true,
        [GATED_FEATURES.FEATURE_FLAGS]: true,
        [GATED_FEATURES.WEB_VITALS]: true,
        [GATED_FEATURES.ERROR_TRACKING]: true,
        [GATED_FEATURES.GEOGRAPHIC]: true,
        [GATED_FEATURES.AI_ASSISTANT]: true,
        [GATED_FEATURES.AI_AGENT]: true,
        [GATED_FEATURES.DATA_EXPORT]: true,
        [GATED_FEATURES.API_ACCESS]: true,
        [GATED_FEATURES.TEAM_ROLES]: true,
    },
    [PLAN_IDS.SCALE]: {
        [GATED_FEATURES.FUNNELS]: true,
        [GATED_FEATURES.GOALS]: true,
        [GATED_FEATURES.RETENTION]: true,
        [GATED_FEATURES.USERS]: true,
        [GATED_FEATURES.FEATURE_FLAGS]: true,
        [GATED_FEATURES.WEB_VITALS]: true,
        [GATED_FEATURES.ERROR_TRACKING]: true,
        [GATED_FEATURES.GEOGRAPHIC]: true,
        [GATED_FEATURES.AI_ASSISTANT]: true,
        [GATED_FEATURES.AI_AGENT]: true,
        [GATED_FEATURES.DATA_EXPORT]: true,
        [GATED_FEATURES.API_ACCESS]: true,
        [GATED_FEATURES.TEAM_ROLES]: true,
    },
};

/** AI capability identifiers */
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

/** AI capabilities per plan */
export type PlanAiCapabilities = Record<AiCapabilityId, boolean>;

/** Complete plan capabilities including features and AI capabilities */
export interface PlanCapabilities {
    features: Record<GatedFeatureId, boolean>;
    ai: PlanAiCapabilities;
}

/**
 * Plan capabilities matrix - combines features and AI capabilities per plan
 */
export const PLAN_CAPABILITIES: Record<PlanId, PlanCapabilities> = {
    [PLAN_IDS.FREE]: {
        features: PLAN_FEATURES[PLAN_IDS.FREE],
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
    name: string;
    description: string;
    upgradeMessage: string;
    minPlan?: PlanId;
}

export const FEATURE_METADATA: Record<FeatureId | GatedFeatureId, FeatureMeta> =
{
    [FEATURE_IDS.EVENTS]: {
        name: "Events",
        description: "Track pageviews and custom events",
        upgradeMessage: "Upgrade to track more events",
    },
    [FEATURE_IDS.ASSISTANT_MESSAGES]: {
        name: "AI Messages",
        description: "Chat with your analytics assistant",
        upgradeMessage: "Upgrade for more AI messages",
    },
    [GATED_FEATURES.FUNNELS]: {
        name: "Funnels",
        description: "Create conversion funnels to track user flows",
        upgradeMessage: "Upgrade to Pro to create funnels",
        minPlan: PLAN_IDS.PRO,
    },
    [GATED_FEATURES.GOALS]: {
        name: "Goals",
        description: "Set and track conversion goals",
        upgradeMessage: "Upgrade to Hobby to create goals",
        minPlan: PLAN_IDS.HOBBY,
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
        upgradeMessage: "Upgrade to Pro for feature flags",
        minPlan: PLAN_IDS.PRO,
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
        upgradeMessage: "Upgrade to Pro for AI Agent access",
        minPlan: PLAN_IDS.PRO,
    },
    [GATED_FEATURES.DATA_EXPORT]: {
        name: "Data Export",
        description: "Export your analytics data to CSV or JSON",
        upgradeMessage: "Data Export is available on all plans",
    },
    [GATED_FEATURES.API_ACCESS]: {
        name: "API Access",
        description: "Access your analytics data via REST API",
        upgradeMessage: "Upgrade to Pro for API access",
        minPlan: PLAN_IDS.PRO,
    },
    [GATED_FEATURES.TEAM_ROLES]: {
        name: "Team Roles",
        description: "Assign roles and permissions to team members",
        upgradeMessage: "Upgrade to Pro for team roles",
        minPlan: PLAN_IDS.PRO,
    },
};

/** Check if a plan has access to a gated feature */
export function isPlanFeatureEnabled(
    planId: PlanId | string | null,
    feature: GatedFeatureId
): boolean {
    const plan = (planId ?? PLAN_IDS.FREE) as PlanId;
    return PLAN_FEATURES[plan]?.[feature] ?? false;
}

/** Get the minimum plan required for a feature */
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

/** Check if a plan has access to an AI capability */
export function isPlanAiCapabilityEnabled(
    planId: PlanId | string | null,
    capability: AiCapabilityId
): boolean {
    const plan = (planId ?? PLAN_IDS.FREE) as PlanId;
    return PLAN_CAPABILITIES[plan]?.ai[capability] ?? false;
}

/** Get the minimum plan required for an AI capability */
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

/** Get all capabilities for a plan */
export function getPlanCapabilities(
    planId: PlanId | string | null
): PlanCapabilities {
    const plan = (planId ?? PLAN_IDS.FREE) as PlanId;
    return PLAN_CAPABILITIES[plan] ?? PLAN_CAPABILITIES[PLAN_IDS.FREE];
}
