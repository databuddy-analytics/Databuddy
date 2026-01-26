import { websitesApi } from "@databuddy/auth";
import {
	and,
	desc,
	eq,
	flags,
	flagsToTargetGroups,
	inArray,
	isNull,
	ne,
	targetGroups,
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
import { ORPCError } from "@orpc/server";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import type { Context } from "../orpc";
import { protectedProcedure, publicProcedure } from "../orpc";
import { requireFeature, requireUsageWithinLimit } from "../types/billing";
import { authorizeWebsiteAccess, isFullyAuthorized } from "../utils/auth";
import { getCacheAuthContext } from "../utils/cache-keys";

const flagsCache = createDrizzleCache({ redis, namespace: "flags" });
const CACHE_DURATION = 60;

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
		throw new ORPCError("BAD_REQUEST", {
			message: `Circular dependency detected involving flag "${targetFlagKey}".`,
		});
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

export const flagsRouter = {
	list: publicProcedure.input(listFlagsSchema).handler(({ context, input }) => {
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
					"read"
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
				tables: ["flags", "flags_to_target_groups", "target_groups"],
				queryFn: async () => {
					await authorizeScope(
						context,
						input.websiteId,
						input.organizationId,
						"read"
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
						throw new ORPCError("NOT_FOUND", {
							message: "Flag not found",
						});
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
				tables: ["flags", "flags_to_target_groups", "target_groups"],
				queryFn: async () => {
					await authorizeScope(
						context,
						input.websiteId,
						input.organizationId,
						"read"
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
						throw new ORPCError("NOT_FOUND", {
							message: "Flag not found",
						});
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
		.input(createFlagSchema)
		.handler(async ({ context, input }) => {
			await authorizeScope(
				context,
				input.websiteId,
				input.organizationId,
				"update"
			);

			// Check if feature flags feature is available on the plan
			requireFeature(context.billing?.planId, GATED_FEATURES.FEATURE_FLAGS);

			// Count existing flags (excluding archived ones)
			const existingFlags = await context.db
				.select({ id: flags.id })
				.from(flags)
				.where(
					and(
						getScopeCondition(
							input.websiteId,
							input.organizationId,
							context.user.id
						),
						isNull(flags.deletedAt),
						ne(flags.status, "archived")
					)
				);

			requireUsageWithinLimit(
				context.billing?.planId,
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
						rolloutBy: input.rolloutBy,
						variants: input.variants,
						dependencies: input.dependencies,
						environment: input.environment,
						deletedAt: null,
						updatedAt: new Date(),
					})
					.where(eq(flags.id, existingFlag[0].id))
					.returning();

				// Update target group associations
				await context.db
					.delete(flagsToTargetGroups)
					.where(eq(flagsToTargetGroups.flagId, existingFlag[0].id));

				if (input.targetGroupIds && input.targetGroupIds.length > 0) {
					await context.db.insert(flagsToTargetGroups).values(
						input.targetGroupIds.map((targetGroupId) => ({
							flagId: existingFlag[0].id,
							targetGroupId,
						}))
					);
				}

				await invalidateFlagCache(
					restoredFlag.id,
					input.websiteId,
					input.organizationId,
					input.key
				);

				return restoredFlag;
			}

			const flagId = randomUUIDv7();
			const [newFlag] = await context.db
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
					userId: input.websiteId ? null : context.user.id,
					createdBy: context.user.id,
				})
				.returning();

			// Insert target group associations
			if (input.targetGroupIds && input.targetGroupIds.length > 0) {
				// Validate that all target groups exist and belong to the same website
				const validGroups = await context.db.query.targetGroups.findMany({
					where: and(
						inArray(targetGroups.id, input.targetGroupIds),
						eq(targetGroups.websiteId, input.websiteId || ""),
						isNull(targetGroups.deletedAt)
					),
				});

				if (validGroups.length !== input.targetGroupIds.length) {
					throw new ORPCError("BAD_REQUEST", {
						message:
							"One or more target groups not found or do not belong to this website",
					});
				}

				await context.db.insert(flagsToTargetGroups).values(
					input.targetGroupIds.map((targetGroupId) => ({
						flagId,
						targetGroupId,
					}))
				);
			}

			await invalidateFlagCache(
				newFlag.id,
				input.websiteId,
				input.organizationId,
				input.key
			);

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
								flag.organizationId || undefined,
								context.user.id
							),
							isNull(flags.deletedAt),
							ne(flags.status, "archived")
						)
					);

				requireUsageWithinLimit(
					context.billing?.planId,
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
							flag.organizationId || undefined,
							context.user.id
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
			const [updatedFlag] = await context.db
				.update(flags)
				.set({
					...updates,
					updatedAt: new Date(),
				})
				.where(and(eq(flags.id, id), isNull(flags.deletedAt)))
				.returning();

			// Update target group associations if provided
			if (targetGroupIds !== undefined) {
				// Validate that all target groups exist and belong to the same website
				if (targetGroupIds.length > 0) {
					const validGroups = await context.db.query.targetGroups.findMany({
						where: and(
							inArray(targetGroups.id, targetGroupIds),
							eq(targetGroups.websiteId, flag.websiteId || ""),
							isNull(targetGroups.deletedAt)
						),
					});

					if (validGroups.length !== targetGroupIds.length) {
						throw new ORPCError("BAD_REQUEST", {
							message:
								"One or more target groups not found or do not belong to this website",
						});
					}
				}

				await context.db
					.delete(flagsToTargetGroups)
					.where(eq(flagsToTargetGroups.flagId, id));

				if (targetGroupIds.length > 0) {
					await context.db.insert(flagsToTargetGroups).values(
						targetGroupIds.map((targetGroupId) => ({
							flagId: id,
							targetGroupId,
						}))
					);
				}
			}

			await invalidateFlagCache(id, flag.websiteId, flag.organizationId);

			// Handle cascading status changes for dependent flags
			if (flag.status !== updatedFlag.status) {
				await handleFlagUpdateDependencyCascading({
					updatedFlag,
					userId: context.user.id,
				});
			}
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
