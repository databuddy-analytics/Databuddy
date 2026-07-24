import { type ApiKeyRow, hasKeyScope } from "@databuddy/api-keys/resolve";
import { auth } from "@databuddy/auth";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getAccessibleWebsites } from "../../lib/accessible-websites";
import { executeBatch } from "../../query";
import { createAnnotationTools } from "../tools/annotations";
import { createFeedbackTools } from "../tools/feedback";
import { createFlagTools } from "../tools/flags";
import { createFunnelTools } from "../tools/funnels";
import { createGoalTools } from "../tools/goals";
import { createLinksTools } from "../tools/links";
import { createMemoryTools } from "../tools/memory";
import { buildProfileTools } from "../tools/profiles";
import { createToolkit } from "../tools/toolkit";
import { executeAgentSqlForWebsite } from "../tools/execute-sql-query";
import {
	buildBatchQueryRequests,
	FilterSchema,
	formatMcpQueryResults,
	MCP_DATE_PRESETS,
} from "./mcp-utils";
import {
	createSlackConversationTools,
	type DatabuddyAgentSlackContext,
} from "./slack-context";
import { ensureWebsiteAccess } from "./tool-context";

interface McpAgentContext {
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
	const investigationTools = createToolkit({
		capabilities: ["investigation"],
		organizationId: options.organizationId ?? undefined,
		userId: options.userId ?? undefined,
		domain: options.websiteDomain ?? undefined,
	});
	return {
		list_websites: tool({
			description:
				"List all websites accessible with the current API key. Call this first when a website is not already selected.",
			strict: true,
			inputSchema: z.object({}),
			execute: async (_args, options) => {
				const ctx = getToolContext(options);
				const session = ctx.userId
					? await auth.api.getSession({ headers: ctx.requestHeaders })
					: null;
				const scopedApiKey =
					ctx.apiKey && !hasKeyScope(ctx.apiKey, "read:data");
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
		execute_sql_query: tool({
			description: `Custom read-only ClickHouse SQL. SELECT/WITH only. Use {paramName:Type} for parameters. websiteId and websiteDomain are bound server-side from the verified website argument; tool args of those names in params are ignored. UNION, INTERSECT, EXCEPT, subqueries, and comma-joins are not allowed; use CTEs instead. Every WHERE must AND \`client_id = {websiteId:String}\` at top level. Use only when get_data/query builders cannot answer.

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
				return executeAgentSqlForWebsite({
					websiteId: args.websiteId,
					websiteDomain: access.domain,
					sql: args.sql,
					params: args.params,
					toolName: "MCP Agent SQL",
					abortSignal: options.abortSignal,
				});
			},
		}),
		get_data: tool({
			description:
				"Run 1-10 analytics builders. Use preset or from/to; supports filters (including trait:<key>), groupBy, and orderBy. Returns a query summary, full rowCount, returnedRows, truncated, and up to 20 data rows. Call list_profile_traits before trait segmentation.",
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
				const plan = buildBatchQueryRequests(
					args.queries,
					args.websiteId,
					args.timezone ?? "UTC"
				);
				const results = await executeBatch(plan.requests, {
					websiteDomain: access.domain,
					timezone: args.timezone ?? "UTC",
					abortSignal: options.abortSignal,
				});
				return {
					batch: true,
					results: formatMcpQueryResults(plan, results),
				};
			},
		}),
		...createMemoryTools(),
		...buildProfileTools({
			loggerName: "MCP Profiles",
			websiteIdSchema: z.string(),
			resolveSite: async (websiteId, toolOptions) => {
				if (!websiteId) {
					throw new Error("websiteId is required");
				}
				const ctx = getToolContext(toolOptions);
				const access = await ensureWebsiteAccess(
					websiteId,
					ctx.requestHeaders,
					ctx.apiKey
				);
				if (access instanceof Error) {
					throw access;
				}
				return { websiteId, domain: access.domain };
			},
		}),
		...createFlagTools(),
		...createFunnelTools(),
		...createGoalTools(),
		...createAnnotationTools(),
		...createLinksTools(),
		...createFeedbackTools(),
		...createSlackConversationTools(options.slackContext),
		...investigationTools,
	};
}
