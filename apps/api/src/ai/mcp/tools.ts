import dayjs from "dayjs";
import { z } from "zod";
import {
	forgetMemory,
	isMemoryEnabled,
	sanitizeMemoryContent,
	saveCuratedMemory,
	searchMemories,
} from "../../lib/supermemory";
import { executeBatch } from "../../query";
import { isAiGatewayConfigured } from "../config/models";
import { callRPCProcedure } from "../tools/utils";
import {
	appendToConversation,
	getConversationHistory,
} from "./conversation-store";
import {
	defineMcpTool,
	McpToolError,
	type McpRequestContext,
	type McpToolFactory,
	type RegisteredMcpTool,
} from "./define-tool";
import { INSIGHT_TOOL_FACTORIES } from "./insights-tools";
import {
	buildBatchQueryRequests,
	getFilteredQueryTypeDescriptions,
	getQueryTypeDescriptions,
	getQueryTypeDetails,
	getSchemaDocumentation,
	getSchemaSummary,
	MCP_DATE_PRESETS,
	QUERY_CATEGORY_KEYS,
	SCHEMA_SECTIONS,
	type McpQueryItem,
} from "./mcp-utils";
import { runMcpAgent } from "./run-agent";
import {
	buildRpcContext,
	coerceQueriesArray,
	getCachedAccessibleWebsites,
	getOrganizationId,
} from "./tool-context";

const MEMORY_ENABLED = isMemoryEnabled();

const GATEWAY_AUTH_ERROR_RE = /Unauthenticated|AI Gateway|AI_GATEWAY_API_KEY/i;

const TIME_UNIT = ["minute", "hour", "day", "week", "month"] as const;

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
	limit: z.coerce.number().int().min(1).max(1000).optional(),
	filters: z.array(FilterSchema).optional(),
	groupBy: z.array(z.string()).optional(),
	orderBy: z.string().optional(),
});

const WebsiteSummarySchema = z.object({
	id: z.string(),
	name: z.string().nullable(),
	domain: z.string().nullable(),
	isPublic: z.boolean().nullable(),
});

const LinkRowOutputSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	targetUrl: z.string(),
	externalId: z.string().nullable(),
	expiresAt: z.string().nullable().optional(),
	createdAt: z.string().optional(),
	ogTitle: z.string().nullable().optional(),
	ogDescription: z.string().nullable().optional(),
});

const askTool = defineMcpTool(
	{
		name: "ask",
		description:
			"Run a multi-step analytics agent on a free-form question. Use when the question is open-ended and you don't know which specific tool fits. Reuse conversationId for follow-ups.",
		inputSchema: z.object({
			question: z
				.string()
				.min(1)
				.max(2000)
				.describe("Your analytics question in natural language"),
			conversationId: z
				.string()
				.optional()
				.describe(
					"Pass from a previous ask response to continue the conversation"
				),
			timezone: z
				.string()
				.optional()
				.describe("IANA timezone (e.g. 'America/New_York'). Defaults to UTC."),
		}),
		outputSchema: z.object({
			answer: z.string(),
			conversationId: z.string(),
		}),
		ratelimit: { limit: 10, windowSec: 60 },
	},
	async (input, ctx) => {
		if (!isAiGatewayConfigured) {
			throw new McpToolError(
				"internal",
				"AI gateway is not configured on this server.",
				{
					hint: "Set AI_GATEWAY_API_KEY on the API process and restart. Meanwhile, use summarize_insights, compare_metric, top_movers, or get_data directly.",
				}
			);
		}

		const conversationId = input.conversationId ?? crypto.randomUUID();
		const priorMessages = await getConversationHistory(
			conversationId,
			ctx.userId,
			ctx.apiKey
		);

		try {
			const answer = await runMcpAgent({
				question: input.question,
				requestHeaders: ctx.requestHeaders,
				apiKey: ctx.apiKey,
				userId: ctx.userId,
				timezone: input.timezone,
				conversationId,
				priorMessages: priorMessages.length > 0 ? priorMessages : undefined,
			});

			await appendToConversation(
				conversationId,
				ctx.userId,
				ctx.apiKey,
				input.question,
				answer,
				priorMessages
			);

			return { answer, conversationId };
		} catch (err) {
			if (err instanceof Error && err.name === "AbortError") {
				throw new McpToolError(
					"upstream_timeout",
					"Request timed out. Try a simpler question or use get_data for direct queries."
				);
			}
			// Upstream AI gateway auth / config errors — rewrite to a clearer tool-level error.
			const msg = err instanceof Error ? err.message : String(err);
			if (GATEWAY_AUTH_ERROR_RE.test(msg)) {
				throw new McpToolError(
					"internal",
					"AI gateway rejected the request (likely missing or invalid key).",
					{
						hint: "Check AI_GATEWAY_API_KEY on the API process. Use direct tools (summarize_insights, compare_metric, get_data) in the meantime.",
					}
				);
			}
			throw err;
		}
	}
);

const listWebsitesTool = defineMcpTool(
	{
		name: "list_websites",
		description:
			"List websites the caller can access. Use first to discover websiteIds before any tool that needs one.",
		inputSchema: z.object({}),
		outputSchema: z.object({
			websites: z.array(WebsiteSummarySchema),
			total: z.number(),
		}),
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (_input, ctx) => {
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
	}
);

const getDataTool = defineMcpTool(
	{
		name: "get_data",
		description:
			"Run one or many analytics queries against a website. Single mode: type + preset/from/to. Batch mode: queries[] (2-10 items). Defaults to last_7d when no date is given.",
		inputSchema: z.object({
			websiteId: z
				.string()
				.optional()
				.describe("Website ID from list_websites"),
			websiteName: z
				.string()
				.optional()
				.describe("Website name. Alternative to websiteId."),
			websiteDomain: z
				.string()
				.optional()
				.describe("Website domain. Alternative to websiteId."),
			type: z
				.string()
				.optional()
				.describe(
					"Query type for single-query mode. Use capabilities to see all types."
				),
			preset: z
				.enum(MCP_DATE_PRESETS as [string, ...string[]])
				.optional()
				.describe(
					"Date preset (e.g. 'last_7d', 'last_30d'). Alternative to from/to."
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
			limit: z.coerce
				.number()
				.int()
				.min(1)
				.max(1000)
				.optional()
				.describe("Max rows to return (1-1000)."),
			filters: z
				.array(FilterSchema)
				.optional()
				.describe(
					"Filters [{field, op, value}]. ops: eq, ne, contains, not_contains, starts_with, in, not_in."
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
				.describe("IANA timezone. Defaults to UTC."),
		}),
		outputSchema: z.object({
			// Single-query shape
			data: z.array(z.record(z.string(), z.unknown())).optional(),
			rowCount: z.number().optional(),
			type: z.string().optional(),
			// Batch shape
			batch: z.boolean().optional(),
			results: z
				.array(
					z.object({
						type: z.string(),
						data: z.array(z.record(z.string(), z.unknown())),
						rowCount: z.number(),
						error: z.string().optional(),
					})
				)
				.optional(),
			// Shared
			error: z.string().optional(),
		}),
		resolveWebsite: true,
		ratelimit: { limit: 30, windowSec: 60 },
	},
	async (input, ctx) => {
		const websiteId = ctx.websiteId as string;
		const timezone = input.timezone ?? "UTC";

		const rawQueries = input.queries
			? Array.isArray(input.queries)
				? input.queries
				: coerceQueriesArray(input.queries)
			: undefined;

		const items: McpQueryItem[] =
			rawQueries && rawQueries.length >= 2
				? (rawQueries as McpQueryItem[])
				: input.type
					? [
							{
								type: input.type,
								preset: input.preset,
								from: input.from,
								to: input.to,
								timeUnit: input.timeUnit,
								limit: input.limit,
								filters: input.filters,
								groupBy: input.groupBy,
								orderBy: input.orderBy,
							},
						]
					: [];

		if (items.length === 0) {
			throw new McpToolError(
				"invalid_input",
				"Either 'type' (single query) or 'queries' array (batch, 2-10 items) is required.",
				{
					hint: "Single: {type:'top_pages',preset:'last_7d'}. Batch: {queries:[{type:'summary',preset:'last_7d'},{type:'top_pages',preset:'last_7d'}]}",
				}
			);
		}

		const buildResult = buildBatchQueryRequests(items, websiteId, timezone);
		if ("error" in buildResult) {
			throw new McpToolError("invalid_input", buildResult.error);
		}
		const requests = buildResult.requests;
		const isBatch = requests.length > 1;

		// ctx.websiteDomain is guaranteed set by defineMcpTool when resolveWebsite is true
		const websiteDomain = ctx.websiteDomain ?? "unknown";
		const results = await executeBatch(requests, {
			websiteDomain,
			timezone,
		});

		if (isBatch) {
			return {
				batch: true,
				results: results.map((r) => ({
					type: r.type,
					data: r.data,
					rowCount: r.data.length,
					...(r.error && { error: r.error }),
				})),
			};
		}

		const first = results[0];
		if (!first) {
			throw new McpToolError("internal", "No results returned");
		}
		return {
			data: first.data,
			rowCount: first.data.length,
			type: first.type,
			...(first.error && { error: first.error }),
		};
	}
);

const getSchemaTool = defineMcpTool(
	{
		name: "get_schema",
		description:
			"Return the ClickHouse analytics schema. Filter by section ('events','errors','vitals','outgoing') and toggle examples/guidelines to slim the payload. Use only when writing custom SQL.",
		inputSchema: z.object({
			sections: z
				.array(z.enum(SCHEMA_SECTIONS))
				.optional()
				.describe(
					`Only return these schema sections. Default = all. Options: ${SCHEMA_SECTIONS.join(", ")}`
				),
			includeExamples: z
				.boolean()
				.optional()
				.default(true)
				.describe("Include SQL example patterns (default true)"),
			includeGuidelines: z
				.boolean()
				.optional()
				.default(true)
				.describe("Include query guidelines block (default true)"),
		}),
		outputSchema: z.object({
			schema: z.string(),
			sections: z.array(z.string()),
			bytes: z.number(),
		}),
		ratelimit: { limit: 60, windowSec: 60 },
	},
	(input) => {
		const schema = getSchemaDocumentation({
			sections: input.sections,
			includeExamples: input.includeExamples,
			includeGuidelines: input.includeGuidelines,
		});
		return {
			schema,
			sections:
				input.sections && input.sections.length > 0
					? [...input.sections]
					: [...SCHEMA_SECTIONS],
			bytes: schema.length,
		};
	}
);

const CAPABILITY_SECTIONS = [
	"hints",
	"datePresets",
	"schemaSummary",
	"availableTools",
	"categories",
	"queryTypes",
] as const;
type CapabilitySection = (typeof CAPABILITY_SECTIONS)[number];
const CAPABILITY_DEFAULTS: readonly CapabilitySection[] = [
	"hints",
	"datePresets",
	"schemaSummary",
	"availableTools",
	"categories",
];

const HINTS: readonly string[] = [
	"get_data accepts websiteId, websiteName, or websiteDomain — no need to call list_websites first if you know the name or domain",
	"get_data batch: pass queries array (2-10 items, each with type + preset or from/to). Single: type + preset OR from+to. Defaults to last_7d.",
	"capabilities is filterable: include=['hints'] for just hints, category='errors' to filter queryTypes, detail='full' for allowedFilters",
	"get_schema is sectionable: sections=['events'] + includeExamples=false for the smallest useful payload",
	"ask requires AI_GATEWAY_API_KEY on the API process; use summarize_insights/compare_metric/get_data as direct alternatives",
	"summarize_insights with no websiteId returns ORG-WIDE counts + per-site breakdown. Set includeDetail=true for description/suggestion on top priorities.",
	"compare_metric accepts 'metrics' (array) to batch multiple metrics in a single pair of DB queries",
	"detect_anomalies runs BOTH z-score (spikes) and week-over-week (gradual drops) by default; use method='wow' for trend-only",
	"top_movers supports minDeltaPercent to drop small changes, and direction='up'|'down'|'both'",
	"list_insights supports 'ids' for direct drill-down and 'fields' to slim the response",
	"Custom events: filter by event name with [{field:'event_name',op:'eq',value:'your-event'}]",
	"Custom events: filter by property key with [{field:'property_key',op:'eq',value:'your-key'}] for property_top_values/distribution",
];

const capabilitiesTool = defineMcpTool(
	{
		name: "capabilities",
		description:
			"Return tool hints, date presets, categories, and (optionally) query types. Use 'include' to control response shape and 'category' to filter queryTypes — defaults OMIT queryTypes for a small payload.",
		inputSchema: z.object({
			include: z
				.array(z.enum(CAPABILITY_SECTIONS))
				.optional()
				.describe(
					`Sections to include. Default: ${CAPABILITY_DEFAULTS.join(", ")}. Pass ['queryTypes'] to request the heavy query-type list.`
				),
			category: z
				.enum(QUERY_CATEGORY_KEYS as [string, ...string[]])
				.optional()
				.describe(
					`Filter queryTypes to a category. Options: ${QUERY_CATEGORY_KEYS.join(", ")}`
				),
			contains: z
				.string()
				.optional()
				.describe("Substring filter for queryTypes keys (case-insensitive)."),
			detail: z
				.enum(["summary", "full"])
				.optional()
				.default("summary")
				.describe(
					"'summary' returns descriptions only; 'full' includes allowedFilters per type. Only applied when queryTypes is included."
				),
		}),
		outputSchema: z.object({
			schemaSummary: z.string().optional(),
			datePresets: z.array(z.string()).optional(),
			dateFormat: z.string().optional(),
			maxLimit: z.number().optional(),
			availableTools: z.array(z.string()).optional(),
			categories: z.array(z.string()).optional(),
			queryTypes: z.record(z.string(), z.unknown()).optional(),
			hints: z.array(z.string()).optional(),
		}),
		ratelimit: { limit: 60, windowSec: 60 },
	},
	(input) => {
		const selected = new Set<CapabilitySection>(
			input.include && input.include.length > 0
				? input.include
				: CAPABILITY_DEFAULTS
		);
		if ((input.category || input.contains) && !selected.has("queryTypes")) {
			selected.add("queryTypes");
		}

		const out: Record<string, unknown> = {};
		if (selected.has("hints")) {
			out.hints = HINTS;
		}
		if (selected.has("datePresets")) {
			out.datePresets = MCP_DATE_PRESETS;
			out.dateFormat = "YYYY-MM-DD";
			out.maxLimit = 1000;
		}
		if (selected.has("schemaSummary")) {
			out.schemaSummary = getSchemaSummary();
		}
		if (selected.has("availableTools")) {
			out.availableTools = getRegisteredToolNames();
		}
		if (selected.has("categories")) {
			out.categories = QUERY_CATEGORY_KEYS;
		}
		if (selected.has("queryTypes")) {
			if (input.category || input.contains) {
				out.queryTypes = getFilteredQueryTypeDescriptions({
					category: input.category,
					contains: input.contains,
				});
			} else {
				out.queryTypes =
					input.detail === "full"
						? getQueryTypeDetails()
						: getQueryTypeDescriptions();
			}
		}
		return out;
	}
);

const listFunnelsTool = defineMcpTool(
	{
		name: "list_funnels",
		description:
			"List funnels for a website with their steps and filters. Use before get_funnel_analytics or to enumerate available funnels.",
		inputSchema: z.object({
			websiteId: z.string().describe("Website ID from list_websites"),
		}),
		outputSchema: z.object({
			funnels: z.array(z.record(z.string(), z.unknown())),
			count: z.number(),
			hint: z.string().optional(),
		}),
		resolveWebsite: true,
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		const result = await callRPCProcedure(
			"funnels",
			"list",
			{ websiteId: input.websiteId },
			buildRpcContext(ctx)
		);
		const funnels = Array.isArray(result) ? result : [];
		if (funnels.length === 0) {
			return {
				funnels,
				count: 0,
				hint: "No funnels yet for this website. Create one in the dashboard.",
			};
		}
		return { funnels, count: funnels.length };
	}
);

const getFunnelAnalyticsTool = defineMcpTool(
	{
		name: "get_funnel_analytics",
		description:
			"Return per-step conversion, drop-off, and timing for one funnel. Use after list_funnels to analyze a specific funnelId.",
		inputSchema: z.object({
			funnelId: z.string().describe("Funnel ID from list_funnels"),
			websiteId: z.string().describe("Website ID from list_websites"),
			from: z
				.string()
				.optional()
				.describe("Start date YYYY-MM-DD (defaults to 30 days ago)"),
			to: z
				.string()
				.optional()
				.describe("End date YYYY-MM-DD (defaults to today)"),
		}),
		// Passthrough from RPC — shape varies by funnel. Permissive by design.
		outputSchema: z.record(z.string(), z.unknown()),
		resolveWebsite: true,
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		if (input.from && !dayjs(input.from).isValid()) {
			throw new McpToolError("invalid_input", "from must be YYYY-MM-DD");
		}
		if (input.to && !dayjs(input.to).isValid()) {
			throw new McpToolError("invalid_input", "to must be YYYY-MM-DD");
		}
		return await callRPCProcedure(
			"funnels",
			"getAnalytics",
			{
				funnelId: input.funnelId,
				websiteId: input.websiteId,
				startDate: input.from,
				endDate: input.to,
			},
			buildRpcContext(ctx)
		);
	}
);

const listGoalsTool = defineMcpTool(
	{
		name: "list_goals",
		description:
			"List conversion goals for a website with their type, target, and filters. Use before get_goal_analytics.",
		inputSchema: z.object({
			websiteId: z.string().describe("Website ID from list_websites"),
		}),
		outputSchema: z.object({
			goals: z.array(z.record(z.string(), z.unknown())),
			count: z.number(),
			hint: z.string().optional(),
		}),
		resolveWebsite: true,
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		const result = await callRPCProcedure(
			"goals",
			"list",
			{ websiteId: input.websiteId },
			buildRpcContext(ctx)
		);
		const goals = Array.isArray(result) ? result : [];
		if (goals.length === 0) {
			return {
				goals,
				count: 0,
				hint: "No goals yet for this website. Create one in the dashboard.",
			};
		}
		return { goals, count: goals.length };
	}
);

const getGoalAnalyticsTool = defineMcpTool(
	{
		name: "get_goal_analytics",
		description:
			"Return entered/completed counts and conversion rate for one goalId. Use after list_goals.",
		inputSchema: z.object({
			goalId: z.string().describe("Goal ID from list_goals"),
			websiteId: z.string().describe("Website ID from list_websites"),
			from: z
				.string()
				.optional()
				.describe("Start date YYYY-MM-DD (defaults to 30 days ago)"),
			to: z
				.string()
				.optional()
				.describe("End date YYYY-MM-DD (defaults to today)"),
		}),
		// Passthrough from RPC — shape varies by goal. Permissive by design.
		outputSchema: z.record(z.string(), z.unknown()),
		resolveWebsite: true,
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		if (input.from && !dayjs(input.from).isValid()) {
			throw new McpToolError("invalid_input", "from must be YYYY-MM-DD");
		}
		if (input.to && !dayjs(input.to).isValid()) {
			throw new McpToolError("invalid_input", "to must be YYYY-MM-DD");
		}
		return await callRPCProcedure(
			"goals",
			"getAnalytics",
			{
				goalId: input.goalId,
				websiteId: input.websiteId,
				startDate: input.from,
				endDate: input.to,
			},
			buildRpcContext(ctx)
		);
	}
);

interface LinkRow {
	createdAt: string;
	expiresAt: string | null;
	externalId: string | null;
	id: string;
	name: string;
	ogDescription: string | null;
	ogTitle: string | null;
	slug: string;
	targetUrl: string;
}

const listLinksTool = defineMcpTool(
	{
		name: "list_links",
		description:
			"List short links for the website's organization. Use to enumerate all links before referencing one.",
		inputSchema: z.object({
			websiteId: z.string().describe("Website ID from list_websites"),
		}),
		outputSchema: z.object({
			links: z.array(LinkRowOutputSchema),
			count: z.number(),
			hint: z.string().optional(),
		}),
		resolveWebsite: true,
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		const orgId = await getOrganizationId(input.websiteId);
		if (orgId instanceof Error) {
			throw new McpToolError("not_found", orgId.message);
		}
		const result = await callRPCProcedure(
			"links",
			"list",
			{ organizationId: orgId },
			buildRpcContext(ctx)
		);
		const links = (Array.isArray(result) ? result : []) as LinkRow[];
		if (links.length === 0) {
			return {
				links,
				count: 0,
				hint: "No links yet for this organization.",
			};
		}
		return {
			links: links.map((link) => ({
				id: link.id,
				name: link.name,
				slug: link.slug,
				targetUrl: link.targetUrl,
				externalId: link.externalId,
				expiresAt: link.expiresAt,
				createdAt: link.createdAt,
				ogTitle: link.ogTitle,
				ogDescription: link.ogDescription,
			})),
			count: links.length,
		};
	}
);

const searchLinksTool = defineMcpTool(
	{
		name: "search_links",
		description:
			"Find short links matching a substring on name, slug, target URL, or external ID. Use when you know part of a link identifier.",
		inputSchema: z.object({
			websiteId: z.string().describe("Website ID from list_websites"),
			query: z
				.string()
				.min(1)
				.describe("Search query (matches name, slug, URL, or external ID)"),
		}),
		outputSchema: z.object({
			links: z.array(
				z.object({
					id: z.string(),
					name: z.string(),
					slug: z.string(),
					targetUrl: z.string(),
					externalId: z.string().nullable(),
				})
			),
			count: z.number(),
		}),
		resolveWebsite: true,
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		const orgId = await getOrganizationId(input.websiteId);
		if (orgId instanceof Error) {
			throw new McpToolError("not_found", orgId.message);
		}
		const allLinks = (await callRPCProcedure(
			"links",
			"list",
			{ organizationId: orgId },
			buildRpcContext(ctx)
		)) as LinkRow[];
		const queryLower = input.query.toLowerCase();
		const matches = allLinks.filter(
			(link) =>
				link.name.toLowerCase().includes(queryLower) ||
				link.slug.toLowerCase().includes(queryLower) ||
				link.targetUrl.toLowerCase().includes(queryLower) ||
				link.externalId?.toLowerCase().includes(queryLower)
		);
		return {
			links: matches.map((link) => ({
				id: link.id,
				name: link.name,
				slug: link.slug,
				targetUrl: link.targetUrl,
				externalId: link.externalId,
			})),
			count: matches.length,
		};
	}
);

const searchMemoryTool = defineMcpTool(
	{
		name: "search_memory",
		description:
			"Search saved notes from prior conversations. Use to recall preferences or earlier findings before re-asking the user.",
		inputSchema: z.object({
			query: z
				.string()
				.min(1)
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
		outputSchema: z.object({
			found: z.boolean(),
			memories: z
				.array(
					z.object({
						content: z.string(),
						relevance: z.number(),
					})
				)
				.optional(),
			message: z.string().optional(),
		}),
		ratelimit: { limit: 30, windowSec: 60 },
	},
	async (input, ctx) => {
		const apiKeyId = ctx.apiKey ? (ctx.apiKey as { id: string }).id : null;
		const results = await searchMemories(input.query, ctx.userId, apiKeyId, {
			limit: input.limit ?? 5,
			threshold: 0.4,
		});
		if (results.length === 0) {
			return { found: false, message: "No relevant memories found." };
		}
		return {
			found: true,
			memories: results.map((r) => ({
				content: sanitizeMemoryContent(r.memory),
				relevance: Math.round(r.similarity * 100),
			})),
		};
	}
);

const saveMemoryTool = defineMcpTool(
	{
		name: "save_memory",
		description:
			"Persist a short insight, preference, or finding for future conversations. Use after a confirmed answer worth remembering.",
		inputSchema: z.object({
			content: z
				.string()
				.min(1)
				.max(2000)
				.describe(
					"The insight to save (e.g. 'User focuses on /pricing bounce rate')"
				),
			category: z
				.enum(["preference", "insight", "pattern", "alert", "context"])
				.optional()
				.describe("Category (default: insight)"),
		}),
		outputSchema: z.object({ queued: z.boolean() }),
		ratelimit: { limit: 30, windowSec: 60 },
	},
	(input, ctx) => {
		const apiKeyId = ctx.apiKey ? (ctx.apiKey as { id: string }).id : null;
		saveCuratedMemory(input.content, ctx.userId, apiKeyId, {
			category: input.category ?? "insight",
		});
		return { queued: true };
	}
);

const forgetMemoryTool = defineMcpTool(
	{
		name: "forget_memory",
		description:
			"Delete an incorrect or outdated memory. Search for the memory first, then forget it.",
		inputSchema: z.object({
			query: z
				.string()
				.min(1)
				.describe("Search query to find the memory to forget"),
		}),
		outputSchema: z.object({
			forgotten: z.boolean(),
			message: z.string(),
		}),
		ratelimit: { limit: 10, windowSec: 60 },
	},
	async (input, ctx) => {
		const apiKeyId = ctx.apiKey ? (ctx.apiKey as { id: string }).id : null;
		const results = await searchMemories(input.query, ctx.userId, apiKeyId, {
			limit: 1,
			threshold: 0.3,
		});
		if (results.length === 0 || !results[0]) {
			return {
				forgotten: false,
				message: "No matching memory found to forget.",
			};
		}
		const containerTag = ctx.userId
			? `user:${ctx.userId}`
			: apiKeyId
				? `apikey:${apiKeyId}`
				: "anonymous";
		const result = await forgetMemory(containerTag, results[0].memory);
		return {
			forgotten: result.success,
			message: result.success
				? "Memory forgotten."
				: "Failed to forget memory.",
		};
	}
);

const ALL_TOOL_FACTORIES: McpToolFactory[] = [
	askTool,
	listWebsitesTool,
	getDataTool,
	getSchemaTool,
	capabilitiesTool,
	listFunnelsTool,
	getFunnelAnalyticsTool,
	listGoalsTool,
	getGoalAnalyticsTool,
	listLinksTool,
	searchLinksTool,
	...INSIGHT_TOOL_FACTORIES,
	...(MEMORY_ENABLED
		? [searchMemoryTool, saveMemoryTool, forgetMemoryTool]
		: []),
];

const REGISTERED_TOOL_NAMES: readonly string[] = Object.freeze(
	ALL_TOOL_FACTORIES.map((f, idx) => {
		if (typeof f.toolName !== "string" || f.toolName.length === 0) {
			throw new Error(
				`MCP tool factory at index ${idx} is missing a toolName. Check defineMcpTool usage.`
			);
		}
		return f.toolName;
	})
);

function getRegisteredToolNames(): readonly string[] {
	return REGISTERED_TOOL_NAMES;
}

export function createMcpTools(ctx: McpRequestContext): RegisteredMcpTool[] {
	return ALL_TOOL_FACTORIES.map((factory) => factory.build(ctx));
}
