import { auth, websitesApi } from "@databuddy/auth";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import dayjs from "dayjs";
import { z } from "zod";
import { getAccessibleWebsites } from "../../lib/accessible-websites";
import {
	getAccessibleWebsiteIds,
	hasGlobalAccess,
	hasKeyScope,
	hasWebsiteScope,
} from "../../lib/api-key";
import { trackAgentEvent } from "../../lib/databuddy";
import {
	isMemoryEnabled,
	searchMemories,
	storeConversation as storeMemory,
} from "../../lib/supermemory";
import {
	getCachedWebsite,
	getWebsiteDomain,
	validateWebsite,
} from "../../lib/website-utils";
import { executeBatch } from "../../query";
import type { AppContext } from "../config/context";
import { callRPCProcedure } from "../tools/utils";
import {
	appendToConversation,
	getConversationHistory,
} from "./conversation-store";
import {
	buildBatchQueryRequests,
	CLICKHOUSE_SCHEMA_DOCS,
	getQueryTypeDescriptions,
	getQueryTypeDetails,
	getSchemaSummary,
	MCP_DATE_PRESETS,
	type McpQueryItem,
} from "./mcp-utils";
import { runMcpAgent } from "./run-agent";

interface McpToolContext {
	requestHeaders: Headers;
	userId: string | null;
	apiKey: Awaited<
		ReturnType<typeof import("../../lib/api-key").getApiKeyFromHeader>
	>;
}

async function ensureWebsiteAccess(
	websiteId: string,
	headers: Headers,
	apiKey: McpToolContext["apiKey"]
): Promise<{ domain: string } | Error> {
	const validation = await validateWebsite(websiteId);
	if (!(validation.success && validation.website)) {
		return new Error(validation.error ?? "Website not found");
	}
	const { website } = validation;

	if (website.isPublic) {
		return { domain: website.domain ?? "unknown" };
	}

	if (apiKey) {
		if (!hasKeyScope(apiKey, "read:data")) {
			return new Error("API key missing read:data scope");
		}
		const accessibleIds = getAccessibleWebsiteIds(apiKey);
		const hasWebsiteAccess =
			hasWebsiteScope(apiKey, websiteId, "read:data") ||
			accessibleIds.includes(websiteId) ||
			(hasGlobalAccess(apiKey) &&
				apiKey.organizationId === website.organizationId);
		if (!hasWebsiteAccess) {
			return new Error("Access denied to this website");
		}
		return { domain: website.domain ?? "unknown" };
	}

	const session = await auth.api.getSession({ headers });
	if (session?.user?.role === "ADMIN") {
		return { domain: website.domain ?? "unknown" };
	}

	const hasPermission =
		website.organizationId &&
		(
			await websitesApi.hasPermission({
				headers,
				body: { permissions: { website: ["read"] } },
			})
		).success;
	if (!hasPermission) {
		return new Error("Access denied to this website");
	}
	return { domain: website.domain ?? "unknown" };
}

const TIME_UNIT = ["minute", "hour", "day", "week", "month"] as const;
type TimeUnit = (typeof TIME_UNIT)[number];

const FilterSchema = z.object({
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
});

const QueryItemSchema = z.object({
	type: z.string(),
	preset: z.enum(MCP_DATE_PRESETS as [string, ...string[]]).optional(),
	from: z.string().optional(),
	to: z.string().optional(),
	timeUnit: z.enum(TIME_UNIT).optional(),
	limit: z.number().min(1).max(1000).optional(),
	filters: z.array(FilterSchema).optional(),
	groupBy: z.array(z.string()).optional(),
	orderBy: z.string().optional(),
});

function coerceQueriesArray(val: unknown): unknown[] | undefined {
	if (Array.isArray(val)) {
		return val;
	}
	if (typeof val === "string") {
		try {
			const parsed = JSON.parse(val) as unknown;
			return Array.isArray(parsed) ? parsed : undefined;
		} catch {
			return undefined;
		}
	}
	return undefined;
}

interface GetDataArgs {
	websiteId?: string;
	websiteName?: string;
	websiteDomain?: string;
	type?: string;
	preset?: (typeof MCP_DATE_PRESETS)[number];
	from?: string;
	to?: string;
	timeUnit?: TimeUnit;
	limit?: number;
	timezone?: string;
	filters?: Array<{
		field: string;
		op: string;
		value: string | number | (string | number)[];
		target?: string;
		having?: boolean;
	}>;
	groupBy?: string[];
	orderBy?: string;
	queries?: McpQueryItem[];
}

const PROTOCOL_RE = /^https?:\/\//;

async function resolveWebsiteId(
	args: Pick<GetDataArgs, "websiteId" | "websiteName" | "websiteDomain">,
	ctx: McpToolContext
): Promise<string | Error> {
	if (args.websiteId) {
		return args.websiteId;
	}

	const authCtx = {
		user: ctx.userId ? { id: ctx.userId } : null,
		apiKey: ctx.apiKey,
	};
	const list = await getAccessibleWebsites(authCtx);

	if (args.websiteDomain) {
		const domain = args.websiteDomain.toLowerCase().replace(PROTOCOL_RE, "");
		const match = list.find((w) => w.domain?.toLowerCase() === domain);
		if (match) {
			return match.id;
		}
		return new Error(
			`No accessible website found with domain "${args.websiteDomain}"`
		);
	}

	if (args.websiteName) {
		const name = args.websiteName.toLowerCase();
		const match = list.find((w) => w.name?.toLowerCase() === name);
		if (match) {
			return match.id;
		}
		return new Error(
			`No accessible website found with name "${args.websiteName}"`
		);
	}

	return new Error(
		"One of websiteId, websiteName, or websiteDomain is required"
	);
}

function toMcpResult(data: unknown, isError = false): CallToolResult {
	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify(data, null, 2),
			},
		],
		isError,
	};
}

function buildRpcContext(ctx: McpToolContext): AppContext {
	return {
		userId: ctx.userId ?? "",
		websiteId: "",
		websiteDomain: "",
		timezone: "UTC",
		currentDateTime: new Date().toISOString(),
		chatId: "",
		requestHeaders: ctx.requestHeaders,
	};
}

async function getOrganizationId(websiteId: string): Promise<string | Error> {
	const website = await getCachedWebsite(websiteId);
	if (!website) {
		return new Error("Website not found");
	}
	if (!website.organizationId) {
		return new Error("Website is not associated with an organization");
	}
	return website.organizationId;
}

function getMcpAttribution(ctx: McpToolContext): {
	organization_id: string | null;
	user_id: string | null;
	auth_type: "session" | "api_key";
} {
	const auth_type = ctx.apiKey ? "api_key" : "session";
	const organization_id = ctx.apiKey?.organizationId ?? null;
	const user_id = ctx.userId ?? ctx.apiKey?.userId ?? null;
	return { organization_id, user_id, auth_type };
}

function rpcErrorMessage(err: unknown, fallback: string): string {
	if (err instanceof Error) {
		return err.message;
	}
	return fallback;
}

function trackToolCompletion(
	ctx: McpToolContext,
	tool: string,
	success: boolean
): void {
	trackAgentEvent("agent_activity", {
		action: "tool_completed",
		source: "mcp",
		tool,
		success,
		...getMcpAttribution(ctx),
	});
}

export function createMcpTools(ctx: McpToolContext) {
	return {
		ask: {
			description:
				"Ask any analytics question in natural language. The agent will discover your websites, run queries, and return insights. Pass conversationId for follow-up questions (e.g. 'now compare with last week') to maintain context. Use this for questions like 'what are my top pages?', 'show me traffic last week', 'how many visitors did we have?', etc.",
			inputSchema: z.object({
				question: z
					.string()
					.describe("Your analytics question in natural language"),
				conversationId: z
					.string()
					.optional()
					.describe(
						"Optional. Pass from previous ask response for follow-up questions to maintain conversation history."
					),
				timezone: z
					.string()
					.optional()
					.describe(
						"Optional. IANA timezone (e.g. 'America/New_York'). Defaults to UTC."
					),
			}),
			handler: async (args: {
				question: string;
				conversationId?: string;
				timezone?: string;
			}) => {
				try {
					const conversationId = args.conversationId ?? crypto.randomUUID();
					const priorMessages = await getConversationHistory(
						conversationId,
						ctx.userId,
						ctx.apiKey
					);

					const answer = await runMcpAgent({
						question: args.question,
						requestHeaders: ctx.requestHeaders,
						apiKey: ctx.apiKey,
						userId: ctx.userId,
						timezone: args.timezone,
						conversationId,
						priorMessages: priorMessages.length > 0 ? priorMessages : undefined,
					});

					await appendToConversation(
						conversationId,
						ctx.userId,
						ctx.apiKey,
						args.question,
						answer,
						priorMessages
					);

					trackToolCompletion(ctx, "ask", true);
					return toMcpResult({ answer, conversationId });
				} catch (err) {
					trackToolCompletion(ctx, "ask", false);
					const message =
						err instanceof Error
							? err.name === "AbortError"
								? "Request timed out. Try a simpler question or use get_data for direct queries."
								: `Agent error: ${err.message}`
							: "Agent failed unexpectedly";
					return toMcpResult({ error: message }, true);
				}
			},
		},
		list_websites: {
			description:
				"List websites accessible with your API key. Use to discover website IDs before get_data. Fast, no LLM.",
			inputSchema: z.object({}),
			handler: async () => {
				try {
					const authCtx = {
						user: ctx.userId ? { id: ctx.userId } : null,
						apiKey: ctx.apiKey,
					};
					const list = await getAccessibleWebsites(authCtx);
					trackToolCompletion(ctx, "list_websites", true);
					return toMcpResult({
						websites: list.map((w) => ({
							id: w.id,
							name: w.name,
							domain: w.domain,
							isPublic: w.isPublic,
						})),
						total: list.length,
					});
				} catch (err) {
					trackToolCompletion(ctx, "list_websites", false);
					throw err;
				}
			},
		},
		get_data: {
			description:
				"Run analytics query(ies). Single mode: pass type + preset or from/to. Batch mode: pass queries array (2-10 items). Defaults to last_7d when no date specified. Supports filters, groupBy, orderBy. Identify the website with websiteId, websiteName, or websiteDomain.",
			inputSchema: z.object({
				websiteId: z
					.string()
					.optional()
					.describe("Website ID from list_websites"),
				websiteName: z
					.string()
					.optional()
					.describe(
						"Website name (e.g. 'Landing Page'). Alternative to websiteId."
					),
				websiteDomain: z
					.string()
					.optional()
					.describe(
						"Website domain (e.g. 'databuddy.cc'). Alternative to websiteId."
					),
				type: z
					.string()
					.optional()
					.describe(
						"Query type for single-query mode (e.g. 'summary_metrics', 'top_pages', 'country'). Use capabilities tool to see all types."
					),
				preset: z
					.enum(MCP_DATE_PRESETS as [string, ...string[]])
					.optional()
					.describe(
						"Date preset (e.g. 'last_7d', 'last_30d', 'today'). Alternative to from/to."
					),
				from: z
					.string()
					.optional()
					.describe("Start date YYYY-MM-DD. Use with 'to'."),
				to: z
					.string()
					.optional()
					.describe("End date YYYY-MM-DD. Use with 'from'."),
				timeUnit: z
					.enum(TIME_UNIT)
					.optional()
					.describe("Time granularity for time-series data."),
				limit: z
					.number()
					.min(1)
					.max(1000)
					.optional()
					.describe("Max rows to return (1-1000)."),
				filters: z
					.array(FilterSchema)
					.optional()
					.describe(
						"Array of filters. Each: {field, op, value}. ops: eq, ne, contains, not_contains, starts_with, in, not_in."
					),
				groupBy: z.array(z.string()).optional().describe("Fields to group by."),
				orderBy: z.string().optional().describe("Field to order results by."),
				queries: z
					.array(QueryItemSchema)
					.min(2)
					.max(10)
					.optional()
					.describe(
						"Batch mode: 2-10 query items, each with type + preset or from/to. Omit 'type' when using this."
					),
				timezone: z
					.string()
					.optional()
					.describe(
						"IANA timezone (e.g. 'America/New_York'). Defaults to UTC."
					),
			}),
			handler: async (args: GetDataArgs) => {
				const resolvedId = await resolveWebsiteId(args, ctx);
				if (resolvedId instanceof Error) {
					trackToolCompletion(ctx, "get_data", false);
					return toMcpResult({ error: resolvedId.message }, true);
				}

				const access = await ensureWebsiteAccess(
					resolvedId,
					ctx.requestHeaders,
					ctx.apiKey
				);
				if (access instanceof Error) {
					trackToolCompletion(ctx, "get_data", false);
					return toMcpResult({ error: access.message }, true);
				}

				const timezone = args.timezone ?? "UTC";

				const rawQueries = args.queries
					? Array.isArray(args.queries)
						? args.queries
						: coerceQueriesArray(args.queries)
					: undefined;

				const items: McpQueryItem[] =
					rawQueries && rawQueries.length >= 2
						? (rawQueries as McpQueryItem[])
						: args.type
							? [
									{
										type: args.type,
										preset: args.preset,
										from: args.from,
										to: args.to,
										timeUnit: args.timeUnit,
										limit: args.limit,
										filters: args.filters,
										groupBy: args.groupBy,
										orderBy: args.orderBy,
									},
								]
							: [];

				if (items.length === 0) {
					trackToolCompletion(ctx, "get_data", false);
					return toMcpResult(
						{
							error:
								"Either 'type' (single query) or 'queries' array (batch, 2-10 items) is required",
						},
						true
					);
				}

				const buildResult = buildBatchQueryRequests(
					items,
					resolvedId,
					timezone
				);
				if ("error" in buildResult) {
					trackToolCompletion(ctx, "get_data", false);
					return toMcpResult({ error: buildResult.error }, true);
				}
				const requests = buildResult.requests;
				const isBatch = requests.length > 1;

				try {
					const websiteDomain =
						(await getWebsiteDomain(resolvedId)) ?? "unknown";
					const results = await executeBatch(requests, {
						websiteDomain,
						timezone,
					});
					trackToolCompletion(ctx, "get_data", true);
					return toMcpResult(
						isBatch
							? {
									batch: true,
									results: results.map((r) => ({
										type: r.type,
										data: r.data,
										rowCount: r.data.length,
										...(r.error && { error: r.error }),
									})),
								}
							: results[0]
								? {
										data: results[0].data,
										rowCount: results[0].data.length,
										type: results[0].type,
										...(results[0].error && { error: results[0].error }),
									}
								: { error: "No results returned" }
					);
				} catch (err) {
					trackToolCompletion(ctx, "get_data", false);
					const message =
						err instanceof Error ? err.message : "Query execution failed";
					return toMcpResult({ error: message }, true);
				}
			},
		},
		get_schema: {
			description:
				"Returns ClickHouse schema docs for the analytics database. Use before writing custom SQL or choosing query types.",
			inputSchema: z.object({}),
			handler: () => {
				trackToolCompletion(ctx, "get_schema", true);
				return toMcpResult({ schema: CLICKHOUSE_SCHEMA_DOCS });
			},
		},
		capabilities: {
			description:
				"Query types with descriptions, allowed filters, date presets, schema summary, and usage hints. Use this to discover what queries are available and what filters each accepts.",
			inputSchema: z.object({
				detail: z
					.enum(["summary", "full"])
					.optional()
					.default("summary")
					.describe(
						"'summary' returns type descriptions only; 'full' includes allowedFilters per type"
					),
			}),
			handler: (args: { detail?: string }) => {
				trackToolCompletion(ctx, "capabilities", true);
				const useFull = args.detail === "full";
				const queryTypes = useFull
					? getQueryTypeDetails()
					: getQueryTypeDescriptions();
				const availableTools = [
					"ask",
					"list_websites",
					"get_data",
					"get_schema",
					"capabilities",
					"list_funnels",
					"get_funnel_analytics",
					"list_goals",
					"get_goal_analytics",
					"list_links",
					"search_links",
					...(isMemoryEnabled() ? ["search_memory", "save_memory"] : []),
				];

				return toMcpResult({
					queryTypes,
					schemaSummary: getSchemaSummary(),
					datePresets: MCP_DATE_PRESETS,
					dateFormat: "YYYY-MM-DD",
					maxLimit: 1000,
					availableTools,
					hints: [
						"get_data accepts websiteId, websiteName, or websiteDomain — no need to call list_websites first if you know the name or domain",
						"list_websites returns ids, names, and domains — use it when you need to discover available websites",
						"get_data batch: pass queries array (2-10 items, each with type + preset or from/to)",
						"get_data single: pass type + preset (e.g. last_30d) OR type + from + to (YYYY-MM-DD)",
						"get_data defaults to last_7d when preset/from/to omitted",
						"get_schema returns full ClickHouse schema — only needed for custom SQL, not for query builders",
						"capabilities with detail='full' shows allowedFilters per query type",
						"ask accepts optional timezone (IANA format) and returns conversationId for follow-ups",
						"list_funnels, list_goals, list_links are direct tools — no LLM cost, fast",
						"Use ask for complex questions; use direct tools for simple CRUD lookups",
						"Custom events: use custom_events_discovery to get events + properties + top values in one call",
						"Custom events: use filters [{field:'event_name',op:'eq',value:'your-event'}] to scope property queries to a specific event",
						"Custom events: use filters [{field:'property_key',op:'eq',value:'your-key'}] to scope property_top_values/distribution to a specific property",
					],
				});
			},
		},

		list_funnels: {
			description:
				"List all funnels for a website. Returns funnels with steps, filters, and metadata. No LLM cost.",
			inputSchema: z.object({
				websiteId: z.string().describe("Website ID from list_websites"),
			}),
			handler: async (args: { websiteId: string }) => {
				try {
					const rpcCtx = buildRpcContext(ctx);
					const result = await callRPCProcedure(
						"funnels",
						"list",
						{ websiteId: args.websiteId },
						rpcCtx
					);
					trackToolCompletion(ctx, "list_funnels", true);
					return toMcpResult({
						funnels: result,
						count: Array.isArray(result) ? result.length : 0,
					});
				} catch (err) {
					trackToolCompletion(ctx, "list_funnels", false);
					return toMcpResult(
						{ error: rpcErrorMessage(err, "Failed to list funnels") },
						true
					);
				}
			},
		},
		get_funnel_analytics: {
			description:
				"Get conversion rates, drop-off points, and step-by-step metrics for a funnel. No LLM cost.",
			inputSchema: z.object({
				funnelId: z.string().describe("Funnel ID from list_funnels"),
				websiteId: z.string().describe("Website ID from list_websites"),
				startDate: z
					.string()
					.optional()
					.describe("Start date YYYY-MM-DD (defaults to 30 days ago)"),
				endDate: z
					.string()
					.optional()
					.describe("End date YYYY-MM-DD (defaults to today)"),
			}),
			handler: async (args: {
				funnelId: string;
				websiteId: string;
				startDate?: string;
				endDate?: string;
			}) => {
				try {
					if (args.startDate && !dayjs(args.startDate).isValid()) {
						return toMcpResult({ error: "startDate must be YYYY-MM-DD" }, true);
					}
					if (args.endDate && !dayjs(args.endDate).isValid()) {
						return toMcpResult({ error: "endDate must be YYYY-MM-DD" }, true);
					}
					const rpcCtx = buildRpcContext(ctx);
					const result = await callRPCProcedure(
						"funnels",
						"getAnalytics",
						{
							funnelId: args.funnelId,
							websiteId: args.websiteId,
							startDate: args.startDate,
							endDate: args.endDate,
						},
						rpcCtx
					);
					trackToolCompletion(ctx, "get_funnel_analytics", true);
					return toMcpResult(result);
				} catch (err) {
					trackToolCompletion(ctx, "get_funnel_analytics", false);
					return toMcpResult(
						{
							error: rpcErrorMessage(err, "Failed to get funnel analytics"),
						},
						true
					);
				}
			},
		},

		list_goals: {
			description:
				"List all goals for a website. Returns goals with type, target, filters, and metadata. No LLM cost.",
			inputSchema: z.object({
				websiteId: z.string().describe("Website ID from list_websites"),
			}),
			handler: async (args: { websiteId: string }) => {
				try {
					const rpcCtx = buildRpcContext(ctx);
					const result = await callRPCProcedure(
						"goals",
						"list",
						{ websiteId: args.websiteId },
						rpcCtx
					);
					trackToolCompletion(ctx, "list_goals", true);
					return toMcpResult({
						goals: result,
						count: Array.isArray(result) ? result.length : 0,
					});
				} catch (err) {
					trackToolCompletion(ctx, "list_goals", false);
					return toMcpResult(
						{ error: rpcErrorMessage(err, "Failed to list goals") },
						true
					);
				}
			},
		},
		get_goal_analytics: {
			description:
				"Get conversion metrics for a goal: total users entered, completed, and conversion rate. No LLM cost.",
			inputSchema: z.object({
				goalId: z.string().describe("Goal ID from list_goals"),
				websiteId: z.string().describe("Website ID from list_websites"),
				startDate: z
					.string()
					.optional()
					.describe("Start date YYYY-MM-DD (defaults to 30 days ago)"),
				endDate: z
					.string()
					.optional()
					.describe("End date YYYY-MM-DD (defaults to today)"),
			}),
			handler: async (args: {
				goalId: string;
				websiteId: string;
				startDate?: string;
				endDate?: string;
			}) => {
				try {
					if (args.startDate && !dayjs(args.startDate).isValid()) {
						return toMcpResult({ error: "startDate must be YYYY-MM-DD" }, true);
					}
					if (args.endDate && !dayjs(args.endDate).isValid()) {
						return toMcpResult({ error: "endDate must be YYYY-MM-DD" }, true);
					}
					const rpcCtx = buildRpcContext(ctx);
					const result = await callRPCProcedure(
						"goals",
						"getAnalytics",
						{
							goalId: args.goalId,
							websiteId: args.websiteId,
							startDate: args.startDate,
							endDate: args.endDate,
						},
						rpcCtx
					);
					trackToolCompletion(ctx, "get_goal_analytics", true);
					return toMcpResult(result);
				} catch (err) {
					trackToolCompletion(ctx, "get_goal_analytics", false);
					return toMcpResult(
						{ error: rpcErrorMessage(err, "Failed to get goal analytics") },
						true
					);
				}
			},
		},

		list_links: {
			description:
				"List all short links for a website's organization. Returns links with slugs, target URLs, and metadata. No LLM cost.",
			inputSchema: z.object({
				websiteId: z.string().describe("Website ID from list_websites"),
			}),
			handler: async (args: { websiteId: string }) => {
				try {
					const orgId = await getOrganizationId(args.websiteId);
					if (orgId instanceof Error) {
						trackToolCompletion(ctx, "list_links", false);
						return toMcpResult({ error: orgId.message }, true);
					}
					const rpcCtx = buildRpcContext(ctx);
					const result = await callRPCProcedure(
						"links",
						"list",
						{ organizationId: orgId },
						rpcCtx
					);
					const links = Array.isArray(result) ? result : [];
					trackToolCompletion(ctx, "list_links", true);
					return toMcpResult({
						links: links.map(
							(link: {
								id: string;
								name: string;
								slug: string;
								targetUrl: string;
								externalId: string | null;
								expiresAt: string | null;
								createdAt: string;
								ogTitle: string | null;
								ogDescription: string | null;
							}) => ({
								id: link.id,
								name: link.name,
								slug: link.slug,
								targetUrl: link.targetUrl,
								externalId: link.externalId,
								expiresAt: link.expiresAt,
								createdAt: link.createdAt,
								ogTitle: link.ogTitle,
								ogDescription: link.ogDescription,
							})
						),
						count: links.length,
					});
				} catch (err) {
					trackToolCompletion(ctx, "list_links", false);
					return toMcpResult(
						{ error: rpcErrorMessage(err, "Failed to list links") },
						true
					);
				}
			},
		},
		search_links: {
			description:
				"Search short links by name, slug, target URL, or external ID. No LLM cost.",
			inputSchema: z.object({
				websiteId: z.string().describe("Website ID from list_websites"),
				query: z
					.string()
					.min(1)
					.describe("Search query (matches name, slug, URL, or external ID)"),
			}),
			handler: async (args: { websiteId: string; query: string }) => {
				try {
					const orgId = await getOrganizationId(args.websiteId);
					if (orgId instanceof Error) {
						trackToolCompletion(ctx, "search_links", false);
						return toMcpResult({ error: orgId.message }, true);
					}
					const rpcCtx = buildRpcContext(ctx);
					const allLinks = (await callRPCProcedure(
						"links",
						"list",
						{ organizationId: orgId },
						rpcCtx
					)) as Array<{
						id: string;
						name: string;
						slug: string;
						targetUrl: string;
						externalId: string | null;
					}>;
					const queryLower = args.query.toLowerCase();
					const matches = allLinks.filter(
						(link) =>
							link.name.toLowerCase().includes(queryLower) ||
							link.slug.toLowerCase().includes(queryLower) ||
							link.targetUrl.toLowerCase().includes(queryLower) ||
							link.externalId?.toLowerCase().includes(queryLower)
					);
					trackToolCompletion(ctx, "search_links", true);
					return toMcpResult({
						links: matches.map((link) => ({
							id: link.id,
							name: link.name,
							slug: link.slug,
							targetUrl: link.targetUrl,
							externalId: link.externalId,
						})),
						count: matches.length,
					});
				} catch (err) {
					trackToolCompletion(ctx, "search_links", false);
					return toMcpResult(
						{ error: rpcErrorMessage(err, "Failed to search links") },
						true
					);
				}
			},
		},
		...(isMemoryEnabled()
			? {
					search_memory: {
						description:
							"Search past conversations and saved context. Returns relevant memories ranked by similarity. Use to recall preferences, past questions, and previous findings. No LLM cost.",
						inputSchema: z.object({
							query: z
								.string()
								.describe(
									"What to search for (e.g. 'pricing page performance', 'past traffic issues')"
								),
							limit: z
								.number()
								.min(1)
								.max(10)
								.optional()
								.describe("Max memories to return (default 5)"),
						}),
						handler: async (args: { query: string; limit?: number }) => {
							try {
								const apiKeyId = ctx.apiKey
									? (ctx.apiKey as { id: string }).id
									: null;
								const results = await searchMemories(
									args.query,
									ctx.userId,
									apiKeyId,
									{
										limit: args.limit ?? 5,
										threshold: 0.4,
									}
								);
								trackToolCompletion(ctx, "search_memory", true);
								if (results.length === 0) {
									return toMcpResult({
										found: false,
										message: "No relevant memories found.",
									});
								}
								return toMcpResult({
									found: true,
									memories: results.map((r) => ({
										content: r.memory,
										relevance: Math.round(r.similarity * 100),
									})),
								});
							} catch (err) {
								trackToolCompletion(ctx, "search_memory", false);
								return toMcpResult(
									{
										error:
											err instanceof Error
												? err.message
												: "Memory search failed",
									},
									true
								);
							}
						},
					},
					save_memory: {
						description:
							"Save an important insight, preference, or finding for future conversations. No LLM cost.",
						inputSchema: z.object({
							content: z
								.string()
								.describe(
									"The insight or information to save (e.g. 'User focuses on /pricing bounce rate')"
								),
							category: z
								.enum(["preference", "insight", "pattern", "alert", "context"])
								.optional()
								.describe("Category of the memory (default: insight)"),
						}),
						handler: (args: { content: string; category?: string }) => {
							const apiKeyId = ctx.apiKey
								? (ctx.apiKey as { id: string }).id
								: null;
							storeMemory(
								[
									{
										role: "assistant",
										content: args.content,
									},
								],
								ctx.userId,
								apiKeyId,
								{ category: args.category ?? "insight" }
							);
							trackToolCompletion(ctx, "save_memory", true);
							return toMcpResult({ saved: true });
						},
					},
				}
			: {}),
	};
}
