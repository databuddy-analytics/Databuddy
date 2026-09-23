import { randomUUID } from "node:crypto";
import { eq } from "@databuddy/db";
import { chQuery } from "@databuddy/db/clickhouse";
import { revenueConfig } from "@databuddy/db/schema";
import { z } from "zod";
import { rpcError } from "../errors";
import { auditedSessionProcedure, protectedProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";
import { revenueUpsertInputSchema } from "./revenue.schemas";

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
						permissions: ["update"],
					});

			const ownerId = workspace.organizationId;

			const config = await context.db.query.revenueConfig.findFirst({
				where: input.websiteId
					? { ownerId, websiteId: input.websiteId }
					: { ownerId, websiteId: { isNull: true } },
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

	stripeWebhookEvents: protectedProcedure
		.route({
			description:
				"Returns the last time each Stripe webhook event was received. Requires read permission.",
			method: "POST",
			path: "/revenue/stripeWebhookEvents",
			summary: "Get Stripe webhook event health",
			tags: ["Revenue"],
		})
		.input(z.object({ websiteId: z.string().optional() }))
		.output(
			z.array(
				z.object({
					eventType: z.string(),
					lastReceivedAt: z.string(),
				})
			)
		)
		.handler(async ({ context, input }) => {
			const workspace = input.websiteId
				? await withWorkspace(context, {
						websiteId: input.websiteId,
						permissions: ["read"],
					})
				: await withWorkspace(context, {
						resource: "website",
						permissions: ["update"],
					});

			const rows = await chQuery<{
				event_type: string;
				last_received_at: string;
			}>(
				`SELECT
					JSONExtractString(metadata, 'stripe_event_type') AS event_type,
					formatDateTime(max(synced_at), '%Y-%m-%dT%H:%i:%SZ') AS last_received_at
				FROM analytics.revenue
				WHERE owner_id = {ownerId:String}
					${input.websiteId ? "AND website_id = {websiteId:String}" : ""}
					AND provider = 'stripe'
					AND synced_at >= now() - INTERVAL 90 DAY
					AND JSONExtractString(metadata, 'stripe_event_type') != ''
				GROUP BY event_type`,
				{
					ownerId: workspace.organizationId,
					...(input.websiteId ? { websiteId: input.websiteId } : {}),
				}
			);

			return rows.map((row) => ({
				eventType: row.event_type,
				lastReceivedAt: row.last_received_at,
			}));
		}),

	upsert: auditedSessionProcedure
		.route({
			description:
				"Creates or updates revenue config. Requires configure permission.",
			method: "POST",
			path: "/revenue/upsert",
			summary: "Upsert revenue config",
			tags: ["Revenue"],
		})
		.input(revenueUpsertInputSchema)
		.output(revenueOutputSchema)
		.handler(async ({ context, input }) => {
			const workspace = input.websiteId
				? await withWorkspace(context, {
						websiteId: input.websiteId,
						permissions: ["update"],
					})
				: await withWorkspace(context, {
						resource: "website",
						permissions: ["update"],
					});

			const ownerId = workspace.organizationId;

			const existing = await context.db.query.revenueConfig.findFirst({
				where: input.websiteId
					? { ownerId, websiteId: input.websiteId }
					: { ownerId, websiteId: { isNull: true } },
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
					id: randomUUID(),
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

	regenerateHash: auditedSessionProcedure
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
			const workspace = input.websiteId
				? await withWorkspace(context, {
						websiteId: input.websiteId,
						permissions: ["update"],
					})
				: await withWorkspace(context, {
						resource: "website",
						permissions: ["update"],
					});

			const ownerId = workspace.organizationId;

			const existing = await context.db.query.revenueConfig.findFirst({
				where: input.websiteId
					? { ownerId, websiteId: input.websiteId }
					: { ownerId, websiteId: { isNull: true } },
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
};
