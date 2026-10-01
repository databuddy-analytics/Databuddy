import { ORPCError } from "@orpc/server";
import dayjs from "dayjs";
import { z } from "zod";
import { funnelStepSchema } from "@databuddy/rpc/funnel-steps";
import {
	historyInsightSchema,
	insightBriefItemSchema,
	insightTimelineItemSchema,
	insightTimelineReplySchema,
} from "@databuddy/shared/insights";
import {
	DEEP_LINK_APP_IDS,
	isDeepLinkTarget,
} from "@databuddy/shared/constants/deep-link-apps";
import {
	annotationChartContextSchema,
	annotationCoordinateSchema,
	httpUrlSchema,
} from "@databuddy/validation";
import {
	flagFormShape,
	userRuleSchema,
	variantSchema,
} from "@databuddy/shared/flags";
import type { DatePreset } from "../../lib/date-presets";
import { executeBatch } from "../../query";
import type { AppContext } from "../config/context";
import {
	createUserTargetRule,
	type FlagTargetRule,
	flagRolloutBySchema,
} from "../tools/flag-rules";
import { goalFunnelFilterSchema, goalTypeSchema } from "../tools/goals";
import { runInvestigationAction } from "../tools/investigations";
import { callRPCProcedure, omitUndefined } from "../tools/utils";
import {
	countUnfiledLinks,
	LinkFolderSelectorSchema,
	LinkFolderWithUsageSchema,
	LinkRowOutputSchema,
	listLinkFolders,
	listLinks,
	parseLinkRow,
	resolveLinkFolder,
	searchLinks,
	summarizeLink,
	summarizeLinkFolder,
	summarizeLinkFoldersWithUsage,
} from "../tools/link-catalog";
import {
	defineMcpTool,
	metadataForResource,
	type McpHandlerContext,
	McpToolError,
	type McpRequestContext,
	type McpToolFactory,
	type RegisteredMcpTool,
} from "./define-tool";
import {
	buildBatchQueryRequests,
	FilterSchema,
	formatMcpQueryResults,
	getFilteredQueryTypes,
	getMcpSchemaDocumentation,
	getSchemaSummary,
	MCP_DATE_PRESETS,
	MCP_RESULT_ROW_LIMIT,
	QUERY_CATEGORY_KEYS,
	queryFailedMessage,
	SCHEMA_SECTIONS,
	type McpQueryItem,
} from "./mcp-utils";
import {
	buildRpcContext,
	getCachedAccessibleWebsites,
	resolveOrganizationId,
} from "./tool-context";
import { createMcpWorkspaceTools } from "./workspace-tools";
import {
	ANNOTATION_FIELDS,
	ConfirmedSchema,
	DynamicObjectSchema,
	FLAG_FIELDS,
	FLAG_WRITE_FIELDS,
	FUNNEL_FIELDS,
	GOAL_FIELDS,
	getResolvedOrganizationId,
	getResolvedWebsiteId,
	LinkExpiresAtSchema,
	LinkSlugSchema,
	McpDateRangeSchema,
	MutationResultSchema,
	PageSchema,
	paginate,
	pickFields,
	pickFlagFields,
	readConversionAnalytics,
	resolveMcpDateRange,
	summarizeConversionAnalytics,
	updatePreview,
	WebsiteSelectorSchema,
} from "./tool-contracts";

const TIME_UNIT = ["minute", "hour", "day", "week", "month"] as const;
const CREATE_WRITE = { destructive: false } as const;
const IDEMPOTENT_WRITE = { idempotent: true } as const;
const ANALYTICS_RATE_LIMIT = { limit: 20, windowSec: 60 } as const;

const QueryLimitSchema = z
	.number()
	.int()
	.min(1)
	.max(MCP_RESULT_ROW_LIMIT)
	.optional()
	.describe(
		`Rows to return, 1-${MCP_RESULT_ROW_LIMIT}. Defaults to the query type's own limit; at most ${MCP_RESULT_ROW_LIMIT} rows are returned.`
	);

const DatePresetSchema = z.enum(
	MCP_DATE_PRESETS as [DatePreset, ...DatePreset[]]
);
const QueryItemSchema = z.object({
	type: z.string(),
	preset: DatePresetSchema.optional(),
	from: z.string().optional(),
	to: z.string().optional(),
	timeUnit: z.enum(TIME_UNIT).optional(),
	limit: QueryLimitSchema,
	filters: z.array(FilterSchema).optional(),
	orderBy: z.string().optional(),
});

const FunnelStepInputSchema = z.strictObject(
	funnelStepSchema.omit({ conditions: true }).shape
);

const WebsiteSummarySchema = z.object({
	id: z.string(),
	name: z.string().nullable(),
	domain: z.string().nullable(),
	isPublic: z.boolean().nullable(),
	organizationId: z.string(),
	organizationName: z.string(),
});

const FlagRuleSchema = userRuleSchema.extend({
	valuesTruncated: z
		.never({
			error:
				"list_flags cuts long target lists. Copy rules from the update_flag preview (confirmed=false), which returns every target.",
		})
		.optional(),
});
const FlagVariantSchema = variantSchema;

const FlagStatusSchema = flagFormShape.status;
const FlagTypeSchema = flagFormShape.type;

function createChartContext(input: {
	from?: string;
	to?: string;
}): z.infer<typeof annotationChartContextSchema> {
	return {
		dateRange: {
			start_date:
				input.from ?? dayjs().subtract(30, "day").format("YYYY-MM-DD"),
			end_date: input.to ?? dayjs().format("YYYY-MM-DD"),
			granularity: "daily",
		},
	};
}

function queryFailure(result: { error?: string; type: string }): McpToolError {
	return new McpToolError(
		result.error === queryFailedMessage(result.type)
			? "query_failed"
			: "invalid_input",
		result.error ?? `The ${result.type} query failed.`
	);
}

const listWebsitesTool = defineMcpTool(
	{
		name: "list_websites",
		description:
			"List the websites this account can access, with IDs, names, domains, and organizations. Website-scoped tools accept websiteId, websiteName, or websiteDomain.",
		inputSchema: z.object({ ...PageSchema }),
		outputSchema: z.object({
			websites: z.array(WebsiteSummarySchema),
			total: z.number(),
			hasMore: z.boolean(),
		}),
		metadata: metadataForResource("organization", ["read"]),
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		const page = paginate(await getCachedAccessibleWebsites(ctx), input);

		return { websites: page.items, total: page.total, hasMore: page.hasMore };
	}
);

const listInsightsTool = defineMcpTool(
	{
		name: "list_insights",
		description:
			"List published insights for an organization or website: title, summary, evidence, impact, and the recorded next step (null when no step was recorded, when a later finding for the same case superseded it, or when the case resolved).",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			...PageSchema,
		}),
		outputSchema: z.object({
			hasMore: z.boolean(),
			insights: z.array(insightBriefItemSchema),
		}),
		metadata: metadataForResource("website", ["read"]),
		resolveWebsite: "optional",
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		const organizationId =
			ctx.websiteOrganizationId ?? resolveOrganizationId(ctx);
		if (organizationId instanceof Error) {
			throw organizationId;
		}
		const result = await runInvestigationAction(
			{
				action: "brief",
				limit: input.limit,
				offset: input.offset,
				...(ctx.websiteId ? { websiteId: ctx.websiteId } : {}),
			},
			{
				...buildRpcContext(ctx),
				organizationId,
			}
		);
		if (result.action !== "brief") {
			throw new McpToolError("internal", "Unexpected insight action");
		}
		return { hasMore: result.hasMore, insights: result.insights };
	}
);

const listInvestigationsTool = defineMcpTool(
	{
		name: "list_investigations",
		description:
			"List the latest investigation per subject, with status and IDs. Cases with a dashboard analysis or verification queued or running are left out until it finishes, and an older case may appear instead; get_investigation reads one by ID.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			...PageSchema,
		}),
		outputSchema: z.object({
			hasMore: z.boolean(),
			investigations: z.array(historyInsightSchema),
		}),
		metadata: metadataForResource("website", ["read"]),
		resolveWebsite: "optional",
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		const organizationId =
			ctx.websiteOrganizationId ?? resolveOrganizationId(ctx);
		if (organizationId instanceof Error) {
			throw organizationId;
		}
		const result = await runInvestigationAction(
			{
				action: "list",
				limit: input.limit,
				offset: input.offset,
				...(ctx.websiteId ? { websiteId: ctx.websiteId } : {}),
			},
			{
				...buildRpcContext(ctx),
				organizationId,
			}
		);
		if (result.action !== "list") {
			throw new McpToolError("internal", "Unexpected investigation action");
		}
		return { hasMore: result.hasMore, investigations: result.investigations };
	}
);

const getInvestigationTool = defineMcpTool(
	{
		name: "get_investigation",
		description:
			"Get one durable investigation, including its current status, evidence-backed observations, and human replies. The ID may come from Slack or list_investigations.",
		inputSchema: z.object({
			investigationId: z.string().min(1).max(256),
		}),
		outputSchema: z.object({
			canReply: z.boolean(),
			investigation: historyInsightSchema,
			timeline: z.array(insightTimelineItemSchema),
		}),
		metadata: metadataForResource("website", ["read"]),
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		const result = await runInvestigationAction(
			{ action: "get", investigationId: input.investigationId },
			buildRpcContext(ctx)
		);
		if (result.action !== "get") {
			throw new McpToolError("internal", "Unexpected investigation action");
		}
		if (!result.investigation) {
			throw new McpToolError(
				"not_found",
				"No investigation with this ID is accessible to this connection.",
				{
					hint: "Use an id from list_investigations or an investigationId from list_insights.",
				}
			);
		}
		return {
			canReply: result.canReply,
			investigation: result.investigation,
			timeline: result.timeline,
		};
	}
);

const replyToInvestigationTool = defineMcpTool(
	{
		name: "reply_to_investigation",
		description:
			"Add a clarification to an existing investigation. It is answered from the case's saved evidence, without new measurements or actions. The answer appears in get_investigation. It cannot start a new investigation.",
		inputSchema: z.object({
			investigationId: z.string().min(1).max(256),
			body: z.string().trim().min(1).max(2000),
			replyId: z
				.string()
				.trim()
				.min(1)
				.max(200)
				.refine((value) => !value.includes(":"), {
					message: "Reply ids cannot contain colons",
				})
				.describe(
					"Unique stable idempotency key. Reuse it if this tool call is retried."
				),
		}),
		outputSchema: z.object({ reply: insightTimelineReplySchema }),
		metadata: metadataForResource("website", ["update"]),
		annotations: { destructive: false, idempotent: true },
		ratelimit: { limit: 20, windowSec: 60 },
	},
	async (input, ctx) => {
		const result = await runInvestigationAction(
			{
				action: "reply",
				body: input.body,
				investigationId: input.investigationId,
				replyId: input.replyId,
			},
			buildRpcContext(ctx)
		);
		if (result.action !== "reply") {
			throw new McpToolError("internal", "Unexpected investigation action");
		}
		return { reply: result.reply };
	}
);

const getDataTool = defineMcpTool(
	{
		name: "get_data",
		title: "Query analytics",
		description:
			"Query Databuddy's analytics API (www.databuddy.cc/docs/api) for a website: one query or a batch of 2-10. Query types come from capabilities. Default range last_30d. Returns at most 20 rows per query.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			type: z
				.string()
				.optional()
				.describe(
					"Query type for single-query mode. Use capabilities to see all types."
				),
			preset: DatePresetSchema.optional().describe(
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
			limit: QueryLimitSchema,
			filters: z
				.array(FilterSchema)
				.optional()
				.describe(
					"Filters [{field, op, value}]. ops: eq, ne, contains, not_contains, starts_with, in, not_in. 'field' is a common dimension such as path, country, referrer, device_type, or utm_source, a query-specific field from capabilities detail='full', or trait:<key> (e.g. trait:plan) to segment by an identified-user trait. Rejected fields return the allowed list for this query."
				),
			orderBy: z
				.string()
				.optional()
				.describe(
					"Output metric to sort by, such as 'visitors' or 'pageviews DESC'. Rejected values return the allowed list."
				),
			queries: z
				.array(QueryItemSchema)
				.min(2)
				.max(10)
				.optional()
				.describe(
					"Batch mode: 2-10 query items, each with type and optionally its own preset or from/to. Items without a date range use the top-level preset or from/to, and items inherit the top-level timeUnit, limit, filters, and orderBy unless they set their own. Omit 'type' when using this."
				),
			timezone: z
				.string()
				.optional()
				.describe(
					"IANA timezone for date presets and date or hour buckets. Defaults to UTC. Row timestamps such as time, first_visit, or last_visit are returned in UTC."
				),
		}),
		outputSchema: z.object({
			definition: z.string().optional(),
			data: z.array(z.record(z.string(), z.unknown())).optional(),
			returnedRows: z.number().optional(),
			rowCount: z.number().optional(),
			summary: z.string().optional(),
			truncated: z.boolean().optional(),
			type: z.string().optional(),
			batch: z.boolean().optional(),
			results: z
				.array(
					z.object({
						type: z.string(),
						definition: z.string().optional(),
						data: z.array(z.record(z.string(), z.unknown())),
						returnedRows: z.number(),
						rowCount: z.number(),
						summary: z.string(),
						truncated: z.boolean(),
						error: z.string().optional(),
					})
				)
				.optional(),
		}),
		metadata: { access: { kind: "read" } },
		resolveWebsite: true,
		ratelimit: { limit: 30, windowSec: 60 },
	},
	async (input, ctx) => {
		const websiteId = getResolvedWebsiteId(ctx);
		const timezone = input.timezone ?? "UTC";

		const queries: z.infer<typeof QueryItemSchema>[] =
			input.queries ?? (input.type ? [{ type: input.type }] : []);

		if (queries.length === 0) {
			throw new McpToolError(
				"invalid_input",
				"Either 'type' (single query) or 'queries' array (batch, 2-10 items) is required.",
				{
					hint: "Single: {type:'top_pages',preset:'last_7d'}. Batch: {queries:[{type:'summary_metrics',preset:'last_7d'},{type:'top_pages',preset:'last_7d'}]}",
				}
			);
		}

		const items: McpQueryItem[] = queries.map((query) => ({
			...query,
			...(query.preset || query.from || query.to
				? {}
				: { preset: input.preset, from: input.from, to: input.to }),
			timeUnit: query.timeUnit ?? input.timeUnit,
			limit: query.limit ?? input.limit,
			filters: query.filters ?? input.filters,
			orderBy: query.orderBy ?? input.orderBy,
		}));
		const plan = buildBatchQueryRequests(items, websiteId, timezone);
		const results = await executeBatch(plan.requests, {
			websiteDomain: ctx.websiteDomain ?? "unknown",
			timezone,
			abortSignal: ctx.abortSignal,
		});
		const formatted = formatMcpQueryResults(plan, results);
		if (formatted.every((result) => result.error)) {
			const failures = formatted.map(queryFailure);
			const [firstFailure] = failures;
			if (firstFailure && failures.length === 1) {
				throw firstFailure;
			}
			throw new McpToolError(
				failures.some((failure) => failure.code === "query_failed")
					? "query_failed"
					: "invalid_input",
				`All ${failures.length} queries failed. ${formatted
					.map(
						(result, index) =>
							`Query ${index + 1} (${result.type}): ${failures[index]?.message}`
					)
					.join(" ")}`
			);
		}

		if (items.length > 1) {
			return { batch: true, results: formatted };
		}

		const first = formatted[0];
		if (!first) {
			throw new McpToolError("internal", "No results returned");
		}
		return first;
	}
);

const getSchemaTool = defineMcpTool(
	{
		name: "get_schema",
		title: "List analytics columns",
		description:
			"Return the analytics tables with column names and types as a reference. get_data filters take common dimensions such as path or country plus query-specific fields from capabilities detail='full'; rejected fields return the allowed list.",
		inputSchema: z.object({
			sections: z
				.array(z.enum(SCHEMA_SECTIONS))
				.optional()
				.describe(
					`Only return these schema sections. Default = all. Options: ${SCHEMA_SECTIONS.join(", ")}`
				),
		}),
		outputSchema: z.object({
			schema: z.string(),
			sections: z.array(z.string()),
			bytes: z.number(),
		}),
		metadata: metadataForResource("organization", ["read"]),
		ratelimit: { limit: 60, windowSec: 60 },
	},
	(input) => {
		const schema = getMcpSchemaDocumentation(input.sections);
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
	"categories",
	"queryTypes",
] as const;
type CapabilitySection = (typeof CAPABILITY_SECTIONS)[number];
const CAPABILITY_DEFAULTS: readonly CapabilitySection[] = [
	"hints",
	"datePresets",
	"schemaSummary",
	"categories",
];

const HINTS: readonly string[] = [
	"The databuddy://guide resource documents query conventions and what insight and investigation fields mean.",
	"capabilities is filterable: include=['queryTypes'] returns the full catalog, category='Errors' or contains='vital' narrows it, detail='full' adds query-specific allowedFilters.",
	"get_schema is sectionable: sections=['events'] returns the smallest useful payload.",
	`get_data returns at most ${MCP_RESULT_ROW_LIMIT} rows per query; limit can lower that.`,
];

const capabilitiesTool = defineMcpTool(
	{
		name: "capabilities",
		title: "List query types",
		description:
			"Return get_data query types, date presets, categories, and a schema summary. 'include' selects sections; queryTypes are omitted unless requested or filtered by category or contains.",
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
					"'summary' returns descriptions only; 'full' adds each type's query-specific allowedFilters, on top of common dimensions such as path and country, also when filtering by category or contains."
				),
		}),
		outputSchema: z.object({
			schemaSummary: z.string().optional(),
			datePresets: z.array(z.string()).optional(),
			dateFormat: z.string().optional(),
			maxLimit: z.number().optional(),
			categories: z.array(z.string()).optional(),
			queryTypes: z.record(z.string(), z.unknown()).optional(),
			hints: z.array(z.string()).optional(),
		}),
		metadata: metadataForResource("organization", ["read"]),
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
			out.maxLimit = MCP_RESULT_ROW_LIMIT;
		}
		if (selected.has("schemaSummary")) {
			out.schemaSummary = getSchemaSummary();
		}
		if (selected.has("categories")) {
			out.categories = QUERY_CATEGORY_KEYS;
		}
		if (selected.has("queryTypes")) {
			out.queryTypes = getFilteredQueryTypes({
				category: input.category,
				contains: input.contains,
				detail: input.detail,
			});
		}
		return out;
	}
);

const listFunnelsTool = defineMcpTool(
	{
		name: "list_funnels",
		description:
			"List funnels for a website with their steps and filters. Funnel IDs are used by get_funnel_analytics.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			...PageSchema,
		}),
		outputSchema: z.object({
			funnels: z.array(z.record(z.string(), z.unknown())),
			total: z.number(),
			hasMore: z.boolean(),
			hint: z.string().optional(),
		}),
		metadata: { access: { kind: "read" } },
		resolveWebsite: true,
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		const result = await callRPCProcedure(
			"funnels",
			"list",
			{ websiteId: ctx.websiteId },
			buildRpcContext(ctx)
		);
		const page = paginate(Array.isArray(result) ? result : [], input);
		return {
			funnels: page.items.map((funnel) => pickFields(funnel, FUNNEL_FIELDS)),
			total: page.total,
			hasMore: page.hasMore,
			...(page.total === 0 && { hint: "This website has no funnels yet." }),
		};
	}
);

const getFunnelAnalyticsTool = defineMcpTool(
	{
		name: "get_funnel_analytics",
		description:
			"Return per-step conversion and drop-off for one funnel, by funnelId from list_funnels. range is the window measured. time_series holds at most the latest 90 points.",
		inputSchema: McpDateRangeSchema.safeExtend({
			...WebsiteSelectorSchema,
			funnelId: z.string().describe("Funnel ID from list_funnels"),
		}),
		outputSchema: DynamicObjectSchema,
		metadata: { access: { kind: "read" } },
		resolveWebsite: true,
		ratelimit: ANALYTICS_RATE_LIMIT,
	},
	async (input, ctx) => {
		const range = resolveMcpDateRange(input);
		return summarizeConversionAnalytics(
			await readConversionAnalytics(
				"get_funnel_analytics",
				["funnels", "getAnalytics"],
				{
					funnelId: input.funnelId,
					websiteId: ctx.websiteId,
					startDate: range.from,
					endDate: range.to,
				},
				ctx
			),
			range
		);
	}
);

const createFunnelTool = defineMcpTool(
	{
		name: "create_funnel",
		description:
			"Create a funnel for a website. confirmed=false (default) returns a preview without writing; confirmed=true creates it.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			name: z.string().min(1).max(100),
			description: z.string().optional(),
			steps: z.array(FunnelStepInputSchema).min(2).max(10),
			filters: z.array(goalFunnelFilterSchema).optional(),
			ignoreHistoricData: z.boolean().optional(),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		resolveWebsite: true,
		metadata: metadataForResource("website", ["update"]),
		annotations: CREATE_WRITE,
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
			funnel: pickFields(result, FUNNEL_FIELDS),
		};
	}
);

const listGoalsTool = defineMcpTool(
	{
		name: "list_goals",
		description:
			"List conversion goals for a website with their type, target, and filters. Goal IDs are used by get_goal_analytics.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			...PageSchema,
		}),
		outputSchema: z.object({
			goals: z.array(z.record(z.string(), z.unknown())),
			total: z.number(),
			hasMore: z.boolean(),
			hint: z.string().optional(),
		}),
		metadata: { access: { kind: "read" } },
		resolveWebsite: true,
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		const result = await callRPCProcedure(
			"goals",
			"list",
			{ websiteId: ctx.websiteId },
			buildRpcContext(ctx)
		);
		const page = paginate(Array.isArray(result) ? result : [], input);
		return {
			goals: page.items.map((goal) => pickFields(goal, GOAL_FIELDS)),
			total: page.total,
			hasMore: page.hasMore,
			...(page.total === 0 && { hint: "This website has no goals yet." }),
		};
	}
);

const getGoalAnalyticsTool = defineMcpTool(
	{
		name: "get_goal_analytics",
		description:
			"Return entered and completed counts and the conversion rate for one goal, by goalId from list_goals.",
		inputSchema: McpDateRangeSchema.safeExtend({
			...WebsiteSelectorSchema,
			goalId: z.string().describe("Goal ID from list_goals"),
		}),
		outputSchema: DynamicObjectSchema,
		metadata: { access: { kind: "read" } },
		resolveWebsite: true,
		ratelimit: ANALYTICS_RATE_LIMIT,
	},
	async (input, ctx) => {
		const range = resolveMcpDateRange(input);
		return summarizeConversionAnalytics(
			await readConversionAnalytics(
				"get_goal_analytics",
				["goals", "getAnalytics"],
				{
					goalId: input.goalId,
					websiteId: ctx.websiteId,
					startDate: range.from,
					endDate: range.to,
				},
				ctx
			),
			range
		);
	}
);

const createGoalTool = defineMcpTool(
	{
		name: "create_goal",
		description:
			"Create a conversion goal. confirmed=false (default) returns a preview without writing; confirmed=true creates it.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			type: goalTypeSchema,
			target: z.string().min(1),
			name: z.string().min(1).max(100),
			description: z.string().nullable().optional(),
			filters: z.array(goalFunnelFilterSchema).optional(),
			ignoreHistoricData: z.boolean().optional(),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		resolveWebsite: true,
		metadata: metadataForResource("website", ["update"]),
		annotations: CREATE_WRITE,
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
			goal: pickFields(result, GOAL_FIELDS),
		};
	}
);

const listLinkFoldersTool = defineMcpTool(
	{
		name: "list_link_folders",
		description:
			"List short-link folders for the website's organization, with link counts. Links can only be assigned to these existing folders.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			...PageSchema,
		}),
		outputSchema: z.object({
			folders: z.array(LinkFolderWithUsageSchema),
			total: z.number(),
			hasMore: z.boolean(),
			unfiledCount: z.number(),
			hint: z.string(),
		}),
		resolveWebsite: true,
		metadata: metadataForResource("link", ["read"]),
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		const orgId = getResolvedOrganizationId(ctx);
		const rpcContext = buildRpcContext(ctx);
		const [folders, unfiledCount] = await Promise.all([
			listLinkFolders(rpcContext, orgId),
			countUnfiledLinks(rpcContext, orgId),
		]);
		const page = paginate(summarizeLinkFoldersWithUsage(folders), input);

		return {
			folders: page.items,
			total: page.total,
			hasMore: page.hasMore,
			unfiledCount,
			hint:
				folders.length === 0
					? "This organization has no link folders. Folders are created in the Databuddy dashboard; links stay unfiled until then."
					: "create_link and update_link accept folderId or folderSlug from this list. They cannot create folders.",
		};
	}
);

const listLinksTool = defineMcpTool(
	{
		name: "list_links",
		description:
			"List short links for the website's organization, newest first, with existing folders. total covers the full catalog; search_links finds a specific link.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			...PageSchema,
		}),
		outputSchema: z.object({
			links: z.array(LinkRowOutputSchema),
			total: z.number(),
			hasMore: z.boolean(),
			folders: z.array(LinkFolderWithUsageSchema),
			unfiledCount: z.number(),
			hint: z.string().optional(),
		}),
		resolveWebsite: true,
		metadata: metadataForResource("link", ["read"]),
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		const orgId = getResolvedOrganizationId(ctx);
		const rpcContext = buildRpcContext(ctx);
		const [page, folders, unfiledCount] = await Promise.all([
			listLinks(rpcContext, orgId, {
				limit: input.limit,
				offset: input.offset,
			}),
			listLinkFolders(rpcContext, orgId),
			countUnfiledLinks(rpcContext, orgId),
		]);
		return {
			links: page.items.map((link) => summarizeLink(link, folders)),
			total: page.total,
			hasMore: page.hasMore,
			folders: summarizeLinkFoldersWithUsage(folders),
			unfiledCount,
			...(page.total === 0 && {
				hint: "No links yet for this organization.",
			}),
		};
	}
);

const searchLinksTool = defineMcpTool(
	{
		name: "search_links",
		description:
			"Find short links across the full catalog matching a substring on name, slug, target URL, or external ID, newest first.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			query: z
				.string()
				.trim()
				.min(1)
				.max(255)
				.describe("Search query (matches name, slug, URL, or external ID)"),
			...PageSchema,
		}),
		outputSchema: z.object({
			links: z.array(LinkRowOutputSchema),
			total: z.number().optional(),
			hasMore: z.boolean(),
		}),
		resolveWebsite: true,
		metadata: metadataForResource("link", ["read"]),
		ratelimit: { limit: 20, windowSec: 60 },
	},
	async (input, ctx) => {
		const orgId = getResolvedOrganizationId(ctx);
		const rpcContext = buildRpcContext(ctx);
		const [page, folders] = await Promise.all([
			searchLinks(rpcContext, orgId, input.query, {
				includeTotal: true,
				limit: input.limit,
				offset: input.offset,
			}),
			listLinkFolders(rpcContext, orgId),
		]);
		return {
			links: page.items.map((link) => summarizeLink(link, folders)),
			...(page.total === undefined ? {} : { total: page.total }),
			hasMore: page.hasMore,
		};
	}
);

const createLinkTool = defineMcpTool(
	{
		name: "create_link",
		description:
			"Create a short link in the website's organization. confirmed=false (default) returns a preview without writing; confirmed=true creates it.",
		inputSchema: z
			.object({
				...WebsiteSelectorSchema,
				name: z.string().min(1).max(255),
				targetUrl: httpUrlSchema,
				slug: LinkSlugSchema.optional(),
				expiresAt: LinkExpiresAtSchema.optional(),
				expiredRedirectUrl: httpUrlSchema.optional(),
				ogTitle: z.string().max(200).optional(),
				ogDescription: z.string().max(500).optional(),
				ogImageUrl: httpUrlSchema.optional(),
				externalId: z.string().max(255).optional(),
				...LinkFolderSelectorSchema.shape,
				deepLinkApp: z.enum(DEEP_LINK_APP_IDS).optional(),
				confirmed: ConfirmedSchema,
			})
			.superRefine(({ deepLinkApp, targetUrl }, context) => {
				if (deepLinkApp && !isDeepLinkTarget(deepLinkApp, targetUrl)) {
					context.addIssue({
						code: "custom",
						message:
							"Deep link URLs must use HTTPS and match the selected app.",
						path: ["targetUrl"],
					});
				}
			}),
		outputSchema: MutationResultSchema,
		resolveWebsite: true,
		metadata: metadataForResource("link", ["read", "create"]),
		annotations: CREATE_WRITE,
		ratelimit: { limit: 20, windowSec: 60 },
	},
	async (input, ctx) => {
		const orgId = getResolvedOrganizationId(ctx);
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
					deepLinkApp: input.deepLinkApp ?? null,
					expiresAt: input.expiresAt ?? null,
					expiredRedirectUrl: input.expiredRedirectUrl ?? null,
					ogTitle: input.ogTitle ?? null,
					ogDescription: input.ogDescription ?? null,
					ogImageUrl: input.ogImageUrl ?? null,
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
			"List chart annotations for a website: text, time range, tags, color, and visibility.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			...PageSchema,
		}),
		outputSchema: z.object({
			annotations: z.array(z.record(z.string(), z.unknown())),
			total: z.number(),
			hasMore: z.boolean(),
		}),
		metadata: { access: { kind: "read" } },
		resolveWebsite: true,
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		const result = await callRPCProcedure(
			"annotations",
			"list",
			{
				websiteId: ctx.websiteId,
				chartType: "metrics",
				chartContext: createChartContext({}),
			},
			buildRpcContext(ctx)
		);
		const page = paginate(Array.isArray(result) ? result : [], input);
		return {
			annotations: page.items.map((annotation) =>
				pickFields(annotation, ANNOTATION_FIELDS)
			),
			total: page.total,
			hasMore: page.hasMore,
		};
	}
);

const createAnnotationTool = defineMcpTool(
	{
		name: "create_annotation",
		description:
			"Create a chart annotation. confirmed=false (default) returns a preview without writing; confirmed=true creates it.",
		inputSchema: annotationCoordinateSchema.safeExtend({
			...WebsiteSelectorSchema,
			chartContext: annotationChartContextSchema.optional(),
			yValue: z.number().optional(),
			text: z.string().min(1).max(500),
			tags: z.array(z.string()).optional(),
			color: z.string().optional(),
			isPublic: z.boolean().optional(),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		resolveWebsite: true,
		metadata: metadataForResource("website", ["update"]),
		annotations: CREATE_WRITE,
		ratelimit: { limit: 20, windowSec: 60 },
	},
	async (input, ctx) => {
		const chartContext =
			input.chartContext ??
			createChartContext({
				from: dayjs(input.xValue).format("YYYY-MM-DD"),
				to: dayjs(input.xEndValue ?? input.xValue).format("YYYY-MM-DD"),
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
			annotation: pickFields(result, ANNOTATION_FIELDS),
		};
	}
);

type FlagStatus = z.infer<typeof FlagStatusSchema>;

interface FlagScope {
	notFoundHint: string;
	rpcContext: AppContext;
	scope: { websiteId: string } | { organizationId: string };
}

function resolveFlagScope(ctx: McpHandlerContext): FlagScope {
	if (ctx.websiteId) {
		return {
			notFoundHint:
				"Flag IDs come from list_flags for the same website. Organization-wide flags are updated without a website.",
			rpcContext: buildRpcContext(ctx),
			scope: { websiteId: ctx.websiteId },
		};
	}
	const organizationId = resolveOrganizationId(ctx);
	if (organizationId instanceof Error) {
		throw organizationId;
	}
	return {
		notFoundHint:
			"Website flags need websiteId, websiteName, or websiteDomain. list_flags shows each website's flags.",
		rpcContext: buildRpcContext({ ...ctx, organizationId }),
		scope: { organizationId },
	};
}

function readFlag(
	id: string,
	{ notFoundHint, rpcContext, scope }: FlagScope
): Promise<unknown> {
	return callRPCProcedure(
		"flags",
		"getById",
		{ id, ...scope },
		rpcContext
	).catch((error: unknown) => {
		if (error instanceof ORPCError && error.code === "NOT_FOUND") {
			throw new McpToolError("not_found", "Flag not found", {
				hint: notFoundHint,
			});
		}
		throw error;
	});
}

const FlagDependencyRowSchema = z.object({
	key: z.string(),
	status: FlagStatusSchema,
	dependencies: z.array(z.string()).nullable().optional(),
});
type FlagDependencyRow = z.infer<typeof FlagDependencyRowSchema>;

const MAX_FLAG_CASCADE_DEPTH = 10;
const FLAG_LIST_PAGE_SIZE = 200;

async function listScopeFlags({
	rpcContext,
	scope,
}: FlagScope): Promise<FlagDependencyRow[]> {
	const rows: FlagDependencyRow[] = [];
	let page: FlagDependencyRow[];
	do {
		page = z
			.array(FlagDependencyRowSchema)
			.parse(
				await callRPCProcedure(
					"flags",
					"list",
					{ ...scope, limit: FLAG_LIST_PAGE_SIZE, offset: rows.length },
					rpcContext
				)
			);
		rows.push(...page);
	} while (page.length === FLAG_LIST_PAGE_SIZE);
	return rows;
}

interface FlagStatusPlan {
	dependentsActivated: string[];
	dependentsDeactivated: string[];
	inactiveDependencies: string[];
	savedStatus: FlagStatus;
}

function planFlagStatus(
	scopeFlags: FlagDependencyRow[],
	change: {
		currentStatus?: FlagStatus;
		dependencies: string[];
		key: string;
		status: FlagStatus;
	}
): FlagStatusPlan {
	const statuses = new Map(scopeFlags.map((flag) => [flag.key, flag.status]));
	const inactiveDependencies = change.dependencies.filter((key) => {
		const status = statuses.get(key);
		return status !== undefined && status !== "active";
	});
	const plan: FlagStatusPlan = {
		dependentsActivated: [],
		dependentsDeactivated: [],
		inactiveDependencies,
		savedStatus:
			inactiveDependencies.length > 0 &&
			(change.status === "active" || !change.currentStatus)
				? "inactive"
				: change.status,
	};
	if (!change.currentStatus || change.currentStatus === plan.savedStatus) {
		return plan;
	}

	statuses.set(change.key, plan.savedStatus);
	const visited = new Set<string>();
	const cascade = (key: string, status: FlagStatus, depth: number) => {
		if (
			status === "archived" ||
			depth >= MAX_FLAG_CASCADE_DEPTH ||
			visited.has(key)
		) {
			return;
		}
		visited.add(key);
		const changed = scopeFlags.filter((flag) => {
			const dependencies = flag.dependencies ?? [];
			if (!dependencies.includes(key)) {
				return false;
			}
			const current = statuses.get(flag.key);
			return status === "inactive"
				? current === "active"
				: current === "inactive" &&
						dependencies.every(
							(dependency) => statuses.get(dependency) === "active"
						);
		});
		for (const flag of changed) {
			statuses.set(flag.key, status);
			if (status === "active") {
				plan.dependentsActivated.push(flag.key);
			} else {
				plan.dependentsDeactivated.push(flag.key);
			}
		}
		for (const flag of changed) {
			cascade(flag.key, status, depth + 1);
		}
	};
	cascade(change.key, plan.savedStatus, 0);
	return plan;
}

function flagStatusNotes(
	requestedStatus: FlagStatus | undefined,
	savedStatus: unknown,
	plan: FlagStatusPlan | null
): string | undefined {
	const notes: string[] = [];
	if (requestedStatus && savedStatus !== requestedStatus) {
		const reason = plan?.inactiveDependencies.length
			? ` because these dependencies are not active: ${plan.inactiveDependencies.join(", ")}`
			: "";
		notes.push(
			`Requested status ${requestedStatus} is stored as ${String(savedStatus)}${reason}.`
		);
	}
	if (plan && savedStatus === plan.savedStatus) {
		if (plan.dependentsActivated.length > 0) {
			notes.push(
				`Dependent flags turned on: ${plan.dependentsActivated.join(", ")}.`
			);
		}
		if (plan.dependentsDeactivated.length > 0) {
			notes.push(
				`Dependent flags turned off: ${plan.dependentsDeactivated.join(", ")}.`
			);
		}
	}
	return notes.length > 0 ? notes.join(" ") : undefined;
}

const FLAG_IDENTITY_FIELDS = ["id", "key", "name", "status"] as const;

function appendableFlagRules(rules: unknown[]): FlagTargetRule[] {
	const parsed = z.array(FlagRuleSchema).safeParse(rules);
	if (!parsed.success) {
		throw new McpToolError(
			"invalid_input",
			"This flag's existing rules use an older format that cannot be appended to.",
			{
				hint: "Use mode=replace to start the rules over, or rewrite them with update_flag.",
			}
		);
	}
	return parsed.data;
}

const listFlagsTool = defineMcpTool(
	{
		name: "list_flags",
		description:
			"List feature flags with their status, rollout, rules, and variants: a website's flags when a website is given, otherwise the organization-wide flags. Flag IDs are used by update_flag and add_users_to_flag.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			status: FlagStatusSchema.optional(),
			...PageSchema,
		}),
		outputSchema: z.object({
			flags: z.array(z.record(z.string(), z.unknown())),
			hasMore: z.boolean(),
		}),
		metadata: { access: { kind: "read" } },
		resolveWebsite: "optional",
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		const page = {
			status: input.status,
			limit: input.limit + 1,
			offset: input.offset,
		};
		const { rpcContext, scope } = resolveFlagScope(ctx);
		const result = await callRPCProcedure(
			"flags",
			"list",
			{ ...page, ...scope },
			rpcContext
		);
		const rows = Array.isArray(result) ? result : [];
		return {
			flags: rows.slice(0, input.limit).map((flag) => pickFlagFields(flag)),
			hasMore: rows.length > input.limit,
		};
	}
);

const createFlagTool = defineMcpTool(
	{
		name: "create_flag",
		description:
			"Create a feature flag, inactive and boolean unless configured. confirmed=false (default) returns a preview without writing; confirmed=true creates it.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			key: flagFormShape.key,
			name: z.string().min(1).max(100).optional(),
			description: z.string().optional(),
			type: FlagTypeSchema.optional(),
			status: FlagStatusSchema.optional(),
			defaultValue: z.boolean().optional(),
			payload: z.record(z.string(), z.unknown()).optional(),
			persistAcrossAuth: z.boolean().optional(),
			rolloutPercentage: z.number().min(0).max(100).optional(),
			rolloutBy: flagRolloutBySchema.optional(),
			rules: z.array(FlagRuleSchema).optional(),
			variants: z.array(FlagVariantSchema).optional(),
			dependencies: z.array(z.string()).optional(),
			environment: z.string().nullable().optional(),
			targetGroupIds: z.array(z.string()).optional(),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		resolveWebsite: true,
		metadata: metadataForResource("flag", ["create"]),
		annotations: CREATE_WRITE,
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
		const flagScope = resolveFlagScope(ctx);
		const statusPlan = payload.dependencies?.length
			? planFlagStatus(await listScopeFlags(flagScope), {
					dependencies: payload.dependencies,
					key: payload.key,
					status: payload.status,
				})
			: null;

		if (!input.confirmed) {
			const warning = flagStatusNotes(
				payload.status,
				statusPlan?.savedStatus ?? payload.status,
				statusPlan
			);
			return {
				preview: true,
				message: "Review this feature flag before creating it.",
				confirmationRequired: true,
				flag: {
					key: payload.key,
					name: payload.name ?? payload.key,
					type: payload.type,
					status: statusPlan?.savedStatus ?? payload.status,
					defaultValue: payload.defaultValue,
					rolloutPercentage: payload.rolloutPercentage,
					rolloutBy: payload.rolloutBy ?? "user",
					dependencies: payload.dependencies ?? [],
					ruleCount: payload.rules?.length ?? 0,
					variantCount: payload.variants?.length ?? 0,
				},
				...(warning && { warning }),
			};
		}

		const result = await callRPCProcedure(
			"flags",
			"create",
			payload,
			flagScope.rpcContext
		);
		const flag = pickFlagFields(result, FLAG_WRITE_FIELDS);
		const notes = flagStatusNotes(payload.status, flag.status, statusPlan);
		return {
			success: true,
			message: [`Feature flag "${input.key}" created successfully.`, notes]
				.filter(Boolean)
				.join(" "),
			flag: {
				...flag,
				...(payload.targetGroupIds && {
					targetGroupIds: payload.targetGroupIds,
				}),
			},
		};
	}
);

const updateFlagTool = defineMcpTool(
	{
		name: "update_flag",
		description:
			"Update a feature flag's config, status, rollout, rules, or variants. rules replaces every rule. confirmed=false (default) returns the current flag, with full rule targets, and the changes without writing; confirmed=true applies them.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
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
			rolloutBy: flagRolloutBySchema.optional(),
			variants: z.array(FlagVariantSchema).optional(),
			dependencies: z.array(z.string()).optional(),
			environment: z.string().nullable().optional(),
			targetGroupIds: z.array(z.string()).optional(),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		resolveWebsite: "optional",
		metadata: metadataForResource("flag", ["update"]),
		annotations: IDEMPOTENT_WRITE,
		ratelimit: { limit: 20, windowSec: 60 },
	},
	async (input, ctx) => {
		const {
			confirmed,
			id,
			websiteId: _websiteId,
			websiteName: _websiteName,
			websiteDomain: _websiteDomain,
			...changes
		} = input;
		const updates = omitUndefined(changes);
		const flagScope = resolveFlagScope(ctx);
		const current = await readFlag(id, flagScope);
		const currentFlag = FlagDependencyRowSchema.parse(current);
		const statusPlan = changes.status
			? planFlagStatus(await listScopeFlags(flagScope), {
					currentStatus: currentFlag.status,
					dependencies: changes.dependencies ?? currentFlag.dependencies ?? [],
					key: currentFlag.key,
					status: changes.status,
				})
			: null;

		if (!confirmed || Object.keys(updates).length === 0) {
			const warning = flagStatusNotes(
				changes.status,
				statusPlan?.savedStatus,
				statusPlan
			);
			return updatePreview(
				"feature flag",
				pickFlagFields(current, FLAG_FIELDS, Number.POSITIVE_INFINITY),
				updates,
				{
					...(statusPlan && { statusChange: statusPlan }),
					...(warning && { warning }),
				}
			);
		}

		const result = await callRPCProcedure(
			"flags",
			"update",
			{ id, ...updates },
			flagScope.rpcContext
		);
		const flag = pickFlagFields(result, FLAG_WRITE_FIELDS);
		const notes = flagStatusNotes(changes.status, flag.status, statusPlan);
		return {
			success: true,
			message: ["Feature flag updated successfully.", notes]
				.filter(Boolean)
				.join(" "),
			flag: {
				...flag,
				...(changes.targetGroupIds && {
					targetGroupIds: changes.targetGroupIds,
				}),
			},
			...(statusPlan &&
				flag.status === statusPlan.savedStatus && {
					statusChange: statusPlan,
				}),
		};
	}
);

const addUsersToFlagTool = defineMcpTool(
	{
		name: "add_users_to_flag",
		description:
			"Target user IDs or emails on a feature flag. mode=append (default) adds one rule; mode=replace deletes every existing rule first. confirmed=false (default) previews.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			flagId: z.string(),
			users: z.array(z.string().trim().min(1)).min(1).max(500),
			matchBy: z.enum(["email", "user_id"]).optional().default("email"),
			mode: z.enum(["append", "replace"]).optional().default("append"),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		resolveWebsite: "optional",
		metadata: metadataForResource("flag", ["update"]),
		ratelimit: { limit: 20, windowSec: 60 },
	},
	async (input, ctx) => {
		const uniqueUsers = [...new Set(input.users)];
		const flagScope = resolveFlagScope(ctx);
		const currentFlag = z
			.object({
				id: z.string(),
				key: z.string(),
				name: z.string().nullable().optional(),
				rules: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
				status: FlagStatusSchema.optional(),
			})
			.parse(await readFlag(input.flagId, flagScope));
		const existingRules = currentFlag.rules ?? [];
		const nextRules = [
			...(input.mode === "replace" ? [] : appendableFlagRules(existingRules)),
			createUserTargetRule(input.matchBy, uniqueUsers),
		];
		const targeting = {
			matchBy: input.matchBy,
			mode: input.mode,
			userCount: uniqueUsers.length,
			ruleCountBefore: existingRules.length,
			ruleCountAfter: nextRules.length,
		};

		if (!input.confirmed) {
			return {
				preview: true,
				message:
					"Review this feature flag targeting change before applying it.",
				confirmationRequired: true,
				flag: pickFields(currentFlag, FLAG_IDENTITY_FIELDS),
				targeting,
			};
		}

		const result = await callRPCProcedure(
			"flags",
			"update",
			{ id: input.flagId, rules: nextRules },
			flagScope.rpcContext
		);
		return {
			success: true,
			message: `Added ${uniqueUsers.length} user target${uniqueUsers.length === 1 ? "" : "s"} to the flag.`,
			flag: pickFields(result, FLAG_IDENTITY_FIELDS),
			targeting,
		};
	}
);

const TOOL_FACTORIES = [
	...createMcpWorkspaceTools(),
	listWebsitesTool,
	listInsightsTool,
	listInvestigationsTool,
	getInvestigationTool,
	replyToInvestigationTool,
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
] satisfies McpToolFactory[];

export function createMcpTools(ctx: McpRequestContext): RegisteredMcpTool[] {
	return TOOL_FACTORIES.map((factory) => factory.build(ctx));
}
