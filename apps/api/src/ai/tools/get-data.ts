import { tool } from "ai";
import { z } from "zod";
import { getWebsiteDomain } from "../../lib/website-utils";
import { executeQuery, QueryBuilders } from "../../query";
import type { QueryRequest } from "../../query/types";

const queryItemSchema = z.object({
	type: z.string(),
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
	type: string;
}

const MAX_MODEL_ROWS = 50;

function resolveDates(item: QueryItem): { from: string; to: string } {
	if (item.from && item.to) {
		return { from: item.from, to: item.to };
	}

	const now = new Date();
	const today = now.toISOString().split("T").at(0) ?? "";

	const daysBack = (d: number) => {
		const date = new Date(now);
		date.setDate(date.getDate() - d);
		return date.toISOString().split("T").at(0) ?? "";
	};

	switch (item.preset) {
		case "today":
			return { from: today, to: today };
		case "yesterday": {
			const y = daysBack(1);
			return { from: y, to: y };
		}
		case "last_7d":
			return { from: daysBack(7), to: today };
		case "last_14d":
			return { from: daysBack(14), to: today };
		case "last_30d":
			return { from: daysBack(30), to: today };
		case "last_90d":
			return { from: daysBack(90), to: today };
		default:
			return { from: daysBack(7), to: today };
	}
}

export const getDataTool = tool({
	description:
		"Batch 1-10 analytics query builder queries in parallel. Common types: summary_metrics, today_metrics, traffic, top_pages, top_referrers, sessions_*, device_types, browsers, country, city, errors_*, performance_*, custom_events_*, profile_list, vitals_*, revenue_*. Use preset (last_7d/last_30d/…) or from+to dates. Server returns valid types on unknown input.",
	inputSchema: z.object({
		websiteId: z.string(),
		queries: z.array(queryItemSchema).min(1).max(10),
		websiteDomain: z.string().optional(),
	}),
	execute: async ({ websiteId, queries, websiteDomain }) => {
		const batchStart = Date.now();
		const domain = websiteDomain ?? (await getWebsiteDomain(websiteId));

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

				const { from, to } = resolveDates(item);
				const req: QueryRequest = {
					projectId: websiteId,
					type: item.type,
					from,
					to,
					timeUnit: item.timeUnit,
					filters: item.filters,
					groupBy: item.groupBy,
					orderBy: item.orderBy,
					limit: item.limit,
					timezone: item.timezone ?? "UTC",
				};

				const data = await executeQuery(req, domain, req.timezone);
				return {
					type: item.type,
					data: data.slice(0, MAX_MODEL_ROWS),
					rowCount: data.length,
					executionTime: Date.now() - queryStart,
				};
			})
		);

		const resultMap: Record<string, QueryItemResult> = {};
		for (const r of results) {
			resultMap[r.type] = r;
		}

		return {
			results: resultMap,
			queryCount: queries.length,
			totalExecutionTime: Date.now() - batchStart,
		};
	},
});
