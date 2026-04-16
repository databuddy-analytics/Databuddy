import type { AppContext } from "../config/context";
import { callRPCProcedure } from "../tools/utils";
import { executeQuery } from "../../query";
import type { QueryRequest } from "../../query/types";
import type { WeekOverWeekPeriod } from "./types";

const DEFAULT_PRODUCT_LIMIT = 5;

export const PRODUCT_INSIGHT_QUERY_TYPES = [
	"goals_summary",
	"funnels_summary",
	"retention_summary",
	"custom_events_summary",
] as const;

export type ProductInsightQueryType =
	(typeof PRODUCT_INSIGHT_QUERY_TYPES)[number];

export interface ProductInsightQuery {
	limit?: number;
	type: ProductInsightQueryType;
}

function toNumber(value: unknown): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return 0;
}

async function getGoalsSummary(
	appContext: AppContext,
	range: { from: string; to: string },
	limit: number
) {
	const goals = await callRPCProcedure(
		"goals",
		"list",
		{ websiteId: appContext.websiteId },
		appContext
	);

	if (!Array.isArray(goals) || goals.length === 0) {
		return { count: 0, goals: [] };
	}

	const selectedGoals = goals.slice(0, limit) as Record<string, unknown>[];
	const summaries = await Promise.all(
		selectedGoals.map(async (goal) => {
			const analytics = (await callRPCProcedure(
				"goals",
				"getAnalytics",
				{
					goalId: goal.id,
					websiteId: appContext.websiteId,
					startDate: range.from,
					endDate: range.to,
				},
				appContext
			)) as Record<string, unknown>;

			const steps = Array.isArray(analytics.steps_analytics)
				? (analytics.steps_analytics as Record<string, unknown>[])
				: [];
			const primaryStep = steps[0] ?? {};

			return {
				id: goal.id,
				name: goal.name,
				type: goal.type,
				target: goal.target,
				overall_conversion_rate: toNumber(analytics.overall_conversion_rate),
				total_users_entered: toNumber(analytics.total_users_entered),
				total_users_completed: toNumber(analytics.total_users_completed),
				error_rate: toNumber(primaryStep.error_rate),
			};
		})
	);

	return { count: goals.length, goals: summaries };
}

async function getFunnelsSummary(
	appContext: AppContext,
	range: { from: string; to: string },
	limit: number
) {
	const funnels = await callRPCProcedure(
		"funnels",
		"list",
		{ websiteId: appContext.websiteId },
		appContext
	);

	if (!Array.isArray(funnels) || funnels.length === 0) {
		return { count: 0, funnels: [] };
	}

	const selectedFunnels = funnels.slice(0, limit) as Record<string, unknown>[];
	const summaries = await Promise.all(
		selectedFunnels.map(async (funnel) => {
			const analytics = (await callRPCProcedure(
				"funnels",
				"getAnalytics",
				{
					funnelId: funnel.id,
					websiteId: appContext.websiteId,
					startDate: range.from,
					endDate: range.to,
				},
				appContext
			)) as Record<string, unknown>;

			const errorInsights =
				typeof analytics.error_insights === "object" &&
				analytics.error_insights !== null
					? (analytics.error_insights as Record<string, unknown>)
					: {};

			return {
				id: funnel.id,
				name: funnel.name,
				overall_conversion_rate: toNumber(analytics.overall_conversion_rate),
				total_users_entered: toNumber(analytics.total_users_entered),
				total_users_completed: toNumber(analytics.total_users_completed),
				biggest_dropoff_step: toNumber(analytics.biggest_dropoff_step),
				biggest_dropoff_rate: toNumber(analytics.biggest_dropoff_rate),
				error_correlation_rate: toNumber(errorInsights.error_correlation_rate),
			};
		})
	);

	return { count: funnels.length, funnels: summaries };
}

function runQuery(
	type: QueryRequest["type"],
	appContext: AppContext,
	range: { from: string; to: string },
	limit?: number
) {
	return executeQuery(
		{
			projectId: appContext.websiteId,
			type,
			from: range.from,
			to: range.to,
			timezone: appContext.timezone,
			limit,
		},
		appContext.websiteDomain,
		appContext.timezone
	);
}

async function getRetentionSummary(
	appContext: AppContext,
	range: { from: string; to: string },
	limit: number
) {
	const [retentionRate, cohorts] = await Promise.all([
		runQuery("retention_rate", appContext, range, limit),
		runQuery("retention_cohorts", appContext, range, limit),
	]);

	return {
		retention_rate: Array.isArray(retentionRate) ? retentionRate : [],
		retention_cohorts: Array.isArray(cohorts) ? cohorts : [],
	};
}

async function getCustomEventsSummary(
	appContext: AppContext,
	range: { from: string; to: string },
	limit: number
) {
	const summary = await runQuery(
		"custom_events_summary",
		appContext,
		range,
		limit
	);

	return {
		custom_events: Array.isArray(summary) ? summary : [],
	};
}

export async function fetchProductMetrics(
	appContext: AppContext,
	periodBounds: WeekOverWeekPeriod,
	period: "current" | "previous",
	queries: ProductInsightQuery[]
) {
	const range =
		period === "current" ? periodBounds.current : periodBounds.previous;
	const results: Record<string, unknown>[] = [];

	for (const query of queries) {
		const limit = query.limit ?? DEFAULT_PRODUCT_LIMIT;

		switch (query.type) {
			case "goals_summary":
				results.push({
					type: query.type,
					...(await getGoalsSummary(appContext, range, limit)),
				});
				break;
			case "funnels_summary":
				results.push({
					type: query.type,
					...(await getFunnelsSummary(appContext, range, limit)),
				});
				break;
			case "retention_summary":
				results.push({
					type: query.type,
					...(await getRetentionSummary(appContext, range, limit)),
				});
				break;
			case "custom_events_summary":
				results.push({
					type: query.type,
					...(await getCustomEventsSummary(appContext, range, limit)),
				});
				break;
			default:
				break;
		}
	}

	return {
		period,
		range,
		results,
	};
}
