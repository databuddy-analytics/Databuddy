import { and, desc, eq, isNull, withTransaction } from "@databuddy/db";
import { flagsToTargetGroups, targetGroups } from "@databuddy/db/schema";
import { createDrizzleCache, redis } from "@databuddy/redis";
import { userRuleSchema } from "@databuddy/shared/flags";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import { publicProcedure, trackedProcedure } from "../orpc";
import {
	withPublicWorkspace,
	withWebsiteRead,
	withWorkspace,
} from "../procedures/with-workspace";
import { invalidateFlagEvaluationCaches } from "../utils/flags";
import { scopedCacheKey } from "../utils/scoped-cache-key";

const targetGroupsCache = createDrizzleCache({
	redis,
	namespace: "targetGroups",
});
const flagsCache = createDrizzleCache({
	redis,
	namespace: "flags",
});
const CACHE_DURATION = 60;

const listSchema = z.object({
	websiteId: z.string(),
});

const getByIdSchema = z.object({
	id: z.string(),
	websiteId: z.string(),
});

const createSchema = z.object({
	websiteId: z.string(),
	name: z.string().min(1).max(100),
	description: z.string().max(500).optional(),
	color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
	rules: z.array(userRuleSchema),
});

const updateSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100).optional(),
	description: z.string().max(500).optional(),
	color: z
		.string()
		.regex(/^#[0-9A-Fa-f]{6}$/)
		.optional(),
	rules: z.array(userRuleSchema).optional(),
});

const deleteSchema = z.object({
	id: z.string(),
});

const targetGroupOutputSchema = z.record(z.string(), z.unknown());

const successOutputSchema = z.object({ success: z.literal(true) });

function requireAuthedTargetGroupRead(workspace: { tier: "authed" | "demo" }) {
	if (workspace.tier === "demo") {
		throw rpcError.unauthorized(
			"Target group definitions require authenticated workspace access"
		);
	}
}

export const targetGroupsRouter = {
	list: publicProcedure
		.route({
			description:
				"Returns all target groups for a website. Requires website read permission.",
			method: "POST",
			path: "/target-groups/list",
			summary: "List target groups",
			tags: ["Target Groups"],
		})
		.input(listSchema)
		.output(z.array(targetGroupOutputSchema))
		.handler(async ({ context, input }) => {
			const workspace = await withPublicWorkspace(context, {
				websiteId: input.websiteId,
				permissions: ["read"],
			});

			requireAuthedTargetGroupRead(workspace);

			return targetGroupsCache.withCache({
				key: scopedCacheKey("list", workspace, `website:${input.websiteId}`),
				ttl: CACHE_DURATION,
				tables: ["target_groups"],
				queryFn: async () => {
					const groupsList = await context.db
						.select()
						.from(targetGroups)
						.where(
							and(
								eq(targetGroups.websiteId, input.websiteId),
								isNull(targetGroups.deletedAt)
							)
						)
						.orderBy(desc(targetGroups.createdAt));

					return groupsList;
				},
			});
		}),

	getById: publicProcedure
		.route({
			description:
				"Returns a single target group by id. Requires website read permission.",
			method: "POST",
			path: "/target-groups/getById",
			summary: "Get target group",
			tags: ["Target Groups"],
		})
		.input(getByIdSchema)
		.output(targetGroupOutputSchema)
		.use(withWebsiteRead)
		.handler(async ({ context, input }) => {
			const { workspace } = context;
			requireAuthedTargetGroupRead(workspace);

			return await targetGroupsCache.withCache({
				key: scopedCacheKey(
					"byId",
					workspace,
					`website:${input.websiteId}`,
					`id:${input.id}`
				),
				ttl: CACHE_DURATION,
				tables: ["target_groups"],
				queryFn: async () => {
					const row = await context.db.query.targetGroups.findFirst({
						where: {
							id: input.id,
							websiteId: input.websiteId,
							deletedAt: { isNull: true },
						},
					});
					if (!row) {
						throw rpcError.notFound("Target group", input.id);
					}
					return row;
				},
			});
		}),

	create: trackedProcedure
		.route({
			description:
				"Creates a new target group. Requires target groups feature and website update permission.",
			method: "POST",
			path: "/target-groups/create",
			summary: "Create target group",
			tags: ["Target Groups"],
		})
		.input(createSchema)
		.output(targetGroupOutputSchema)
		.handler(async ({ context, input }) => {
			const workspace = await withWorkspace(context, {
				websiteId: input.websiteId,
				resource: "flag",
				permissions: ["update"],
			});

			const createdBy = await workspace.getCreatedBy();

			const [newGroup] = await context.db
				.insert(targetGroups)
				.values({
					id: randomUUIDv7(),
					name: input.name,
					description: input.description ?? null,
					color: input.color,
					rules: input.rules,
					websiteId: input.websiteId,
					createdBy,
				})
				.returning();

			await targetGroupsCache.invalidateByTables(["target_groups"]);

			return newGroup;
		}),

	update: trackedProcedure
		.route({
			description:
				"Updates an existing target group. Requires website update permission.",
			method: "POST",
			path: "/target-groups/update",
			summary: "Update target group",
			tags: ["Target Groups"],
		})
		.input(updateSchema)
		.output(targetGroupOutputSchema)
		.handler(async ({ context, input }) => {
			const existingGroup = await context.db
				.select()
				.from(targetGroups)
				.where(
					and(eq(targetGroups.id, input.id), isNull(targetGroups.deletedAt))
				)
				.limit(1);

			if (existingGroup.length === 0) {
				throw rpcError.notFound("Target group", input.id);
			}

			const group = existingGroup[0];

			await withWorkspace(context, {
				websiteId: group.websiteId,
				resource: "flag",
				permissions: ["update"],
			});

			const { id, ...updates } = input;
			const [updatedGroup] = await context.db
				.update(targetGroups)
				.set({
					...updates,
					updatedAt: new Date(),
				})
				.where(and(eq(targetGroups.id, id), isNull(targetGroups.deletedAt)))
				.returning();

			await targetGroupsCache.invalidateByTables(["target_groups"]);
			await invalidateFlagEvaluationCaches(group.websiteId);

			return updatedGroup;
		}),

	delete: trackedProcedure
		.route({
			description:
				"Soft-deletes a target group. Requires website delete permission.",
			method: "POST",
			path: "/target-groups/delete",
			summary: "Delete target group",
			tags: ["Target Groups"],
		})
		.input(deleteSchema)
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const existingGroup = await context.db
				.select()
				.from(targetGroups)
				.where(
					and(eq(targetGroups.id, input.id), isNull(targetGroups.deletedAt))
				)
				.limit(1);

			if (existingGroup.length === 0) {
				throw rpcError.notFound("Target group", input.id);
			}

			const group = existingGroup[0];

			await withWorkspace(context, {
				websiteId: group.websiteId,
				resource: "flag",
				permissions: ["delete"],
			});

			await withTransaction(async (tx) => {
				await tx
					.delete(flagsToTargetGroups)
					.where(eq(flagsToTargetGroups.targetGroupId, input.id));

				await tx
					.update(targetGroups)
					.set({ deletedAt: new Date() })
					.where(
						and(eq(targetGroups.id, input.id), isNull(targetGroups.deletedAt))
					);
			});

			await targetGroupsCache.invalidateByTables(["target_groups"]);
			await flagsCache.invalidateByTables(["flags", "flags_to_target_groups"]);
			await invalidateFlagEvaluationCaches(group.websiteId);

			return { success: true };
		}),
};
