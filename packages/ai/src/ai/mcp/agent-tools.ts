import { type ApiKeyRow, hasGlobalAccess } from "@databuddy/api-keys/resolve";
import { auth } from "@databuddy/auth";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getAccessibleWebsites } from "../../lib/accessible-websites";
import { getWebsiteDomain } from "../../lib/website-utils";
import { executeBatch, executeQuery } from "../../query";
import type { QueryRequest } from "../../query/types";
import { createAnnotationTools } from "../tools/annotations";
import { createFlagTools } from "../tools/flags";
import { createFunnelTools } from "../tools/funnels";
import { createGoalTools } from "../tools/goals";
import { createInsightDigestTools } from "../tools/insight-digest";
import { createInvestigationTools } from "../tools/investigation-tools";
import { createLinksTools } from "../tools/links";
import { createMemoryTools } from "../tools/memory";
import { executeAgentSqlForWebsite } from "../tools/execute-sql-query";
import {
	buildBatchQueryRequests,
	FilterSchema,
	MCP_DATE_PRESETS,
} from "./mcp-utils";
import { createMcpProfileTools } from "./profile-tools";
import {
	createSlackConversationTools,
	type DatabuddyAgentSlackContext,
} from "./slack-context";
import { ensureWebsiteAccess } from "./tool-context";

export interface McpAgentContext {
	apiKey: ApiKeyRow | null;
	organizationId?: string | null;
	requestHeaders: Headers;
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

function getToolContext(options: unknown): McpAgentContext {
	return getContext(
		(options as { experimental_context?: unknown }).experimental_context
	);
}

export function createMcpAgentTools(
	options: {
		slackContext?: DatabuddyAgentSlackContext | null;
		organizationId?: string | null;
		userId?: string | null;
		websiteDomain?: string | null;
	} = {}
): ToolSet {
	const investigationTools = options.organizationId
		? createInvestigationTools({
				organizationId: options.organizationId,
				userId: options.userId ?? undefined,
				domain: options.websiteDomain ?? undefined,
			})
		: {};
	return {
		list_websites: tool({
			description:
				"List all websites accessible with the current API key. Call this FIRST to discover website IDs before any analytics query. Required before execute_query_builder or execute_sql_query.",
			strict: true,
			inputSchema: z.object({}),
			execute: async (_args, options) => {
				const ctx = getToolContext(options);
				const session = ctx.userId
					? await auth.api.getSession({ headers: ctx.requestHeaders })
					: null;
				const scopedApiKey = ctx.apiKey && !hasGlobalAccess(ctx.apiKey);
				const authCtx = {
					apiKey: ctx.apiKey,
					organizationId: scopedApiKey
						? null
						: (ctx.organizationId ?? ctx.apiKey?.organizationId ?? null),
					user: session?.user
						? {
								id: session.user.id,
								role: (session.user as { role?: string }).role,
							}
						: ctx.userId
							? { id: ctx.userId }
							: null,
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
			description:
				"Single pre-built analytics query. Prefer get_data for analytics requests because it batches 1-10 builders. Covers traffic, pages, sessions, errors, performance, vitals, custom events, profiles, links, uptime, LLM, and revenue. If a type is invalid, the server returns valid options.",
			strict: true,
			inputSchema: z.object({
				websiteId: z.string(),
				type: z.string(),
				from: z.string(),
				to: z.string(),
				timeUnit: z.enum(["minute", "hour", "day", "week", "month"]).optional(),
				filters: z.array(FilterSchema).optional(),
				groupBy: z.array(z.string()).optional(),
				orderBy: z.string().optional(),
				limit: z.number().min(1).max(1000).optional(),
				offset: z.number().min(0).optional(),
				timezone: z.string().optional(),
			}),
			execute: async (args, options) => {
				const ctx = getToolContext(options);
				const access = await ensureWebsiteAccess(
					args.websiteId,
					ctx.requestHeaders,
					ctx.apiKey
				);
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
					filters: args.filters,
					groupBy: args.groupBy,
					orderBy: args.orderBy,
					limit: args.limit,
					offset: args.offset,
					timezone: args.timezone ?? "UTC",
				};
				const data = await executeQuery(
					queryRequest,
					websiteDomain,
					queryRequest.timezone,
					options.abortSignal
				);
				return { data, rowCount: data.length, type: args.type };
			},
		}),
		execute_sql_query: tool({
			description: `Custom read-only ClickHouse SQL. SELECT/WITH only. Use {paramName:Type} for parameters. websiteId and websiteDomain are bound server-side from the verified website argument; tool args of those names in params are ignored. UNION, INTERSECT, EXCEPT, subqueries, and comma-joins are not allowed — use CTEs instead. Every WHERE must AND \`client_id = {websiteId:String}\` at top level. Use only when get_data/query builders cannot answer.

Canonical analytics.events schema: client_id, anonymous_id, session_id, time, path, referrer, browser_name, os_name, device_type, country, region, city, utm_source, utm_medium, utm_campaign, utm_term, utm_content, time_on_page, scroll_depth, event_name.

Critical schema footguns: website id column is client_id (not website_id); timestamp is time (not created_at); page URL path is path (not page_path); event discriminator is event_name (not event_type); pageviews are event_name = 'screen_view' (never 'pageview'). Custom events are easy to query incorrectly; use get_data custom_events_* builders instead.`,
			strict: true,
			inputSchema: z.object({
				websiteId: z.string(),
				sql: z.string(),
				params: z.record(z.string(), z.unknown()).optional(),
			}),
			execute: async (args, options) => {
				const ctx = getToolContext(options);
				const access = await ensureWebsiteAccess(
					args.websiteId,
					ctx.requestHeaders,
					ctx.apiKey
				);
				if (access instanceof Error) {
					throw new Error(access.message);
				}
				const websiteDomain =
					(await getWebsiteDomain(args.websiteId)) ?? "unknown";
				return executeAgentSqlForWebsite({
					websiteId: args.websiteId,
					websiteDomain,
					sql: args.sql,
					params: args.params,
					toolName: "MCP Agent SQL",
					abortSignal: options.abortSignal,
				});
			},
		}),
		get_data: tool({
			description:
				"Run 1-10 pre-built analytics queries in one call. Preferred for explicit analytics requests. Covers traffic, pages, sessions, errors, performance, vitals, custom events, profiles, links, uptime, LLM, and revenue. Use preset (last_7d/last_30d/etc.) or from/to dates. Supports filters, groupBy, orderBy. If a type is invalid, the server returns valid options.",
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
							filters: z.array(FilterSchema).optional(),
							groupBy: z.array(z.string()).optional(),
							orderBy: z.string().optional(),
						})
					)
					.min(1)
					.max(10),
				timezone: z.string().optional().default("UTC"),
			}),
			execute: async (args, options) => {
				const ctx = getToolContext(options);
				const access = await ensureWebsiteAccess(
					args.websiteId,
					ctx.requestHeaders,
					ctx.apiKey
				);
				if (access instanceof Error) {
					throw new Error(access.message);
				}
				const { requests, invalid } = buildBatchQueryRequests(
					args.queries,
					args.websiteId,
					args.timezone ?? "UTC"
				);
				const websiteDomain =
					(await getWebsiteDomain(args.websiteId)) ?? "unknown";
				const results = await executeBatch(requests, {
					websiteDomain,
					timezone: args.timezone ?? "UTC",
					abortSignal: options.abortSignal,
				});
				return {
					batch: true,
					results: [
						...results.map((r) => ({
							type: r.type,
							data: r.data,
							rowCount: r.data.length,
							...(r.error && { error: "Query failed" }),
						})),
						...invalid.map((q) => ({
							type: q.type,
							data: [] as unknown[],
							rowCount: 0,
							error: q.error,
						})),
					],
				};
			},
		}),
		...createMemoryTools(),
		...createMcpProfileTools(),
		...createFlagTools(),
		...createFunnelTools(),
		...createGoalTools(),
		...createAnnotationTools(),
		...createLinksTools(),
		...createInsightDigestTools(),
		...createSlackConversationTools(options.slackContext),
		...investigationTools,
	};
}
