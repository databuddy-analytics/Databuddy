import { abExperiments, abGoals, abVariants } from '@databuddy/db';
import { createDrizzleCache, redis } from '@databuddy/redis';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '../lib/logger';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';
import { authorizeWebsiteAccess } from '../utils/auth';

const drizzleCache = createDrizzleCache({ redis, namespace: 'experiments' });

const CACHE_TTL = 300;

// Variant schemas
const variantContentSchema = z.record(z.string(), z.any());

const variantSchema = z.object({
	name: z.string().min(1).max(100),
	type: z.enum(['visual', 'redirect', 'code']),
	content: variantContentSchema,
	trafficWeight: z.number().min(0).max(100).default(50),
	isControl: z.boolean().default(false),
});

const createVariantSchema = z.object({
	experimentId: z.string(),
	...variantSchema.shape,
});

const updateVariantSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100).optional(),
	type: z.enum(['visual', 'redirect', 'code']).optional(),
	content: variantContentSchema.optional(),
	trafficWeight: z.number().min(0).max(100).optional(),
	isControl: z.boolean().optional(),
});

// Goal schemas
const goalSchema = z.object({
	name: z.string().min(1).max(100),
	type: z.string().min(1),
	target: z.string().min(1),
	description: z.string().optional(),
});

const createGoalSchema = z.object({
	experimentId: z.string(),
	...goalSchema.shape,
});

const updateGoalSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100).optional(),
	type: z.string().min(1).optional(),
	target: z.string().min(1).optional(),
	description: z.string().optional(),
});

// Experiment schemas
const experimentSchema = z.object({
	name: z.string().min(1).max(100),
	description: z.string().optional(),
	status: z.enum(['draft', 'running', 'paused', 'completed']).default('draft'),
	trafficAllocation: z.number().min(0).max(100).default(100),
	startDate: z.string().datetime().optional(),
	endDate: z.string().datetime().optional(),
	primaryGoal: z.string().optional(),
});

const createExperimentSchema = z.object({
	websiteId: z.string(),
	...experimentSchema.shape,
	variants: z.array(variantSchema).min(1).optional(),
	goals: z.array(goalSchema).optional(),
});

const updateExperimentSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100).optional(),
	description: z.string().optional(),
	status: z.enum(['draft', 'running', 'paused', 'completed']).optional(),
	trafficAllocation: z.number().min(0).max(100).optional(),
	startDate: z.string().datetime().optional(),
	endDate: z.string().datetime().optional(),
	primaryGoal: z.string().optional(),
});

export const experimentsRouter = createTRPCRouter({
	// List experiments for a website
	list: publicProcedure
		.input(z.object({ websiteId: z.string() }))
		.query(({ ctx, input }) => {
			const cacheKey = `experiments:list:${input.websiteId}`;

			return drizzleCache.withCache({
				key: cacheKey,
				ttl: CACHE_TTL,
				tables: ['abExperiments', 'abVariants', 'abGoals'],
				queryFn: async () => {
					await authorizeWebsiteAccess(ctx, input.websiteId, 'read');

					const experiments = await ctx.db
						.select()
						.from(abExperiments)
						.where(
							and(
								eq(abExperiments.websiteId, input.websiteId),
								isNull(abExperiments.deletedAt)
							)
						)
						.orderBy(desc(abExperiments.createdAt));

					// Get variants and goals for each experiment
					const experimentsWithDetails = await Promise.all(
						experiments.map(async (experiment) => {
							const [variants, goals] = await Promise.all([
								ctx.db
									.select()
									.from(abVariants)
									.where(eq(abVariants.experimentId, experiment.id))
									.orderBy(desc(abVariants.createdAt)),
								ctx.db
									.select()
									.from(abGoals)
									.where(eq(abGoals.experimentId, experiment.id))
									.orderBy(desc(abGoals.createdAt)),
							]);

							return {
								...experiment,
								variants,
								goals,
							};
						})
					);

					return experimentsWithDetails;
				},
			});
		}),

	// Get experiment by ID with variants and goals
	getById: publicProcedure
		.input(z.object({ id: z.string(), websiteId: z.string() }))
		.query(({ ctx, input }) => {
			const cacheKey = `experiments:byId:${input.id}:${input.websiteId}`;

			return drizzleCache.withCache({
				key: cacheKey,
				ttl: CACHE_TTL,
				tables: ['abExperiments', 'abVariants', 'abGoals'],
				queryFn: async () => {
					await authorizeWebsiteAccess(ctx, input.websiteId, 'read');

					// Get experiment
					const experiment = await ctx.db
						.select()
						.from(abExperiments)
						.where(
							and(
								eq(abExperiments.id, input.id),
								eq(abExperiments.websiteId, input.websiteId),
								isNull(abExperiments.deletedAt)
							)
						)
						.limit(1);

					if (!experiment.length) {
						throw new TRPCError({
							code: 'NOT_FOUND',
							message: 'Experiment not found',
						});
					}

					// Get variants
					const variants = await ctx.db
						.select()
						.from(abVariants)
						.where(eq(abVariants.experimentId, input.id))
						.orderBy(desc(abVariants.createdAt));

					// Get goals
					const goals = await ctx.db
						.select()
						.from(abGoals)
						.where(eq(abGoals.experimentId, input.id))
						.orderBy(desc(abGoals.createdAt));

					return {
						...experiment[0],
						variants,
						goals,
					};
				},
			});
		}),

	// Create new experiment
	create: protectedProcedure
		.input(createExperimentSchema)
		.mutation(async ({ ctx, input }) => {
			await authorizeWebsiteAccess(ctx, input.websiteId, 'update');

			const { variants = [], goals = [], ...experimentData } = input;

			try {
				return await ctx.db.transaction(async (tx) => {
					// Create experiment
					const experimentId = crypto.randomUUID();
					const [experiment] = await tx
						.insert(abExperiments)
						.values({
							id: experimentId,
							...experimentData,
							createdBy: ctx.user.id,
							createdAt: new Date(),
							updatedAt: new Date(),
						})
						.returning();

					// Create variants if provided
					if (variants.length > 0) {
						await tx.insert(abVariants).values(
							variants.map((variant) => ({
								id: crypto.randomUUID(),
								...variant,
								experimentId: experiment.id,
								createdAt: new Date(),
								updatedAt: new Date(),
							}))
						);
					}

					// Create goals if provided
					if (goals.length > 0) {
						await tx.insert(abGoals).values(
							goals.map((goal) => ({
								id: crypto.randomUUID(),
								...goal,
								experimentId: experiment.id,
								createdAt: new Date(),
								updatedAt: new Date(),
							}))
						);
					}

					// Invalidate cache
					await drizzleCache.invalidateByTables(['abExperiments']);

					logger.info('Created experiment', {
						experimentId: experiment.id,
						websiteId: input.websiteId,
						userId: ctx.user.id,
					});

					return experiment;
				});
			} catch (error) {
				logger.error('Failed to create experiment', {
					error: error instanceof Error ? error.message : 'Unknown error',
					websiteId: input.websiteId,
					userId: ctx.user.id,
				});

				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to create experiment',
				});
			}
		}),

	// Update experiment
	update: protectedProcedure
		.input(updateExperimentSchema)
		.mutation(async ({ ctx, input }) => {
			const { id, ...updateData } = input;

			try {
				// Get experiment to verify ownership
				const existing = await ctx.db
					.select({ websiteId: abExperiments.websiteId })
					.from(abExperiments)
					.where(and(eq(abExperiments.id, id), isNull(abExperiments.deletedAt)))
					.limit(1);

				if (!existing.length) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: 'Experiment not found',
					});
				}

				await authorizeWebsiteAccess(ctx, existing[0].websiteId, 'update');

				const [updated] = await ctx.db
					.update(abExperiments)
					.set({
						...updateData,
						updatedAt: new Date(),
					})
					.where(eq(abExperiments.id, id))
					.returning();

				// Invalidate cache
				await Promise.all([
					drizzleCache.invalidateByTables(['abExperiments']),
					drizzleCache.invalidateByKey(
						`experiments:byId:${id}:${existing[0].websiteId}`
					),
				]);

				logger.info('Updated experiment', {
					experimentId: id,
					websiteId: existing[0].websiteId,
					userId: ctx.user.id,
				});

				return updated;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}

				logger.error('Failed to update experiment', {
					error: error instanceof Error ? error.message : 'Unknown error',
					experimentId: id,
					userId: ctx.user.id,
				});

				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to update experiment',
				});
			}
		}),

	// Delete experiment (soft delete)
	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			try {
				// Get experiment to verify ownership
				const existing = await ctx.db
					.select({ websiteId: abExperiments.websiteId })
					.from(abExperiments)
					.where(
						and(eq(abExperiments.id, input.id), isNull(abExperiments.deletedAt))
					)
					.limit(1);

				if (!existing.length) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: 'Experiment not found',
					});
				}

				await authorizeWebsiteAccess(ctx, existing[0].websiteId, 'delete');

				await ctx.db
					.update(abExperiments)
					.set({
						deletedAt: new Date(),
						updatedAt: new Date(),
					})
					.where(eq(abExperiments.id, input.id));

				// Invalidate cache
				await Promise.all([
					drizzleCache.invalidateByTables(['abExperiments']),
					drizzleCache.invalidateByKey(
						`experiments:byId:${input.id}:${existing[0].websiteId}`
					),
				]);

				logger.info('Deleted experiment', {
					experimentId: input.id,
					websiteId: existing[0].websiteId,
					userId: ctx.user.id,
				});

				return { success: true };
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}

				logger.error('Failed to delete experiment', {
					error: error instanceof Error ? error.message : 'Unknown error',
					experimentId: input.id,
					userId: ctx.user.id,
				});

				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to delete experiment',
				});
			}
		}),

	// Variant management
	variants: createTRPCRouter({
		// Create variant
		create: protectedProcedure
			.input(createVariantSchema)
			.mutation(async ({ ctx, input }) => {
				try {
					// Verify experiment exists and user has access
					const experiment = await ctx.db
						.select({ websiteId: abExperiments.websiteId })
						.from(abExperiments)
						.where(
							and(
								eq(abExperiments.id, input.experimentId),
								isNull(abExperiments.deletedAt)
							)
						)
						.limit(1);

					if (!experiment.length) {
						throw new TRPCError({
							code: 'NOT_FOUND',
							message: 'Experiment not found',
						});
					}

					await authorizeWebsiteAccess(ctx, experiment[0].websiteId, 'update');

					const [variant] = await ctx.db
						.insert(abVariants)
						.values({
							id: crypto.randomUUID(),
							...input,
							createdAt: new Date(),
							updatedAt: new Date(),
						})
						.returning();

					// Invalidate cache
					await drizzleCache.invalidateByKey(
						`experiments:byId:${input.experimentId}:${experiment[0].websiteId}`
					);

					return variant;
				} catch (error) {
					if (error instanceof TRPCError) {
						throw error;
					}

					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: 'Failed to create variant',
					});
				}
			}),

		// Update variant
		update: protectedProcedure
			.input(updateVariantSchema)
			.mutation(async ({ ctx, input }) => {
				const { id, ...updateData } = input;

				try {
					// Get variant with experiment info
					const existing = await ctx.db
						.select({
							experimentId: abVariants.experimentId,
							websiteId: abExperiments.websiteId,
						})
						.from(abVariants)
						.innerJoin(
							abExperiments,
							eq(abVariants.experimentId, abExperiments.id)
						)
						.where(eq(abVariants.id, id))
						.limit(1);

					if (!existing.length) {
						throw new TRPCError({
							code: 'NOT_FOUND',
							message: 'Variant not found',
						});
					}

					await authorizeWebsiteAccess(ctx, existing[0].websiteId, 'update');

					const [updated] = await ctx.db
						.update(abVariants)
						.set({
							...updateData,
							updatedAt: new Date(),
						})
						.where(eq(abVariants.id, id))
						.returning();

					// Invalidate cache
					await drizzleCache.invalidateByKey(
						`experiments:byId:${existing[0].experimentId}:${existing[0].websiteId}`
					);

					return updated;
				} catch (error) {
					if (error instanceof TRPCError) {
						throw error;
					}

					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: 'Failed to update variant',
					});
				}
			}),

		// Delete variant
		delete: protectedProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ ctx, input }) => {
				try {
					// Get variant with experiment info
					const existing = await ctx.db
						.select({
							experimentId: abVariants.experimentId,
							websiteId: abExperiments.websiteId,
						})
						.from(abVariants)
						.innerJoin(
							abExperiments,
							eq(abVariants.experimentId, abExperiments.id)
						)
						.where(eq(abVariants.id, input.id))
						.limit(1);

					if (!existing.length) {
						throw new TRPCError({
							code: 'NOT_FOUND',
							message: 'Variant not found',
						});
					}

					await authorizeWebsiteAccess(ctx, existing[0].websiteId, 'delete');

					await ctx.db.delete(abVariants).where(eq(abVariants.id, input.id));

					// Invalidate cache
					await drizzleCache.invalidateByKey(
						`experiments:byId:${existing[0].experimentId}:${existing[0].websiteId}`
					);

					return { success: true };
				} catch (error) {
					if (error instanceof TRPCError) {
						throw error;
					}

					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: 'Failed to delete variant',
					});
				}
			}),
	}),

	// Goal management
	goals: createTRPCRouter({
		// Create goal
		create: protectedProcedure
			.input(createGoalSchema)
			.mutation(async ({ ctx, input }) => {
				try {
					// Verify experiment exists and user has access
					const experiment = await ctx.db
						.select({ websiteId: abExperiments.websiteId })
						.from(abExperiments)
						.where(
							and(
								eq(abExperiments.id, input.experimentId),
								isNull(abExperiments.deletedAt)
							)
						)
						.limit(1);

					if (!experiment.length) {
						throw new TRPCError({
							code: 'NOT_FOUND',
							message: 'Experiment not found',
						});
					}

					await authorizeWebsiteAccess(ctx, experiment[0].websiteId, 'update');

					const [goal] = await ctx.db
						.insert(abGoals)
						.values({
							id: crypto.randomUUID(),
							...input,
							createdAt: new Date(),
							updatedAt: new Date(),
						})
						.returning();

					// Invalidate cache
					await drizzleCache.invalidateByKey(
						`experiments:byId:${input.experimentId}:${experiment[0].websiteId}`
					);

					return goal;
				} catch (error) {
					if (error instanceof TRPCError) {
						throw error;
					}

					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: 'Failed to create goal',
					});
				}
			}),

		// Update goal
		update: protectedProcedure
			.input(updateGoalSchema)
			.mutation(async ({ ctx, input }) => {
				const { id, ...updateData } = input;

				try {
					// Get goal with experiment info
					const existing = await ctx.db
						.select({
							experimentId: abGoals.experimentId,
							websiteId: abExperiments.websiteId,
						})
						.from(abGoals)
						.innerJoin(
							abExperiments,
							eq(abGoals.experimentId, abExperiments.id)
						)
						.where(eq(abGoals.id, id))
						.limit(1);

					if (!existing.length) {
						throw new TRPCError({
							code: 'NOT_FOUND',
							message: 'Goal not found',
						});
					}

					await authorizeWebsiteAccess(ctx, existing[0].websiteId, 'update');

					const [updated] = await ctx.db
						.update(abGoals)
						.set({
							...updateData,
							updatedAt: new Date(),
						})
						.where(eq(abGoals.id, id))
						.returning();

					// Invalidate cache
					await drizzleCache.invalidateByKey(
						`experiments:byId:${existing[0].experimentId}:${existing[0].websiteId}`
					);

					return updated;
				} catch (error) {
					if (error instanceof TRPCError) {
						throw error;
					}

					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: 'Failed to update goal',
					});
				}
			}),

		// Delete goal
		delete: protectedProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ ctx, input }) => {
				try {
					// Get goal with experiment info
					const existing = await ctx.db
						.select({
							experimentId: abGoals.experimentId,
							websiteId: abExperiments.websiteId,
						})
						.from(abGoals)
						.innerJoin(
							abExperiments,
							eq(abGoals.experimentId, abExperiments.id)
						)
						.where(eq(abGoals.id, input.id))
						.limit(1);

					if (!existing.length) {
						throw new TRPCError({
							code: 'NOT_FOUND',
							message: 'Goal not found',
						});
					}

					await authorizeWebsiteAccess(ctx, existing[0].websiteId, 'delete');

					await ctx.db.delete(abGoals).where(eq(abGoals.id, input.id));

					// Invalidate cache
					await drizzleCache.invalidateByKey(
						`experiments:byId:${existing[0].experimentId}:${existing[0].websiteId}`
					);

					return { success: true };
				} catch (error) {
					if (error instanceof TRPCError) {
						throw error;
					}

					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: 'Failed to delete goal',
					});
				}
			}),
	}),
});
