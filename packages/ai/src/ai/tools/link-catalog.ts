import { z } from "zod";
import type { AppContext } from "../config/context";
import { McpToolError } from "../mcp/define-tool";
import { callRPCProcedure } from "./utils/rpc";

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
	createdBy: z.string().optional(),
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

export const LinkFolderSelectorSchema = z.object({
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
