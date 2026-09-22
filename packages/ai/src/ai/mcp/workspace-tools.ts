import {
	DEEP_LINK_APP_IDS,
	isDeepLinkTarget,
} from "@databuddy/shared/constants/deep-link-apps";
import { LINK_SLUG_REGEX } from "@databuddy/shared/constants/links";
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
import { buildRpcContext, getOrganizationId } from "./tool-context";
import {
	ConfirmedSchema,
	DynamicObjectSchema,
	getResolvedWebsiteId,
	McpDateRangeSchema,
	MutationResultSchema,
	resolveMcpDateRange,
	WebsiteSelectorSchema,
	WorkflowFilterSchema,
} from "./tool-contracts";

function omitUndefined(
	input: Record<string, unknown>
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(input).filter(([, value]) => value !== undefined)
	);
}

const getFunnelAnalyticsByReferrerTool = defineMcpTool(
	{
		name: "get_funnel_analytics_by_referrer",
		description:
			"Return funnel conversion analytics broken down by referrer/source. Use after list_funnels to see which sources convert best.",
		inputSchema: McpDateRangeSchema.safeExtend({
			...WebsiteSelectorSchema,
			funnelId: z.string().describe("Funnel ID from list_funnels"),
		}),
		outputSchema: DynamicObjectSchema,
		resolveWebsite: true,
		ratelimit: { limit: 60, windowSec: 60 },
	},
	(input, ctx) => {
		const { from, to } = resolveMcpDateRange(input);
		return callRPCProcedure(
			"funnels",
			"getAnalyticsByReferrer",
			{
				funnelId: input.funnelId,
				websiteId: getResolvedWebsiteId(ctx),
				startDate: from,
				endDate: to,
			},
			buildRpcContext(ctx)
		);
	}
);

const updateGoalTool = defineMcpTool(
	{
		name: "update_goal",
		description:
			"Update a conversion goal. Call with confirmed=false to preview changes, then confirmed=true after explicit user approval.",
		inputSchema: z.object({
			id: z.string(),
			type: z.enum(["PAGE_VIEW", "EVENT", "CUSTOM"]).optional(),
			target: z.string().min(1).optional(),
			name: z.string().min(1).max(100).optional(),
			description: z.string().nullable().optional(),
			filters: z.array(WorkflowFilterSchema).optional(),
			ignoreHistoricData: z.boolean().optional(),
			isActive: z.boolean().optional(),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		// Preview loads the current goal before an update, so read:data is required too.
		metadata: metadataForResource("website", ["read", "update"]),
		ratelimit: { limit: 20, windowSec: 60 },
	},
	async ({ confirmed, id, ...input }, ctx) => {
		const updates = omitUndefined(input);
		const rpcContext = buildRpcContext(ctx);
		const current = await callRPCProcedure(
			"goals",
			"getById",
			{ id },
			rpcContext
		);

		if (!confirmed) {
			return {
				preview: true,
				message:
					Object.keys(updates).length > 0
						? "Review this goal update before applying it."
						: "No changes detected. The goal will remain unchanged.",
				confirmationRequired: Object.keys(updates).length > 0,
				current,
				updates,
			};
		}

		if (Object.keys(updates).length === 0) {
			return {
				preview: true,
				message: "No changes detected. The goal will remain unchanged.",
				confirmationRequired: false,
				current,
			};
		}

		const goal = await callRPCProcedure(
			"goals",
			"update",
			{ id, ...updates },
			rpcContext
		);
		return { success: true, message: "Goal updated successfully.", goal };
	}
);

const deleteGoalTool = defineMcpTool(
	{
		name: "delete_goal",
		description:
			"Delete a conversion goal. Call with confirmed=false to preview, then confirmed=true after explicit user approval.",
		inputSchema: z.object({
			id: z.string(),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		// Preview loads the current goal before deletion, so read:data is required too.
		metadata: metadataForResource("website", ["read", "delete"]),
		ratelimit: { limit: 10, windowSec: 60 },
	},
	async ({ confirmed, id }, ctx) => {
		const rpcContext = buildRpcContext(ctx);
		const goal = await callRPCProcedure("goals", "getById", { id }, rpcContext);
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
			"Update annotation text, tags, color, or visibility. Preview changes before applying them.",
		inputSchema: z.object({
			id: z.string(),
			text: z.string().min(1).max(500).optional(),
			tags: z.array(z.string()).optional(),
			color: z.string().optional(),
			isPublic: z.boolean().optional(),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		// Preview loads the current annotation before an update, so read:data is required too.
		metadata: metadataForResource("website", ["read", "update"]),
		ratelimit: { limit: 20, windowSec: 60 },
	},
	async ({ confirmed, id, ...input }, ctx) => {
		const updates = omitUndefined(input);
		const rpcContext = buildRpcContext(ctx);
		const current = await callRPCProcedure(
			"annotations",
			"getById",
			{ id },
			rpcContext
		);

		if (!confirmed) {
			return {
				preview: true,
				message:
					Object.keys(updates).length > 0
						? "Review this annotation update before applying it."
						: "No changes detected. The annotation will remain unchanged.",
				confirmationRequired: Object.keys(updates).length > 0,
				current,
				updates,
			};
		}

		if (Object.keys(updates).length === 0) {
			return {
				preview: true,
				message: "No changes detected. The annotation will remain unchanged.",
				confirmationRequired: false,
				current,
			};
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
			annotation,
		};
	}
);

const deleteAnnotationTool = defineMcpTool(
	{
		name: "delete_annotation",
		description:
			"Delete a chart annotation. Call with confirmed=false to preview, then confirmed=true after explicit user approval.",
		inputSchema: z.object({
			id: z.string(),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		// Preview loads the current annotation before deletion, so read:data is required too.
		metadata: metadataForResource("website", ["read", "delete"]),
		ratelimit: { limit: 10, windowSec: 60 },
	},
	async ({ confirmed, id }, ctx) => {
		const rpcContext = buildRpcContext(ctx);
		const annotation = await callRPCProcedure(
			"annotations",
			"getById",
			{ id },
			rpcContext
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
	slug: z.string().min(3).max(50).regex(LINK_SLUG_REGEX).optional(),
	expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
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
			"Update a short link. Call with confirmed=false to preview changes, then confirmed=true after explicit user approval.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			id: z.string(),
			...linkUpdateFields,
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		resolveWebsite: true,
		metadata: metadataForResource("link", ["read", "update"]),
		ratelimit: { limit: 20, windowSec: 60 },
	},
	async ({ confirmed, id, folderId, folderSlug, ...input }, ctx) => {
		const organizationId = await getOrganizationId(getResolvedWebsiteId(ctx));
		if (organizationId instanceof Error) {
			throw new McpToolError("not_found", organizationId.message);
		}

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
			...(hasLinkFolderSelector({ folderId, folderSlug })
				? { folderId: folderSelection.folderId }
				: {}),
		});

		if (!confirmed) {
			return {
				preview: true,
				message:
					Object.keys(updates).length > 0
						? "Review this short-link update before applying it."
						: "No changes detected. The short link will remain unchanged.",
				confirmationRequired: Object.keys(updates).length > 0,
				current: summarizeLink(current, folders),
				updates,
				availableFolders: folderSelection.folders.map(summarizeLinkFolder),
			};
		}

		if (Object.keys(updates).length === 0) {
			return {
				preview: true,
				message: "No changes detected. The short link will remain unchanged.",
				confirmationRequired: false,
				current: summarizeLink(current, folders),
			};
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
			"Delete a short link. Call with confirmed=false to preview, then confirmed=true after explicit user approval.",
		inputSchema: z.object({
			...WebsiteSelectorSchema,
			id: z.string(),
			confirmed: ConfirmedSchema,
		}),
		outputSchema: MutationResultSchema,
		resolveWebsite: true,
		metadata: metadataForResource("link", ["read", "delete"]),
		ratelimit: { limit: 10, windowSec: 60 },
	},
	async ({ confirmed, id }, ctx) => {
		const organizationId = await getOrganizationId(getResolvedWebsiteId(ctx));
		if (organizationId instanceof Error) {
			throw new McpToolError("not_found", organizationId.message);
		}

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
