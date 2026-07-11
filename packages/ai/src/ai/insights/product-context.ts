import { type AppContext, requireWebsiteId } from "../config/context";
import { callRPCProcedure } from "../tools/utils";
import { executeQuery } from "../../query";
import type { QueryRequest } from "../../query/types";

export interface ProductInsightTarget {
	id: string;
	type: "event" | "funnel" | "goal";
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
	goalId: string
) {
	const goal = (await callRPCProcedure(
		"goals",
		"getById",
		{ id: goalId },
		appContext
	)) as Record<string, unknown>;
	const analytics = (await callRPCProcedure(
		"goals",
		"getAnalytics",
		{
			goalId,
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
		count: 1,
		goals: [
			{
				id: goal.id,
				name: goal.name,
				type: goal.type,
				target: goal.target,
				overall_conversion_rate: toNumber(analytics.overall_conversion_rate),
				total_users_entered: toNumber(analytics.total_users_entered),
				total_users_completed: toNumber(analytics.total_users_completed),
				error_rate: toNumber(primaryStep.error_rate),
			},
		],
	};
}

async function getFunnelsSummary(
	appContext: AppContext,
	range: { from: string; to: string },
	funnelId: string
) {
	const funnel = (await callRPCProcedure(
		"funnels",
		"getById",
		{ id: funnelId },
		appContext
	)) as Record<string, unknown>;
	const analytics = (await callRPCProcedure(
		"funnels",
		"getAnalytics",
		{
			funnelId,
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
		count: 1,
		funnels: [
			{
				id: funnel.id,
				name: funnel.name,
				overall_conversion_rate: toNumber(analytics.overall_conversion_rate),
				total_users_entered: toNumber(analytics.total_users_entered),
				total_users_completed: toNumber(analytics.total_users_completed),
				biggest_dropoff_step: toNumber(analytics.biggest_dropoff_step),
				biggest_dropoff_rate: toNumber(analytics.biggest_dropoff_rate),
				error_correlation_rate: toNumber(errorInsights.error_correlation_rate),
			},
		],
	};
}

function runQuery(
	type: QueryRequest["type"],
	appContext: AppContext,
	range: { from: string; to: string },
	filters?: QueryRequest["filters"]
) {
	return executeQuery(
		{
			projectId: requireWebsiteId(appContext),
			type,
			from: range.from,
			to: range.to,
			timezone: appContext.timezone,
			filters,
		},
		appContext.websiteDomain,
		appContext.timezone
	);
}

async function getCustomEventsSummary(
	appContext: AppContext,
	range: { from: string; to: string },
	eventName: string
) {
	const summary = await runQuery("custom_events_summary", appContext, range, [
		{ field: "event_name", op: "eq", value: eventName },
	]);

	return {
		event: { id: eventName, name: eventName },
		custom_events: Array.isArray(summary) ? summary : [],
	};
}

export async function fetchProductMetrics(
	appContext: AppContext,
	range: { from: string; to: string },
	target: ProductInsightTarget
) {
	let result: Record<string, unknown>;
	switch (target.type) {
		case "goal":
			result = {
				type: "goals_summary",
				...(await getGoalsSummary(appContext, range, target.id)),
			};
			break;
		case "funnel":
			result = {
				type: "funnels_summary",
				...(await getFunnelsSummary(appContext, range, target.id)),
			};
			break;
		case "event":
			result = {
				type: "custom_events_summary",
				...(await getCustomEventsSummary(appContext, range, target.id)),
			};
			break;
		default:
			throw new Error("Unsupported product target");
	}

	return {
		results: [result],
	};
}
