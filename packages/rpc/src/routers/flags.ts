import { randomUUID } from "node:crypto";
import { websitesApi } from "@databuddy/auth";
import { and, desc, eq, flags, inArray, isNull } from "@databuddy/db";
import { createDrizzleCache, redis } from "@databuddy/redis";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import type { Context } from "../orpc";
import { protectedProcedure, publicProcedure } from "../orpc";
import { authorizeWebsiteAccess } from "../utils/auth";
import { flagFormSchema, userRuleSchema, variantSchema, } from "@databuddy/shared/flags";
import { getScopeCondition, handleFlagUpdateDependencyCascading } from "@databuddy/shared/flags/utils";
import { getCacheAuthContext } from "../utils/cache-keys";

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
		payload: z.any().optional(),
		persistAcrossAuth: z.boolean().optional(),
		...flagFormSchema.shape,
	})
	.refine((data) => data.websiteId || data.organizationId, {
		message: "Either websiteId or organizationId must be provided",
		path: ["websiteId"],
	});

const updateFlagSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100).optional(),
	description: z.string().optional(),
	type: z.enum(["boolean", "rollout", "multivariant"]).optional(),
	status: z.enum(["active", "inactive", "archived"]).optional(),
	defaultValue: z.boolean().optional(),
	payload: z.any().optional(),
	rules: z.array(userRuleSchema).optional(),
	persistAcrossAuth: z.boolean().optional(),
	rolloutPercentage: z.number().min(0).max(100).optional(),
	variants: z.array(variantSchema).optional(),
	dependencies: z.array(z.string()).optional(),
	forceCancelScheduledRollout: z.boolean().optional(),
}).passthrough().superRefine((data, ctx) => {
	if (data.type === "multivariant" && data.variants) {
		const hasAnyWeight = data.variants.some((v) => typeof v.weight === "number");
		if (hasAnyWeight) {
			const totalWeight = data.variants.reduce((sum, v) => sum + (typeof v.weight === "number" ? v.weight : 0), 0);
			if (totalWeight !== 100) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["variants"],
					message: "When specifying weights, they must sum to 100%",
				});
			}
		}
	}
});

const checkCircularDependency = async (
	context: Context,
	targetFlagKey: string,
	proposedDependencies: string[],
	websiteId?: string,
	organizationId?: string
) => {
	const allFlags = await context.db
		.select({
			key: flags.key,
			dependencies: flags.dependencies,
		})
		.from(flags)
		.where(
			and(
				getScopeCondition(websiteId, organizationId, context?.user?.id),
				isNull(flags.deletedAt)
			)
		);

	const graph = new Map<string, string[]>();
	for (const flag of allFlags) {
		if (flag.key === targetFlagKey) {
			graph.set(flag.key, proposedDependencies);
		} else {
			graph.set(flag.key, (flag.dependencies as string[]) || []);
		}
	}

	if (!graph.has(targetFlagKey)) {
		graph.set(targetFlagKey, proposedDependencies);
	}


	const visited = new Set<string>();
	const recursionStack = new Set<string>();

	const hasCycle = (currentKey: string): boolean => {
		visited.add(currentKey);
		recursionStack.add(currentKey);

		const neighbors = graph.get(currentKey) || [];

		for (const neighbor of neighbors) {
			if (!visited.has(neighbor)) {
				if (hasCycle(neighbor)) return true;
			} else if (recursionStack.has(neighbor)) {
				return true;
			}
		}

		recursionStack.delete(currentKey);
		return false;
	};

	if (hasCycle(targetFlagKey)) {
		throw new ORPCError("BAD_REQUEST", {
			message: `Circular dependency detected involving flag "${targetFlagKey}".`,
		});
	}
};

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
		.handler(async ({ context, input }) => {
			const scope = getScope(input.websiteId, input.organizationId);
			const authContext = await getCacheAuthContext(context, {
				websiteId: input.websiteId,
				organizationId: input.organizationId,
			});

			const cacheKey = `byId:${input.id}:${scope}:${authContext}`;

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
		.handler(async ({ context, input }) => {
			const scope = getScope(input.websiteId, input.organizationId);
			const authContext = await getCacheAuthContext(context, {
				websiteId: input.websiteId,
				organizationId: input.organizationId,
			});

			const cacheKey = `byKey:${input.key}:${scope}:${authContext}`;

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

			// Check for circular dependencies
			if (input.dependencies && input.dependencies.length > 0) {
				await checkCircularDependency(
					context,
					input.key,
					input.dependencies,
					input.websiteId,
					input.organizationId
				);
			}

			const dependencyFlags = await context.db
				.select()
				.from(flags)
				.where(
					and(
						inArray(flags.key, input.dependencies || []),
						getScopeCondition(
							input.websiteId,
							input.organizationId,
							context.user.id
						),
						isNull(flags.deletedAt)
					)
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

			// Check if any dependency is inactive - if so, force this flag to be inactive
			const hasInactiveDependency = dependencyFlags.some(
				(depFlag) => depFlag.status !== "active"
			);

			const finalStatus = hasInactiveDependency ? "inactive" : input.status;
			if (existingFlag.length > 0) {
				if (!existingFlag[0].deletedAt) {
					throw new ORPCError("CONFLICT", {
						message: "A flag with this key already exists in this scope",
					});
				}

				const [restoredFlag] = await context.db
					.update(flags)
					.set({
						name: input.name,
						description: input.description,
						type: input.type,
						status: finalStatus,
						defaultValue: input.defaultValue,
						rules: input.rules,
						persistAcrossAuth:
							input.persistAcrossAuth ??
							existingFlag[0].persistAcrossAuth ??
							false,
						rolloutPercentage: input.rolloutPercentage,
						variants: input.variants,
						dependencies: input.dependencies,
						environment: input.environment,
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
					status: finalStatus,
					defaultValue: input.defaultValue,
					payload: input.payload || null,
					rules: input.rules || [],
					persistAcrossAuth: input.persistAcrossAuth ?? false,
					rolloutPercentage: input.rolloutPercentage || 0,
					variants: input.variants || [],
					dependencies: input.dependencies || [],
					websiteId: input.websiteId || null,
					organizationId: input.organizationId || null,
					environment: input.environment || existingFlag?.[0]?.environment,
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
				.select()
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

			// Check for circular dependencies if dependencies are being updated
			if (input.dependencies) {
				await checkCircularDependency(
					context,
					flag.key,
					input.dependencies,
					flag.websiteId || undefined,
					flag.organizationId || undefined
				);
			}

			const dependencyFlags = await context.db
				.select()
				.from(flags)
				.where(
					and(
						inArray(flags.key, input.dependencies || []),
						getScopeCondition(
							flag.websiteId || undefined,
							flag.organizationId || undefined,
							context.user.id
						),
						isNull(flags.deletedAt)
					)
				);

			const nextDependencies = input.dependencies ?? (flag.dependencies as string[]) ?? [];

			if (nextDependencies.length > 0 && input.status === "active") {
				const hasInactiveDependency = dependencyFlags.some(
					(depFlag) => depFlag.status !== "active"
				);

				if (hasInactiveDependency) {
					input.status = "inactive";
				}
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

			// Handle cascading status changes for dependent flags
			await handleFlagUpdateDependencyCascading({ updatedFlag, userId: context.user.id })
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
}
