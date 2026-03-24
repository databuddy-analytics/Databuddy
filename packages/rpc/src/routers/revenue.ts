import { and, eq, isNull, revenueConfig } from "@databuddy/db";
import { createId } from "@databuddy/shared/utils/ids";
import { z } from "zod";
import { rpcError } from "../errors";
import { protectedProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

function generateHash(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

const revenueOutputSchema = z.record(z.string(), z.unknown());

export const revenueRouter = {
	get: protectedProcedure
		.route({
			description:
				"Returns revenue config for website or org. Requires configure permission.",
			method: "POST",
			path: "/revenue/get",
			summary: "Get revenue config",
			tags: ["Revenue"],
		})
		.input(z.object({ websiteId: z.string().optional() }))
		.output(revenueOutputSchema.nullable())
		.handler(async ({ context, input }) => {
			const workspace = input.websiteId
				? await withWorkspace(context, {
						websiteId: input.websiteId,
						permissions: ["read"],
					})
				: await withWorkspace(context, {
						resource: "website",
						permissions: ["configure"],
					});

			const ownerId = workspace.organizationId;

			const config = await context.db.query.revenueConfig.findFirst({
				where: input.websiteId
					? and(
							eq(revenueConfig.ownerId, ownerId),
							eq(revenueConfig.websiteId, input.websiteId)
						)
					: and(
							eq(revenueConfig.ownerId, ownerId),
							isNull(revenueConfig.websiteId)
						),
			});

			if (!config) {
				return null;
			}

			return {
				id: config.id,
				websiteId: config.websiteId,
				webhookHash: config.webhookHash,
				stripeConfigured: Boolean(config.stripeWebhookSecret),
				paddleConfigured: Boolean(config.paddleWebhookSecret),
				currency: config.currency,
				createdAt: config.createdAt,
				updatedAt: config.updatedAt,
			};
		}),

	upsert: protectedProcedure
		.route({
			description:
				"Creates or updates revenue config. Requires configure permission.",
			method: "POST",
			path: "/revenue/upsert",
			summary: "Upsert revenue config",
			tags: ["Revenue"],
		})
		.input(
			z.object({
				websiteId: z.string().optional(),
				stripeWebhookSecret: z.string().optional(),
				paddleWebhookSecret: z.string().optional(),
				currency: z.string().length(3).optional(),
			})
		)
		.output(revenueOutputSchema)
		.handler(async ({ context, input }) => {
			const workspace = await withWorkspace(context, {
				...(input.websiteId
					? { websiteId: input.websiteId }
					: { resource: "website" as const }),
				permissions: ["configure"],
			});

			const ownerId = workspace.organizationId;

			const existing = await context.db.query.revenueConfig.findFirst({
				where: input.websiteId
					? and(
							eq(revenueConfig.ownerId, ownerId),
							eq(revenueConfig.websiteId, input.websiteId)
						)
					: and(
							eq(revenueConfig.ownerId, ownerId),
							isNull(revenueConfig.websiteId)
						),
			});

			if (existing) {
				const [updated] = await context.db
					.update(revenueConfig)
					.set({
						stripeWebhookSecret:
							input.stripeWebhookSecret ?? existing.stripeWebhookSecret,
						paddleWebhookSecret:
							input.paddleWebhookSecret ?? existing.paddleWebhookSecret,
						currency: input.currency ?? existing.currency,
						updatedAt: new Date(),
					})
					.where(eq(revenueConfig.id, existing.id))
					.returning();

				return {
					id: updated.id,
					websiteId: updated.websiteId,
					webhookHash: updated.webhookHash,
					stripeConfigured: Boolean(updated.stripeWebhookSecret),
					paddleConfigured: Boolean(updated.paddleWebhookSecret),
					currency: updated.currency,
				};
			}

			const [created] = await context.db
				.insert(revenueConfig)
				.values({
					id: createId(),
					ownerId,
					websiteId: input.websiteId || null,
					webhookHash: generateHash(),
					stripeWebhookSecret: input.stripeWebhookSecret || null,
					paddleWebhookSecret: input.paddleWebhookSecret || null,
					currency: input.currency || "USD",
				})
				.returning();

			return {
				id: created.id,
				websiteId: created.websiteId,
				webhookHash: created.webhookHash,
				stripeConfigured: Boolean(created.stripeWebhookSecret),
				paddleConfigured: Boolean(created.paddleWebhookSecret),
				currency: created.currency,
			};
		}),

	regenerateHash: protectedProcedure
		.route({
			description: "Regenerates webhook hash. Requires configure permission.",
			method: "POST",
			path: "/revenue/regenerateHash",
			summary: "Regenerate hash",
			tags: ["Revenue"],
		})
		.input(z.object({ websiteId: z.string().optional() }))
		.output(z.object({ webhookHash: z.string() }))
		.handler(async ({ context, input }) => {
			const workspace = await withWorkspace(context, {
				...(input.websiteId
					? { websiteId: input.websiteId }
					: { resource: "website" as const }),
				permissions: ["configure"],
			});

			const ownerId = workspace.organizationId;

			const existing = await context.db.query.revenueConfig.findFirst({
				where: input.websiteId
					? and(
							eq(revenueConfig.ownerId, ownerId),
							eq(revenueConfig.websiteId, input.websiteId)
						)
					: and(
							eq(revenueConfig.ownerId, ownerId),
							isNull(revenueConfig.websiteId)
						),
			});

			if (!existing) {
				throw rpcError.notFound("Revenue config");
			}

			const newHash = generateHash();

			await context.db
				.update(revenueConfig)
				.set({ webhookHash: newHash, updatedAt: new Date() })
				.where(eq(revenueConfig.id, existing.id));

			return { webhookHash: newHash };
		}),

	delete: protectedProcedure
		.route({
			description: "Deletes revenue config. Requires configure permission.",
			method: "POST",
			path: "/revenue/delete",
			summary: "Delete revenue config",
			tags: ["Revenue"],
		})
		.input(z.object({ websiteId: z.string().optional() }))
		.output(z.object({ deleted: z.literal(true) }))
		.handler(async ({ context, input }) => {
			const workspace = await withWorkspace(context, {
				...(input.websiteId
					? { websiteId: input.websiteId }
					: { resource: "website" as const }),
				permissions: ["configure"],
			});

			const ownerId = workspace.organizationId;

			const existing = await context.db.query.revenueConfig.findFirst({
				where: input.websiteId
					? and(
							eq(revenueConfig.ownerId, ownerId),
							eq(revenueConfig.websiteId, input.websiteId)
						)
					: and(
							eq(revenueConfig.ownerId, ownerId),
							isNull(revenueConfig.websiteId)
						),
			});

			if (!existing) {
				throw rpcError.notFound("Revenue config");
			}

			await context.db
				.delete(revenueConfig)
				.where(eq(revenueConfig.id, existing.id));

			return { deleted: true };
		}),
};
