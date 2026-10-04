import {
	DEEP_LINK_APP_IDS,
	isDeepLinkTarget,
} from "@databuddy/shared/constants/deep-link-apps";
import { LINK_SLUG_REGEX } from "@databuddy/shared/constants/links";
import {
	httpUrlSchema,
	isoDateOrOffsetDateTimeSchema,
} from "@databuddy/validation";
import { z } from "zod";
import type { AppContext } from "../config/context";
import { McpToolError } from "../mcp/define-tool";
import { callRPCProcedure, omitUndefined } from "./utils/rpc";

const DateStringSchema = z
	.union([z.string(), z.date()])
	.transform((value) => (value instanceof Date ? value.toISOString() : value));

const LinkFolderSummarySchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
});

export const LinkFolderWithUsageSchema = LinkFolderSummarySchema.extend({
	linkCount: z.number(),
});

export const LinkRowOutputSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	targetUrl: z.string(),
	deepLinkApp: z.string().nullable(),
	folderId: z.string().nullable(),
	folder: LinkFolderSummarySchema.nullable().optional(),
	externalId: z.string().nullable(),
	expiresAt: z.string().nullable().optional(),
	expiredRedirectUrl: z.string().nullable().optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
	ogTitle: z.string().nullable().optional(),
	ogDescription: z.string().nullable().optional(),
	ogImageUrl: z.string().nullable().optional(),
});

const LinkFolderSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	createdAt: DateStringSchema.optional(),
	updatedAt: DateStringSchema.optional(),
	organizationId: z.string(),
	createdBy: z.string().nullish(),
	deletedAt: DateStringSchema.nullable().optional(),
	linkCount: z.number().int().nonnegative().optional(),
});

const LinkRowSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	targetUrl: z.string(),
	deepLinkApp: z.string().nullable().optional(),
	folderId: z.string().nullable().optional(),
	externalId: z.string().nullable().optional(),
	expiresAt: DateStringSchema.nullable().optional(),
	expiredRedirectUrl: z.string().nullable().optional(),
	createdAt: DateStringSchema.optional(),
	updatedAt: DateStringSchema.optional(),
	ogTitle: z.string().nullable().optional(),
	ogDescription: z.string().nullable().optional(),
	ogImageUrl: z.string().nullable().optional(),
	organizationId: z.string().optional(),
});

const LinkPageSchema = z.object({
	hasMore: z.boolean(),
	items: z.array(LinkRowSchema),
	total: z.number().int().nonnegative().optional(),
});

const MODEL_LINK_LIMIT = 50;

const LinkFolderSelectorSchema = z.object({
	folderId: z
		.string()
		.nullable()
		.optional()
		.describe(
			"Existing link folder id. Use null to leave the link unfiled or clear the folder."
		),
	folderSlug: z
		.string()
		.min(1)
		.max(64)
		.regex(/^[a-z0-9_-]+$/)
		.optional()
		.describe(
			"Existing link folder slug. Use this or folderId, never a display name."
		),
});

const LinkSlugSchema = z
	.string()
	.min(3)
	.max(50)
	.regex(LINK_SLUG_REGEX)
	.describe("3-50 letters, digits, hyphens, or underscores.");

const LinkExpiresAtSchema = isoDateOrOffsetDateTimeSchema.describe(
	"Expiry as YYYY-MM-DD or an ISO date-time with offset."
);

const DEEP_LINK_TARGET_MISMATCH =
	"Deep link URLs must use HTTPS and match the selected app.";

export const linkCreateFields = {
	name: z.string().min(1).max(255).describe("Link name."),
	targetUrl: httpUrlSchema.describe("Destination URL."),
	slug: LinkSlugSchema.optional(),
	expiresAt: LinkExpiresAtSchema.optional(),
	expiredRedirectUrl: httpUrlSchema
		.optional()
		.describe("Where visitors go after the link expires."),
	ogTitle: z.string().max(200).optional().describe("Social preview title."),
	ogDescription: z
		.string()
		.max(500)
		.optional()
		.describe("Social preview description."),
	ogImageUrl: httpUrlSchema.optional().describe("Social preview image URL."),
	externalId: z
		.string()
		.max(255)
		.optional()
		.describe("Your own ID for the link, such as a CRM record."),
	...LinkFolderSelectorSchema.shape,
	deepLinkApp: z
		.enum(DEEP_LINK_APP_IDS)
		.optional()
		.describe(
			"Native app that opens the link on mobile; targetUrl must belong to it."
		),
};

export const linkUpdateFields = {
	name: z.string().min(1).max(255).optional().describe("Link name."),
	targetUrl: httpUrlSchema.optional().describe("Destination URL."),
	slug: LinkSlugSchema.optional(),
	expiresAt: LinkExpiresAtSchema.nullable()
		.optional()
		.describe("Expiry date or datetime; null removes the expiry."),
	expiredRedirectUrl: httpUrlSchema
		.nullable()
		.optional()
		.describe("Where visitors go after the link expires; null clears it."),
	ogTitle: z
		.string()
		.max(200)
		.nullable()
		.optional()
		.describe("Social preview title; null clears it."),
	ogDescription: z
		.string()
		.max(500)
		.nullable()
		.optional()
		.describe("Social preview description; null clears it."),
	ogImageUrl: httpUrlSchema
		.nullable()
		.optional()
		.describe("Social preview image URL; null clears it."),
	externalId: z
		.string()
		.max(255)
		.nullable()
		.optional()
		.describe(
			"Your own ID for the link, such as a CRM record; null clears it."
		),
	...LinkFolderSelectorSchema.shape,
	deepLinkApp: z
		.enum(DEEP_LINK_APP_IDS)
		.nullable()
		.optional()
		.describe(
			"Native app that opens the link on mobile; targetUrl must belong to it. null turns it off."
		),
};

export function refineDeepLinkTarget(
	{ deepLinkApp, targetUrl }: { deepLinkApp?: string; targetUrl: string },
	context: z.core.$RefinementCtx
) {
	if (deepLinkApp && !isDeepLinkTarget(deepLinkApp, targetUrl)) {
		context.addIssue({
			code: "custom",
			message: DEEP_LINK_TARGET_MISMATCH,
			path: ["targetUrl"],
		});
	}
}

export type LinkFolder = z.infer<typeof LinkFolderSchema>;
type LinkFolderSelector = z.infer<typeof LinkFolderSelectorSchema>;
export type LinkRow = z.infer<typeof LinkRowSchema>;

interface LinkFilters {
	folderId?: string | null;
	search?: string;
}

type LinkPage = z.infer<typeof LinkPageSchema>;
interface LinkPageRequest {
	includeTotal?: boolean;
	limit: number;
	offset: number;
}
type CountedLinkPage = LinkPage & { total: number };

type LinkFolderResolution =
	| {
			folder: LinkFolder | null;
			folderId: string | null | undefined;
			folders: LinkFolder[];
			ok: true;
	  }
	| {
			folders: LinkFolder[];
			message: string;
			ok: false;
	  };

export function parseLinkRow(value: unknown): LinkRow {
	const result = LinkRowSchema.safeParse(value);
	if (!result.success) {
		throw new Error("Received an invalid link response.");
	}
	return result.data;
}

function parseLinkFolders(value: unknown): LinkFolder[] {
	const result = z.array(LinkFolderSchema).safeParse(value);
	return result.success ? result.data : [];
}

async function loadLinks(
	context: AppContext,
	organizationId: string,
	filters: LinkFilters = {},
	page: LinkPageRequest = { limit: MODEL_LINK_LIMIT, offset: 0 }
): Promise<LinkPage> {
	const result = LinkPageSchema.safeParse(
		await callRPCProcedure(
			"links",
			"paginated",
			{
				...filters,
				limit: page.limit,
				offset: page.offset,
				...(page.includeTotal ? { includeTotal: true } : {}),
				organizationId,
				sort: "newest",
				type: "all",
			},
			context
		)
	);
	if (!result.success) {
		throw new Error("Received an invalid paginated link response.");
	}
	return result.data;
}

async function loadCountedLinks(
	context: AppContext,
	organizationId: string,
	filters: LinkFilters,
	page: { limit: number; offset: number }
): Promise<CountedLinkPage> {
	const result = await loadLinks(context, organizationId, filters, {
		...page,
		includeTotal: true,
	});
	if (result.total === undefined) {
		throw new Error("Received an invalid paginated link count response.");
	}
	return { ...result, total: result.total };
}

export function listLinks(
	context: AppContext,
	organizationId: string,
	page: { limit: number; offset: number } = {
		limit: MODEL_LINK_LIMIT,
		offset: 0,
	}
): Promise<CountedLinkPage> {
	return loadCountedLinks(context, organizationId, {}, page);
}

export async function countUnfiledLinks(
	context: AppContext,
	organizationId: string
): Promise<number> {
	const page = await loadCountedLinks(
		context,
		organizationId,
		{ folderId: null },
		{ limit: 1, offset: 0 }
	);
	return page.total;
}

export function searchLinks(
	context: AppContext,
	organizationId: string,
	query: string,
	page?: LinkPageRequest
): Promise<LinkPage> {
	return loadLinks(context, organizationId, { search: query }, page);
}

export async function readOrganizationLink(
	context: AppContext,
	organizationId: string,
	id: string
): Promise<LinkRow> {
	const link = parseLinkRow(
		await callRPCProcedure("links", "get", { id }, context)
	);
	if (link.organizationId !== organizationId) {
		throw new McpToolError(
			"not_found",
			"Short link not found in this website's organization.",
			{
				hint: "Link IDs come from list_links or search_links for the same website.",
			}
		);
	}
	return link;
}

export async function listLinkFolders(
	context: AppContext,
	organizationId: string
): Promise<LinkFolder[]> {
	return parseLinkFolders(
		await callRPCProcedure("linkFolders", "list", { organizationId }, context)
	);
}

export function summarizeLinkFolder(folder: LinkFolder) {
	return {
		id: folder.id,
		name: folder.name,
		slug: folder.slug,
		createdAt: folder.createdAt,
		updatedAt: folder.updatedAt,
	};
}

export function summarizeLinkFoldersWithUsage(folders: LinkFolder[]) {
	return folders.map((folder) => ({
		...summarizeLinkFolder(folder),
		linkCount: folder.linkCount ?? 0,
	}));
}

export function summarizeLink(link: LinkRow, folders: LinkFolder[]) {
	const folder = folders.find((item) => item.id === link.folderId) ?? null;
	return {
		id: link.id,
		name: link.name,
		slug: link.slug,
		targetUrl: link.targetUrl,
		deepLinkApp: link.deepLinkApp ?? null,
		folderId: link.folderId ?? null,
		folder: folder ? summarizeLinkFolder(folder) : null,
		externalId: link.externalId ?? null,
		expiresAt: link.expiresAt,
		expiredRedirectUrl: link.expiredRedirectUrl ?? null,
		createdAt: link.createdAt,
		updatedAt: link.updatedAt,
		ogTitle: link.ogTitle ?? null,
		ogDescription: link.ogDescription ?? null,
		ogImageUrl: link.ogImageUrl ?? null,
	};
}

function formatLinkFolderOptions(folders: LinkFolder[]): string {
	if (folders.length === 0) {
		return "No link folders exist yet.";
	}
	return folders
		.map((folder) => `${folder.name} (${folder.slug}, id: ${folder.id})`)
		.join("; ");
}

export function resolveLinkFolderFromList(
	folders: LinkFolder[],
	selector: LinkFolderSelector
): LinkFolderResolution {
	if (selector.folderId !== undefined && selector.folderSlug?.trim()) {
		return {
			folders,
			message: "Use either folderId or folderSlug for a link folder, not both.",
			ok: false,
		};
	}

	if (selector.folderId !== undefined) {
		const folderId = selector.folderId?.trim() || "";
		if (!folderId) {
			return { folder: null, folderId: null, folders, ok: true };
		}
		const folder = folders.find((item) => item.id === folderId) ?? null;
		if (folder) {
			return { folder, folderId: folder.id, folders, ok: true };
		}
		return {
			folders,
			message: `No link folder with id "${folderId}" exists in this organization. Available folders: ${formatLinkFolderOptions(folders)}. Use an existing folder or leave the link unfiled.`,
			ok: false,
		};
	}

	const requested = selector.folderSlug?.trim() || "";
	if (!requested) {
		return { folder: null, folderId: undefined, folders, ok: true };
	}

	const key = requested.toLowerCase();
	const slugMatch = folders.find((folder) => folder.slug.toLowerCase() === key);
	if (slugMatch) {
		return { folder: slugMatch, folderId: slugMatch.id, folders, ok: true };
	}

	return {
		folders,
		message: `No link folder with slug "${requested}" exists in this organization. Available folders: ${formatLinkFolderOptions(folders)}. Use an existing folder id or slug, or leave the link unfiled.`,
		ok: false,
	};
}

export async function resolveLinkFolder(
	context: AppContext,
	organizationId: string,
	selector: LinkFolderSelector
): Promise<LinkFolderResolution> {
	const folders = await listLinkFolders(context, organizationId);
	return resolveLinkFolderFromList(folders, selector);
}

export async function createOrganizationLink(
	context: AppContext,
	organizationId: string,
	{
		expiresAt,
		folderId: _folderId,
		folderSlug: _folderSlug,
		...link
	}: z.infer<z.ZodObject<typeof linkCreateFields>>,
	folderId: string | null | undefined
): Promise<LinkRow> {
	return parseLinkRow(
		await callRPCProcedure(
			"links",
			"create",
			{
				...link,
				organizationId,
				folderId: folderId ?? null,
				expiresAt: expiresAt ? new Date(expiresAt) : null,
			},
			context
		)
	);
}

export async function planLinkUpdate(
	context: AppContext,
	organizationId: string,
	id: string,
	{
		expiresAt,
		folderId,
		folderSlug,
		...input
	}: z.infer<z.ZodObject<typeof linkUpdateFields>>
) {
	const [current, folders] = await Promise.all([
		readOrganizationLink(context, organizationId, id),
		listLinkFolders(context, organizationId),
	]);
	const folderSelection = resolveLinkFolderFromList(folders, {
		folderId,
		folderSlug,
	});
	if (!folderSelection.ok) {
		return folderSelection;
	}
	const deepLinkApp =
		input.deepLinkApp === undefined ? current.deepLinkApp : input.deepLinkApp;
	if (
		deepLinkApp &&
		!isDeepLinkTarget(deepLinkApp, input.targetUrl ?? current.targetUrl)
	) {
		return { folders, message: DEEP_LINK_TARGET_MISMATCH, ok: false as const };
	}
	return {
		current,
		folders,
		ok: true as const,
		updates: omitUndefined({
			...input,
			expiresAt: expiresAt && new Date(expiresAt).toISOString(),
			folderId: folderSelection.folderId,
		}),
	};
}
