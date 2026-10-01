import {
	DEEP_LINK_APP_IDS,
	isDeepLinkTarget,
} from "@databuddy/shared/constants/deep-link-apps";
import { httpUrlSchema } from "@databuddy/validation";
import { z } from "zod";
import { callRPCProcedure } from "../tools/utils";
import {
	LinkFolderSelectorSchema,
	hasLinkFolderSelector,
	listLinkFolders,
	parseLinkRow,
	resolveLinkFolderFromList,
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
	GoalTypeSchema,
	getResolvedOrganizationId,
	getResolvedWebsiteId,
	LinkExpiresAtSchema,
	LinkSlugSchema,
	McpDateRangeSchema,
	MutationResultSchema,
	omitUndefined,
	PageSchema,
	paginate,
	pickFields,
	resolveMcpDateRange,
	summarizeConversionAnalytics,
	toIsoTimestamp,
	updatePreview,
	WebsiteSelectorSchema,
	WorkflowFilterSchema,
} from "./tool-contracts";

const IDEMPOTENT_WRITE = { idempotent: true } as const;

const getFunnelAnalyticsByReferrerTool = defineMcpTool(
	{
		name: "get_funnel_analytics_by_referrer",
		description:
			"Return one funnel's conversion broken down by referrer, by funnelId from list_funnels. Paginated over referrers.",
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
				await callRPCProcedure(
					"funnels",
					"getAnalyticsByReferrer",
					{
						funnelId: input.funnelId,
						websiteId: getResolvedWebsiteId(ctx),
						startDate: range.from,
						endDate: range.to,
					},
					buildRpcContext(ctx)
				)
			);
		const page = paginate(result.referrer_analytics, input);
		return {
			...summarizeConversionAnalytics(result, range),
			referrer_analytics: page.items,
			total: page.total,
			hasMore: page.hasMore,
		};
	}
);

const updateGoalTool = defineMcpTool(
	{
		name: "update_goal",
		description:
			"Update a conversion goal. confirmed=false (default) returns the current goal and the changes without writing; confirmed=true applies them.",
		inputSchema: z.object({
			id: z.string(),
			type: GoalTypeSchema.optional(),
			target: z.string().min(1).optional(),
			name: z.string().min(1).max(100).optional(),
			description: z.string().nullable().optional(),
			filters: z.array(WorkflowFilterSchema).optional(),
			ignoreHistoricData: z.boolean().optional(),
			isActive: z.boolean().optional(),
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
		const current = pickFields(
			await callRPCProcedure("goals", "getById", { id }, rpcContext),
			GOAL_FIELDS
		);

		if (!confirmed || Object.keys(updates).length === 0) {
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
			id: z.string(),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		metadata: metadataForResource("website", ["read", "delete"]),
		annotations: IDEMPOTENT_WRITE,
		ratelimit: { limit: 10, windowSec: 60 },
	},
	async ({ confirmed, id }, ctx) => {
		const rpcContext = buildRpcContext(ctx);
		const goal = pickFields(
			await callRPCProcedure("goals", "getById", { id }, rpcContext),
			GOAL_FIELDS
		);
		if (!confirmed) {
			return {
				preview: true,
				message: "Review this goal deletion before applying it.",
				confirmationRequired: true,
				goal,
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
			id: z.string(),
			text: z.string().min(1).max(500).optional(),
			tags: z.array(z.string()).optional(),
			color: z.string().optional(),
			isPublic: z.boolean().optional(),
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
		const current = pickFields(
			await callRPCProcedure("annotations", "getById", { id }, rpcContext),
			ANNOTATION_FIELDS
		);

		if (!confirmed || Object.keys(updates).length === 0) {
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
			id: z.string(),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		metadata: metadataForResource("website", ["read", "delete"]),
		annotations: IDEMPOTENT_WRITE,
		ratelimit: { limit: 10, windowSec: 60 },
	},
	async ({ confirmed, id }, ctx) => {
		const rpcContext = buildRpcContext(ctx);
		const annotation = pickFields(
			await callRPCProcedure("annotations", "getById", { id }, rpcContext),
			ANNOTATION_FIELDS
		);
		if (!confirmed) {
			return {
				preview: true,
				message: "Review this annotation deletion before applying it.",
				confirmationRequired: true,
				annotation,
			};
		}

		await callRPCProcedure("annotations", "delete", { id }, rpcContext);
		return { success: true, message: "Annotation deleted successfully." };
	}
);

const linkUpdateFields = {
	name: z.string().min(1).max(255).optional(),
	targetUrl: httpUrlSchema.optional(),
	slug: LinkSlugSchema.optional(),
	expiresAt: LinkExpiresAtSchema.nullable().optional(),
	expiredRedirectUrl: httpUrlSchema.nullable().optional(),
	ogTitle: z.string().max(200).nullable().optional(),
	ogDescription: z.string().max(500).nullable().optional(),
	ogImageUrl: httpUrlSchema.nullable().optional(),
	externalId: z.string().max(255).nullable().optional(),
	...LinkFolderSelectorSchema.shape,
	deepLinkApp: z.enum(DEEP_LINK_APP_IDS).nullable().optional(),
};

const updateLinkTool = defineMcpTool(
	{
		name: "update_link",
		description:
			"Update a short link. confirmed=false (default) returns the current link and the changes without writing; confirmed=true applies them.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			id: z.string(),
			...linkUpdateFields,
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		resolveWebsite: true,
		metadata: metadataForResource("link", ["read", "update"]),
		annotations: IDEMPOTENT_WRITE,
		ratelimit: { limit: 20, windowSec: 60 },
	},
	async ({ confirmed, id, folderId, folderSlug, expiresAt, ...input }, ctx) => {
		const organizationId = getResolvedOrganizationId(ctx);
		const rpcContext = buildRpcContext(ctx);
		const [current, folders] = await Promise.all([
			callRPCProcedure("links", "get", { id, organizationId }, rpcContext).then(
				parseLinkRow
			),
			listLinkFolders(rpcContext, organizationId),
		]);
		const folderSelection = resolveLinkFolderFromList(folders, {
			folderId,
			folderSlug,
		});
		if (!folderSelection.ok) {
			throw new McpToolError("invalid_input", folderSelection.message);
		}

		const effectiveDeepLinkApp =
			input.deepLinkApp === undefined ? current.deepLinkApp : input.deepLinkApp;
		const effectiveTargetUrl = input.targetUrl ?? current.targetUrl;
		if (
			effectiveDeepLinkApp &&
			!isDeepLinkTarget(effectiveDeepLinkApp, effectiveTargetUrl)
		) {
			throw new McpToolError(
				"invalid_input",
				"Deep link URLs must use HTTPS and match the selected app."
			);
		}

		const updates = omitUndefined({
			...input,
			...(expiresAt === undefined
				? {}
				: { expiresAt: expiresAt === null ? null : toIsoTimestamp(expiresAt) }),
			...(hasLinkFolderSelector({ folderId, folderSlug })
				? { folderId: folderSelection.folderId }
				: {}),
		});

		if (!confirmed || Object.keys(updates).length === 0) {
			return updatePreview(
				"short link",
				summarizeLink(current, folders),
				updates,
				confirmed
					? {}
					: {
							availableFolders:
								folderSelection.folders.map(summarizeLinkFolder),
						}
			);
		}

		const link = parseLinkRow(
			await callRPCProcedure("links", "update", { id, ...updates }, rpcContext)
		);
		return {
			success: true,
			message: `Short link "${link.name}" updated successfully.`,
			link: summarizeLink(link, folderSelection.folders),
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
			id: z.string(),
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
			callRPCProcedure("links", "get", { id, organizationId }, rpcContext).then(
				parseLinkRow
			),
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
