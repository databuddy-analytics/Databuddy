import { type AppContext, requireWebsiteId } from "../config/context";
import { callRPCProcedure } from "../tools/utils";
import { executeQuery } from "../../query";
import type { QueryRequest } from "../../query/types";
import { normalizeFunnelSteps } from "@databuddy/rpc/funnel-steps";

export interface ProductInsightTarget {
	id: string;
	type: "event" | "funnel" | "goal";
}

export interface ProductMetricsResult {
	results: Record<string, unknown>[];
}

export type ProductMetricsFetcher = (
	appContext: AppContext,
	range: { from: string; to: string },
	target: ProductInsightTarget,
	abortSignal?: AbortSignal
) => Promise<ProductMetricsResult>;

export function summarizeFunnelSteps(
	steps: unknown,
	analyticsSteps: Record<string, unknown>[]
) {
	const normalized = normalizeFunnelSteps(steps);
	const analyticsByStep = new Map(
		analyticsSteps.flatMap((step) => {
			const stepNumber = toNumber(step.step_number);
			return Number.isInteger(stepNumber) && stepNumber > 0
				? [[stepNumber, step] as const]
				: [];
		})
	);

	return normalized.map((step, index) => ({
		step_number: index + 1,
		name: step.name,
		target: step.target,
		type: step.type,
		users: toNumber(analyticsByStep.get(index + 1)?.users),
	}));
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

function isoDate(value: unknown): string | null {
	const date = value instanceof Date ? value : new Date(String(value ?? ""));
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function getGoalsSummary(
	appContext: AppContext,
	range: { from: string; to: string },
	goalId: string,
	abortSignal?: AbortSignal
) {
	const goal = (await callRPCProcedure(
		"goals",
		"getById",
		{ id: goalId },
		appContext,
		abortSignal
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
		appContext,
		abortSignal
	)) as Record<string, unknown>;
	const confirmedGoal = (await callRPCProcedure(
		"goals",
		"getById",
		{ id: goalId },
		appContext,
		abortSignal
	)) as Record<string, unknown>;
	if (isoDate(goal.updatedAt) !== isoDate(confirmedGoal.updatedAt)) {
		throw new Error("Goal definition changed during evidence collection");
	}
	const steps = Array.isArray(analytics.steps_analytics)
		? (analytics.steps_analytics as Record<string, unknown>[])
		: [];
	const primaryStep = steps[0] ?? {};

	return {
		count: 1,
		goals: [
			{
				id: goal.id,
				is_active: goal.isActive,
				name: goal.name,
				type: goal.type,
				target: goal.target,
				definition_updated_at: isoDate(goal.updatedAt),
				overall_conversion_rate: toNumber(analytics.overall_conversion_rate),
				total_users_entered: toNumber(analytics.total_users_entered),
				total_users_completed: toNumber(analytics.total_users_completed),
				error_context_available: primaryStep.error_context_available === true,
				error_rate: toNumber(primaryStep.error_rate),
			},
		],
	};
}

async function getFunnelsSummary(
	appContext: AppContext,
	range: { from: string; to: string },
	funnelId: string,
	abortSignal?: AbortSignal
) {
	const funnel = (await callRPCProcedure(
		"funnels",
		"getById",
		{ id: funnelId },
		appContext,
		abortSignal
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
		appContext,
		abortSignal
	)) as Record<string, unknown>;
	const confirmedFunnel = (await callRPCProcedure(
		"funnels",
		"getById",
		{ id: funnelId },
		appContext,
		abortSignal
	)) as Record<string, unknown>;
	if (isoDate(funnel.updatedAt) !== isoDate(confirmedFunnel.updatedAt)) {
		throw new Error("Funnel definition changed during evidence collection");
	}
	const errorInsights =
		typeof analytics.error_insights === "object" &&
		analytics.error_insights !== null
			? (analytics.error_insights as Record<string, unknown>)
			: {};
	const analyticsSteps = Array.isArray(analytics.steps_analytics)
		? (analytics.steps_analytics as Record<string, unknown>[])
		: [];

	return {
		count: 1,
		funnels: [
			{
				id: funnel.id,
				is_active: funnel.isActive,
				name: funnel.name,
				definition_updated_at: isoDate(funnel.updatedAt),
				steps: summarizeFunnelSteps(funnel.steps, analyticsSteps),
				overall_conversion_rate: toNumber(analytics.overall_conversion_rate),
				total_users_entered: toNumber(analytics.total_users_entered),
				total_users_completed: toNumber(analytics.total_users_completed),
				biggest_dropoff_step: toNumber(analytics.biggest_dropoff_step),
				biggest_dropoff_rate: toNumber(analytics.biggest_dropoff_rate),
				error_context_available: errorInsights.available === true,
				error_correlation_rate: toNumber(errorInsights.error_correlation_rate),
			},
		],
	};
}

function runQuery(
	type: QueryRequest["type"],
	appContext: AppContext,
	range: { from: string; to: string },
	filters?: QueryRequest["filters"],
	abortSignal?: AbortSignal
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
		appContext.timezone,
		abortSignal
	);
}

async function getCustomEventsSummary(
	appContext: AppContext,
	range: { from: string; to: string },
	eventName: string,
	abortSignal?: AbortSignal
) {
	const summary = await runQuery(
		"custom_events_summary",
		appContext,
		range,
		[{ field: "event_name", op: "eq", value: eventName }],
		abortSignal
	);

	return {
		event: { id: eventName, name: eventName },
		custom_events: Array.isArray(summary) ? summary : [],
	};
}

export async function fetchProductMetrics(
	appContext: AppContext,
	range: { from: string; to: string },
	target: ProductInsightTarget,
	abortSignal?: AbortSignal
): Promise<ProductMetricsResult> {
	let result: Record<string, unknown>;
	switch (target.type) {
		case "goal":
			result = {
				type: "goals_summary",
				...(await getGoalsSummary(appContext, range, target.id, abortSignal)),
			};
			break;
		case "funnel":
			result = {
				type: "funnels_summary",
				...(await getFunnelsSummary(appContext, range, target.id, abortSignal)),
			};
			break;
		case "event":
			result = {
				type: "custom_events_summary",
				...(await getCustomEventsSummary(
					appContext,
					range,
					target.id,
					abortSignal
				)),
			};
			break;
		default:
			throw new Error("Unsupported product target");
	}

	return {
		results: [result],
	};
}
