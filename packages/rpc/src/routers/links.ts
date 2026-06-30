import { and, desc, eq, isNull, isUniqueViolationFor } from "@databuddy/db";
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

const generateSlug = customAlphabet(
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
	8
);

const listLinksSchema = z
	.object({
		organizationId: z.string().optional(),
		externalId: z.string().optional(),
		folderId: z.string().nullable().optional(),
		sourceType: z.string().max(64).optional(),
		sourceId: z.string().max(255).optional(),
		sourceOwnerId: z.string().max(255).optional(),
		targetDomain: z.string().max(255).optional(),
	})
	.default({});

const getLinkSchema = z.object({
	id: z.string(),
});

const slugSchema = z
	.string()
	.min(3)
	.max(50)
	.regex(
		/^[a-zA-Z0-9_-]+$/,
		"Slug can only contain letters, numbers, hyphens, and underscores"
	);

const createLinkSchema = z.object({
	organizationId: z.string().optional(),
	name: z.string().min(1).max(255),
	targetUrl: z.url(),
	slug: slugSchema.optional(),
	folderId: z.string().nullable().optional(),
	expiresAt: z.date().nullable().optional(),
	expiredRedirectUrl: z.url().nullable().optional(),
	ogTitle: z.string().max(200).nullable().optional(),
	ogDescription: z.string().max(500).nullable().optional(),
	ogImageUrl: z.url().nullable().optional(),
	ogVideoUrl: z.url().nullable().optional(),
	iosUrl: z.url().nullable().optional(),
	androidUrl: z.url().nullable().optional(),
	externalId: z.string().max(255).nullable().optional(),
	sourceType: z.string().max(64).nullable().optional(),
	sourceId: z.string().max(255).nullable().optional(),
	sourceOwnerId: z.string().max(255).nullable().optional(),
	targetDomain: z.string().max(255).nullable().optional(),
	deepLinkApp: z.string().nullable().optional(),
});

const updateLinkSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(255).optional(),
	targetUrl: z.url().optional(),
	slug: slugSchema.optional(),
	folderId: z.string().nullable().optional(),
	expiresAt: z.string().datetime().nullable().optional(),
	expiredRedirectUrl: z.url().nullable().optional(),
	ogTitle: z.string().max(200).nullable().optional(),
	ogDescription: z.string().max(500).nullable().optional(),
	ogImageUrl: z.url().nullable().optional(),
	ogVideoUrl: z.url().nullable().optional(),
	iosUrl: z.url().nullable().optional(),
	androidUrl: z.url().nullable().optional(),
	externalId: z.string().max(255).nullable().optional(),
	sourceType: z.string().max(64).nullable().optional(),
	sourceId: z.string().max(255).nullable().optional(),
	sourceOwnerId: z.string().max(255).nullable().optional(),
	targetDomain: z.string().max(255).nullable().optional(),
	deepLinkApp: z.string().nullable().optional(),
});

const deleteLinkSchema = z.object({
	id: z.string(),
});

const linkOutputSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	createdBy: z.string(),
	folderId: z.string().nullable(),
	slug: z.string(),
	name: z.string(),
	targetUrl: z.string(),
	targetDomain: z.string().nullable(),
	sourceType: z.string().nullable(),
	sourceId: z.string().nullable(),
	sourceOwnerId: z.string().nullable(),
	expiresAt: z.nullable(z.coerce.date()),
	expiredRedirectUrl: z.string().nullable(),
	ogTitle: z.string().nullable(),
	ogDescription: z.string().nullable(),
	ogImageUrl: z.string().nullable(),
	ogVideoUrl: z.string().nullable(),
	iosUrl: z.string().nullable(),
	androidUrl: z.string().nullable(),
	externalId: z.string().nullable(),
	deepLinkApp: z.string().nullable(),
	deletedAt: z.nullable(z.coerce.date()),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

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

function toCachedLink(link: {
	id: string;
	targetUrl: string;
	expiresAt: Date | null;
	expiredRedirectUrl: string | null;
	ogTitle: string | null;
	ogDescription: string | null;
	ogImageUrl: string | null;
	ogVideoUrl: string | null;
	iosUrl: string | null;
	androidUrl: string | null;
	deepLinkApp: string | null;
}): CachedLink {
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

export const linksRouter = {
	list: protectedProcedure
		.route({
			method: "POST",
			path: "/links/list",
			tags: ["Links"],
			summary: "List links",
			description:
				"Returns all links for the workspace. Optional organizationId defaults to the active organization from the session. Requires read:links scope.",
			spec: (s) => ({ ...s, "x-required-scopes": ["read:links"] as const }),
		})
		.input(listLinksSchema)
		.output(z.array(linkOutputSchema))
		.handler(async ({ context, input }) => {
			const organizationId =
				input.organizationId ?? context.organizationId ?? null;
			if (!organizationId) {
				throw rpcError.badRequest("Organization ID is required");
			}

			await withWorkspace(context, {
				organizationId,
				resource: "link",
				permissions: ["read"],
			});

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

			return context.db
				.select()
				.from(links)
				.where(and(...conditions))
				.orderBy(desc(links.createdAt));
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
			const result = await context.db
				.select()
				.from(links)
				.where(eq(links.id, input.id))
				.limit(1);

			if (result.length === 0) {
				throw rpcError.notFound("link", input.id);
			}

			const linkRow = result[0];
			if (!linkRow) {
				throw rpcError.notFound("link", input.id);
			}
			await withWorkspace(context, {
				organizationId: linkRow.organizationId,
				resource: "link",
				permissions: ["read"],
			});

			return linkRow;
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
			const organizationId =
				input.organizationId?.trim() || context.organizationId || null;
			if (!organizationId) {
				throw rpcError.badRequest("Organization ID is required");
			}

			const workspace = await withWorkspace(context, {
				organizationId,
				resource: "link",
				permissions: ["create"],
			});

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
				: Array.from({ length: 10 }, () => generateSlug());

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
			const existingLink = await context.db
				.select()
				.from(links)
				.where(eq(links.id, input.id))
				.limit(1);

			if (existingLink.length === 0) {
				throw rpcError.notFound("link", input.id);
			}

			const link = existingLink[0];
			if (!link) {
				throw rpcError.notFound("link", input.id);
			}
			await withWorkspace(context, {
				organizationId: link.organizationId,
				resource: "link",
				permissions: ["update"],
			});

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
			const existingLink = await context.db
				.select({
					organizationId: links.organizationId,
					slug: links.slug,
				})
				.from(links)
				.where(eq(links.id, input.id))
				.limit(1);

			if (existingLink.length === 0) {
				throw rpcError.notFound("link", input.id);
			}

			const link = existingLink[0];
			if (!link) {
				throw rpcError.notFound("link", input.id);
			}

			await withWorkspace(context, {
				organizationId: link.organizationId,
				resource: "link",
				permissions: ["delete"],
			});

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
