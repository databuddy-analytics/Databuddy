import {
	and,
	eq,
	inArray,
	isNull,
	ne,
	notDeleted,
	withTransaction,
} from "@databuddy/db";
import {
	flagChangeEvents,
	flags,
	flagsToTargetGroups,
} from "@databuddy/db/schema";
import { createDrizzleCache, redis } from "@databuddy/redis";
import {
	flagFormShape,
	userRuleSchema,
	variantSchema,
} from "@databuddy/shared/flags";
import {
	getScope,
	getScopeCondition,
	handleFlagUpdateDependencyCascading,
	invalidateFlagCache,
} from "../utils/flags";
import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import type { Context } from "../orpc";
import { publicProcedure, trackedProcedure } from "../orpc";
import { setTrackProperties } from "../middleware/track-mutation";
import {
	type Workspace,
	withPublicWorkspace,
	withWorkspace,
} from "../procedures/with-workspace";
import {
	requireFeatureWithLimit,
	requireUsageWithinLimit,
} from "../types/billing";
import { scopedCacheKey } from "../utils/scoped-cache-key";

const flagsCache = createDrizzleCache({ redis, namespace: "flags" });
const CACHE_DURATION = 60;

function requireCondition(condition: ReturnType<typeof and>) {
	if (!condition) {
		throw new Error("Expected flag filter conditions");
	}
	return condition;
}

const flagScopeFields = {
	websiteId: z.string().optional(),
	organizationId: z.string().optional(),
};

const SCOPE_REQUIRED_ERROR =
	"Either websiteId or organizationId must be provided";

const requireScope = <
	T extends { websiteId?: string; organizationId?: string },
>(
	data: T
) => Boolean(data.websiteId || data.organizationId);

const scopeRefinement = { message: SCOPE_REQUIRED_ERROR, path: ["websiteId"] };

function authorizeFlagRead(
	context: Context,
	scope: { websiteId?: string; organizationId?: string }
): Promise<Workspace> {
	if (scope.websiteId) {
		return withPublicWorkspace(context, {
			websiteId: scope.websiteId,
			resource: "flag",
			permissions: ["read"],
		});
	}
	if (!scope.organizationId) {
		throw rpcError.badRequest(SCOPE_REQUIRED_ERROR);
	}
	return withWorkspace(context, {
		organizationId: scope.organizationId,
		resource: "flag",
		permissions: ["read"],
	});
}

function requireAuthedFlagRead(workspace: Workspace) {
	if (workspace.tier === "demo") {
		throw rpcError.unauthorized(
			"Feature flag definitions require authenticated workspace access"
		);
	}
}

const listFlagsSchema = z
	.object({
		...flagScopeFields,
		status: z.enum(["active", "inactive", "archived"]).optional(),
	})
	.refine(requireScope, scopeRefinement);

const getFlagSchema = z
	.object({ id: z.string(), ...flagScopeFields })
	.refine(requireScope, scopeRefinement);

const getFlagByKeySchema = z
	.object({ key: z.string(), ...flagScopeFields })
	.refine(requireScope, scopeRefinement);

const createFlagSchema = z
	.object({
		...flagScopeFields,
		payload: z
			.record(z.string(), z.unknown())
			.refine(
				(obj) => JSON.stringify(obj).length <= 32_768,
				"Payload too large (max 32KB)"
			)
			.optional(),
		persistAcrossAuth: z.boolean().optional(),
		...flagFormShape,
	})
	.refine(requireScope, scopeRefinement);

const updateFlagSchema = z
	.object({
		id: z.string(),
		name: z.string().min(1).max(100).optional(),
		description: z.string().optional(),
		type: z.enum(["boolean", "rollout", "multivariant"]).optional(),
		status: z.enum(["active", "inactive", "archived"]).optional(),
		defaultValue: z.boolean().optional(),
		payload: z
			.record(z.string(), z.unknown())
			.refine(
				(obj) => JSON.stringify(obj).length <= 32_768,
				"Payload too large (max 32KB)"
			)
			.optional(),
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

interface FlagRelation {
	flagsToTargetGroups: Array<{
		targetGroup: { deletedAt: Date | null; [key: string]: unknown } | null;
	}>;
}

function flattenTargetGroups<T extends FlagRelation>(flag: T) {
	const { flagsToTargetGroups, ...rest } = flag;
	const targetGroups = flagsToTargetGroups
		.map((ftg) => ftg.targetGroup)
		.filter((tg): tg is NonNullable<typeof tg> => !!tg && !tg.deletedAt);
	return { ...rest, targetGroups };
}

function buildFlagChangeSnapshot(flag: {
	defaultValue: boolean;
	dependencies?: string[] | null;
	description?: string | null;
	environment?: string | null;
	key: string;
	name?: string | null;
	persistAcrossAuth: boolean;
	rolloutBy?: string | null;
	rolloutPercentage?: number | null;
	status: "active" | "inactive" | "archived";
	type: "boolean" | "rollout" | "multivariant";
	variants?: Array<{
		description?: string;
		key: string;
		type: "string" | "number" | "json";
		value: unknown;
		weight?: number;
	}> | null;
}) {
	return {
		key: flag.key,
		name: flag.name ?? null,
		description: flag.description ?? null,
		type: flag.type,
		status: flag.status,
		defaultValue: flag.defaultValue,
		persistAcrossAuth: flag.persistAcrossAuth,
		rolloutPercentage: flag.rolloutPercentage ?? null,
		rolloutBy: flag.rolloutBy ?? null,
		environment: flag.environment ?? null,
		dependencies: flag.dependencies ?? [],
		variants: flag.variants ?? [],
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
		.handler(async ({ context, input }) => {
			const workspace = await authorizeFlagRead(context, input);
			requireAuthedFlagRead(workspace);
			const scope = getScope(input.websiteId, input.organizationId);

			return flagsCache.withCache({
				key: scopedCacheKey(
					"list",
					workspace,
					scope,
					`status:${input.status || "all"}`
				),
				ttl: CACHE_DURATION,
				tables: ["flags", "flags_to_target_groups", "target_groups"],
				queryFn: async () => {
					const flagsList = await context.db.query.flags.findMany({
						where: {
							RAW: (t) => {
								const conditions = [
									isNull(t.deletedAt),
									getScopeCondition(
										input.websiteId,
										input.organizationId,
										undefined,
										t
									),
								];
								if (input.status) {
									conditions.push(eq(t.status, input.status));
								}
								return requireCondition(and(...conditions));
							},
						},
						orderBy: { createdAt: "desc" },
						limit: 200,
						with: { flagsToTargetGroups: { with: { targetGroup: true } } },
					});

					return flagsList.map(flattenTargetGroups);
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
			const workspace = await authorizeFlagRead(context, input);
			requireAuthedFlagRead(workspace);
			const scope = getScope(input.websiteId, input.organizationId);

			return flagsCache.withCache({
				key: scopedCacheKey("byId", workspace, scope, `id:${input.id}`),
				ttl: CACHE_DURATION,
				tables: ["flags", "flags_to_target_groups", "target_groups"],
				queryFn: async () => {
					const flag = await context.db.query.flags.findFirst({
						where: {
							RAW: (t) =>
								requireCondition(
									and(
										eq(t.id, input.id),
										getScopeCondition(
											input.websiteId,
											input.organizationId,
											undefined,
											t
										),
										isNull(t.deletedAt)
									)
								),
						},
						with: { flagsToTargetGroups: { with: { targetGroup: true } } },
					});

					if (!flag) {
						throw rpcError.notFound("Flag", input.id);
					}
					return flattenTargetGroups(flag);
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
			const workspace = await authorizeFlagRead(context, input);
			requireAuthedFlagRead(workspace);
			const scope = getScope(input.websiteId, input.organizationId);

			return flagsCache.withCache({
				key: scopedCacheKey("byKey", workspace, scope, `key:${input.key}`),
				ttl: CACHE_DURATION,
				tables: ["flags", "flags_to_target_groups", "target_groups"],
				queryFn: async () => {
					const flag = await context.db.query.flags.findFirst({
						where: {
							RAW: (t) =>
								requireCondition(
									and(
										eq(t.key, input.key),
										getScopeCondition(
											input.websiteId,
											input.organizationId,
											undefined,
											t
										),
										eq(t.status, "active"),
										isNull(t.deletedAt)
									)
								),
						},
						with: { flagsToTargetGroups: { with: { targetGroup: true } } },
					});

					if (!flag) {
						throw rpcError.notFound("Flag");
					}
					return flattenTargetGroups(flag);
				},
			});
		}),

	create: trackedProcedure
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
			setTrackProperties({ type: input.type });
			const wsId = input.websiteId;
			const orgId = input.organizationId;

			const workspace = wsId
				? await withWorkspace(context, {
						websiteId: wsId,
						resource: "flag",
						permissions: ["create"],
					})
				: await withWorkspace(context, {
						organizationId: orgId,
						resource: "flag",
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

			const dependencyKeys = input.dependencies ?? [];
			const dependencyFlags = dependencyKeys.length
				? await context.db
						.select()
						.from(flags)
						.where(
							and(
								inArray(flags.key, dependencyKeys),
								getScopeCondition(input.websiteId, input.organizationId),
								isNull(flags.deletedAt)
							)
						)
				: [];

			if (dependencyFlags.length !== dependencyKeys.length) {
				throw rpcError.badRequest(
					"One or more dependency flags were not found in this scope"
				);
			}

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

					await tx.insert(flagChangeEvents).values({
						id: randomUUIDv7(),
						flagId: restored.id,
						websiteId: restored.websiteId,
						organizationId: restored.organizationId,
						changeType: "restored",
						before: buildFlagChangeSnapshot(existingFlag[0]),
						after: buildFlagChangeSnapshot(restored),
						changedBy: createdBy,
					});

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
					const ids = input.targetGroupIds;
					const validGroups = await tx.query.targetGroups.findMany({
						where: {
							RAW: (t) =>
								requireCondition(
									and(
										inArray(t.id, ids),
										eq(t.websiteId, input.websiteId || ""),
										isNull(t.deletedAt)
									)
								),
						},
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

				await tx.insert(flagChangeEvents).values({
					id: randomUUIDv7(),
					flagId,
					websiteId: createdFlag.websiteId,
					organizationId: createdFlag.organizationId,
					changeType: "created",
					before: null,
					after: buildFlagChangeSnapshot(createdFlag),
					changedBy: createdBy,
				});

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

	update: trackedProcedure
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
			if (input.type || input.status) {
				setTrackProperties({
					...(input.type && { type: input.type }),
					...(input.status && { status: input.status }),
				});
			}
			const existingFlag = await context.db
				.select()
				.from(flags)
				.where(and(eq(flags.id, input.id), isNull(flags.deletedAt)))
				.limit(1);

			if (existingFlag.length === 0) {
				throw rpcError.notFound("Flag", input.id);
			}

			const flag = existingFlag[0];

			let workspace: Workspace | undefined;
			if (flag.websiteId) {
				workspace = await withWorkspace(context, {
					websiteId: flag.websiteId,
					resource: "flag",
					permissions: ["update"],
				});
			} else if (flag.organizationId) {
				workspace = await withWorkspace(context, {
					organizationId: flag.organizationId,
					resource: "flag",
					permissions: ["update"],
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

			const changedBy = await workspace.getCreatedBy();
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

			const nextDependencies =
				input.dependencies ?? (flag.dependencies as string[]) ?? [];

			const dependencyFlags = nextDependencies.length
				? await context.db
						.select()
						.from(flags)
						.where(
							and(
								inArray(flags.key, nextDependencies),
								getScopeCondition(
									flag.websiteId || undefined,
									flag.organizationId || undefined
								),
								isNull(flags.deletedAt)
							)
						)
				: [];

			if (dependencyFlags.length !== nextDependencies.length) {
				throw rpcError.badRequest(
					"One or more dependency flags were not found in this scope"
				);
			}

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
							where: {
								RAW: (t) =>
									requireCondition(
										and(
											inArray(t.id, targetGroupIds),
											eq(t.websiteId, flag.websiteId || ""),
											isNull(t.deletedAt)
										)
									),
							},
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

				await tx.insert(flagChangeEvents).values({
					id: randomUUIDv7(),
					flagId: updated.id,
					websiteId: updated.websiteId,
					organizationId: updated.organizationId,
					changeType: "updated",
					before: buildFlagChangeSnapshot(flag),
					after: buildFlagChangeSnapshot(updated),
					changedBy,
				});

				return updated;
			});

			await invalidateFlagCache(id, flag.websiteId, flag.organizationId);

			// Handle cascading status changes for dependent flags
			if (flag.status !== updatedFlag.status) {
				await handleFlagUpdateDependencyCascading({
					updatedFlag,
					changedBy,
				});
			}
			return updatedFlag;
		}),

	delete: trackedProcedure
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
				.select()
				.from(flags)
				.where(and(eq(flags.id, input.id), isNull(flags.deletedAt)))
				.limit(1);

			if (existingFlag.length === 0) {
				throw rpcError.notFound("Flag", input.id);
			}

			const flag = existingFlag[0];
			let workspace: Workspace | undefined;

			if (flag.websiteId) {
				workspace = await withWorkspace(context, {
					websiteId: flag.websiteId,
					resource: "flag",
					permissions: ["delete"],
				});
			} else if (flag.organizationId) {
				workspace = await withWorkspace(context, {
					organizationId: flag.organizationId,
					resource: "flag",
					permissions: ["delete"],
				});
			} else {
				throw rpcError.forbidden(
					"Flags must be scoped to a website or organization"
				);
			}

			const changedBy = await workspace.getCreatedBy();

			await withTransaction(async (tx) => {
				const [archivedFlag] = await tx
					.update(flags)
					.set({
						deletedAt: new Date(),
						status: "archived",
					})
					.where(and(eq(flags.id, input.id), isNull(flags.deletedAt)))
					.returning();

				await tx.insert(flagChangeEvents).values({
					id: randomUUIDv7(),
					flagId: archivedFlag.id,
					websiteId: archivedFlag.websiteId,
					organizationId: archivedFlag.organizationId,
					changeType: "archived",
					before: buildFlagChangeSnapshot(flag),
					after: buildFlagChangeSnapshot(archivedFlag),
					changedBy,
				});
			});

			await invalidateFlagCache(input.id, flag.websiteId, flag.organizationId);

			return { success: true };
		}),
};
