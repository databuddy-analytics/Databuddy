import { and, desc, eq, isUniqueViolationFor, links } from "@databuddy/db";
import {
	type CachedLink,
	invalidateLinkCache,
	setCachedLink,
} from "@databuddy/redis";
import { randomUUIDv7 } from "bun";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { rpcError } from "../errors";
import { logger } from "../lib/logger";
import { protectedProcedure } from "../orpc";
import {
	withLinksAccess,
	workspaceInputSchema,
} from "../procedures/with-workspace";

const generateSlug = customAlphabet(
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
	8
);

const listLinksSchema = workspaceInputSchema.extend({
	organizationId: z.string(),
	externalId: z.string().optional(),
});

const getLinkSchema = workspaceInputSchema.extend({
	id: z.string(),
	organizationId: z.string(),
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
	organizationId: z.string(),
	name: z.string().min(1).max(255),
	targetUrl: z.url(),
	slug: slugSchema.optional(),
	expiresAt: z.date().nullable().optional(),
	expiredRedirectUrl: z.url().nullable().optional(),
	ogTitle: z.string().max(200).nullable().optional(),
	ogDescription: z.string().max(500).nullable().optional(),
	ogImageUrl: z.url().nullable().optional(),
	ogVideoUrl: z.url().nullable().optional(),
	iosUrl: z.url().nullable().optional(),
	androidUrl: z.url().nullable().optional(),
	externalId: z.string().max(255).nullable().optional(),
});

const updateLinkSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(255).optional(),
	targetUrl: z.url().optional(),
	slug: slugSchema.optional(),
	expiresAt: z.string().datetime().nullable().optional(),
	expiredRedirectUrl: z.url().nullable().optional(),
	ogTitle: z.string().max(200).nullable().optional(),
	ogDescription: z.string().max(500).nullable().optional(),
	ogImageUrl: z.url().nullable().optional(),
	ogVideoUrl: z.url().nullable().optional(),
	iosUrl: z.url().nullable().optional(),
	androidUrl: z.url().nullable().optional(),
	externalId: z.string().max(255).nullable().optional(),
});

const deleteLinkSchema = z.object({
	id: z.string(),
});

const linkOutputSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	createdBy: z.string(),
	slug: z.string(),
	name: z.string(),
	targetUrl: z.string(),
	expiresAt: z.nullable(z.coerce.date()),
	expiredRedirectUrl: z.string().nullable(),
	ogTitle: z.string().nullable(),
	ogDescription: z.string().nullable(),
	ogImageUrl: z.string().nullable(),
	ogVideoUrl: z.string().nullable(),
	iosUrl: z.string().nullable(),
	androidUrl: z.string().nullable(),
	externalId: z.string().nullable(),
	deletedAt: z.nullable(z.coerce.date()),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

function validateHttpUrl(url: string): void {
	const parsed = new URL(url);
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw rpcError.badRequest(
			"Target URL must be an absolute HTTP or HTTPS URL"
		);
	}
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
				"Returns all links for the given organization. Requires read:links scope.",
			spec: (s) => ({ ...s, "x-required-scopes": ["read:links"] as const }),
		})
		.input(listLinksSchema)
		.output(z.array(linkOutputSchema))
		.handler(async ({ context, input }) => {
			await withLinksAccess(context, {
				organizationId: input.organizationId,
				permission: "read",
			});

			const conditions = [eq(links.organizationId, input.organizationId)];
			if (input.externalId) {
				conditions.push(eq(links.externalId, input.externalId));
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
			description: "Returns a single link by id. Requires read:links scope.",
			spec: (s) => ({ ...s, "x-required-scopes": ["read:links"] as const }),
		})
		.input(getLinkSchema)
		.output(linkOutputSchema)
		.handler(async ({ context, input }) => {
			await withLinksAccess(context, {
				organizationId: input.organizationId,
				permission: "read",
			});

			const result = await context.db
				.select()
				.from(links)
				.where(
					and(
						eq(links.id, input.id),
						eq(links.organizationId, input.organizationId)
					)
				)
				.limit(1);

			if (result.length === 0) {
				throw rpcError.notFound("link", input.id);
			}

			return result[0];
		}),

	create: protectedProcedure
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
			const workspace = await withLinksAccess(context, {
				organizationId: input.organizationId,
				permission: "create",
			});

			validateHttpUrl(input.targetUrl);
			const createdBy = await workspace.getCreatedBy();

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
							organizationId: input.organizationId,
							createdBy,
							name: input.name,
							targetUrl: input.targetUrl,
							expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
							expiredRedirectUrl: input.expiredRedirectUrl ?? null,
							ogTitle: input.ogTitle ?? null,
							ogDescription: input.ogDescription ?? null,
							ogImageUrl: input.ogImageUrl ?? null,
							ogVideoUrl: input.ogVideoUrl ?? null,
							iosUrl: input.iosUrl ?? null,
							androidUrl: input.androidUrl ?? null,
							externalId: input.externalId ?? null,
						})
						.returning();

					await setCachedLink(slug, toCachedLink(newLink)).catch((err) =>
						logger.error(
							{ slug, linkId: newLink.id, error: String(err) },
							"Failed to cache link after create"
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

	update: protectedProcedure
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
			await withLinksAccess(context, {
				organizationId: link.organizationId,
				permission: "update",
			});

			if (input.targetUrl) {
				validateHttpUrl(input.targetUrl);
			}

			const { id, expiresAt, ...updates } = input;
			const oldSlug = link.slug;

			try {
				const [updatedLink] = await context.db
					.update(links)
					.set({
						...updates,
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

				await Promise.all([
					oldSlug === updatedLink.slug
						? Promise.resolve()
						: invalidateLinkCache(oldSlug),
					setCachedLink(updatedLink.slug, toCachedLink(updatedLink)),
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

	delete: protectedProcedure
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

			await withLinksAccess(context, {
				organizationId: link.organizationId,
				permission: "delete",
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

			// Hard delete the link
			await context.db.delete(links).where(eq(links.id, input.id));

			return { success: true };
		}),
};
