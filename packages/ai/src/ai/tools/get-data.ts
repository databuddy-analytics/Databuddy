import { TraitFilterError } from "@databuddy/services/identity";
import { captureError } from "../../lib/tracing";
import { tool } from "ai";
import { z } from "zod";
import { getWebsiteDomain } from "../../lib/website-utils";
import {
	executeQuery,
	publicQueryErrorMessage,
	getQueryBuilder,
	QueryBuilders,
	queryPlanGateError,
	SANITIZED_QUERY_ERROR,
	WEBSITE_QUERY_TYPES,
} from "../../query";
import { resolveDatePreset } from "../../lib/date-presets";
import type { CompiledQuery, QueryRequest } from "../../query/types";
import { agentDataInputSchema } from "../mcp/agent-query-schema";
import {
	capRowArrays,
	keepsNewestRows,
	MCP_RESULT_ROW_LIMIT,
	queryItemError,
} from "../mcp/mcp-utils";
import { normalizeClickHouseDateTime } from "../../query/date-utils";
import {
	getAppContext,
	resolveToolWebsite,
	toolDateRangeError,
} from "./utils/context";

const queryItemSchema = agentDataInputSchema.shape.queries.element
	.extend({
		type: z.enum(WEBSITE_QUERY_TYPES),
		websiteId: z
			.string()
			.nullish()
			.transform((value) => value ?? undefined)
			.describe("Target website id; null uses the workspace default."),
		timezone: z
			.string()
			.nullish()
			.transform((value) => value ?? undefined)
			.describe("IANA timezone; null uses the conversation timezone."),
	})
	.refine(({ from, to, preset }) => {
		if (preset && (from !== undefined || to !== undefined)) {
			return false;
		}
		return (
			Boolean(from) === Boolean(to) &&
			!(
				from &&
				to &&
				normalizeClickHouseDateTime(from) >
					normalizeClickHouseDateTime(to, { endOfDay: true })
			)
		);
	}, "Use a preset with from/to null, or both dates with preset null in chronological order.");

type QueryItem = z.infer<typeof queryItemSchema>;

interface QueryItemResult {
	data: Record<string, unknown>[];
	definition?: string;
	error?: string;
	filters?: QueryItem["filters"];
	from?: string;
	query?: CompiledQuery;
	returnedRows?: number;
	rowCount: number;
	summary?: string;
	timezone?: string;
	to?: string;
	truncated?: boolean;
	type: string;
	websiteId?: string;
}

function describeFilter(f: NonNullable<QueryItem["filters"]>[number]): string {
	const value = Array.isArray(f.value) ? f.value.join(",") : f.value;
	const op = f.op === "eq" ? "=" : f.op === "ne" ? "!=" : ` ${f.op} `;
	return `${f.field}${op}${value}`;
}

function buildResultSummary(
	type: string,
	from: string,
	to: string,
	filters: QueryItem["filters"]
): string {
	const meta = getQueryBuilder(type)?.meta;
	const title = meta?.title ?? type;
	const range = from === to ? from : `${from} → ${to}`;
	const filterPart = filters?.length
		? `filters: ${filters.map(describeFilter).join(" AND ")}`
		: "no filters applied";
	return `${title} · ${range} · ${filterPart}`;
}

const MAX_DISPLAY_PARAM_VALUES = 10;
const MS_PER_DAY = 86_400_000;

function displayQuery({ sql, params }: CompiledQuery): CompiledQuery {
	return {
		sql,
		params: Object.fromEntries(
			Object.entries(params).map(([name, value]) => [
				name,
				Array.isArray(value) && value.length > MAX_DISPLAY_PARAM_VALUES
					? `${value.length} values`
					: value,
			])
		),
	};
}

export function getDataModelOutput({
	output,
}: {
	output: { results: Record<string, QueryItemResult> };
}) {
	return {
		type: "text" as const,
		value: JSON.stringify({
			results: Object.fromEntries(
				Object.entries(output.results).map(
					([key, { query: _query, data, ...result }]) => [
						key,
						{ ...result, data: data.map(capRowArrays) },
					]
				)
			),
		}),
	};
}

function describeQueryError(error: unknown): string {
	if (error instanceof TraitFilterError) {
		return error.message;
	}
	const message = publicQueryErrorMessage(error);
	if (message === SANITIZED_QUERY_ERROR) {
		captureError(error, { tool: "get_data", step: "execute_query" });
	}
	return message;
}

function resolveDates(
	item: QueryItem,
	timeZone: string,
	currentDateTime?: string
): { from: string; to: string } {
	if (item.from && item.to) {
		return { from: item.from, to: item.to };
	}
	const reference = currentDateTime ? new Date(currentDateTime) : new Date();
	return resolveDatePreset(
		item.preset ?? "last_30d",
		timeZone,
		Number.isNaN(reference.getTime()) ? new Date() : reference
	);
}

export const getDataTool = tool({
	description: `Run analytics query builders for explicit data questions. Batch 1-10 queries per call. Use preset (last_7d/last_30d/...) or from+to dates; omitted dates default to last_30d in the context timezone. Read the returned definition for population and percentage semantics. Each query may target a specific website via websiteId; omit to use the workspace default. Filters select rows: never supply target or having. discover_query_types lists allowed and required filters. Results include at most ${MCP_RESULT_ROW_LIMIT} rows; rowCount is the number of query rows, not the whole population. Query limits may exclude more rows even when truncated is false. Never infer absence, totals, or completeness from a ranked list; query the exact subject or use an aggregate builder.`,
	inputSchema: z.object({
		queries: z
			.array(queryItemSchema)
			.min(1)
			.max(10)
			.describe(
				"One to ten explicit analytics query builder requests needed to answer the user's latest data question."
			),
	}),
	execute: async ({ queries }, options) => {
		const ctx = getAppContext(options);
		const showQueries = ctx.source === "dashboard";

		const results = await Promise.all(
			queries.map(async (item): Promise<QueryItemResult> => {
				let websiteId: string;
				let resolvedDomain: string | undefined;
				try {
					const resolved = resolveToolWebsite(ctx, item.websiteId);
					websiteId = resolved.websiteId;
					resolvedDomain = resolved.domain;
				} catch (error) {
					return {
						type: item.type,
						websiteId: item.websiteId,
						data: [],
						rowCount: 0,
						error:
							error instanceof Error ? error.message : "Website not resolved",
					};
				}

				try {
					const domain = resolvedDomain || (await getWebsiteDomain(websiteId));
					const timezone = item.timezone ?? ctx.timezone ?? "UTC";
					const { from, to } = resolveDates(
						item,
						timezone,
						ctx.currentDateTime
					);
					const config = QueryBuilders[item.type];
					const days =
						(Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) /
						MS_PER_DAY;
					const blocked =
						toolDateRangeError(from, to, ctx, timezone) ??
						queryItemError(item.type, config, item, days) ??
						(await queryPlanGateError([item.type], { websiteId }));
					if (blocked) {
						return {
							type: item.type,
							websiteId,
							data: [],
							rowCount: 0,
							error: blocked,
						};
					}
					const keepNewest = keepsNewestRows(config, item.orderBy);
					const req: QueryRequest = {
						projectId: websiteId,
						type: item.type,
						from,
						to,
						timeUnit: item.timeUnit,
						filters: item.filters,
						orderBy: item.orderBy,
						limit: keepNewest ? undefined : item.limit,
						timezone,
					};

					const executed: { query?: CompiledQuery } = {};
					const data = await executeQuery(
						req,
						domain,
						timezone,
						options.abortSignal,
						showQueries
							? (query) => {
									executed.query = displayQuery(query);
								}
							: undefined
					);
					const rowLimit = Math.min(
						item.limit ?? MCP_RESULT_ROW_LIMIT,
						MCP_RESULT_ROW_LIMIT
					);
					const rows = keepNewest
						? data.slice(-rowLimit)
						: data.slice(0, rowLimit);
					return {
						type: item.type,
						definition: config.meta?.description,
						websiteId,
						filters: item.filters ?? [],
						from,
						to,
						timezone,
						summary: buildResultSummary(item.type, from, to, item.filters),
						data: rows,
						query: executed.query,
						returnedRows: rows.length,
						rowCount: data.length,
						truncated: rows.length < data.length,
					};
				} catch (error) {
					return {
						type: item.type,
						websiteId,
						data: [],
						rowCount: 0,
						error: describeQueryError(error),
					};
				}
			})
		);

		const resultMap: Record<string, QueryItemResult> = {};
		for (const r of results) {
			const base = r.websiteId ? `${r.type}@${r.websiteId}` : r.type;
			let key = resultMap[r.type] ? base : r.type;
			let n = 2;
			while (resultMap[key]) {
				key = `${base}#${n++}`;
			}
			resultMap[key] = r;
		}

		return { results: resultMap };
	},
});
