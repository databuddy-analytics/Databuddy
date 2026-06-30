import dayjs from "dayjs";
import { z } from "zod";
import { userRuleSchema, variantSchema } from "@databuddy/shared/flags";
import {
	forgetMemory,
	isMemoryEnabled,
	sanitizeMemoryContent,
	saveCuratedMemory,
	searchMemories,
} from "../../lib/supermemory";
import { executeBatch } from "../../query";
import { isAiGatewayConfigured } from "../config/models";
import { summarizeDigestConfig } from "../tools/digest-summary";
import { callRPCProcedure } from "../tools/utils";
import {
	LinkFolderSelectorSchema,
	LinkFolderWithUsageSchema,
	LinkRowOutputSchema,
	listLinkFolders,
	listLinks,
	parseLinkRow,
	resolveLinkFolder,
	summarizeLink,
	summarizeLinkFolder,
	summarizeLinkFoldersWithUsage,
} from "../tools/link-catalog";
import {
	appendToConversation,
	getConversationHistory,
} from "./conversation-store";
import {
	defineMcpTool,
	McpToolError,
	type McpHandlerContext,
	type McpRequestContext,
	type McpToolFactory,
	type McpToolMetadata,
	type RegisteredMcpTool,
} from "./define-tool";
import { INSIGHT_TOOL_FACTORIES } from "./insights-tools";
import { investigateTool } from "./investigate";
import {
	buildBatchQueryRequests,
	FilterSchema,
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
	getCachedAccessibleWebsites,
	getOrganizationId,
	resolveOrganizationIds,
} from "./tool-context";
import { createToolRegistry } from "./registry";

const MEMORY_ENABLED = isMemoryEnabled();

const GATEWAY_AUTH_ERROR_RE = /Unauthenticated|AI Gateway|AI_GATEWAY_API_KEY/i;

const TIME_UNIT = ["minute", "hour", "day", "week", "month"] as const;

const WebsiteSelectorSchema = {
	websiteId: z.string().optional().describe("Website ID from list_websites"),
	websiteName: z
		.string()
		.optional()
		.describe("Website name. Alternative to websiteId."),
	websiteDomain: z
		.string()
		.optional()
		.describe("Website domain. Alternative to websiteId."),
} as const;

const QueryItemSchema = z.object({
	type: z.string(),
	preset: z.enum(MCP_DATE_PRESETS as [string, ...string[]]).optional(),
	from: z.string().optional(),
	to: z.string().optional(),
	timeUnit: z.enum(TIME_UNIT).optional(),
	limit: z.number().int().min(1).max(1000).optional(),
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

const WorkflowFilterSchema = z.object({
	field: z.string(),
	operator: z.enum(["equals", "contains", "not_equals", "in", "not_in"]),
	value: z.union([z.string(), z.array(z.string())]),
});

const FunnelStepSchema = z.object({
	type: z.enum(["PAGE_VIEW", "EVENT", "CUSTOM"]),
	target: z.string().min(1),
	name: z.string().min(1),
	conditions: z.record(z.string(), z.unknown()).optional(),
});

const ChartContextSchema = z.object({
	dateRange: z.object({
		start_date: z.string(),
		end_date: z.string(),
		granularity: z.enum(["hourly", "daily", "weekly", "monthly"]),
	}),
	filters: z
		.array(
			z.object({
				field: z.string(),
				operator: z.enum(["eq", "ne", "gt", "lt", "contains"]),
				value: z.string(),
			})
		)
		.optional(),
	metrics: z.array(z.string()).optional(),
	tabId: z.string().optional(),
});

const FlagRuleSchema = userRuleSchema;
const FlagVariantSchema = variantSchema;

const FlagStatusSchema = z.enum(["active", "inactive", "archived"]);
const FlagTypeSchema = z.enum(["boolean", "rollout", "multivariant"]);
const ConfirmedSchema = z.boolean().optional().default(false);

const MutationResultSchema = z
	.object({
		confirmationRequired: z.boolean().optional(),
		message: z.string(),
		preview: z.boolean().optional(),
		success: z.boolean().optional(),
	})
	.passthrough();

const WRITE_METADATA = {
	capability: "workspace",
	access: {
		confirmation: "recommended",
		kind: "write",
	},
	evlogAction: "tool_mutation",
} satisfies Partial<McpToolMetadata>;

function writeMetadata(scopes: string[]): Partial<McpToolMetadata> {
	return {
		...WRITE_METADATA,
		access: {
			...WRITE_METADATA.access,
			scopes,
		},
	};
}

function assertValidDate(value: string | undefined, field: string): void {
	if (value && !dayjs(value).isValid()) {
		throw new McpToolError("invalid_input", `${field} must be a valid date`);
	}
}

function createChartContext(input: {
	from?: string;
	granularity?: "hourly" | "daily" | "weekly" | "monthly";
	metrics?: string[];
	to?: string;
}): z.infer<typeof ChartContextSchema> {
	return {
		dateRange: {
			start_date:
				input.from ?? dayjs().subtract(30, "day").format("YYYY-MM-DD"),
			end_date: input.to ?? dayjs().format("YYYY-MM-DD"),
			granularity: input.granularity ?? "daily",
		},
		...(input.metrics ? { metrics: input.metrics } : {}),
	};
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function getResolvedWebsiteId(ctx: McpHandlerContext): string {
	if (!ctx.websiteId) {
		throw new McpToolError("internal", "Website was not resolved.");
	}
	return ctx.websiteId;
}

function createFlagUserRule(
	matchBy: "email" | "user_id",
	values: string[]
): z.infer<typeof FlagRuleSchema> {
	return {
		batch: true,
		batchValues: values,
		enabled: true,
		operator: "in",
		type: matchBy,
		values,
	};
}

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
			"List websites the caller can access. Use only when the user hasn't named one — every other tool accepts websiteId, websiteName, or websiteDomain.",
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
			"Run analytics queries against a website. Single: type + preset/from/to. Batch: queries[] (2-10). Defaults to last_7d. Call capabilities for the query-type catalog and get_schema for column names. Filter/groupBy errors list allowed fields.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
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
			limit: z
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
					"Filters [{field, op, value}]. ops: eq, ne, contains, not_contains, starts_with, in, not_in. 'field' is the ClickHouse column name — call get_schema if unsure. Rejected fields return the allowed list for this query."
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
		const websiteId = getResolvedWebsiteId(ctx);
		const timezone = input.timezone ?? "UTC";

		const rawQueries = input.queries;

		const items: McpQueryItem[] =
			rawQueries && rawQueries.length >= 2
				? rawQueries
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

		const { requests, invalid } = buildBatchQueryRequests(
			items,
			websiteId,
			timezone
		);

		// ctx.websiteDomain is guaranteed set by defineMcpTool when resolveWebsite is true
		const websiteDomain = ctx.websiteDomain ?? "unknown";
		const results = await executeBatch(requests, {
			websiteDomain,
			timezone,
		});

		const merged: Array<{
			data: unknown[];
			error?: string;
			rowCount: number;
			type: string;
		}> = [
			...results.map((r) => ({
				type: r.type,
				data: r.data,
				rowCount: r.data.length,
				...(r.error && { error: r.error }),
			})),
			...invalid.map((q) => ({
				type: q.type,
				data: [] as unknown[],
				rowCount: 0,
				error: q.error,
			})),
		];

		if (items.length > 1) {
			return { batch: true, results: merged };
		}

		const first = merged[0];
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
			"Return the ClickHouse analytics schema (column names + types). Use when an unknown field name shows up in a filter rejection or when composing a custom query. Filter by section and toggle examples/guidelines to slim.",
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
	"toolCatalog",
	"categories",
	"queryTypes",
] as const;
type CapabilitySection = (typeof CAPABILITY_SECTIONS)[number];
const CAPABILITY_DEFAULTS: readonly CapabilitySection[] = [
	"hints",
	"datePresets",
	"schemaSummary",
	"availableTools",
	"toolCatalog",
	"categories",
];

const HINTS: readonly string[] = [
	"For a deeper reference (workflow + footguns), read the databuddy://guide MCP resource.",
	"capabilities is filterable: include=['queryTypes'] to fetch the heavy catalog, category='Errors' or contains='vital' to narrow, detail='full' for allowedFilters.",
	"get_schema is sectionable: sections=['events'] + includeExamples=false for the smallest useful payload.",
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
			toolCatalog: z.array(z.record(z.string(), z.unknown())).optional(),
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
		if (selected.has("toolCatalog")) {
			out.toolCatalog = getToolCatalog();
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
			...WebsiteSelectorSchema,
		}),
		outputSchema: z.object({
			funnels: z.array(z.record(z.string(), z.unknown())),
			count: z.number(),
			hint: z.string().optional(),
		}),
		resolveWebsite: true,
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (_input, ctx) => {
		const result = await callRPCProcedure(
			"funnels",
			"list",
			{ websiteId: ctx.websiteId },
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
			...WebsiteSelectorSchema,
			funnelId: z.string().describe("Funnel ID from list_funnels"),
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
		assertValidDate(input.from, "from");
		assertValidDate(input.to, "to");
		return await callRPCProcedure(
			"funnels",
			"getAnalytics",
			{
				funnelId: input.funnelId,
				websiteId: ctx.websiteId,
				startDate: input.from,
				endDate: input.to,
			},
			buildRpcContext(ctx)
		);
	}
);

const createFunnelTool = defineMcpTool(
	{
		name: "create_funnel",
		description:
			"Create a funnel for a website. Call with confirmed=false for preview, then confirmed=true after explicit user approval.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			name: z.string().min(1).max(100),
			description: z.string().optional(),
			steps: z.array(FunnelStepSchema).min(2).max(10),
			filters: z.array(WorkflowFilterSchema).optional(),
			ignoreHistoricData: z.boolean().optional(),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		resolveWebsite: true,
		metadata: writeMetadata(["manage:websites"]),
		ratelimit: { limit: 10, windowSec: 60 },
	},
	async (input, ctx) => {
		const websiteId = getResolvedWebsiteId(ctx);
		if (!input.confirmed) {
			return {
				preview: true,
				message: "Review this funnel before creating it.",
				confirmationRequired: true,
				funnel: {
					name: input.name,
					description: input.description ?? null,
					stepCount: input.steps.length,
					steps: input.steps,
					filters: input.filters ?? [],
					ignoreHistoricData: input.ignoreHistoricData ?? false,
				},
			};
		}

		const result = await callRPCProcedure(
			"funnels",
			"create",
			{
				websiteId,
				name: input.name,
				description: input.description,
				steps: input.steps,
				filters: input.filters,
				ignoreHistoricData: input.ignoreHistoricData ?? false,
			},
			buildRpcContext(ctx)
		);
		return {
			success: true,
			message: `Funnel "${input.name}" created successfully.`,
			funnel: result,
		};
	}
);

const listGoalsTool = defineMcpTool(
	{
		name: "list_goals",
		description:
			"List conversion goals for a website with their type, target, and filters. Use before get_goal_analytics.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
		}),
		outputSchema: z.object({
			goals: z.array(z.record(z.string(), z.unknown())),
			count: z.number(),
			hint: z.string().optional(),
		}),
		resolveWebsite: true,
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (_input, ctx) => {
		const result = await callRPCProcedure(
			"goals",
			"list",
			{ websiteId: ctx.websiteId },
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
			...WebsiteSelectorSchema,
			goalId: z.string().describe("Goal ID from list_goals"),
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
		assertValidDate(input.from, "from");
		assertValidDate(input.to, "to");
		return await callRPCProcedure(
			"goals",
			"getAnalytics",
			{
				goalId: input.goalId,
				websiteId: ctx.websiteId,
				startDate: input.from,
				endDate: input.to,
			},
			buildRpcContext(ctx)
		);
	}
);

const createGoalTool = defineMcpTool(
	{
		name: "create_goal",
		description:
			"Create a conversion goal. Call with confirmed=false for preview, then confirmed=true after explicit user approval.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			type: z.enum(["PAGE_VIEW", "EVENT", "CUSTOM"]),
			target: z.string().min(1),
			name: z.string().min(1).max(100),
			description: z.string().nullable().optional(),
			filters: z.array(WorkflowFilterSchema).optional(),
			ignoreHistoricData: z.boolean().optional(),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		resolveWebsite: true,
		metadata: writeMetadata(["manage:websites"]),
		ratelimit: { limit: 10, windowSec: 60 },
	},
	async (input, ctx) => {
		const websiteId = getResolvedWebsiteId(ctx);
		if (!input.confirmed) {
			return {
				preview: true,
				message: "Review this goal before creating it.",
				confirmationRequired: true,
				goal: {
					name: input.name,
					description: input.description ?? null,
					type: input.type,
					target: input.target,
					filters: input.filters ?? [],
					ignoreHistoricData: input.ignoreHistoricData ?? false,
				},
			};
		}

		const result = await callRPCProcedure(
			"goals",
			"create",
			{
				websiteId,
				type: input.type,
				target: input.target,
				name: input.name,
				description: input.description,
				filters: input.filters,
				ignoreHistoricData: input.ignoreHistoricData ?? false,
			},
			buildRpcContext(ctx)
		);
		return {
			success: true,
			message: `Goal "${input.name}" created successfully.`,
			goal: result,
		};
	}
);

const listLinkFoldersTool = defineMcpTool(
	{
		name: "list_link_folders",
		description:
			"List existing short-link folders for the website organization, including link counts. Use this before assigning a link to a folder.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
		}),
		outputSchema: z.object({
			folders: z.array(LinkFolderWithUsageSchema),
			count: z.number(),
			unfiledCount: z.number(),
			hint: z.string(),
		}),
		resolveWebsite: true,
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (_input, ctx) => {
		const orgId = await getOrganizationId(getResolvedWebsiteId(ctx));
		if (orgId instanceof Error) {
			throw new McpToolError("not_found", orgId.message);
		}

		const rpcContext = buildRpcContext(ctx);
		const [folders, links] = await Promise.all([
			listLinkFolders(rpcContext, orgId),
			listLinks(rpcContext, orgId),
		]);

		return {
			folders: summarizeLinkFoldersWithUsage(folders, links),
			count: folders.length,
			unfiledCount: links.filter((link) => !link.folderId).length,
			hint:
				folders.length === 0
					? "No link folders exist yet. Leave links unfiled unless the user creates a folder in Databuddy."
					: "Use folderId or folderSlug from this list. Do not invent new folders from the agent.",
		};
	}
);

const listLinksTool = defineMcpTool(
	{
		name: "list_links",
		description:
			"List short links and existing folders for the website's organization. Use to enumerate all links before referencing one or choosing where a new link should go.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
		}),
		outputSchema: z.object({
			links: z.array(LinkRowOutputSchema),
			count: z.number(),
			folders: z.array(LinkFolderWithUsageSchema),
			unfiledCount: z.number(),
			hint: z.string().optional(),
		}),
		resolveWebsite: true,
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (_input, ctx) => {
		const orgId = await getOrganizationId(getResolvedWebsiteId(ctx));
		if (orgId instanceof Error) {
			throw new McpToolError("not_found", orgId.message);
		}
		const rpcContext = buildRpcContext(ctx);
		const [links, folders] = await Promise.all([
			listLinks(rpcContext, orgId),
			listLinkFolders(rpcContext, orgId),
		]);
		if (links.length === 0) {
			return {
				links,
				count: 0,
				folders: summarizeLinkFoldersWithUsage(folders, links),
				unfiledCount: 0,
				hint: "No links yet for this organization.",
			};
		}
		return {
			links: links.map((link) => summarizeLink(link, folders)),
			count: links.length,
			folders: summarizeLinkFoldersWithUsage(folders, links),
			unfiledCount: links.filter((link) => !link.folderId).length,
		};
	}
);

const searchLinksTool = defineMcpTool(
	{
		name: "search_links",
		description:
			"Find short links matching a substring on name, slug, target URL, or external ID. Use when you know part of a link identifier.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
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
					folderId: z.string().nullable(),
					folder: LinkRowOutputSchema.shape.folder,
					externalId: z.string().nullable(),
				})
			),
			count: z.number(),
		}),
		resolveWebsite: true,
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		const orgId = await getOrganizationId(getResolvedWebsiteId(ctx));
		if (orgId instanceof Error) {
			throw new McpToolError("not_found", orgId.message);
		}
		const rpcContext = buildRpcContext(ctx);
		const [allLinks, folders] = await Promise.all([
			listLinks(rpcContext, orgId),
			listLinkFolders(rpcContext, orgId),
		]);
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
				folderId: link.folderId ?? null,
				folder: summarizeLink(link, folders).folder,
				externalId: link.externalId,
			})),
			count: matches.length,
		};
	}
);

const createLinkTool = defineMcpTool(
	{
		name: "create_link",
		description:
			"Create a short link for the website organization. Call with confirmed=false for preview first.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			name: z.string().min(1).max(255),
			targetUrl: z.string().url(),
			slug: z
				.string()
				.min(3)
				.max(50)
				.regex(/^[a-zA-Z0-9_-]+$/)
				.optional(),
			expiresAt: z.string().optional(),
			expiredRedirectUrl: z.string().url().optional(),
			ogTitle: z.string().max(200).optional(),
			ogDescription: z.string().max(500).optional(),
			ogImageUrl: z.string().url().optional(),
			externalId: z.string().max(255).optional(),
			...LinkFolderSelectorSchema.shape,
			deepLinkApp: z.string().optional(),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		resolveWebsite: true,
		metadata: writeMetadata(["write:links"]),
		ratelimit: { limit: 20, windowSec: 60 },
	},
	async (input, ctx) => {
		assertValidDate(input.expiresAt, "expiresAt");
		const orgId = await getOrganizationId(getResolvedWebsiteId(ctx));
		if (orgId instanceof Error) {
			throw new McpToolError("not_found", orgId.message);
		}

		const rpcContext = buildRpcContext(ctx);
		const folderSelection = await resolveLinkFolder(rpcContext, orgId, {
			folderId: input.folderId,
			folderSlug: input.folderSlug,
		});
		if (!folderSelection.ok) {
			throw new McpToolError("invalid_input", folderSelection.message);
		}

		if (!input.confirmed) {
			return {
				preview: true,
				message: "Review this short link before creating it.",
				confirmationRequired: true,
				link: {
					name: input.name,
					targetUrl: input.targetUrl,
					slug: input.slug ?? "(auto-generated)",
					expiresAt: input.expiresAt ?? null,
					ogTitle: input.ogTitle ?? null,
					ogDescription: input.ogDescription ?? null,
					externalId: input.externalId ?? null,
					folder: folderSelection.folder
						? summarizeLinkFolder(folderSelection.folder)
						: "Unfiled",
				},
				availableFolders: folderSelection.folders.map(summarizeLinkFolder),
			};
		}

		const result = parseLinkRow(
			await callRPCProcedure(
				"links",
				"create",
				{
					organizationId: orgId,
					name: input.name,
					targetUrl: input.targetUrl,
					slug: input.slug,
					folderId: folderSelection.folderId ?? null,
					expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
					expiredRedirectUrl: input.expiredRedirectUrl ?? null,
					ogTitle: input.ogTitle ?? null,
					ogDescription: input.ogDescription ?? null,
					ogImageUrl: input.ogImageUrl ?? null,
					externalId: input.externalId ?? null,
					deepLinkApp: input.deepLinkApp ?? null,
				},
				rpcContext
			)
		);
		return {
			success: true,
			message: `Link "${input.name}" created successfully.`,
			link: summarizeLink(result, folderSelection.folders),
		};
	}
);

const listAnnotationsTool = defineMcpTool(
	{
		name: "list_annotations",
		description:
			"List chart annotations for a website over a date range. Defaults to the last 30 days.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			from: z.string().optional(),
			to: z.string().optional(),
			granularity: z.enum(["hourly", "daily", "weekly", "monthly"]).optional(),
			metrics: z.array(z.string()).optional(),
			chartContext: ChartContextSchema.optional(),
		}),
		outputSchema: z.object({
			annotations: z.array(z.record(z.string(), z.unknown())),
			count: z.number(),
		}),
		resolveWebsite: true,
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		assertValidDate(input.from, "from");
		assertValidDate(input.to, "to");
		const result = await callRPCProcedure(
			"annotations",
			"list",
			{
				websiteId: ctx.websiteId,
				chartType: "metrics",
				chartContext: input.chartContext ?? createChartContext(input),
			},
			buildRpcContext(ctx)
		);
		const annotations = Array.isArray(result) ? result : [];
		return { annotations, count: annotations.length };
	}
);

const createAnnotationTool = defineMcpTool(
	{
		name: "create_annotation",
		description:
			"Create a chart annotation. Call with confirmed=false for preview before writing.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			chartContext: ChartContextSchema.optional(),
			annotationType: z.enum(["point", "line", "range"]),
			xValue: z.string(),
			xEndValue: z.string().optional(),
			yValue: z.number().optional(),
			text: z.string().min(1).max(500),
			tags: z.array(z.string()).optional(),
			color: z.string().optional(),
			isPublic: z.boolean().optional(),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		resolveWebsite: true,
		metadata: writeMetadata(["manage:websites"]),
		ratelimit: { limit: 20, windowSec: 60 },
	},
	async (input, ctx) => {
		assertValidDate(input.xValue, "xValue");
		assertValidDate(input.xEndValue, "xEndValue");
		if (input.annotationType === "range" && !input.xEndValue) {
			throw new McpToolError(
				"invalid_input",
				"Range annotations require xEndValue."
			);
		}

		const chartContext =
			input.chartContext ??
			createChartContext({
				from: dayjs(input.xValue).format("YYYY-MM-DD"),
				to: dayjs(input.xEndValue ?? input.xValue).format("YYYY-MM-DD"),
				granularity: "daily",
			});

		if (!input.confirmed) {
			return {
				preview: true,
				message: "Review this annotation before creating it.",
				confirmationRequired: true,
				annotation: {
					type: input.annotationType,
					text: input.text,
					xValue: input.xValue,
					xEndValue: input.xEndValue ?? null,
					tags: input.tags ?? [],
					color: input.color ?? "#3B82F6",
					isPublic: input.isPublic ?? false,
				},
			};
		}

		const result = await callRPCProcedure(
			"annotations",
			"create",
			{
				websiteId: ctx.websiteId,
				chartType: "metrics",
				chartContext,
				annotationType: input.annotationType,
				xValue: input.xValue,
				xEndValue: input.xEndValue,
				yValue: input.yValue,
				text: input.text,
				tags: input.tags,
				color: input.color,
				isPublic: input.isPublic ?? false,
			},
			buildRpcContext(ctx)
		);
		return {
			success: true,
			message: "Annotation created successfully.",
			annotation: result,
		};
	}
);

const listFlagsTool = defineMcpTool(
	{
		name: "list_flags",
		description:
			"List feature flags for a website. Use before updating flag rollout, rules, or status.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			status: FlagStatusSchema.optional(),
		}),
		outputSchema: z.object({
			flags: z.array(z.record(z.string(), z.unknown())),
			count: z.number(),
		}),
		resolveWebsite: true,
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		const result = await callRPCProcedure(
			"flags",
			"list",
			{ websiteId: ctx.websiteId, status: input.status },
			buildRpcContext(ctx)
		);
		const flags = Array.isArray(result) ? result : [];
		return { flags, count: flags.length };
	}
);

const createFlagTool = defineMcpTool(
	{
		name: "create_flag",
		description:
			"Create a feature flag. Defaults to inactive boolean flag until explicitly configured.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			key: z
				.string()
				.min(1)
				.max(100)
				.regex(/^[a-zA-Z0-9_-]+$/),
			name: z.string().min(1).max(100).optional(),
			description: z.string().optional(),
			type: FlagTypeSchema.optional(),
			status: FlagStatusSchema.optional(),
			defaultValue: z.boolean().optional(),
			payload: z.record(z.string(), z.unknown()).optional(),
			persistAcrossAuth: z.boolean().optional(),
			rolloutPercentage: z.number().min(0).max(100).optional(),
			rolloutBy: z.string().optional(),
			rules: z.array(FlagRuleSchema).optional(),
			variants: z.array(FlagVariantSchema).optional(),
			dependencies: z.array(z.string()).optional(),
			environment: z.string().nullable().optional(),
			targetGroupIds: z.array(z.string()).optional(),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		resolveWebsite: true,
		metadata: writeMetadata(["manage:flags", "manage:websites"]),
		ratelimit: { limit: 20, windowSec: 60 },
	},
	async (input, ctx) => {
		const payload = {
			websiteId: ctx.websiteId,
			key: input.key,
			name: input.name,
			description: input.description,
			type: input.type ?? "boolean",
			status: input.status ?? "inactive",
			defaultValue: input.defaultValue ?? false,
			payload: input.payload,
			persistAcrossAuth: input.persistAcrossAuth,
			rolloutPercentage: input.rolloutPercentage ?? 0,
			rolloutBy: input.rolloutBy,
			rules: input.rules,
			variants: input.variants,
			dependencies: input.dependencies,
			environment: input.environment,
			targetGroupIds: input.targetGroupIds,
		};

		if (!input.confirmed) {
			return {
				preview: true,
				message: "Review this feature flag before creating it.",
				confirmationRequired: true,
				flag: {
					key: payload.key,
					name: payload.name ?? payload.key,
					type: payload.type,
					status: payload.status,
					defaultValue: payload.defaultValue,
					rolloutPercentage: payload.rolloutPercentage,
					ruleCount: payload.rules?.length ?? 0,
					variantCount: payload.variants?.length ?? 0,
				},
			};
		}

		const result = await callRPCProcedure(
			"flags",
			"create",
			payload,
			buildRpcContext(ctx)
		);
		return {
			success: true,
			message: `Feature flag "${input.key}" created successfully.`,
			flag: result,
		};
	}
);

const updateFlagTool = defineMcpTool(
	{
		name: "update_flag",
		description:
			"Update feature flag config, status, rollout, rules, or variants after explicit confirmation.",
		inputSchema: z.object({
			id: z.string(),
			name: z.string().min(1).max(100).optional(),
			description: z.string().optional(),
			type: FlagTypeSchema.optional(),
			status: FlagStatusSchema.optional(),
			defaultValue: z.boolean().optional(),
			payload: z.record(z.string(), z.unknown()).optional(),
			rules: z.array(FlagRuleSchema).optional(),
			persistAcrossAuth: z.boolean().optional(),
			rolloutPercentage: z.number().min(0).max(100).optional(),
			rolloutBy: z.string().optional(),
			variants: z.array(FlagVariantSchema).optional(),
			dependencies: z.array(z.string()).optional(),
			environment: z.string().optional(),
			targetGroupIds: z.array(z.string()).optional(),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		metadata: writeMetadata(["manage:flags", "manage:websites"]),
		ratelimit: { limit: 20, windowSec: 60 },
	},
	async (input, ctx) => {
		const { confirmed, id, ...updates } = input;
		const cleanUpdates = Object.fromEntries(
			Object.entries(updates).filter(([, value]) => value !== undefined)
		);
		if (!confirmed) {
			return {
				preview: true,
				message: "Review this feature flag update before applying it.",
				confirmationRequired: true,
				flagId: id,
				updates: cleanUpdates,
			};
		}

		const result = await callRPCProcedure(
			"flags",
			"update",
			{ id, ...cleanUpdates },
			buildRpcContext(ctx)
		);
		return {
			success: true,
			message: "Feature flag updated successfully.",
			flag: result,
		};
	}
);

const addUsersToFlagTool = defineMcpTool(
	{
		name: "add_users_to_flag",
		description:
			"Add user IDs or emails to a feature flag targeting rule. Appends by default, replaces when mode=replace.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			flagId: z.string(),
			users: z.array(z.string().min(1)).min(1).max(500),
			matchBy: z.enum(["email", "user_id"]).optional().default("email"),
			mode: z.enum(["append", "replace"]).optional().default("append"),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		resolveWebsite: true,
		metadata: writeMetadata(["manage:flags", "manage:websites"]),
		ratelimit: { limit: 20, windowSec: 60 },
	},
	async (input, ctx) => {
		const uniqueUsers = [
			...new Set(input.users.map((user) => user.trim())),
		].filter(Boolean);
		const currentFlag = asRecord(
			await callRPCProcedure(
				"flags",
				"getById",
				{ id: input.flagId, websiteId: ctx.websiteId },
				buildRpcContext(ctx)
			)
		);
		const currentRules =
			z.array(FlagRuleSchema).safeParse(currentFlag.rules).data ?? [];
		const nextRule = createFlagUserRule(input.matchBy, uniqueUsers);
		const nextRules =
			input.mode === "replace" ? [nextRule] : [...currentRules, nextRule];

		if (!input.confirmed) {
			return {
				preview: true,
				message:
					"Review this feature flag targeting change before applying it.",
				confirmationRequired: true,
				flag: {
					id: currentFlag.id,
					key: currentFlag.key,
					name: currentFlag.name,
					status: currentFlag.status,
				},
				targeting: {
					matchBy: input.matchBy,
					mode: input.mode,
					userCount: uniqueUsers.length,
					ruleCountBefore: currentRules.length,
					ruleCountAfter: nextRules.length,
				},
			};
		}

		const result = await callRPCProcedure(
			"flags",
			"update",
			{ id: input.flagId, rules: nextRules },
			buildRpcContext(ctx)
		);
		return {
			success: true,
			message: `Added ${uniqueUsers.length} user target${uniqueUsers.length === 1 ? "" : "s"} to the flag.`,
			flag: result,
		};
	}
);

const DigestFrequencySchema = z.enum(["hourly", "daily", "weekly"]);

const manageInsightDigestTool = defineMcpTool(
	{
		name: "manage_insight_digest",
		description:
			"Route, stop, or inspect Slack delivery of analytics insight digests. action=route sends digests to a channel, unroute stops it, status shows current routing.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			action: z
				.enum(["route", "unroute", "status"])
				.describe("route to a channel, unroute to stop, or status to inspect"),
			channelId: z
				.string()
				.min(1)
				.max(120)
				.optional()
				.describe("Slack channel ID. Required for route and unroute."),
			frequency: DigestFrequencySchema.optional().describe(
				"How often investigations run for this scope. Applied on route."
			),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		resolveWebsite: "optional",
		metadata: writeMetadata(["manage:websites"]),
		ratelimit: { limit: 20, windowSec: 60 },
	},
	async (input, ctx) => {
		const websiteId = ctx.websiteId;
		const orgIds = await resolveOrganizationIds(websiteId, ctx);
		if (orgIds instanceof Error) {
			throw new McpToolError("not_found", orgIds.message);
		}
		const organizationId = orgIds[0];
		const rpcContext = buildRpcContext(ctx);
		const scopeInput = { organizationId, websiteId: websiteId ?? undefined };

		if (input.action === "status") {
			const config = await callRPCProcedure(
				"insightGeneration",
				"getConfig",
				scopeInput,
				rpcContext
			);
			const summary = summarizeDigestConfig(config);
			return {
				success: true,
				message:
					summary.channels.length > 0
						? `Digest goes to ${summary.channels.length} Slack channel${summary.channels.length === 1 ? "" : "s"} on a ${summary.frequency} cadence.`
						: "No Slack digest delivery is configured for this scope.",
				digest: summary,
			};
		}

		if (!input.channelId) {
			throw new McpToolError(
				"invalid_input",
				"channelId is required to route or unroute a digest."
			);
		}

		if (!input.confirmed) {
			return {
				preview: true,
				confirmationRequired: true,
				message:
					input.action === "route"
						? `Route insight digests to this Slack channel${input.frequency ? ` on a ${input.frequency} cadence` : ""}?`
						: "Stop routing insight digests to this Slack channel?",
				digest: {
					action: input.action,
					channelId: input.channelId,
					frequency: input.frequency ?? null,
					scope: websiteId ? "website" : "organization",
				},
			};
		}

		if (input.action === "unroute") {
			const config = await callRPCProcedure(
				"insightGeneration",
				"removeSlackDelivery",
				{ ...scopeInput, channelId: input.channelId },
				rpcContext
			);
			return {
				success: true,
				message: "Stopped routing insight digests to this Slack channel.",
				digest: summarizeDigestConfig(config),
			};
		}

		const config = await callRPCProcedure(
			"insightGeneration",
			"addSlackDelivery",
			{
				...scopeInput,
				channelId: input.channelId,
				frequency: input.frequency,
			},
			rpcContext
		);
		const summary = summarizeDigestConfig(config);
		return {
			success: true,
			message: `Insight digests will be delivered to this Slack channel on a ${summary.frequency} cadence.`,
			digest: summary,
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

const TOOL_REGISTRY = createToolRegistry([
	...(isAiGatewayConfigured ? [askTool, investigateTool] : []),
	listWebsitesTool,
	getDataTool,
	getSchemaTool,
	capabilitiesTool,
	listFunnelsTool,
	getFunnelAnalyticsTool,
	createFunnelTool,
	listGoalsTool,
	getGoalAnalyticsTool,
	createGoalTool,
	listLinkFoldersTool,
	listLinksTool,
	searchLinksTool,
	createLinkTool,
	listAnnotationsTool,
	createAnnotationTool,
	listFlagsTool,
	createFlagTool,
	updateFlagTool,
	addUsersToFlagTool,
	manageInsightDigestTool,
	...INSIGHT_TOOL_FACTORIES,
	...(MEMORY_ENABLED
		? [searchMemoryTool, saveMemoryTool, forgetMemoryTool]
		: []),
] satisfies McpToolFactory[]);

function getRegisteredToolNames(): readonly string[] {
	return TOOL_REGISTRY.names;
}

function getToolCatalog() {
	return TOOL_REGISTRY.catalog;
}

export function createMcpTools(ctx: McpRequestContext): RegisteredMcpTool[] {
	return TOOL_REGISTRY.factories.map((factory) => factory.build(ctx));
}
