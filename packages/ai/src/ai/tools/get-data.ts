import { tool } from "ai";
import { z } from "zod";
import { getWebsiteDomain } from "../../lib/website-utils";
import { executeQuery, QueryBuilders } from "../../query";
import { shiftDate, todayInTimeZone } from "../../query/date-utils";
import type { QueryRequest } from "../../query/types";
import { getAppContext, resolveToolWebsite } from "./utils";

const queryItemSchema = z.object({
	type: z.string(),
	websiteId: z
		.string()
		.optional()
		.describe(
			"Target website id. Omit to use the workspace default. Required when comparing or querying a specific site in a multi-website workspace; get ids from list_websites."
		),
	from: z.string().optional(),
	to: z.string().optional(),
	preset: z
		.enum(["today", "yesterday", "last_7d", "last_14d", "last_30d", "last_90d"])
		.optional(),
	timeUnit: z.enum(["minute", "hour", "day", "week", "month"]).optional(),
	filters: z
		.array(
			z.object({
				field: z.string(),
				op: z.enum([
					"eq",
					"ne",
					"contains",
					"not_contains",
					"starts_with",
					"in",
					"not_in",
				]),
				value: z.union([
					z.string(),
					z.number(),
					z.array(z.union([z.string(), z.number()])),
				]),
				target: z.string().optional(),
				having: z.boolean().optional(),
			})
		)
		.optional(),
	groupBy: z.array(z.string()).optional(),
	orderBy: z.string().optional(),
	limit: z.number().min(1).max(1000).optional(),
	timezone: z.string().optional(),
});

type QueryItem = z.infer<typeof queryItemSchema>;

interface QueryItemResult {
	data: unknown[];
	error?: string;
	executionTime: number;
	rowCount: number;
	summary?: string;
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
	filters: QueryItem["filters"],
	groupBy: string[] | undefined
): string {
	const meta = QueryBuilders[type]?.meta;
	const title = meta?.title ?? type;
	const range = from === to ? from : `${from} → ${to}`;
	const filterPart = filters?.length
		? `filters: ${filters.map(describeFilter).join(" AND ")}`
		: "no filters applied";
	const groupPart = groupBy?.length ? `; groupBy: ${groupBy.join(", ")}` : "";
	return `${title} · ${range} · ${filterPart}${groupPart}`;
}

const MAX_MODEL_ROWS = 50;

const PRESET_DAYS = {
	last_7d: 7,
	last_14d: 14,
	last_30d: 30,
	last_90d: 90,
} as const;

function resolveDates(
	item: QueryItem,
	timeZone: string
): { from: string; to: string } {
	if (item.from && item.to) {
		return { from: item.from, to: item.to };
	}

	const today = todayInTimeZone(timeZone);

	if (item.preset === "today") {
		return { from: today, to: today };
	}
	if (item.preset === "yesterday") {
		const yesterday = shiftDate(today, -1);
		return { from: yesterday, to: yesterday };
	}

	const days = PRESET_DAYS[item.preset as keyof typeof PRESET_DAYS] ?? 7;
	return { from: shiftDate(today, -days), to: today };
}

export const getDataTool = tool({
	description:
		"Run analytics query builders for explicit data questions. Batch 1-10 queries per call. Use preset (last_7d/last_30d/...) or from+to dates. Each query may target a specific website via websiteId; omit to use the workspace default. Call discover_query_types to browse available types.",
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
		const batchStart = Date.now();

		const results = await Promise.all(
			queries.map(async (item): Promise<QueryItemResult> => {
				const queryStart = Date.now();

				if (!QueryBuilders[item.type]) {
					return {
						type: item.type,
						data: [],
						rowCount: 0,
						executionTime: 0,
						error: `Unknown query type "${item.type}". Valid types: ${Object.keys(QueryBuilders).join(", ")}`,
					};
				}

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
						executionTime: 0,
						error:
							error instanceof Error ? error.message : "Website not resolved",
					};
				}

				const domain = resolvedDomain || (await getWebsiteDomain(websiteId));
				const timezone = item.timezone ?? ctx.timezone ?? "UTC";
				const { from, to } = resolveDates(item, timezone);
				const req: QueryRequest = {
					projectId: websiteId,
					type: item.type,
					from,
					to,
					timeUnit: item.timeUnit,
					filters: item.filters as QueryRequest["filters"],
					groupBy: item.groupBy,
					orderBy: item.orderBy,
					limit: item.limit,
					timezone,
				};

				const data = await executeQuery(req, domain, timezone);
				return {
					type: item.type,
					websiteId,
					summary: buildResultSummary(
						item.type,
						from,
						to,
						item.filters,
						item.groupBy
					),
					data: data.slice(0, MAX_MODEL_ROWS),
					rowCount: data.length,
					executionTime: Date.now() - queryStart,
				};
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

		return {
			results: resultMap,
			queryCount: queries.length,
			totalExecutionTime: Date.now() - batchStart,
		};
	},
});
