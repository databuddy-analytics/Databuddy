import { websitesApi } from "@databuddy/auth";
import {
	and,
	chQuery,
	desc,
	eq,
	isNull,
	links,
} from "@databuddy/db";
import { ORPCError } from "@orpc/server";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import type { Context } from "../orpc";
import { protectedProcedure } from "../orpc";

const BASE62_CHARS =
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function generateSlug(): string {
	const bytes = new Uint8Array(8);
	crypto.getRandomValues(bytes);
	let slug = "";
	for (let i = 0; i < 8; i++) {
		slug += BASE62_CHARS[bytes[i] % 62];
	}
	return slug;
}

async function authorizeOrganizationAccess(
	context: Context,
	organizationId: string,
	permission: "read" | "create" | "update" | "delete" = "read"
): Promise<void> {
	if (!context.user) {
		throw new ORPCError("UNAUTHORIZED", {
			message: "Authentication is required",
		});
	}

	if (context.user.role === "ADMIN") {
		return;
	}

	const headersObj: Record<string, string> = {};
	context.headers.forEach((value, key) => {
		headersObj[key] = value;
	});

	const perm = permission === "read" ? "read" : permission === "delete" ? "delete" : "create";
	const { success } = await websitesApi.hasPermission({
		headers: headersObj,
		body: { permissions: { website: [perm] } },
	});

	if (!success) {
		throw new ORPCError("FORBIDDEN", {
			message: "You do not have permission to access this organization",
		});
	}
}

const listLinksSchema = z.object({
	organizationId: z.string(),
});

const getLinkSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
});

const createLinkSchema = z.object({
	organizationId: z.string(),
	name: z.string().min(1).max(255),
	targetUrl: z.string().url(),
});

const updateLinkSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(255).optional(),
	targetUrl: z.string().url().optional(),
});

const deleteLinkSchema = z.object({
	id: z.string(),
});

const getLinkStatsSchema = z.object({
	id: z.string(),
	from: z.string().optional(),
	to: z.string().optional(),
});

export const linksRouter = {
	list: protectedProcedure
		.input(listLinksSchema)
		.handler(async ({ context, input }) => {
			await authorizeOrganizationAccess(context, input.organizationId, "read");

			return context.db
				.select()
				.from(links)
				.where(
					and(
						eq(links.workspaceId, input.organizationId),
						isNull(links.deletedAt)
					)
				)
				.orderBy(desc(links.createdAt));
		}),

	get: protectedProcedure
		.input(getLinkSchema)
		.handler(async ({ context, input }) => {
			await authorizeOrganizationAccess(context, input.organizationId, "read");

			const result = await context.db
				.select()
				.from(links)
				.where(
					and(
						eq(links.id, input.id),
						eq(links.workspaceId, input.organizationId),
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
			await authorizeOrganizationAccess(
				context,
				input.organizationId,
				"create"
			);

			// Validate targetUrl is absolute http/https
			const url = new URL(input.targetUrl);
			if (url.protocol !== "http:" && url.protocol !== "https:") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Target URL must be an absolute HTTP or HTTPS URL",
				});
			}

			// Generate unique slug with retry on collision
			// Generate unique slug with retry on collision
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
							workspaceId: input.organizationId,
							createdById: context.user.id,
							slug,
							name: input.name,
							targetUrl: input.targetUrl,
						})
						.returning();
					return newLink;
				} catch (error) {
					// If unique constraint violation, retry with new slug
					if (error?.code === '23505' && error?.constraint === 'links_slug_unique') {
						attempts++;
						continue;
					}
					throw error;
				}
			}

			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Failed to generate unique slug",
			});

			const linkId = randomUUIDv7();
			const [newLink] = await context.db
				.insert(links)
				.values({
					id: linkId,
					workspaceId: input.organizationId,
					createdById: context.user.id,
					slug,
					name: input.name,
					targetUrl: input.targetUrl,
				})
				.returning();

			return newLink;
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
			await authorizeOrganizationAccess(context, link.workspaceId, "update");

			// Validate targetUrl if provided
			if (input.targetUrl) {
				const url = new URL(input.targetUrl);
				if (url.protocol !== "http:" && url.protocol !== "https:") {
					throw new ORPCError("BAD_REQUEST", {
						message: "Target URL must be an absolute HTTP or HTTPS URL",
					});
				}
			}

			const { id, ...updates } = input;
			const [updatedLink] = await context.db
				.update(links)
				.set({
					...updates,
					updatedAt: new Date(),
				})
				.where(eq(links.id, id))
				.returning();

			return updatedLink;
		}),

	delete: protectedProcedure
		.input(deleteLinkSchema)
		.handler(async ({ context, input }) => {
			const existingLink = await context.db
				.select({ workspaceId: links.workspaceId })
				.from(links)
				.where(and(eq(links.id, input.id), isNull(links.deletedAt)))
				.limit(1);

			if (existingLink.length === 0) {
				throw new ORPCError("NOT_FOUND", {
					message: "Link not found",
				});
			}

			await authorizeOrganizationAccess(
				context,
				existingLink[0].workspaceId,
				"delete"
			);

			await context.db
				.update(links)
				.set({ deletedAt: new Date() })
				.where(eq(links.id, input.id));

			return { success: true };
		}),

	stats: protectedProcedure
		.input(getLinkStatsSchema)
		.handler(async ({ context, input }) => {
			const existingLink = await context.db
				.select({ workspaceId: links.workspaceId })
				.from(links)
				.where(and(eq(links.id, input.id), isNull(links.deletedAt)))
				.limit(1);

			if (existingLink.length === 0) {
				throw new ORPCError("NOT_FOUND", {
					message: "Link not found",
				});
			}

			await authorizeOrganizationAccess(
				context,
				existingLink[0].workspaceId,
				"read"
			);

			const fromDate = input.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
			const toDate = input.to || new Date().toISOString();

			// Total clicks
			const totalClicksResult = await chQuery<{ total: number }>(
				`SELECT count() as total
				FROM analytics.link_visits
				WHERE link_id = {linkId:String}
					AND visited_at >= {from:DateTime64(3)}
					AND visited_at <= {to:DateTime64(3)}`,
				{ linkId: input.id, from: fromDate, to: toDate }
			);

			// Clicks by day
			const clicksByDayResult = await chQuery<{ date: string; clicks: number }>(
				`SELECT
					toDate(visited_at) as date,
					count() as clicks
				FROM analytics.link_visits
				WHERE link_id = {linkId:String}
					AND visited_at >= {from:DateTime64(3)}
					AND visited_at <= {to:DateTime64(3)}
				GROUP BY date
				ORDER BY date`,
				{ linkId: input.id, from: fromDate, to: toDate }
			);

			// Top referrers
			const topReferrersResult = await chQuery<{ referer: string; clicks: number }>(
				`SELECT
					coalesce(referer, 'Direct') as referer,
					count() as clicks
				FROM analytics.link_visits
				WHERE link_id = {linkId:String}
					AND visited_at >= {from:DateTime64(3)}
					AND visited_at <= {to:DateTime64(3)}
				GROUP BY referer
				ORDER BY clicks DESC
				LIMIT 10`,
				{ linkId: input.id, from: fromDate, to: toDate }
			);

			// Top countries
			const topCountriesResult = await chQuery<{ country: string; clicks: number }>(
				`SELECT
					coalesce(country, 'Unknown') as country,
					count() as clicks
				FROM analytics.link_visits
				WHERE link_id = {linkId:String}
					AND visited_at >= {from:DateTime64(3)}
					AND visited_at <= {to:DateTime64(3)}
				GROUP BY country
				ORDER BY clicks DESC
				LIMIT 10`,
				{ linkId: input.id, from: fromDate, to: toDate }
			);

			return {
				totalClicks: totalClicksResult[0]?.total ?? 0,
				clicksByDay: clicksByDayResult,
				topReferrers: topReferrersResult,
				topCountries: topCountriesResult,
			};
		}),
};
