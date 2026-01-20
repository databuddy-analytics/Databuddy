import { and, desc, eq, isNull, links } from "@databuddy/db";
import {
	type CachedLink,
	invalidateLinkCache,
	setCachedLink,
} from "@databuddy/redis";
import { ORPCError } from "@orpc/server";
import { randomUUIDv7 } from "bun";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { protectedProcedure } from "../orpc";
import { withWorkspace, workspaceInputSchema } from "../procedures/with-workspace";

const generateSlug = customAlphabet(
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
	8
);

const listLinksSchema = workspaceInputSchema.extend({
	organizationId: z.string(),
});

const getLinkSchema = workspaceInputSchema.extend({
	id: z.string(),
	organizationId: z.string(),
});

const slugRegex = /^[a-zA-Z0-9_-]+$/;

const createLinkSchema = z.object({
	organizationId: z.string(),
	name: z.string().min(1).max(255),
	targetUrl: z.url(),
	slug: z
		.string()
		.min(3)
		.max(50)
		.regex(
			slugRegex,
			"Slug can only contain letters, numbers, hyphens, and underscores"
		)
		.optional(),
	expiresAt: z.date().nullable().optional(),
	expiredRedirectUrl: z.url().nullable().optional(),
	ogTitle: z.string().max(200).nullable().optional(),
	ogDescription: z.string().max(500).nullable().optional(),
	ogImageUrl: z.url().nullable().optional(),
	ogVideoUrl: z.url().nullable().optional(),
	iosUrl: z.url().nullable().optional(),
	androidUrl: z.url().nullable().optional(),
});

const updateLinkSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(255).optional(),
	targetUrl: z.url().optional(),
	slug: z
		.string()
		.min(3)
		.max(50)
		.regex(
			slugRegex,
			"Slug can only contain letters, numbers, hyphens, and underscores"
		)
		.optional(),
	expiresAt: z.string().datetime().nullable().optional(),
	expiredRedirectUrl: z.url().nullable().optional(),
	ogTitle: z.string().max(200).nullable().optional(),
	ogDescription: z.string().max(500).nullable().optional(),
	ogImageUrl: z.url().nullable().optional(),
	ogVideoUrl: z.url().nullable().optional(),
	iosUrl: z.url().nullable().optional(),
	androidUrl: z.url().nullable().optional(),
});

const deleteLinkSchema = z.object({
	id: z.string(),
});

interface LinkRecord {
	id: string;
	slug: string;
	targetUrl: string;
	expiresAt: Date | null;
	expiredRedirectUrl: string | null;
	ogTitle: string | null;
	ogDescription: string | null;
	ogImageUrl: string | null;
	ogVideoUrl: string | null;
	iosUrl: string | null;
	androidUrl: string | null;
}

function toCachedLink(link: LinkRecord): CachedLink {
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
		.input(listLinksSchema)
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "link",
				permissions: ["read"],
			});

			return context.db
				.select()
				.from(links)
				.where(
					and(
						eq(links.organizationId, input.organizationId),
						isNull(links.deletedAt)
					)
				)
				.orderBy(desc(links.createdAt));
		}),

	get: protectedProcedure
		.input(getLinkSchema)
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "link",
				permissions: ["read"],
			});

			const result = await context.db
				.select()
				.from(links)
				.where(
					and(
						eq(links.id, input.id),
						eq(links.organizationId, input.organizationId),
						isNull(links.deletedAt)
					)
				)
				.limit(1);

			if (result.length === 0) {
				throw new ORPCError("NOT_FOUND", {
					message: "Link not found",
				});
			}

			return result[0];
		}),

	create: protectedProcedure
		.input(createLinkSchema)
		.handler(async ({ context, input }) => {
			const workspace = await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "link",
				permissions: ["create"],
			});

			// User is guaranteed to exist after withWorkspace with permissions
			const userId = workspace.user?.id ?? context.user?.id;
			if (!userId) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Authentication is required",
				});
			}

			const url = new URL(input.targetUrl);
			if (url.protocol !== "http:" && url.protocol !== "https:") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Target URL must be an absolute HTTP or HTTPS URL",
				});
			}

			const linkValues = {
				organizationId: input.organizationId,
				createdBy: userId,
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
			};

			if (input.slug) {
				try {
					const linkId = randomUUIDv7();
					const [newLink] = await context.db
						.insert(links)
						.values({
							id: linkId,
							slug: input.slug,
							...linkValues,
						})
						.returning();

					await setCachedLink(input.slug, toCachedLink(newLink)).catch(() => { });

					return newLink;
				} catch (error) {
					const dbError = error as { code?: string; constraint?: string };
					if (
						dbError.code === "23505" &&
						dbError.constraint === "links_slug_unique"
					) {
						throw new ORPCError("CONFLICT", {
							message: "This slug is already taken",
						});
					}
					throw error;
				}
			}

			let slug = "";
			let attempts = 0;
			const maxAttempts = 10;

			while (attempts < maxAttempts) {
				slug = generateSlug();

				try {
					const linkId = randomUUIDv7();
					const [newLink] = await context.db
						.insert(links)
						.values({
							id: linkId,
							slug,
							...linkValues,
						})
						.returning();

					await setCachedLink(slug, toCachedLink(newLink)).catch(() => { });

					return newLink;
				} catch (error) {
					const dbError = error as { code?: string; constraint?: string };
					if (
						dbError.code === "23505" &&
						dbError.constraint === "links_slug_unique"
					) {
						attempts++;
						continue;
					}
					throw error;
				}
			}

			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Failed to generate unique slug",
			});
		}),

	update: protectedProcedure
		.input(updateLinkSchema)
		.handler(async ({ context, input }) => {
			const existingLink = await context.db
				.select()
				.from(links)
				.where(and(eq(links.id, input.id), isNull(links.deletedAt)))
				.limit(1);

			if (existingLink.length === 0) {
				throw new ORPCError("NOT_FOUND", {
					message: "Link not found",
				});
			}

			const link = existingLink[0];
			await withWorkspace(context, {
				organizationId: link.organizationId,
				resource: "link",
				permissions: ["update"],
			});

			if (input.targetUrl) {
				const url = new URL(input.targetUrl);
				if (url.protocol !== "http:" && url.protocol !== "https:") {
					throw new ORPCError("BAD_REQUEST", {
						message: "Target URL must be an absolute HTTP or HTTPS URL",
					});
				}
			}

			const { id, expiresAt, ...updates } = input;
			const oldSlug = link.slug;

			try {
				const [updatedLink] = await context.db
					.update(links)
					.set({
						...updates,
						expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : undefined,
						updatedAt: new Date(),
					})
					.where(eq(links.id, id))
					.returning();

				const newSlug = updatedLink.slug;

				// If slug changed, invalidate old slug cache
				if (newSlug !== oldSlug) {
					await invalidateLinkCache(oldSlug).catch(() => { });
				}

				// Write-through: cache the updated link
				await setCachedLink(newSlug, toCachedLink(updatedLink)).catch(() => { });

				return updatedLink;
			} catch (error) {
				const dbError = error as { code?: string; constraint?: string };
				if (
					dbError.code === "23505" &&
					dbError.constraint === "links_slug_unique"
				) {
					throw new ORPCError("CONFLICT", {
						message: "This slug is already taken",
					});
				}
				throw error;
			}
		}),

	delete: protectedProcedure
		.input(deleteLinkSchema)
		.handler(async ({ context, input }) => {
			const existingLink = await context.db
				.select({
					organizationId: links.organizationId,
					slug: links.slug,
				})
				.from(links)
				.where(and(eq(links.id, input.id), isNull(links.deletedAt)))
				.limit(1);

			if (existingLink.length === 0) {
				throw new ORPCError("NOT_FOUND", {
					message: "Link not found",
				});
			}

			const link = existingLink[0];

			await withWorkspace(context, {
				organizationId: link.organizationId,
				resource: "link",
				permissions: ["delete"],
			});

			await context.db
				.update(links)
				.set({ deletedAt: new Date() })
				.where(eq(links.id, input.id));

			// Invalidate the cache for this slug
			await invalidateLinkCache(link.slug).catch(() => { });

			return { success: true };
		}),
};
