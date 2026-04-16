import type { AppContext } from "../config/context";
import { callRPCProcedure } from "../tools/utils";
import { executeQuery } from "../../query";
import type { QueryRequest } from "../../query/types";
import { fetchFlagChangeContext } from "./flag-context";
import type { WeekOverWeekPeriod } from "./types";

const DEFAULT_OPS_LIMIT = 5;

export const OPS_INSIGHT_QUERY_TYPES = [
	"errors_summary",
	"errors_by_page",
	"uptime_summary",
	"anomaly_summary",
	"flag_changes",
] as const;

export type OpsInsightQueryType = (typeof OPS_INSIGHT_QUERY_TYPES)[number];

export interface OpsInsightQuery {
	limit?: number;
	type: OpsInsightQueryType;
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

async function getErrorsSummary(
	appContext: AppContext,
	range: { from: string; to: string }
) {
	const summary = await runQuery("error_summary", appContext, range);

	return {
		error_summary: Array.isArray(summary) ? summary : [],
	};
}

async function getErrorsByPage(
	appContext: AppContext,
	range: { from: string; to: string },
	limit: number
) {
	const pages = await runQuery("errors_by_page", appContext, range, limit);

	return {
		errors_by_page: Array.isArray(pages) ? pages : [],
	};
}

async function getUptimeSummary(
	appContext: AppContext,
	range: { from: string; to: string }
) {
	const uptime = await runQuery("uptime_overview", appContext, range);

	return {
		uptime_overview: Array.isArray(uptime) ? uptime : [],
	};
}

async function getAnomalySummary(
	appContext: AppContext,
	period: "current" | "previous",
	limit: number
) {
	if (period !== "current") {
		return {
			anomalies: [],
			note: "Anomaly detection is only available for the current window.",
		};
	}

	const anomalies = await callRPCProcedure(
		"anomalies",
		"detect",
		{ websiteId: appContext.websiteId },
		appContext
	);

	return {
		anomalies: Array.isArray(anomalies) ? anomalies.slice(0, limit) : [],
	};
}

async function getFlagChanges(
	appContext: AppContext,
	range: { from: string; to: string },
	limit: number
) {
	return await fetchFlagChangeContext(appContext, range, limit);
}

export async function fetchOpsMetrics(
	appContext: AppContext,
	periodBounds: WeekOverWeekPeriod,
	period: "current" | "previous",
	queries: OpsInsightQuery[]
) {
	const range =
		period === "current" ? periodBounds.current : periodBounds.previous;
	const results: Record<string, unknown>[] = [];

	for (const query of queries) {
		const limit = query.limit ?? DEFAULT_OPS_LIMIT;

		switch (query.type) {
			case "errors_summary":
				results.push({
					type: query.type,
					...(await getErrorsSummary(appContext, range)),
				});
				break;
			case "errors_by_page":
				results.push({
					type: query.type,
					...(await getErrorsByPage(appContext, range, limit)),
				});
				break;
			case "uptime_summary":
				results.push({
					type: query.type,
					...(await getUptimeSummary(appContext, range)),
				});
				break;
			case "anomaly_summary":
				results.push({
					type: query.type,
					...(await getAnomalySummary(appContext, period, limit)),
				});
				break;
			case "flag_changes":
				results.push({
					type: query.type,
					...(await getFlagChanges(appContext, range, limit)),
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
