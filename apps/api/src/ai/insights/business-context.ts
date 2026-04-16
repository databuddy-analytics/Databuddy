import type { AppContext } from "../config/context";
import { callRPCProcedure } from "../tools/utils";
import { executeQuery } from "../../query";
import type { QueryRequest } from "../../query/types";
import type { WeekOverWeekPeriod } from "./types";

const DEFAULT_BUSINESS_LIMIT = 5;

export const BUSINESS_INSIGHT_QUERY_TYPES = [
	"revenue_summary",
	"revenue_attribution",
	"revenue_by_product",
] as const;

export type BusinessInsightQueryType =
	(typeof BUSINESS_INSIGHT_QUERY_TYPES)[number];

export interface BusinessInsightQuery {
	limit?: number;
	type: BusinessInsightQueryType;
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

async function getRevenueConfig(appContext: AppContext) {
	const config = await callRPCProcedure(
		"revenue",
		"get",
		{ websiteId: appContext.websiteId },
		appContext
	);

	return config !== null;
}

async function getRevenueSummary(
	appContext: AppContext,
	range: { from: string; to: string }
) {
	const summary = await runQuery("revenue_overview", appContext, range);

	return {
		revenue_overview: Array.isArray(summary) ? summary : [],
	};
}

async function getRevenueAttribution(
	appContext: AppContext,
	range: { from: string; to: string }
) {
	const attribution = await runQuery(
		"revenue_attribution_overview",
		appContext,
		range
	);

	return {
		revenue_attribution: Array.isArray(attribution) ? attribution : [],
	};
}

async function getRevenueByProduct(
	appContext: AppContext,
	range: { from: string; to: string },
	limit: number
) {
	const products = await runQuery(
		"revenue_by_product",
		appContext,
		range,
		limit
	);

	return {
		revenue_by_product: Array.isArray(products) ? products : [],
	};
}

export async function fetchBusinessMetrics(
	appContext: AppContext,
	periodBounds: WeekOverWeekPeriod,
	period: "current" | "previous",
	queries: BusinessInsightQuery[]
) {
	const range =
		period === "current" ? periodBounds.current : periodBounds.previous;
	const revenueConfigured = await getRevenueConfig(appContext);
	const results: Record<string, unknown>[] = [];

	for (const query of queries) {
		const limit = query.limit ?? DEFAULT_BUSINESS_LIMIT;

		switch (query.type) {
			case "revenue_summary":
				results.push({
					type: query.type,
					revenue_configured: revenueConfigured,
					...(await getRevenueSummary(appContext, range)),
				});
				break;
			case "revenue_attribution":
				results.push({
					type: query.type,
					revenue_configured: revenueConfigured,
					...(await getRevenueAttribution(appContext, range)),
				});
				break;
			case "revenue_by_product":
				results.push({
					type: query.type,
					revenue_configured: revenueConfigured,
					...(await getRevenueByProduct(appContext, range, limit)),
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
