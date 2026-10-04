import { z } from "zod";
import { callRPCProcedure, omitUndefined } from "../tools/utils";
import { goalFields } from "../tools/goals";
import {
	linkUpdateFields,
	listLinkFolders,
	parseLinkRow,
	planLinkUpdate,
	readOrganizationLink,
	summarizeLink,
	summarizeLinkFolder,
} from "../tools/link-catalog";
import {
	defineMcpTool,
	metadataForResource,
	McpToolError,
	type McpToolFactory,
} from "./define-tool";
import { buildRpcContext } from "./tool-context";
import {
	ANNOTATION_FIELDS,
	ConfirmedSchema,
	DynamicObjectSchema,
	GOAL_FIELDS,
	getResolvedOrganizationId,
	getResolvedWebsiteId,
	McpDateRangeSchema,
	MutationResultSchema,
	PageSchema,
	paginate,
	pickFields,
	readConversionAnalytics,
	resolveMcpDateRange,
	summarizeConversionAnalytics,
	updatePreview,
	WebsiteSelectorSchema,
} from "./tool-contracts";

const IDEMPOTENT_WRITE = { idempotent: true } as const;

const getFunnelAnalyticsByReferrerTool = defineMcpTool(
	{
		name: "get_funnel_analytics_by_referrer",
		description:
			"Return one funnel's conversion broken down by referrer, by funnelId from list_funnels. Paginated over referrers. Referrers with a single visitor are omitted, so totals can be lower than get_funnel_analytics.",
		inputSchema: McpDateRangeSchema.safeExtend({
			...WebsiteSelectorSchema,
			funnelId: z.string().describe("Funnel ID from list_funnels"),
			...PageSchema,
		}),
		outputSchema: DynamicObjectSchema,
		metadata: { access: { kind: "read" } },
		resolveWebsite: true,
		ratelimit: { limit: 20, windowSec: 60 },
	},
	async (input, ctx) => {
		const range = resolveMcpDateRange(input);
		const result = z
			.object({ referrer_analytics: z.array(z.unknown()) })
			.passthrough()
			.parse(
				await readConversionAnalytics(
					"get_funnel_analytics_by_referrer",
					["funnels", "getAnalyticsByReferrer"],
					{
						funnelId: input.funnelId,
						websiteId: getResolvedWebsiteId(ctx),
						startDate: range.from,
						endDate: range.to,
					},
					ctx
				)
			);
		const page = paginate(result.referrer_analytics, input);
		return {
			...summarizeConversionAnalytics(result, range),
			referrer_analytics: page.items,
			total: page.total,
			hasMore: page.hasMore,
			...(page.total === 0 && {
				hint: "No referrer had more than one visitor in this range. get_funnel_analytics reports the funnel's full entrant count.",
			}),
		};
	}
);

const updateGoalTool = defineMcpTool(
	{
		name: "update_goal",
		description:
			"Update a conversion goal. confirmed=false (default) returns the current goal and the changes without writing; confirmed=true applies them.",
		inputSchema: z.object({
			id: z.string().describe("Goal ID from list_goals."),
			...z.object(goalFields).partial().shape,
			description: goalFields.description.describe(
				"What the goal measures; null clears it."
			),
			filters: goalFields.filters.describe(
				"Filters every conversion must match. Replaces the saved filters."
			),
			isActive: z
				.boolean()
				.optional()
				.describe("false pauses the goal; true resumes it."),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		metadata: metadataForResource("website", ["read", "update"]),
		annotations: IDEMPOTENT_WRITE,
		ratelimit: { limit: 20, windowSec: 60 },
	},
	async ({ confirmed, id, ...input }, ctx) => {
		const updates = omitUndefined(input);
		const rpcContext = buildRpcContext(ctx);
		if (!confirmed || Object.keys(updates).length === 0) {
			const current = pickFields(
				await callRPCProcedure("goals", "getById", { id }, rpcContext),
				GOAL_FIELDS
			);
			return updatePreview("goal", current, updates);
		}

		const goal = await callRPCProcedure(
			"goals",
			"update",
			{ id, ...updates },
			rpcContext
		);
		return {
			success: true,
			message: "Goal updated successfully.",
			goal: pickFields(goal, GOAL_FIELDS),
		};
	}
);

const deleteGoalTool = defineMcpTool(
	{
		name: "delete_goal",
		description:
			"Delete a conversion goal. confirmed=false (default) returns the goal without deleting it; confirmed=true deletes it.",
		inputSchema: z.object({
			id: z.string().describe("Goal ID from list_goals."),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		metadata: metadataForResource("website", ["read", "delete"]),
		annotations: IDEMPOTENT_WRITE,
		ratelimit: { limit: 10, windowSec: 60 },
	},
	async ({ confirmed, id }, ctx) => {
		const rpcContext = buildRpcContext(ctx);
		if (!confirmed) {
			return {
				preview: true,
				message: "Review this goal deletion before applying it.",
				confirmationRequired: true,
				goal: pickFields(
					await callRPCProcedure("goals", "getById", { id }, rpcContext),
					GOAL_FIELDS
				),
			};
		}

		await callRPCProcedure("goals", "delete", { id }, rpcContext);
		return { success: true, message: "Goal deleted successfully." };
	}
);

const updateAnnotationTool = defineMcpTool(
	{
		name: "update_annotation",
		description:
			"Update an annotation's text, tags, color, or visibility. confirmed=false (default) returns the changes without writing; confirmed=true applies them.",
		inputSchema: z.object({
			id: z.string().describe("Annotation ID from list_annotations."),
			text: z.string().min(1).max(500).optional().describe("Annotation text."),
			tags: z.array(z.string()).optional().describe("Replaces the saved tags."),
			color: z.string().optional().describe("Hex color, such as #3B82F6."),
			isPublic: z
				.boolean()
				.optional()
				.describe(
					"true shows the annotation to everyone in the organization; false keeps it private to its creator."
				),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		metadata: metadataForResource("website", ["read", "update"]),
		annotations: IDEMPOTENT_WRITE,
		ratelimit: { limit: 20, windowSec: 60 },
	},
	async ({ confirmed, id, ...input }, ctx) => {
		const updates = omitUndefined(input);
		const rpcContext = buildRpcContext(ctx);
		if (!confirmed || Object.keys(updates).length === 0) {
			const current = pickFields(
				await callRPCProcedure("annotations", "getById", { id }, rpcContext),
				ANNOTATION_FIELDS
			);
			return updatePreview("annotation", current, updates);
		}

		const annotation = await callRPCProcedure(
			"annotations",
			"update",
			{ id, ...updates },
			rpcContext
		);
		return {
			success: true,
			message: "Annotation updated successfully.",
			annotation: pickFields(annotation, ANNOTATION_FIELDS),
		};
	}
);

const deleteAnnotationTool = defineMcpTool(
	{
		name: "delete_annotation",
		description:
			"Delete a chart annotation. confirmed=false (default) returns the annotation without deleting it; confirmed=true deletes it.",
		inputSchema: z.object({
			id: z.string().describe("Annotation ID from list_annotations."),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		metadata: metadataForResource("website", ["read", "delete"]),
		annotations: IDEMPOTENT_WRITE,
		ratelimit: { limit: 10, windowSec: 60 },
	},
	async ({ confirmed, id }, ctx) => {
		const rpcContext = buildRpcContext(ctx);
		if (!confirmed) {
			return {
				preview: true,
				message: "Review this annotation deletion before applying it.",
				confirmationRequired: true,
				annotation: pickFields(
					await callRPCProcedure("annotations", "getById", { id }, rpcContext),
					ANNOTATION_FIELDS
				),
			};
		}

		await callRPCProcedure("annotations", "delete", { id }, rpcContext);
		return { success: true, message: "Annotation deleted successfully." };
	}
);

const updateLinkTool = defineMcpTool(
	{
		name: "update_link",
		description:
			"Update a short link. confirmed=false (default) returns the current link and the changes without writing; confirmed=true applies them.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			id: z.string().describe("Link ID from list_links or search_links."),
			...linkUpdateFields,
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		resolveWebsite: true,
		metadata: metadataForResource("link", ["read", "update"]),
		annotations: IDEMPOTENT_WRITE,
		ratelimit: { limit: 20, windowSec: 60 },
	},
	async (
		{
			confirmed,
			id,
			websiteId: _websiteId,
			websiteName: _websiteName,
			websiteDomain: _websiteDomain,
			...input
		},
		ctx
	) => {
		const rpcContext = buildRpcContext(ctx);
		const plan = await planLinkUpdate(
			rpcContext,
			getResolvedOrganizationId(ctx),
			id,
			input
		);
		if (!plan.ok) {
			throw new McpToolError("invalid_input", plan.message);
		}

		if (!confirmed || Object.keys(plan.updates).length === 0) {
			return updatePreview(
				"short link",
				summarizeLink(plan.current, plan.folders),
				plan.updates,
				confirmed
					? {}
					: { availableFolders: plan.folders.map(summarizeLinkFolder) }
			);
		}

		const link = parseLinkRow(
			await callRPCProcedure(
				"links",
				"update",
				{ id, ...plan.updates },
				rpcContext
			)
		);
		return {
			success: true,
			message: `Short link "${link.name}" updated successfully.`,
			link: summarizeLink(link, plan.folders),
		};
	}
);

const deleteLinkTool = defineMcpTool(
	{
		name: "delete_link",
		description:
			"Delete a short link. confirmed=false (default) returns the link without deleting it; confirmed=true deletes it.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			id: z.string().describe("Link ID from list_links or search_links."),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		resolveWebsite: true,
		metadata: metadataForResource("link", ["read", "delete"]),
		annotations: IDEMPOTENT_WRITE,
		ratelimit: { limit: 10, windowSec: 60 },
	},
	async ({ confirmed, id }, ctx) => {
		const organizationId = getResolvedOrganizationId(ctx);
		const rpcContext = buildRpcContext(ctx);
		const [link, folders] = await Promise.all([
			readOrganizationLink(rpcContext, organizationId, id),
			listLinkFolders(rpcContext, organizationId),
		]);
		if (!confirmed) {
			return {
				preview: true,
				message: "Review this short-link deletion before applying it.",
				confirmationRequired: true,
				link: summarizeLink(link, folders),
			};
		}

		await callRPCProcedure("links", "delete", { id }, rpcContext);
		return {
			success: true,
			message: `Short link "${link.name}" deleted successfully.`,
		};
	}
);

export function createMcpWorkspaceTools(): McpToolFactory[] {
	return [
		getFunnelAnalyticsByReferrerTool,
		updateGoalTool,
		deleteGoalTool,
		updateAnnotationTool,
		deleteAnnotationTool,
		updateLinkTool,
		deleteLinkTool,
	];
}
