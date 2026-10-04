import { tool, type ToolExecutionOptions, type ToolSet } from "ai";
import { z } from "zod";
import { executeBatch } from "../../query";
import type { AppMutationMode } from "../config/context";
import { discoverQueryTypesTool } from "../tools/discover-query-types";
import { describeSchemaTool } from "../tools/describe-schema";
import { createAnnotationTools } from "../tools/annotations";
import { createFeedbackTools } from "../tools/feedback";
import { createFlagTools } from "../tools/flags";
import { createFunnelTools } from "../tools/funnels";
import { createGoalTools } from "../tools/goals";
import { createInvestigationTools } from "../tools/investigations";
import { createLinksTools } from "../tools/links";
import { createMemoryTools } from "../tools/memory";
import { buildProfileTools } from "../tools/profiles";
import { createToolkit } from "../tools/toolkit";
import { executeAgentSqlForWebsite } from "../tools/execute-sql-query";
import {
	buildBatchQueryRequests,
	formatMcpQueryResults,
	gateQueryPlan,
} from "./mcp-utils";
import {
	createSlackConversationTools,
	type DatabuddyAgentSlackContext,
} from "./slack-context";
import {
	type AuthorizedPrincipal,
	ensureWebsiteAccess,
	getCachedAccessibleWebsites,
} from "./tool-context";
import { agentDataInputSchema } from "./agent-query-schema";

const WRITE_TOOL_NAME = /^(add|create|delete|forget|save|submit|update)_/;

type McpAgentContext = AuthorizedPrincipal & {
	currentDateTime?: string;
	timezone?: string;
};

function getToolContext({
	experimental_context: ctx,
}: Pick<ToolExecutionOptions, "experimental_context">): McpAgentContext {
	if (!ctx || typeof ctx !== "object" || !("requestHeaders" in ctx)) {
		throw new Error(
			"MCP agent tools require context with requestHeaders and apiKey"
		);
	}
	return ctx as McpAgentContext;
}

export function createMcpAgentTools(
	options: {
		mutationMode?: AppMutationMode;
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
	const tools: ToolSet = {
		discover_query_types: discoverQueryTypesTool,
		describe_schema: describeSchemaTool,
		list_websites: tool({
			description:
				"List all websites accessible with the current API key. Call it only when <accessible_websites> is truncated or missing the site you need.",
			strict: true,
			inputSchema: z.object({}),
			execute: async (_args, options) => {
				const ctx = getToolContext(options);
				const list = await getCachedAccessibleWebsites(ctx);
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
			description: `Custom read-only ClickHouse SQL. SELECT/WITH only. Use {paramName:Type} for parameters. websiteId and websiteDomain are bound server-side from the verified website argument; tool args of those names in params are ignored. UNION, INTERSECT, EXCEPT, subqueries, and comma-joins are not allowed; use CTEs instead. Every WHERE needs the per-table tenant filter; read each table's describe_schema entry first, since the validator rejects wrong-column queries. Use only when get_data/query builders cannot answer.

Critical schema footguns: website id column is client_id (not website_id); timestamp is time (not created_at); page URL path is path (not page_path); event discriminator is event_name (not event_type); pageviews are event_name = 'screen_view' (never 'pageview'). Custom events are easy to query incorrectly; use get_data custom_events_* builders instead.`,
			strict: true,
			inputSchema: z.object({
				websiteId: z.string(),
				sql: z.string(),
				params: z.record(z.string(), z.unknown()).optional(),
			}),
			execute: async (args, options) => {
				const ctx = getToolContext(options);
				const access = await ensureWebsiteAccess(args.websiteId, ctx);
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
				"Run 1-10 analytics builders. Use discover_query_types for builder names and required filters. Use preset or from/to; omitted dates default to last_30d in the conversation timezone. Read the returned definition for population and percentage semantics. Supports filters (including trait:<key>) and orderBy. Each builder returns a fixed breakdown, so pick the builder that breaks down by the dimension you need. Returns a query summary, full rowCount, returnedRows, truncated, and up to 20 data rows. Call list_profile_traits before trait segmentation.",
			strict: true,
			inputSchema: agentDataInputSchema,
			execute: async (args, options) => {
				const ctx = getToolContext(options);
				const access = await ensureWebsiteAccess(args.websiteId, ctx);
				const timezone = args.timezone ?? ctx.timezone ?? "UTC";
				const now = ctx.currentDateTime
					? new Date(ctx.currentDateTime)
					: new Date();
				const plan = await gateQueryPlan(
					buildBatchQueryRequests(
						args.queries,
						args.websiteId,
						timezone,
						Number.isNaN(now.getTime()) ? new Date() : now
					),
					access.organizationId
				);
				const results = await executeBatch(plan.requests, {
					websiteDomain: access.domain,
					timezone,
					abortSignal: options.abortSignal,
				});
				return {
					batch: true,
					website: { id: args.websiteId, domain: access.domain },
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
				const access = await ensureWebsiteAccess(websiteId, ctx);
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
	if (options.mutationMode !== "dry-run") {
		return tools;
	}
	return Object.fromEntries(
		Object.entries({
			...tools,
			...createInvestigationTools({ readOnly: true }),
		}).filter(([name]) => !WRITE_TOOL_NAME.test(name))
	);
}
