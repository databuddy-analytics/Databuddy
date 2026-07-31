import { z } from "zod";
import type { AppContext } from "../config/context";

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
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
	ogTitle: z.string().nullable().optional(),
	ogDescription: z.string().nullable().optional(),
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
	createdAt: DateStringSchema.optional(),
	updatedAt: DateStringSchema.optional(),
	ogTitle: z.string().nullable().optional(),
	ogDescription: z.string().nullable().optional(),
	organizationId: z.string().optional(),
});

const LinkPageSchema = z.object({
	hasMore: z.boolean(),
	items: z.array(LinkRowSchema),
	total: z.number().int().nonnegative().optional(),
});

const LinkSummarySchema = z.object({
	total: z.number().int().nonnegative(),
	unfiledTotal: z.number().int().nonnegative(),
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
export type LinkFolderSelector = z.infer<typeof LinkFolderSelectorSchema>;
export type LinkRow = z.infer<typeof LinkRowSchema>;

type LinkPageFetcher = (input: {
	includeTotal?: boolean;
	limit: number;
	offset: number;
	folderId?: string | null;
	search?: string;
}) => Promise<unknown>;

export type LinkPage = z.infer<typeof LinkPageSchema>;
export type LinkSummary = z.infer<typeof LinkSummarySchema>;

export type LinkFolderResolution =
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

export async function fetchLinkCatalogPage(
	fetchPage: LinkPageFetcher,
	filters: { folderId?: string | null; search?: string } = {}
): Promise<LinkPage> {
	const result = LinkPageSchema.safeParse(
		await fetchPage({
			...filters,
			limit: MODEL_LINK_LIMIT,
			offset: 0,
		})
	);
	if (!result.success) {
		throw new Error("Received an invalid paginated link response.");
	}
	return result.data;
}

export async function fetchLinkSummary(
	fetchPage: LinkPageFetcher,
	search?: string
): Promise<LinkSummary> {
	const input = {
		includeTotal: true,
		limit: 1,
		offset: 0,
		...(search ? { search } : {}),
	};
	const [all, unfiled] = await Promise.all([
		fetchPage(input),
		fetchPage({ ...input, folderId: null }),
	]);
	const allResult = LinkPageSchema.safeParse(all);
	const unfiledResult = LinkPageSchema.safeParse(unfiled);
	if (
		!(allResult.success && unfiledResult.success) ||
		allResult.data.total === undefined ||
		unfiledResult.data.total === undefined
	) {
		throw new Error("Received an invalid paginated link summary response.");
	}
	return {
		total: allResult.data.total,
		unfiledTotal: unfiledResult.data.total,
	};
}

async function loadLinks(
	context: AppContext,
	organizationId: string,
	filters: { folderId?: string | null; search?: string } = {}
): Promise<LinkPage> {
	const { callRPCProcedure } = await import("./utils");
	return fetchLinkCatalogPage(
		(input) =>
			callRPCProcedure(
				"links",
				"paginated",
				{
					...input,
					organizationId,
					sort: "newest",
					type: "all",
				},
				context
			),
		filters
	);
}

export function listLinks(
	context: AppContext,
	organizationId: string
): Promise<LinkPage> {
	return loadLinks(context, organizationId);
}

export function searchLinks(
	context: AppContext,
	organizationId: string,
	query: string
): Promise<LinkPage> {
	return loadLinks(context, organizationId, { search: query });
}

export async function getLinkSummary(
	context: AppContext,
	organizationId: string,
	search?: string
): Promise<LinkSummary> {
	const { callRPCProcedure } = await import("./utils");
	return fetchLinkSummary(
		(input) =>
			callRPCProcedure(
				"links",
				"paginated",
				{
					...input,
					organizationId,
					sort: "newest",
					type: "all",
				},
				context
			),
		search
	);
}

export async function listLinkFolders(
	context: AppContext,
	organizationId: string
): Promise<LinkFolder[]> {
	const { callRPCProcedure } = await import("./utils");
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

export function summarizeLinkFoldersWithUsage(
	folders: LinkFolder[],
	visibleLinks: LinkRow[] = []
) {
	const visibleCounts = visibleLinks.reduce(
		(map, link) =>
			map.set(link.folderId ?? null, (map.get(link.folderId ?? null) ?? 0) + 1),
		new Map<string | null, number>()
	);

	return folders.map((folder) => ({
		...summarizeLinkFolder(folder),
		linkCount: folder.linkCount ?? visibleCounts.get(folder.id) ?? 0,
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
		createdAt: link.createdAt,
		updatedAt: link.updatedAt,
		ogTitle: link.ogTitle ?? null,
		ogDescription: link.ogDescription ?? null,
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

export function hasLinkFolderSelector(selector: LinkFolderSelector): boolean {
	return selector.folderId !== undefined || !!selector.folderSlug?.trim();
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
			message: `I couldn't find link folder id "${folderId}" in this organization. Available folders: ${formatLinkFolderOptions(folders)}. Use an existing folder or leave the link unfiled.`,
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
		message: `I couldn't find an existing link folder slug "${requested}". Available folders: ${formatLinkFolderOptions(folders)}. Use an existing folder id/slug or leave the link unfiled.`,
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
