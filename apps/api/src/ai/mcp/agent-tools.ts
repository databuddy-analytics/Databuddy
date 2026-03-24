import { auth } from "@databuddy/auth";
import { tool } from "ai";
import { z } from "zod";
import { getAccessibleWebsites } from "../../lib/accessible-websites";
import {
	getAccessibleWebsiteIds,
	hasGlobalAccess,
	hasKeyScope,
	hasWebsiteScope,
} from "../../lib/api-key";
import { getWebsiteDomain, validateWebsite } from "../../lib/website-utils";
import { executeBatch, executeQuery, QueryBuilders } from "../../query";
import type { QueryRequest } from "../../query/types";
import { createAnnotationTools } from "../tools/annotations";
import { createFunnelTools } from "../tools/funnels";
import { createGoalTools } from "../tools/goals";
import { createLinksTools } from "../tools/links";
import { createMemoryTools } from "../tools/memory";
import { createProfileTools } from "../tools/profiles";
import {
	executeTimedQuery,
	SQL_VALIDATION_ERROR,
	validateSQL,
} from "../tools/utils";
import { webSearchTool } from "../tools/web-search";
import { buildBatchQueryRequests, MCP_DATE_PRESETS } from "./mcp-utils";

export interface McpAgentContext {
	requestHeaders: Headers;
	apiKey: Awaited<
		ReturnType<typeof import("../../lib/api-key").getApiKeyFromHeader>
	>;
	userId: string | null;
}

function getContext(ctx: unknown): McpAgentContext {
	if (!ctx || typeof ctx !== "object" || !("requestHeaders" in ctx)) {
		throw new Error(
			"MCP agent tools require context with requestHeaders and apiKey"
		);
	}
	return ctx as McpAgentContext;
}

async function ensureWebsiteAccess(
	websiteId: string,
	ctx: McpAgentContext
): Promise<{ domain: string } | Error> {
	const validation = await validateWebsite(websiteId);
	if (!(validation.success && validation.website)) {
		return new Error(validation.error ?? "Website not found");
	}
	const { website } = validation;

	if (website.isPublic) {
		return { domain: website.domain ?? "unknown" };
	}

	if (ctx.apiKey) {
		if (!hasKeyScope(ctx.apiKey, "read:data")) {
			return new Error("API key missing read:data scope");
		}
		const accessibleIds = getAccessibleWebsiteIds(ctx.apiKey);
		const hasWebsiteAccess =
			hasWebsiteScope(ctx.apiKey, websiteId, "read:data") ||
			accessibleIds.includes(websiteId) ||
			(hasGlobalAccess(ctx.apiKey) &&
				ctx.apiKey.organizationId === website.organizationId);
		if (!hasWebsiteAccess) {
			return new Error("Access denied to this website");
		}
		return { domain: website.domain ?? "unknown" };
	}

	const session = await auth.api.getSession({ headers: ctx.requestHeaders });
	if (session?.user?.role === "ADMIN") {
		return { domain: website.domain ?? "unknown" };
	}

	return new Error("Authentication required");
}

export function createMcpAgentTools() {
	return {
		list_websites: tool({
			description:
				"List all websites accessible with the current API key. Call this FIRST to discover website IDs before any analytics query. Required before execute_query_builder or execute_sql_query.",
			strict: true,
			inputSchema: z.object({}),
			execute: async (_args, options) => {
				const experimental_context = (
					options as { experimental_context?: unknown }
				).experimental_context;
				const ctx = getContext(experimental_context);
				const session = ctx.userId
					? await auth.api.getSession({ headers: ctx.requestHeaders })
					: null;
				const authCtx = {
					user: session?.user
						? {
								id: session.user.id,
								role: (session.user as { role?: string }).role,
							}
						: ctx.userId
							? { id: ctx.userId }
							: null,
					apiKey: ctx.apiKey,
				};
				const list = await getAccessibleWebsites(authCtx);
				return {
					websites: list.map((w) => ({
						id: w.id,
						name: w.name,
						domain: w.domain,
						isPublic: w.isPublic,
					})),
					total: list.length,
				};
			},
		}),
		execute_query_builder: tool({
			description: `Pre-built analytics queries. Types: ${Object.keys(QueryBuilders).join(", ")}. Preferred for traffic, sessions, devices, etc.`,
			strict: true,
			inputSchema: z.object({
				websiteId: z.string(),
				type: z.string(),
				from: z.string(),
				to: z.string(),
				timeUnit: z.enum(["minute", "hour", "day", "week", "month"]).optional(),
				filters: z.array(z.record(z.string(), z.unknown())).optional(),
				groupBy: z.array(z.string()).optional(),
				orderBy: z.string().optional(),
				limit: z.number().min(1).max(1000).optional(),
				offset: z.number().min(0).optional(),
				timezone: z.string().optional(),
			}),
			execute: async (args, options) => {
				const experimental_context = (
					options as { experimental_context?: unknown }
				).experimental_context;
				const ctx = getContext(experimental_context);
				const access = await ensureWebsiteAccess(args.websiteId, ctx);
				if (access instanceof Error) {
					throw new Error(access.message);
				}
				const websiteDomain =
					(await getWebsiteDomain(args.websiteId)) ?? "unknown";
				const queryRequest: QueryRequest = {
					projectId: args.websiteId,
					type: args.type,
					from: args.from,
					to: args.to,
					timeUnit: args.timeUnit,
					filters: args.filters as QueryRequest["filters"],
					groupBy: args.groupBy,
					orderBy: args.orderBy,
					limit: args.limit,
					offset: args.offset,
					timezone: args.timezone ?? "UTC",
				};
				const data = await executeQuery(
					queryRequest,
					websiteDomain,
					queryRequest.timezone
				);
				return { data, rowCount: data.length, type: args.type };
			},
		}),
		execute_sql_query: tool({
			description:
				"Custom read-only ClickHouse SQL. SELECT/WITH only. Use {paramName:Type} for parameters. websiteId is auto-included.",
			strict: true,
			inputSchema: z.object({
				websiteId: z.string(),
				sql: z.string(),
				params: z.record(z.string(), z.unknown()).optional(),
			}),
			execute: async (args, options) => {
				const { websiteId, sql, params } = args;
				const experimental_context = (
					options as { experimental_context?: unknown }
				).experimental_context;
				const ctx = getContext(experimental_context);
				const access = await ensureWebsiteAccess(websiteId, ctx);
				if (access instanceof Error) {
					throw new Error(access.message);
				}
				if (!validateSQL(sql)) {
					throw new Error(SQL_VALIDATION_ERROR);
				}
				const result = await executeTimedQuery(
					"MCP Agent SQL",
					sql,
					{ websiteId, ...(params ?? {}) },
					{ websiteId }
				);
				return result;
			},
		}),
		get_data: tool({
			description: `Batch 2-10 analytics queries in one call. PREFERRED when user asks for multiple metrics (traffic + top pages + referrers, etc). Types: ${Object.keys(QueryBuilders).join(", ")}. Use preset (e.g. last_7d, last_30d) or from/to dates. Supports filters (e.g. os_name eq "Mac" for slowest page for Mac users), groupBy, orderBy.`,
			strict: true,
			inputSchema: z.object({
				websiteId: z.string(),
				queries: z
					.array(
						z.object({
							type: z.string(),
							preset: z
								.enum(MCP_DATE_PRESETS as [string, ...string[]])
								.optional(),
							from: z.string().optional(),
							to: z.string().optional(),
							timeUnit: z
								.enum(["minute", "hour", "day", "week", "month"])
								.optional(),
							limit: z.number().min(1).max(1000).optional(),
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
						})
					)
					.min(2)
					.max(10),
				timezone: z.string().optional().default("UTC"),
			}),
			execute: async (args, options) => {
				const experimental_context = (
					options as { experimental_context?: unknown }
				).experimental_context;
				const ctx = getContext(experimental_context);
				const access = await ensureWebsiteAccess(args.websiteId, ctx);
				if (access instanceof Error) {
					throw new Error(access.message);
				}
				const buildResult = buildBatchQueryRequests(
					args.queries,
					args.websiteId,
					args.timezone ?? "UTC"
				);
				if ("error" in buildResult) {
					throw new Error(buildResult.error);
				}
				const websiteDomain =
					(await getWebsiteDomain(args.websiteId)) ?? "unknown";
				const results = await executeBatch(buildResult.requests, {
					websiteDomain,
					timezone: args.timezone ?? "UTC",
				});
				return {
					batch: true,
					results: results.map((r) => ({
						type: r.type,
						data: r.data,
						rowCount: r.data.length,
						...(r.error && { error: "Query failed" }),
					})),
				};
			},
		}),
		web_search: webSearchTool,
		...createMemoryTools(),
		...createProfileTools(),
		...createFunnelTools(),
		...createGoalTools(),
		...createAnnotationTools(),
		...createLinksTools(),
	};
}
