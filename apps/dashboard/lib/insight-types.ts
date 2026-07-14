import type { InsightsHistoryPage } from "@/lib/insight-api";

export type Insight = InsightsHistoryPage["insights"][number];

export type InsightType = Insight["type"];
export type InsightSeverity = Insight["severity"];
export type InsightSentiment = Insight["sentiment"];
export type InsightStatus = NonNullable<Insight["status"]>;
export type InsightResolvedReason = NonNullable<Insight["resolvedReason"]>;
export type InsightMetric = NonNullable<Insight["metrics"]>[number];
export type InsightMetricFormat = InsightMetric["format"];
export type InsightEvidence = NonNullable<Insight["evidence"]>[number];
export type InsightAction = NonNullable<Insight["actions"]>[number];
export type InsightActionType = InsightAction["type"];
