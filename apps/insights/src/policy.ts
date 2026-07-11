import type { InsightGenerationModelTier } from "@databuddy/redis";

export const INSIGHT_COOLDOWN_HOURS = 6;
export const INSIGHT_LOOKBACK_DAYS = 7;
export const INSIGHT_MAX_STEPS = 8;
export const MAX_INSIGHTS_PER_WEBSITE = 3;

const DEPTH_BY_QUALITY = {
	fast: "surface",
	balanced: "investigated",
	deep: "deep",
} as const;

export function insightDepth(quality: InsightGenerationModelTier) {
	return DEPTH_BY_QUALITY[quality];
}

export type InsightDepth = ReturnType<typeof insightDepth>;
