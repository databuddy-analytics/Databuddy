import {
	and,
	asc,
	desc,
	eq,
	ilike,
	isNotNull,
	isNull,
	isUniqueViolationFor,
	or,
} from "@databuddy/db";
import { linkFolders, links } from "@databuddy/db/schema";
import {
	type CachedLink,
	invalidateAgentContextSnapshotsForOwner,
	invalidateLinkCache,
	setCachedLink,
} from "@databuddy/redis";
import { randomUUIDv7 } from "bun";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { rpcError } from "../errors";
import { logger } from "../lib/logger";
import { setTrackProperties } from "../middleware/track-mutation";
import { type Context, protectedProcedure, trackedProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";
import {
	createLinkSchema,
	deleteLinkSchema,
	getLinkSchema,
	linkOutputSchema,
	listLinksPageOutputSchema,
	listLinksPageSchema,
	listLinksSchema,
	updateLinkSchema,
} from "./links.schemas";

type LinkPermission = "read" | "create" | "update" | "delete";
type LinkRow = typeof links.$inferSelect;
type CacheableLink = Pick<
	LinkRow,
	| "id"
	| "targetUrl"
	| "expiresAt"
	| "expiredRedirectUrl"
	| "ogTitle"
	| "ogDescription"
	| "ogImageUrl"
	| "ogVideoUrl"
	| "iosUrl"
	| "androidUrl"
	| "deepLinkApp"
>;

const generateLinkSlug = customAlphabet(
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
	8
);

function validateHttpUrl(url: string): void {
	const parsed = new URL(url);
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw rpcError.badRequest("URL must be an absolute HTTP or HTTPS URL");
	}
}

function normalizeNullableText(
	value: string | null | undefined
): string | null {
	if (value == null) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed || null;
}

function normalizeTargetDomain(
	value: string | null | undefined
): string | null {
	const trimmed = normalizeNullableText(value);
	if (!trimmed) {
		return null;
	}

	try {
		return new URL(
			trimmed.includes("://") ? trimmed : `https://${trimmed}`
		).hostname.toLowerCase();
	} catch {
		return trimmed.split("/")[0]?.toLowerCase() || null;
	}
}

function getTargetDomain(targetUrl: string): string | null {
	try {
		return new URL(targetUrl).hostname.toLowerCase();
	} catch {
		return null;
	}
}

async function validateFolderId(
	db: Context["db"],
	folderId: string | null | undefined,
	organizationId: string
): Promise<string | null> {
	const normalizedFolderId = folderId?.trim() || null;
	if (!normalizedFolderId) {
		return null;
	}

	const existing = await db
		.select({ id: linkFolders.id })
		.from(linkFolders)
		.where(
			and(
				eq(linkFolders.id, normalizedFolderId),
				eq(linkFolders.organizationId, organizationId),
				isNull(linkFolders.deletedAt)
			)
		)
		.limit(1);

	if (existing.length > 0) {
		return normalizedFolderId;
	}

	throw rpcError.badRequest("Link folder does not exist in this organization");
}

function toCachedLink(link: CacheableLink): CachedLink {
	return {
		id: link.id,
		targetUrl: link.targetUrl,
		expiresAt: link.expiresAt?.toISOString() ?? null,
		expiredRedirectUrl: link.expiredRedirectUrl,
		ogTitle: link.ogTitle,
		ogDescription: link.ogDescription,
		ogImageUrl: link.ogImageUrl,
		ogVideoUrl: link.ogVideoUrl,
		iosUrl: link.iosUrl,
		androidUrl: link.androidUrl,
		deepLinkApp: link.deepLinkApp,
	};
}

function requireOrganizationId(
	organizationId: string | null | undefined
): string {
	if (!organizationId) {
		throw rpcError.badRequest("Organization ID is required");
	}
	return organizationId;
}

function requireLinkAccess(
	context: Context,
	organizationId: string,
	permission: LinkPermission
) {
	const permissions: [LinkPermission] = [permission];
	return withWorkspace(context, {
		organizationId,
		resource: "link",
		permissions,
	});
}

const LINKS_LIST_MAX = 1000;

function buildLinkListConditions(
	input: {
		externalId?: string;
		folderId?: string | null;
		sourceId?: string;
		sourceOwnerId?: string;
		sourceType?: string;
		targetDomain?: string;
	},
	organizationId: string
) {
	const conditions = [eq(links.organizationId, organizationId)];
	if (input.externalId) {
		conditions.push(eq(links.externalId, input.externalId));
	}
	if (input.folderId !== undefined) {
		conditions.push(
			input.folderId === null
				? isNull(links.folderId)
				: eq(links.folderId, input.folderId)
		);
	}
	if (input.sourceType) {
		conditions.push(eq(links.sourceType, input.sourceType));
	}
	if (input.sourceId) {
		conditions.push(eq(links.sourceId, input.sourceId));
	}
	if (input.sourceOwnerId) {
		conditions.push(eq(links.sourceOwnerId, input.sourceOwnerId));
	}
	const targetDomain = normalizeTargetDomain(input.targetDomain);
	if (targetDomain) {
		conditions.push(eq(links.targetDomain, targetDomain));
	}
	return conditions;
}

const linkSortOrder = {
	newest: [desc(links.createdAt), desc(links.id)],
	oldest: [asc(links.createdAt), asc(links.id)],
	"name-asc": [asc(links.name), desc(links.id)],
	"name-desc": [desc(links.name), desc(links.id)],
} as const;

async function getLinkOrThrow(context: Context, id: string): Promise<LinkRow> {
	const [link] = await context.db
		.select()
		.from(links)
		.where(and(eq(links.id, id), isNull(links.deletedAt)))
		.limit(1);

	if (!link) {
		throw rpcError.notFound("link", id);
	}

	return link;
}

export const linksRouter = {
	list: protectedProcedure
		.route({
			method: "POST",
			path: "/links/list",
			tags: ["Links"],
			summary: "List links",
			description:
				"Returns up to the 1000 most recent links for the workspace. Optional organizationId defaults to the active organization from the session. Use the paginated endpoint for larger workspaces. Requires read:links scope.",
			spec: (s) => ({ ...s, "x-required-scopes": ["read:links"] as const }),
		})
		.input(listLinksSchema)
		.output(z.array(linkOutputSchema))
		.handler(async ({ context, input }) => {
			const organizationId = requireOrganizationId(
				input.organizationId ?? context.organizationId
			);

			await requireLinkAccess(context, organizationId, "read");

			const conditions = buildLinkListConditions(input, organizationId);

			return context.db
				.select()
				.from(links)
				.where(and(...conditions))
				.orderBy(desc(links.createdAt))
				.limit(LINKS_LIST_MAX);
		}),

	paginated: protectedProcedure
		.route({
			method: "POST",
			path: "/links/paginated",
			tags: ["Links"],
			summary: "List links (paginated)",
			description:
				"Returns a page of links for the workspace with server-side search, sort, type filter, and offset pagination. Requires read:links scope.",
			spec: (s) => ({ ...s, "x-required-scopes": ["read:links"] as const }),
		})
		.input(listLinksPageSchema)
		.output(listLinksPageOutputSchema)
		.handler(async ({ context, input }) => {
			const organizationId = requireOrganizationId(
				input.organizationId ?? context.organizationId
			);

			await requireLinkAccess(context, organizationId, "read");

			const conditions = buildLinkListConditions(input, organizationId);

			if (input.type === "short") {
				conditions.push(isNull(links.deepLinkApp));
			} else if (input.type === "deep") {
				conditions.push(isNotNull(links.deepLinkApp));
			}

			const search = input.search?.trim();
			if (search) {
				const term = `%${search}%`;
				const matches = or(
					ilike(links.name, term),
					ilike(links.slug, term),
					ilike(links.targetUrl, term),
					ilike(links.externalId, term),
					ilike(links.sourceType, term),
					ilike(links.sourceId, term),
					ilike(links.sourceOwnerId, term),
					ilike(links.targetDomain, term)
				);
				if (matches) {
					conditions.push(matches);
				}
			}

			const rows = await context.db
				.select()
				.from(links)
				.where(and(...conditions))
				.orderBy(...linkSortOrder[input.sort])
				.limit(input.limit + 1)
				.offset(input.offset);

			const hasMore = rows.length > input.limit;

			return {
				items: hasMore ? rows.slice(0, input.limit) : rows,
				hasMore,
			};
		}),

	get: protectedProcedure
		.route({
			method: "POST",
			path: "/links/get",
			tags: ["Links"],
			summary: "Get link",
			description:
				"Returns a single link by id; workspace is resolved from the link. Requires read:links scope.",
			spec: (s) => ({ ...s, "x-required-scopes": ["read:links"] as const }),
		})
		.input(getLinkSchema)
		.output(linkOutputSchema)
		.handler(async ({ context, input }) => {
			const link = await getLinkOrThrow(context, input.id);
			await requireLinkAccess(context, link.organizationId, "read");

			return link;
		}),

	create: trackedProcedure
		.route({
			method: "POST",
			path: "/links/create",
			tags: ["Links"],
			summary: "Create link",
			description: "Creates a new short link. Requires write:links scope.",
			spec: (s) => ({ ...s, "x-required-scopes": ["write:links"] as const }),
		})
		.input(createLinkSchema)
		.output(linkOutputSchema)
		.handler(async ({ context, input }) => {
			setTrackProperties({
				has_expiry: !!input.expiresAt,
				has_og: !!(input.ogTitle || input.ogImageUrl),
			});
			const organizationId = requireOrganizationId(
				input.organizationId?.trim() || context.organizationId
			);

			const workspace = await requireLinkAccess(
				context,
				organizationId,
				"create"
			);

			validateHttpUrl(input.targetUrl);
			if (input.expiredRedirectUrl) {
				validateHttpUrl(input.expiredRedirectUrl);
			}
			const createdBy = await workspace.getCreatedBy();
			const resolvedFolderId = await validateFolderId(
				context.db,
				input.folderId,
				organizationId
			);
			const targetDomain =
				normalizeTargetDomain(input.targetDomain) ??
				getTargetDomain(input.targetUrl);

			const slugsToTry = input.slug
				? [input.slug]
				: Array.from({ length: 10 }, () => generateLinkSlug());

			for (const slug of slugsToTry) {
				try {
					const [newLink] = await context.db
						.insert(links)
						.values({
							id: randomUUIDv7(),
							slug,
							organizationId,
							createdBy,
							folderId: resolvedFolderId,
							name: input.name,
							targetUrl: input.targetUrl,
							targetDomain,
							sourceType: normalizeNullableText(input.sourceType),
							sourceId: normalizeNullableText(input.sourceId),
							sourceOwnerId: normalizeNullableText(input.sourceOwnerId),
							expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
							expiredRedirectUrl: input.expiredRedirectUrl ?? null,
							ogTitle: input.ogTitle ?? null,
							ogDescription: input.ogDescription ?? null,
							ogImageUrl: input.ogImageUrl ?? null,
							ogVideoUrl: input.ogVideoUrl ?? null,
							iosUrl: input.iosUrl ?? null,
							androidUrl: input.androidUrl ?? null,
							externalId: input.externalId ?? null,
							deepLinkApp: input.deepLinkApp ?? null,
						})
						.returning();

					if (!newLink) {
						throw rpcError.internal("Failed to create link");
					}

					setCachedLink(slug, toCachedLink(newLink)).catch((err) =>
						logger.error(
							{ slug, linkId: newLink.id, error: String(err) },
							"Failed to cache link after create"
						)
					);
					invalidateAgentContextSnapshotsForOwner(organizationId).catch((err) =>
						logger.error(
							{ organizationId, error: String(err) },
							"Failed to invalidate agent context snapshots after link create"
						)
					);

					return newLink;
				} catch (error) {
					if (!isUniqueViolationFor(error, "links_slug_unique")) {
						throw error;
					}
					if (input.slug) {
						throw rpcError.conflict("This slug is already taken");
					}
				}
			}

			throw rpcError.internal("Failed to generate unique slug");
		}),

	update: trackedProcedure
		.route({
			method: "POST",
			path: "/links/update",
			tags: ["Links"],
			summary: "Update link",
			description: "Updates an existing link. Requires write:links scope.",
			spec: (s) => ({ ...s, "x-required-scopes": ["write:links"] as const }),
		})
		.input(updateLinkSchema)
		.output(linkOutputSchema)
		.handler(async ({ context, input }) => {
			const link = await getLinkOrThrow(context, input.id);
			await requireLinkAccess(context, link.organizationId, "update");

			if (input.targetUrl) {
				validateHttpUrl(input.targetUrl);
			}
			if (input.expiredRedirectUrl) {
				validateHttpUrl(input.expiredRedirectUrl);
			}

			let resolvedFolderId: string | null | undefined;
			if (input.folderId !== undefined) {
				resolvedFolderId = await validateFolderId(
					context.db,
					input.folderId,
					link.organizationId
				);
			}

			const {
				id,
				expiresAt,
				folderId,
				sourceType,
				sourceId,
				sourceOwnerId,
				targetDomain,
				...updates
			} = input;
			const oldSlug = link.slug;
			const nextTargetDomain =
				targetDomain === undefined
					? input.targetUrl
						? getTargetDomain(input.targetUrl)
						: undefined
					: normalizeTargetDomain(targetDomain);

			try {
				const [updatedLink] = await context.db
					.update(links)
					.set({
						...updates,
						folderId:
							resolvedFolderId === undefined ? undefined : resolvedFolderId,
						sourceType:
							sourceType === undefined
								? undefined
								: normalizeNullableText(sourceType),
						sourceId:
							sourceId === undefined
								? undefined
								: normalizeNullableText(sourceId),
						sourceOwnerId:
							sourceOwnerId === undefined
								? undefined
								: normalizeNullableText(sourceOwnerId),
						targetDomain: nextTargetDomain,
						expiresAt:
							expiresAt === undefined
								? undefined
								: expiresAt
									? new Date(expiresAt)
									: null,
						updatedAt: new Date(),
					})
					.where(eq(links.id, id))
					.returning();

				if (!updatedLink) {
					throw rpcError.notFound("link", input.id);
				}

				Promise.all([
					oldSlug === updatedLink.slug
						? Promise.resolve()
						: invalidateLinkCache(oldSlug),
					setCachedLink(updatedLink.slug, toCachedLink(updatedLink)),
					invalidateAgentContextSnapshotsForOwner(link.organizationId),
				]).catch((err) =>
					logger.error(
						{
							linkId: updatedLink.id,
							oldSlug,
							newSlug: updatedLink.slug,
							error: String(err),
						},
						"Failed to update link cache"
					)
				);

				return updatedLink;
			} catch (error) {
				if (isUniqueViolationFor(error, "links_slug_unique")) {
					throw rpcError.conflict("This slug is already taken");
				}
				throw error;
			}
		}),

	delete: trackedProcedure
		.route({
			method: "POST",
			path: "/links/delete",
			tags: ["Links"],
			summary: "Delete link",
			description: "Deletes a link by id. Requires write:links scope.",
			spec: (s) => ({ ...s, "x-required-scopes": ["write:links"] as const }),
		})
		.input(deleteLinkSchema)
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			const link = await getLinkOrThrow(context, input.id);
			await requireLinkAccess(context, link.organizationId, "delete");

			try {
				await invalidateLinkCache(link.slug);
			} catch (error) {
				logger.error(
					{ slug: link.slug, linkId: input.id, error: String(error) },
					"Failed to invalidate link cache before delete"
				);
				throw rpcError.internal(
					"Failed to invalidate cache. Link not deleted."
				);
			}

			await context.db.delete(links).where(eq(links.id, input.id));
			invalidateAgentContextSnapshotsForOwner(link.organizationId).catch(
				(err) =>
					logger.error(
						{ organizationId: link.organizationId, error: String(err) },
						"Failed to invalidate agent context snapshots after link delete"
					)
			);

			return { success: true };
		}),
};
