import { randomUUID } from "node:crypto";
import { websitesApi } from "@databuddy/auth";
import { and, desc, eq, flags, isNull } from "@databuddy/db";
import { createDrizzleCache, redis } from "@databuddy/redis";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import type { Context } from "../orpc";
import { protectedProcedure, publicProcedure } from "../orpc";
import { authorizeWebsiteAccess } from "../utils/auth";

const flagsCache = createDrizzleCache({ redis, namespace: "flags" });
const CACHE_DURATION = 60;

const getScope = (websiteId?: string, organizationId?: string) =>
	websiteId ? `website:${websiteId}` : `org:${organizationId}`;

const authorizeScope = async (
	context: Context,
	websiteId?: string,
	organizationId?: string,
	permission: "read" | "update" | "delete" = "read"
) => {
	if (websiteId) {
		await authorizeWebsiteAccess(context, websiteId, permission);
	} else if (organizationId) {
		const headersObj: Record<string, string> = {};
		context.headers.forEach((value, key) => {
			headersObj[key] = value;
		});
		const perm = permission === "read" ? "read" : "create";
		const { success } = await websitesApi.hasPermission({
			headers: headersObj,
			body: { permissions: { website: [perm] } },
		});
		if (!success) {
			throw new ORPCError("FORBIDDEN", {
				message: "Missing organization permissions.",
			});
		}
	}
};

const getScopeCondition = (
	websiteId?: string,
	organizationId?: string,
	userId?: string
) => {
	if (websiteId) {
		return eq(flags.websiteId, websiteId);
	}
	if (organizationId) {
		return eq(flags.organizationId, organizationId);
	}
	if (userId) {
		return eq(flags.userId, userId);
	}
	return eq(flags.organizationId, "");
};

const invalidateFlagCache = async (
	id: string,
	websiteId?: string | null,
	organizationId?: string | null
) => {
	const scope = getScope(websiteId ?? undefined, organizationId ?? undefined);
	await Promise.all([
		flagsCache.invalidateByTables(["flags"]),
		flagsCache.invalidateByKey(`byId:${id}:${scope}`),
	]);
};

const userRuleSchema = z.object({
	type: z.enum(["user_id", "email", "property"]),
	operator: z.enum([
		"equals",
		"contains",
		"starts_with",
		"ends_with",
		"in",
		"not_in",
		"exists",
		"not_exists",
	]),
	field: z.string().optional(),
	value: z.string().optional(),
	values: z.array(z.string()).optional(),
	enabled: z.boolean(),
	batch: z.boolean().default(false),
	batchValues: z.array(z.string()).optional(),
});

const flagSchema = z.object({
	key: z
		.string()
		.min(1)
		.max(100)
		.regex(
			/^[a-zA-Z0-9_-]+$/,
			"Key must contain only letters, numbers, underscores, and hyphens"
		),
	name: z.string().min(1).max(100).optional(),
	description: z.string().optional(),
	type: z.enum(["boolean", "rollout"]).default("boolean"),
	status: z.enum(["active", "inactive", "archived"]).default("active"),
	defaultValue: z.boolean().default(false),
	payload: z.any().optional(),
	rules: z.array(userRuleSchema).default([]),
	persistAcrossAuth: z.boolean().default(false),
	rolloutPercentage: z.number().min(0).max(100).default(0),
});

const listFlagsSchema = z
	.object({
		websiteId: z.string().optional(),
		organizationId: z.string().optional(),
		status: z.enum(["active", "inactive", "archived"]).optional(),
	})
	.refine((data) => data.websiteId || data.organizationId, {
		message: "Either websiteId or organizationId must be provided",
		path: ["websiteId"],
	});

const getFlagSchema = z
	.object({
		id: z.string(),
		websiteId: z.string().optional(),
		organizationId: z.string().optional(),
	})
	.refine((data) => data.websiteId || data.organizationId, {
		message: "Either websiteId or organizationId must be provided",
		path: ["websiteId"],
	});

const getFlagByKeySchema = z
	.object({
		key: z.string(),
		websiteId: z.string().optional(),
		organizationId: z.string().optional(),
	})
	.refine((data) => data.websiteId || data.organizationId, {
		message: "Either websiteId or organizationId must be provided",
		path: ["websiteId"],
	});

const createFlagSchema = z
	.object({
		websiteId: z.string().optional(),
		organizationId: z.string().optional(),
		...flagSchema.shape,
	})
	.refine((data) => data.websiteId || data.organizationId, {
		message: "Either websiteId or organizationId must be provided",
		path: ["websiteId"],
	});

const updateFlagSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100).optional(),
	description: z.string().optional(),
	type: z.enum(["boolean", "rollout"]).optional(),
	status: z.enum(["active", "inactive", "archived"]).optional(),
	defaultValue: z.boolean().optional(),
	payload: z.any().optional(),
	rules: z.array(userRuleSchema).optional(),
	persistAcrossAuth: z.boolean().optional(),
	rolloutPercentage: z.number().min(0).max(100).optional(),
});

export const flagsRouter = {
	list: publicProcedure.input(listFlagsSchema).handler(({ context, input }) => {
		const scope = getScope(input.websiteId, input.organizationId);
		const cacheKey = `list:${scope}:${input.status || "all"}`;

		return flagsCache.withCache({
			key: cacheKey,
			ttl: CACHE_DURATION,
			tables: ["flags"],
			queryFn: async () => {
				await authorizeScope(
					context,
					input.websiteId,
					input.organizationId,
					"read"
				);

				const conditions = [
					isNull(flags.deletedAt),
					getScopeCondition(input.websiteId, input.organizationId),
				];

				if (input.status) {
					conditions.push(eq(flags.status, input.status));
				}

				return context.db
					.select()
					.from(flags)
					.where(and(...conditions))
					.orderBy(desc(flags.createdAt));
			},
		});
	}),

	getById: publicProcedure
		.input(getFlagSchema)
		.handler(({ context, input }) => {
			const scope = getScope(input.websiteId, input.organizationId);
			const cacheKey = `byId:${input.id}:${scope}`;

			return flagsCache.withCache({
				key: cacheKey,
				ttl: CACHE_DURATION,
				tables: ["flags"],
				queryFn: async () => {
					await authorizeScope(
						context,
						input.websiteId,
						input.organizationId,
						"read"
					);

					const result = await context.db
						.select()
						.from(flags)
						.where(
							and(
								eq(flags.id, input.id),
								getScopeCondition(input.websiteId, input.organizationId),
								isNull(flags.deletedAt)
							)
						)
						.limit(1);

					if (result.length === 0) {
						throw new ORPCError("NOT_FOUND", {
							message: "Flag not found",
						});
					}

					return result[0];
				},
			});
		}),

	getByKey: publicProcedure
		.input(getFlagByKeySchema)
		.handler(({ context, input }) => {
			const scope = getScope(input.websiteId, input.organizationId);
			const cacheKey = `byKey:${input.key}:${scope}`;

			return flagsCache.withCache({
				key: cacheKey,
				ttl: CACHE_DURATION,
				tables: ["flags"],
				queryFn: async () => {
					await authorizeScope(
						context,
						input.websiteId,
						input.organizationId,
						"read"
					);

					const result = await context.db
						.select()
						.from(flags)
						.where(
							and(
								eq(flags.key, input.key),
								getScopeCondition(input.websiteId, input.organizationId),
								eq(flags.status, "active"),
								isNull(flags.deletedAt)
							)
						)
						.limit(1);

					if (result.length === 0) {
						throw new ORPCError("NOT_FOUND", {
							message: "Flag not found",
						});
					}

					return result[0];
				},
			});
		}),

	create: protectedProcedure
		.input(createFlagSchema)
		.handler(async ({ context, input }) => {
			await authorizeScope(
				context,
				input.websiteId,
				input.organizationId,
				"update"
			);

			const existingFlag = await context.db
				.select()
				.from(flags)
				.where(
					and(
						eq(flags.key, input.key),
						getScopeCondition(
							input.websiteId,
							input.organizationId,
							context.user.id
						)
					)
				)
				.limit(1);

			if (existingFlag.length > 0) {
				if (!existingFlag[0].deletedAt) {
					throw new ORPCError("CONFLICT", {
						message: "A flag with this key already exists in this scope",
					});
				}

				const [restoredFlag] = await context.db
					.update(flags)
					.set({
						name: input.name || existingFlag[0].name,
						description: input.description ?? existingFlag[0].description,
						type: input.type,
						status: input.status,
						defaultValue: input.defaultValue,
						payload: input.payload ?? existingFlag[0].payload,
						rules: input.rules || existingFlag[0].rules || [],
						persistAcrossAuth:
							input.persistAcrossAuth ??
							existingFlag[0].persistAcrossAuth ??
							false,
						rolloutPercentage:
							input.rolloutPercentage || existingFlag[0].rolloutPercentage || 0,
						deletedAt: null,
						updatedAt: new Date(),
					})
					.where(eq(flags.id, existingFlag[0].id))
					.returning();

				await flagsCache.invalidateByTables(["flags"]);

				return restoredFlag;
			}

			const [newFlag] = await context.db
				.insert(flags)
				.values({
					id: randomUUID(),
					key: input.key,
					name: input.name || null,
					description: input.description || null,
					type: input.type,
					status: input.status,
					defaultValue: input.defaultValue,
					payload: input.payload || null,
					rules: input.rules || [],
					persistAcrossAuth: input.persistAcrossAuth ?? false,
					rolloutPercentage: input.rolloutPercentage || 0,
					websiteId: input.websiteId || null,
					organizationId: input.organizationId || null,
					userId: input.websiteId ? null : context.user.id,
					createdBy: context.user.id,
				})
				.returning();

			await flagsCache.invalidateByTables(["flags"]);

			return newFlag;
		}),

	update: protectedProcedure
		.input(updateFlagSchema)
		.handler(async ({ context, input }) => {
			const existingFlag = await context.db
				.select({
					websiteId: flags.websiteId,
					organizationId: flags.organizationId,
					userId: flags.userId,
				})
				.from(flags)
				.where(and(eq(flags.id, input.id), isNull(flags.deletedAt)))
				.limit(1);

			if (existingFlag.length === 0) {
				throw new ORPCError("NOT_FOUND", {
					message: "Flag not found",
				});
			}

			const flag = existingFlag[0];

			if (flag.websiteId) {
				await authorizeWebsiteAccess(context, flag.websiteId, "update");
			} else if (
				flag.userId &&
				flag.userId !== context.user.id &&
				context.user.role !== "ADMIN"
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "Not authorized to update this flag",
				});
			}

			const { id, ...updates } = input;
			const [updatedFlag] = await context.db
				.update(flags)
				.set({
					...updates,
					updatedAt: new Date(),
				})
				.where(and(eq(flags.id, id), isNull(flags.deletedAt)))
				.returning();

			await invalidateFlagCache(id, flag.websiteId, flag.organizationId);

			return updatedFlag;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ context, input }) => {
			const existingFlag = await context.db
				.select({
					websiteId: flags.websiteId,
					organizationId: flags.organizationId,
					userId: flags.userId,
				})
				.from(flags)
				.where(and(eq(flags.id, input.id), isNull(flags.deletedAt)))
				.limit(1);

			if (existingFlag.length === 0) {
				throw new ORPCError("NOT_FOUND", {
					message: "Flag not found",
				});
			}

			const flag = existingFlag[0];

			if (flag.websiteId) {
				await authorizeWebsiteAccess(context, flag.websiteId, "delete");
			} else if (
				flag.userId &&
				flag.userId !== context.user.id &&
				context.user.role !== "ADMIN"
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "Not authorized to delete this flag",
				});
			}

			await context.db
				.update(flags)
				.set({
					deletedAt: new Date(),
					status: "archived",
				})
				.where(and(eq(flags.id, input.id), isNull(flags.deletedAt)));

			await invalidateFlagCache(input.id, flag.websiteId, flag.organizationId);

			return { success: true };
		}),
};
