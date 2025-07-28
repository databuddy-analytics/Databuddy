import { goals } from '@databuddy/db';
import { createDrizzleCache, redis } from '@databuddy/redis';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
	type AnalyticsStep,
	getTotalWebsiteUsers,
	processGoalAnalytics,
} from '../lib/analytics-utils';
import { logger } from '../lib/logger';
import { createTRPCRouter, protectedProcedure } from '../trpc';
import { authorizeWebsiteAccess } from '../utils/auth';

const drizzleCache = createDrizzleCache({ redis, namespace: 'goals' });

const CACHE_TTL = 300;
const ANALYTICS_CACHE_TTL = 600;

const goalSchema = z.object({
	type: z.enum(['PAGE_VIEW', 'EVENT', 'CUSTOM']),
	target: z.string().min(1),
	name: z.string().min(1).max(100),
	description: z.string().optional(),
	filters: z
		.array(
			z.object({
				field: z.string(),
				operator: z.enum(['equals', 'contains', 'not_equals', 'in', 'not_in']),
				value: z.union([z.string(), z.array(z.string())]),
			})
		)
		.optional(),
});

const createGoalSchema = z.object({
	websiteId: z.string(),
	...goalSchema.shape,
});

const updateGoalSchema = z.object({
	id: z.string(),
	type: z.enum(['PAGE_VIEW', 'EVENT', 'CUSTOM']).optional(),
	target: z.string().min(1).optional(),
	name: z.string().min(1).max(100).optional(),
	description: z.string().optional(),
	filters: z
		.array(
			z.object({
				field: z.string(),
				operator: z.enum(['equals', 'contains', 'not_equals', 'in', 'not_in']),
				value: z.union([z.string(), z.array(z.string())]),
			})
		)
		.optional(),
	isActive: z.boolean().optional(),
});

const analyticsDateRangeSchema = z.object({
	goalId: z.string(),
	websiteId: z.string(),
	startDate: z.string().optional(),
	endDate: z.string().optional(),
});

const getDefaultDateRange = () => {
	const endDate = new Date().toISOString().split('T')[0];
	const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
		.toISOString()
		.split('T')[0];
	return { startDate, endDate };
};

export const goalsRouter = createTRPCRouter({
	list: protectedProcedure
		.input(z.object({ websiteId: z.string() }))
		.query(({ ctx, input }) => {
			const cacheKey = `goals:list:${input.websiteId}`;

			return drizzleCache.withCache({
				key: cacheKey,
				ttl: CACHE_TTL,
				tables: ['goals'],
				queryFn: async () => {
					await authorizeWebsiteAccess(ctx, input.websiteId, 'read');
					return ctx.db
						.select()
						.from(goals)
						.where(
							and(eq(goals.websiteId, input.websiteId), isNull(goals.deletedAt))
						)
						.orderBy(desc(goals.createdAt));
				},
			});
		}),

	getById: protectedProcedure
		.input(z.object({ id: z.string(), websiteId: z.string() }))
		.query(({ ctx, input }) => {
			const cacheKey = `goals:byId:${input.id}:${input.websiteId}`;

			return drizzleCache.withCache({
				key: cacheKey,
				ttl: CACHE_TTL,
				tables: ['goals'],
				queryFn: async () => {
					await authorizeWebsiteAccess(ctx, input.websiteId, 'read');
					const result = await ctx.db
						.select()
						.from(goals)
						.where(
							and(
								eq(goals.id, input.id),
								eq(goals.websiteId, input.websiteId),
								isNull(goals.deletedAt)
							)
						)
						.limit(1);
					if (result.length === 0) {
						throw new TRPCError({
							code: 'NOT_FOUND',
							message: 'Goal not found',
						});
					}
					return result[0];
				},
			});
		}),

	create: protectedProcedure
		.input(createGoalSchema)
		.mutation(async ({ ctx, input }) => {
			await authorizeWebsiteAccess(ctx, input.websiteId, 'update');
			const goalId = crypto.randomUUID();
			const [newGoal] = await ctx.db
				.insert(goals)
				.values({
					id: goalId,
					websiteId: input.websiteId,
					type: input.type,
					target: input.target,
					name: input.name,
					description: input.description,
					filters: input.filters,
					isActive: true,
					createdBy: ctx.user.id,
				})
				.returning();

			await drizzleCache.invalidateByTables(['goals']);

			return newGoal;
		}),

	update: protectedProcedure
		.input(updateGoalSchema)
		.mutation(async ({ ctx, input }) => {
			const existingGoal = await ctx.db
				.select({ websiteId: goals.websiteId })
				.from(goals)
				.where(and(eq(goals.id, input.id), isNull(goals.deletedAt)))
				.limit(1);
			if (existingGoal.length === 0) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Goal not found' });
			}
			await authorizeWebsiteAccess(ctx, existingGoal[0].websiteId, 'update');
			const { id, ...updates } = input;
			const [updatedGoal] = await ctx.db
				.update(goals)
				.set({
					...updates,
					updatedAt: new Date().toISOString(),
				})
				.where(and(eq(goals.id, id), isNull(goals.deletedAt)))
				.returning();

			await Promise.all([
				drizzleCache.invalidateByTables(['goals']),
				drizzleCache.invalidateByKey(
					`goals:byId:${id}:${existingGoal[0].websiteId}`
				),
			]);

			return updatedGoal;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const existingGoal = await ctx.db
				.select({ websiteId: goals.websiteId })
				.from(goals)
				.where(and(eq(goals.id, input.id), isNull(goals.deletedAt)))
				.limit(1);
			if (existingGoal.length === 0) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Goal not found' });
			}
			await authorizeWebsiteAccess(ctx, existingGoal[0].websiteId, 'delete');
			await ctx.db
				.update(goals)
				.set({
					deletedAt: new Date().toISOString(),
					isActive: false,
				})
				.where(and(eq(goals.id, input.id), isNull(goals.deletedAt)));

			await Promise.all([
				drizzleCache.invalidateByTables(['goals']),
				drizzleCache.invalidateByKey(
					`goals:byId:${input.id}:${existingGoal[0].websiteId}`
				),
			]);

			return { success: true };
		}),

	getAnalytics: protectedProcedure
		.input(analyticsDateRangeSchema)
		.query(({ ctx, input }) => {
			const { startDate, endDate } =
				input.startDate && input.endDate
					? { startDate: input.startDate, endDate: input.endDate }
					: getDefaultDateRange();

			const cacheKey = `goals:analytics:${input.goalId}:${input.websiteId}:${startDate}:${endDate}`;

			return drizzleCache.withCache({
				key: cacheKey,
				ttl: ANALYTICS_CACHE_TTL,
				tables: ['goals'],
				queryFn: async () => {
					await authorizeWebsiteAccess(ctx, input.websiteId, 'read');
					const goal = await ctx.db
						.select()
						.from(goals)
						.where(
							and(
								eq(goals.id, input.goalId),
								eq(goals.websiteId, input.websiteId),
								isNull(goals.deletedAt)
							)
						)
						.limit(1);
					if (goal.length === 0) {
						throw new TRPCError({
							code: 'NOT_FOUND',
							message: 'Goal not found',
						});
					}
					const goalData = goal[0];
					const steps: AnalyticsStep[] = [
						{
							step_number: 1,
							type: goalData.type as 'PAGE_VIEW' | 'EVENT',
							target: goalData.target,
							name: goalData.name,
						},
					];
					const filters =
						(goalData.filters as Array<{
							field: string;
							operator: string;
							value: string | string[];
						}>) || [];
					const totalWebsiteUsers = await getTotalWebsiteUsers(
						input.websiteId,
						startDate,
						endDate
					);
					const params: Record<string, unknown> = {
						websiteId: input.websiteId,
						startDate,
						endDate: `${endDate} 23:59:59`,
					};
					return processGoalAnalytics(
						steps,
						filters,
						params,
						totalWebsiteUsers
					);
				},
			});
		}),

	bulkAnalytics: protectedProcedure
		.input(
			z.object({
				websiteId: z.string(),
				goalIds: z.array(z.string()),
				startDate: z.string().optional(),
				endDate: z.string().optional(),
			})
		)
		.query(({ ctx, input }) => {
			const { startDate, endDate } =
				input.startDate && input.endDate
					? { startDate: input.startDate, endDate: input.endDate }
					: getDefaultDateRange();

			const cacheKey = `goals:bulkAnalytics:${input.websiteId}:${input.goalIds.sort().join(',')}:${startDate}:${endDate}`;

			return drizzleCache.withCache({
				key: cacheKey,
				ttl: ANALYTICS_CACHE_TTL,
				tables: ['goals'],
				queryFn: async () => {
					await authorizeWebsiteAccess(ctx, input.websiteId, 'read');
					const goalsList = await ctx.db
						.select()
						.from(goals)
						.where(
							and(
								eq(goals.websiteId, input.websiteId),
								isNull(goals.deletedAt),
								input.goalIds.length > 0
									? inArray(goals.id, input.goalIds)
									: sql`1=0`
							)
						)
						.orderBy(desc(goals.createdAt));
					const totalWebsiteUsers = await getTotalWebsiteUsers(
						input.websiteId,
						startDate,
						endDate
					);

					const analyticsPromises = goalsList.map(async (goalData) => {
						const steps: AnalyticsStep[] = [
							{
								step_number: 1,
								type: goalData.type as 'PAGE_VIEW' | 'EVENT',
								target: goalData.target,
								name: goalData.name,
							},
						];
						const localParams: Record<string, unknown> = {
							websiteId: input.websiteId,
							startDate,
							endDate: `${endDate} 23:59:59`,
						};
						const filters =
							(goalData.filters as Array<{
								field: string;
								operator: string;
								value: string | string[];
							}>) || [];
						try {
							const processedAnalytics = await processGoalAnalytics(
								steps,
								filters,
								localParams,
								totalWebsiteUsers
							);
							return { id: goalData.id, result: processedAnalytics };
						} catch (error) {
							logger.error('Failed to process goal analytics', {
								goalId: goalData.id,
								error: error instanceof Error ? error.message : String(error),
							});
							return {
								id: goalData.id,
								result: {
									error: `Error processing goal ${goalData.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
								},
							};
						}
					});

					const analyticsResultsArray = await Promise.all(analyticsPromises);
					const analyticsResults: Record<string, unknown> = {};
					for (const { id, result } of analyticsResultsArray) {
						analyticsResults[id] = result;
					}
					return analyticsResults;
				},
			});
		}),
});
