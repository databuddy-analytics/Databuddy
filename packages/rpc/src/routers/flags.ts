import {
	and,
	desc,
	eq,
	flags,
	flagsToTargetGroups,
	inArray,
	isNull,
	ne,
	notDeleted,
	targetGroups,
	withTransaction,
} from "@databuddy/db";
import { createDrizzleCache, redis } from "@databuddy/redis";
import {
	flagFormSchema,
	userRuleSchema,
	variantSchema,
} from "@databuddy/shared/flags";
import {
	getScope,
	getScopeCondition,
	handleFlagUpdateDependencyCascading,
	invalidateFlagCache,
} from "@databuddy/shared/flags/utils";
import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import type { Context } from "../orpc";
import { protectedProcedure, publicProcedure } from "../orpc";
import { isFullyAuthorized, withWorkspace } from "../procedures/with-workspace";
import {
	requireFeatureWithLimit,
	requireUsageWithinLimit,
} from "../types/billing";
import { getCacheAuthContext } from "../utils/cache-keys";

const flagsCache = createDrizzleCache({ redis, namespace: "flags" });
const CACHE_DURATION = 60;

const authorizeScope = async (
	context: Context,
	websiteId?: string,
	organizationId?: string,
	permission: "read" | "update" | "delete" = "read",
	allowPublicAccess = false
) => {
	if (websiteId) {
		await withWorkspace(context, {
			websiteId,
			permissions: [permission],
			allowPublicAccess,
		});
	} else if (organizationId) {
		const perm = permission === "read" ? "read" : "create";
		await withWorkspace(context, {
			organizationId,
			resource: "website",
			permissions: [perm],
		});
	}
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

const updateFlagSchema = z
	.object({
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
		rolloutBy: z.string().optional(),
		variants: z.array(variantSchema).optional(),
		dependencies: z.array(z.string()).optional(),
		environment: z.string().optional(),
		targetGroupIds: z.array(z.string()).optional(),
	})
	.superRefine((data, ctx) => {
		if (data.type === "multivariant" && data.variants) {
			const hasAnyWeight = data.variants.some(
				(v) => typeof v.weight === "number"
			);
			if (hasAnyWeight) {
				const totalWeight = data.variants.reduce(
					(sum, v) => sum + (typeof v.weight === "number" ? v.weight : 0),
					0
				);
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
			and(getScopeCondition(websiteId, organizationId), isNull(flags.deletedAt))
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
				if (hasCycle(neighbor)) {
					return true;
				}
			} else if (recursionStack.has(neighbor)) {
				return true;
			}
		}

		recursionStack.delete(currentKey);
		return false;
	};

	if (hasCycle(targetFlagKey)) {
		throw rpcError.badRequest(
			`Circular dependency detected involving flag "${targetFlagKey}".`
		);
	}
};

interface FlagWithTargetGroups {
	rules?: unknown;
	targetGroups?: Array<{
		rules?: unknown;
		[key: string]: unknown;
	}>;
	[key: string]: unknown;
}

/**
 * Sanitizes flag data for unauthorized/demo users by removing sensitive targeting information.
 * Only keeps aggregate numbers like rule count and group count.
 */
function sanitizeFlagForDemo<T extends FlagWithTargetGroups>(flag: T): T {
	return {
		...flag,
		rules: Array.isArray(flag.rules) && flag.rules.length > 0 ? [] : flag.rules,
		targetGroups: flag.targetGroups?.map(
			(group: { rules?: unknown; [key: string]: unknown }) => ({
				...group,
				rules:
					Array.isArray(group.rules) && group.rules.length > 0
						? []
						: group.rules,
			})
		),
	};
}

const successOutputSchema = z.object({ success: z.literal(true) });

const flagOutputSchema = z.record(z.string(), z.unknown());

export const flagsRouter = {
	list: publicProcedure
		.route({
			description:
				"Returns all flags for a website or organization. Requires scope read permission.",
			method: "POST",
			path: "/flags/list",
			summary: "List flags",
			tags: ["Flags"],
		})
		.input(listFlagsSchema)
		.output(z.array(flagOutputSchema))
		.handler(({ context, input }) => {
			const scope = getScope(input.websiteId, input.organizationId);
			const cacheKey = `list:${scope}:${input.status || "all"}`;

			return flagsCache.withCache({
				key: cacheKey,
				ttl: CACHE_DURATION,
				tables: ["flags", "flags_to_target_groups", "target_groups"],
				queryFn: async () => {
					await authorizeScope(
						context,
						input.websiteId,
						input.organizationId,
						"read",
						true
					);

					const conditions = [
						isNull(flags.deletedAt),
						getScopeCondition(input.websiteId, input.organizationId),
					];

					if (input.status) {
						conditions.push(eq(flags.status, input.status));
					}

					const flagsList = await context.db.query.flags.findMany({
						where: and(...conditions),
						orderBy: desc(flags.createdAt),
						with: {
							flagsToTargetGroups: {
								with: {
									targetGroup: true,
								},
							},
						},
					});

					// Map the nested relations to flat targetGroups array
					const mappedFlags = flagsList.map((flag) => ({
						...flag,
						targetGroups: flag.flagsToTargetGroups
							.filter((ftg) => ftg.targetGroup && !ftg.targetGroup.deletedAt)
							.map((ftg) => ftg.targetGroup),
					}));

					// Check if user is fully authorized
					const isAuthorized = input.websiteId
						? await isFullyAuthorized(context, input.websiteId)
						: Boolean(context.user);

					// Sanitize data for unauthorized/demo users
					if (!isAuthorized) {
						return mappedFlags.map((flag) => sanitizeFlagForDemo(flag));
					}

					return mappedFlags;
				},
			});
		}),

	getById: publicProcedure
		.route({
			description:
				"Returns a single flag by id. Requires scope read permission.",
			method: "POST",
			path: "/flags/getById",
			summary: "Get flag by ID",
			tags: ["Flags"],
		})
		.input(getFlagSchema)
		.output(flagOutputSchema)
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
				tables: ["flags", "flags_to_target_groups", "target_groups"],
				queryFn: async () => {
					await authorizeScope(
						context,
						input.websiteId,
						input.organizationId,
						"read",
						true
					);

					const flag = await context.db.query.flags.findFirst({
						where: and(
							eq(flags.id, input.id),
							getScopeCondition(input.websiteId, input.organizationId),
							isNull(flags.deletedAt)
						),
						with: {
							flagsToTargetGroups: {
								with: {
									targetGroup: true,
								},
							},
						},
					});

					if (!flag) {
						throw rpcError.notFound("Flag", input.id);
					}

					const mappedFlag = {
						...flag,
						targetGroups: flag.flagsToTargetGroups
							.filter((ftg) => ftg.targetGroup && !ftg.targetGroup.deletedAt)
							.map((ftg) => ftg.targetGroup),
					};

					// Check if user is fully authorized
					const isAuthorized = input.websiteId
						? await isFullyAuthorized(context, input.websiteId)
						: Boolean(context.user);

					// Sanitize data for unauthorized/demo users
					if (!isAuthorized) {
						return sanitizeFlagForDemo(mappedFlag);
					}

					return mappedFlag;
				},
			});
		}),

	getByKey: publicProcedure
		.route({
			description:
				"Returns a single active flag by key. Requires scope read permission.",
			method: "POST",
			path: "/flags/getByKey",
			summary: "Get flag by key",
			tags: ["Flags"],
		})
		.input(getFlagByKeySchema)
		.output(flagOutputSchema)
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
				tables: ["flags", "flags_to_target_groups", "target_groups"],
				queryFn: async () => {
					await authorizeScope(
						context,
						input.websiteId,
						input.organizationId,
						"read",
						true
					);

					const flag = await context.db.query.flags.findFirst({
						where: and(
							eq(flags.key, input.key),
							getScopeCondition(input.websiteId, input.organizationId),
							eq(flags.status, "active"),
							isNull(flags.deletedAt)
						),
						with: {
							flagsToTargetGroups: {
								with: {
									targetGroup: true,
								},
							},
						},
					});

					if (!flag) {
						throw rpcError.notFound("Flag");
					}

					const mappedFlag = {
						...flag,
						targetGroups: flag.flagsToTargetGroups
							.filter((ftg) => ftg.targetGroup && !ftg.targetGroup.deletedAt)
							.map((ftg) => ftg.targetGroup),
					};

					// Check if user is fully authorized
					const isAuthorized = input.websiteId
						? await isFullyAuthorized(context, input.websiteId)
						: Boolean(context.user);

					// Sanitize data for unauthorized/demo users
					if (!isAuthorized) {
						return sanitizeFlagForDemo(mappedFlag);
					}

					return mappedFlag;
				},
			});
		}),

	create: protectedProcedure
		.route({
			description:
				"Creates a new feature flag. Requires feature flags plan and scope update permission.",
			method: "POST",
			path: "/flags/create",
			summary: "Create flag",
			tags: ["Flags"],
		})
		.input(createFlagSchema)
		.output(flagOutputSchema)
		.handler(async ({ context, input }) => {
			const wsId = input.websiteId as string | undefined;
			const orgId = input.organizationId as string | undefined;

			const workspace = wsId
				? await withWorkspace(context, {
						websiteId: wsId,
						permissions: ["update"],
					})
				: await withWorkspace(context, {
						organizationId: orgId,
						resource: "website",
						permissions: ["create"],
					});

			const createdBy = await workspace.getCreatedBy();

			const existingFlags = await context.db
				.select({ id: flags.id })
				.from(flags)
				.where(
					and(
						getScopeCondition(input.websiteId, input.organizationId),
						isNull(flags.deletedAt),
						ne(flags.status, "archived")
					)
				);

			requireFeatureWithLimit(
				workspace.plan,
				GATED_FEATURES.FEATURE_FLAGS,
				existingFlags.length
			);

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
						getScopeCondition(input.websiteId, input.organizationId),
						isNull(flags.deletedAt)
					)
				);

			const existingFlag = await context.db
				.select()
				.from(flags)
				.where(
					and(
						eq(flags.key, input.key),
						getScopeCondition(input.websiteId, input.organizationId)
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
					throw rpcError.conflict(
						"A flag with this key already exists in this scope"
					);
				}

				// Use transaction to ensure flag restore + target group associations are atomic
				const restoredFlag = await withTransaction(async (tx) => {
					const [restored] = await tx
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
							rolloutBy: input.rolloutBy,
							variants: input.variants,
							dependencies: input.dependencies,
							environment: input.environment,
							deletedAt: null,
							updatedAt: new Date(),
						})
						.where(eq(flags.id, existingFlag[0].id))
						.returning();

					// Update target group associations within the same transaction
					await tx
						.delete(flagsToTargetGroups)
						.where(eq(flagsToTargetGroups.flagId, existingFlag[0].id));

					if (input.targetGroupIds && input.targetGroupIds.length > 0) {
						await tx.insert(flagsToTargetGroups).values(
							input.targetGroupIds.map((targetGroupId) => ({
								flagId: existingFlag[0].id,
								targetGroupId,
							}))
						);
					}

					return restored;
				});

				await invalidateFlagCache(
					restoredFlag.id,
					input.websiteId,
					input.organizationId,
					input.key
				);

				return restoredFlag;
			}

			const flagId = randomUUIDv7();

			// Use transaction to ensure flag + target group associations are atomic
			const newFlag = await withTransaction(async (tx) => {
				const [createdFlag] = await tx
					.insert(flags)
					.values({
						id: flagId,
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
						rolloutBy: input.rolloutBy || null,
						variants: input.variants || [],
						dependencies: input.dependencies || [],
						websiteId: input.websiteId || null,
						organizationId: input.organizationId || null,
						environment: input.environment || existingFlag?.[0]?.environment,
						userId: null,
						createdBy,
					})
					.returning();

				// Insert target group associations within the same transaction
				if (input.targetGroupIds && input.targetGroupIds.length > 0) {
					// Validate that all target groups exist and belong to the same website
					const validGroups = await tx.query.targetGroups.findMany({
						where: and(
							inArray(targetGroups.id, input.targetGroupIds),
							eq(targetGroups.websiteId, input.websiteId || ""),
							notDeleted(targetGroups)
						),
					});

					if (validGroups.length !== input.targetGroupIds.length) {
						throw rpcError.badRequest(
							"One or more target groups not found or do not belong to this website"
						);
					}

					await tx.insert(flagsToTargetGroups).values(
						input.targetGroupIds.map((targetGroupId) => ({
							flagId,
							targetGroupId,
						}))
					);
				}

				return createdFlag;
			});

			await invalidateFlagCache(
				newFlag.id,
				input.websiteId,
				input.organizationId,
				input.key
			);

			return newFlag;
		}),

	update: protectedProcedure
		.route({
			description:
				"Updates an existing flag. Requires scope update permission.",
			method: "POST",
			path: "/flags/update",
			summary: "Update flag",
			tags: ["Flags"],
		})
		.input(updateFlagSchema)
		.output(flagOutputSchema)
		.handler(async ({ context, input }) => {
			const existingFlag = await context.db
				.select()
				.from(flags)
				.where(and(eq(flags.id, input.id), isNull(flags.deletedAt)))
				.limit(1);

			if (existingFlag.length === 0) {
				throw rpcError.notFound("Flag", input.id);
			}

			const flag = existingFlag[0];

			let workspace;
			if (flag.websiteId) {
				workspace = await withWorkspace(context, {
					websiteId: flag.websiteId,
					permissions: ["update"],
				});
			} else if (flag.organizationId) {
				workspace = await withWorkspace(context, {
					organizationId: flag.organizationId,
					resource: "website",
					permissions: ["create"],
				});
			} else {
				throw rpcError.forbidden(
					"Flags must be scoped to a website or organization"
				);
			}

			const isUnarchiving =
				flag.status === "archived" &&
				input.status &&
				input.status !== "archived";

			if (isUnarchiving) {
				const existingActiveFlags = await context.db
					.select({ id: flags.id })
					.from(flags)
					.where(
						and(
							getScopeCondition(
								flag.websiteId || undefined,
								flag.organizationId || undefined
							),
							isNull(flags.deletedAt),
							ne(flags.status, "archived")
						)
					);

				requireUsageWithinLimit(
					workspace.plan,
					GATED_FEATURES.FEATURE_FLAGS,
					existingActiveFlags.length
				);
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
							flag.organizationId || undefined
						),
						isNull(flags.deletedAt)
					)
				);

			const nextDependencies =
				input.dependencies ?? (flag.dependencies as string[]) ?? [];

			if (nextDependencies.length > 0 && input.status === "active") {
				const hasInactiveDependency = dependencyFlags.some(
					(depFlag) => depFlag.status !== "active"
				);

				if (hasInactiveDependency) {
					input.status = "inactive";
				}
			}

			const { id, targetGroupIds, ...updates } = input;

			// Use transaction to ensure flag update + target group associations are atomic
			const updatedFlag = await withTransaction(async (tx) => {
				const [updated] = await tx
					.update(flags)
					.set({
						...updates,
						updatedAt: new Date(),
					})
					.where(and(eq(flags.id, id), notDeleted(flags)))
					.returning();

				// Update target group associations if provided
				if (targetGroupIds !== undefined) {
					// Validate that all target groups exist and belong to the same website
					if (targetGroupIds.length > 0) {
						const validGroups = await tx.query.targetGroups.findMany({
							where: and(
								inArray(targetGroups.id, targetGroupIds),
								eq(targetGroups.websiteId, flag.websiteId || ""),
								notDeleted(targetGroups)
							),
						});

						if (validGroups.length !== targetGroupIds.length) {
							throw rpcError.badRequest(
								"One or more target groups not found or do not belong to this website"
							);
						}
					}

					await tx
						.delete(flagsToTargetGroups)
						.where(eq(flagsToTargetGroups.flagId, id));

					if (targetGroupIds.length > 0) {
						await tx.insert(flagsToTargetGroups).values(
							targetGroupIds.map((targetGroupId) => ({
								flagId: id,
								targetGroupId,
							}))
						);
					}
				}

				return updated;
			});

			await invalidateFlagCache(id, flag.websiteId, flag.organizationId);

			// Handle cascading status changes for dependent flags
			if (flag.status !== updatedFlag.status) {
				await handleFlagUpdateDependencyCascading({ updatedFlag });
			}
			return updatedFlag;
		}),

	delete: protectedProcedure
		.route({
			description:
				"Soft-deletes a flag (archives it). Requires scope delete permission.",
			method: "POST",
			path: "/flags/delete",
			summary: "Delete flag",
			tags: ["Flags"],
		})
		.input(z.object({ id: z.string() }))
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const existingFlag = await context.db
				.select({
					organizationId: flags.organizationId,
					websiteId: flags.websiteId,
				})
				.from(flags)
				.where(and(eq(flags.id, input.id), isNull(flags.deletedAt)))
				.limit(1);

			if (existingFlag.length === 0) {
				throw rpcError.notFound("Flag", input.id);
			}

			const flag = existingFlag[0];

			if (flag.websiteId) {
				await withWorkspace(context, {
					websiteId: flag.websiteId,
					permissions: ["delete"],
				});
			} else if (flag.organizationId) {
				await withWorkspace(context, {
					organizationId: flag.organizationId,
					resource: "website",
					permissions: ["create"],
				});
			} else {
				throw rpcError.forbidden(
					"Flags must be scoped to a website or organization"
				);
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
