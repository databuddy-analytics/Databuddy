import { type AppContext, requireWebsiteId } from "../config/context";
import { executeQuery } from "../../query";
import type { QueryRequest } from "../../query/types";
import { fetchFlagChangeContext } from "./flag-context";

const DEFAULT_OPS_LIMIT = 5;

export const OPS_INSIGHT_QUERY_TYPES = [
	"errors_summary",
	"errors_by_page",
	"error_fingerprints",
	"uptime_summary",
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
	limit?: number,
	abortSignal?: AbortSignal
) {
	return executeQuery(
		{
			projectId: requireWebsiteId(appContext),
			type,
			from: range.from,
			to: range.to,
			timezone: appContext.timezone,
			limit,
		},
		appContext.websiteDomain,
		appContext.timezone,
		abortSignal
	);
}

async function getErrorsSummary(
	appContext: AppContext,
	range: { from: string; to: string },
	abortSignal?: AbortSignal
) {
	const summary = await runQuery(
		"error_summary",
		appContext,
		range,
		undefined,
		abortSignal
	);

	return {
		error_summary: Array.isArray(summary) ? summary : [],
	};
}

async function getErrorsByPage(
	appContext: AppContext,
	range: { from: string; to: string },
	limit: number,
	abortSignal?: AbortSignal
) {
	const pages = await runQuery(
		"errors_by_page",
		appContext,
		range,
		limit,
		abortSignal
	);

	return {
		errors_by_page: Array.isArray(pages) ? pages : [],
	};
}

async function getErrorFingerprints(
	appContext: AppContext,
	range: { from: string; to: string },
	limit: number,
	abortSignal?: AbortSignal
) {
	const errors = await runQuery(
		"error_fingerprints",
		appContext,
		range,
		limit,
		abortSignal
	);
	return { error_fingerprints: Array.isArray(errors) ? errors : [] };
}

async function getUptimeSummary(
	appContext: AppContext,
	range: { from: string; to: string },
	abortSignal?: AbortSignal
) {
	const uptime = await runQuery(
		"uptime_overview",
		appContext,
		range,
		undefined,
		abortSignal
	);
	const measured = Array.isArray(uptime)
		? uptime.filter(
				(row) =>
					row !== null &&
					typeof row === "object" &&
					Number((row as Record<string, unknown>).total_checks) > 0
			)
		: [];

	return {
		uptime_overview: measured,
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
	range: { from: string; to: string },
	queries: OpsInsightQuery[],
	abortSignal?: AbortSignal
) {
	const results: Record<string, unknown>[] = [];

	for (const query of queries) {
		const limit = query.limit ?? DEFAULT_OPS_LIMIT;

		switch (query.type) {
			case "errors_summary":
				results.push({
					type: query.type,
					...(await getErrorsSummary(appContext, range, abortSignal)),
				});
				break;
			case "errors_by_page":
				results.push({
					type: query.type,
					...(await getErrorsByPage(appContext, range, limit, abortSignal)),
				});
				break;
			case "error_fingerprints":
				results.push({
					type: query.type,
					...(await getErrorFingerprints(
						appContext,
						range,
						limit,
						abortSignal
					)),
				});
				break;
			case "uptime_summary":
				results.push({
					type: query.type,
					...(await getUptimeSummary(appContext, range, abortSignal)),
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

	return { results };
}
