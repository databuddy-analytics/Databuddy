import { funnelDefinitions } from '@databuddy/db';
import { createDrizzleCache, redis } from '@databuddy/redis';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod/v4';
import {
	type AnalyticsStep,
	processFunnelAnalytics,
	processFunnelAnalyticsByReferrer,
} from '../lib/analytics-utils';
import { logger } from '../lib/logger';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';
import { authorizeWebsiteAccess } from '../utils/auth';

const drizzleCache = createDrizzleCache({ redis, namespace: 'funnels' });

const CACHE_TTL = 300;
const ANALYTICS_CACHE_TTL = 600;

const funnelStepSchema = z.object({
	type: z.enum(['PAGE_VIEW', 'EVENT', 'CUSTOM']),
	target: z.string().min(1),
	name: z.string().min(1),
	conditions: z.record(z.string(), z.any()).optional(),
});

const funnelFilterSchema = z.object({
	field: z.string(),
	operator: z.enum(['equals', 'contains', 'not_equals', 'in', 'not_in']),
	value: z.union([z.string(), z.array(z.string())]),
});

const createFunnelSchema = z.object({
	websiteId: z.string(),
	name: z.string().min(1).max(100),
	description: z.string().optional(),
	steps: z.array(funnelStepSchema).min(2).max(10),
	filters: z.array(funnelFilterSchema).optional(),
});

const updateFunnelSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100).optional(),
	description: z.string().optional(),
	steps: z.array(funnelStepSchema).min(2).max(10).optional(),
	filters: z.array(funnelFilterSchema).optional(),
	isActive: z.boolean().optional(),
});

const funnelAnalyticsSchema = z.object({
	funnelId: z.string(),
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

export const funnelsRouter = createTRPCRouter({
	list: publicProcedure
		.input(z.object({ websiteId: z.string() }))
		.query(({ ctx, input }) => {
			const cacheKey = `funnels:list:${input.websiteId}`;

			return drizzleCache.withCache({
				key: cacheKey,
				ttl: CACHE_TTL,
				tables: ['funnelDefinitions'],
				queryFn: async () => {
					await authorizeWebsiteAccess(ctx, input.websiteId, 'read');

					try {
						const funnels = await ctx.db
							.select({
								id: funnelDefinitions.id,
								name: funnelDefinitions.name,
								description: funnelDefinitions.description,
								steps: funnelDefinitions.steps,
								filters: funnelDefinitions.filters,
								isActive: funnelDefinitions.isActive,
								createdAt: funnelDefinitions.createdAt,
								updatedAt: funnelDefinitions.updatedAt,
							})
							.from(funnelDefinitions)
							.where(
								and(
									eq(funnelDefinitions.websiteId, input.websiteId),
									isNull(funnelDefinitions.deletedAt),
									sql`jsonb_array_length(${funnelDefinitions.steps}) > 1`
								)
							)
							.orderBy(desc(funnelDefinitions.createdAt));

						return funnels;
					} catch (error) {
						logger.error('Failed to fetch funnels', {
							error: error instanceof Error ? error.message : String(error),
							websiteId: input.websiteId,
						});
						throw new TRPCError({
							code: 'INTERNAL_SERVER_ERROR',
							message: 'Failed to fetch funnels',
						});
					}
				},
			});
		}),

	getById: protectedProcedure
		.input(z.object({ id: z.string(), websiteId: z.string() }))
		.query(({ ctx, input }) => {
			const cacheKey = `funnels:byId:${input.id}:${input.websiteId}`;

			return drizzleCache.withCache({
				key: cacheKey,
				ttl: CACHE_TTL,
				tables: ['funnelDefinitions'],
				queryFn: async () => {
					await authorizeWebsiteAccess(ctx, input.websiteId, 'read');

					try {
						const funnel = await ctx.db
							.select()
							.from(funnelDefinitions)
							.where(
								and(
									eq(funnelDefinitions.id, input.id),
									eq(funnelDefinitions.websiteId, input.websiteId),
									isNull(funnelDefinitions.deletedAt)
								)
							)
							.limit(1);

						if (funnel.length === 0) {
							throw new TRPCError({
								code: 'NOT_FOUND',
								message: 'Funnel not found',
							});
						}

						return funnel[0];
					} catch (error) {
						if (error instanceof TRPCError) {
							throw error;
						}

						logger.error('Failed to fetch funnel', {
							error: error instanceof Error ? error.message : String(error),
							funnelId: input.id,
							websiteId: input.websiteId,
						});
						throw new TRPCError({
							code: 'INTERNAL_SERVER_ERROR',
							message: 'Failed to fetch funnel',
						});
					}
				},
			});
		}),

	create: protectedProcedure
		.input(createFunnelSchema)
		.mutation(async ({ ctx, input }) => {
			await authorizeWebsiteAccess(ctx, input.websiteId, 'update');

			try {
				const funnelId = crypto.randomUUID();

				const [newFunnel] = await ctx.db
					.insert(funnelDefinitions)
					.values({
						id: funnelId,
						websiteId: input.websiteId,
						name: input.name,
						description: input.description,
						steps: input.steps,
						filters: input.filters,
						createdBy: ctx.user.id,
					})
					.returning();

				await drizzleCache.invalidateByTables(['funnelDefinitions']);

				logger.info('Funnel created', {
					message: `Created funnel "${input.name}"`,
					funnelId,
					websiteId: input.websiteId,
					userId: ctx.user.id,
				});

				return newFunnel;
			} catch (error) {
				logger.error('Failed to create funnel', {
					error: error instanceof Error ? error.message : String(error),
					websiteId: input.websiteId,
					userId: ctx.user.id,
				});
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to create funnel',
				});
			}
		}),

	update: protectedProcedure
		.input(updateFunnelSchema)
		.mutation(async ({ ctx, input }) => {
			const existingFunnel = await ctx.db
				.select({ websiteId: funnelDefinitions.websiteId })
				.from(funnelDefinitions)
				.where(
					and(
						eq(funnelDefinitions.id, input.id),
						isNull(funnelDefinitions.deletedAt)
					)
				)
				.limit(1);
			if (existingFunnel.length === 0) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Funnel not found' });
			}
			await authorizeWebsiteAccess(ctx, existingFunnel[0].websiteId, 'update');

			try {
				const { id, ...updates } = input;
				const [updatedFunnel] = await ctx.db
					.update(funnelDefinitions)
					.set({
						...updates,
						updatedAt: new Date(),
					})
					.where(
						and(
							eq(funnelDefinitions.id, id),
							isNull(funnelDefinitions.deletedAt)
						)
					)
					.returning();

				await Promise.all([
					drizzleCache.invalidateByTables(['funnelDefinitions']),
					drizzleCache.invalidateByKey(
						`funnels:byId:${id}:${existingFunnel[0].websiteId}`
					),
				]);

				return updatedFunnel;
			} catch (error) {
				logger.error('Failed to update funnel', {
					error: error instanceof Error ? error.message : String(error),
					funnelId: input.id,
					websiteId: existingFunnel[0].websiteId,
				});
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to update funnel',
				});
			}
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const existingFunnel = await ctx.db
				.select({ websiteId: funnelDefinitions.websiteId })
				.from(funnelDefinitions)
				.where(
					and(
						eq(funnelDefinitions.id, input.id),
						isNull(funnelDefinitions.deletedAt)
					)
				)
				.limit(1);
			if (existingFunnel.length === 0) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Funnel not found' });
			}
			await authorizeWebsiteAccess(ctx, existingFunnel[0].websiteId, 'delete');

			try {
				await ctx.db
					.update(funnelDefinitions)
					.set({
						deletedAt: new Date(),
						isActive: false,
					})
					.where(
						and(
							eq(funnelDefinitions.id, input.id),
							isNull(funnelDefinitions.deletedAt)
						)
					);

				await Promise.all([
					drizzleCache.invalidateByTables(['funnelDefinitions']),
					drizzleCache.invalidateByKey(
						`funnels:byId:${input.id}:${existingFunnel[0].websiteId}`
					),
				]);

				return { success: true };
			} catch (error) {
				logger.error('Failed to delete funnel', {
					error: error instanceof Error ? error.message : String(error),
					funnelId: input.id,
					websiteId: existingFunnel[0].websiteId,
				});
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to delete funnel',
				});
			}
		}),

	getAnalytics: publicProcedure
		.input(funnelAnalyticsSchema)
		.query(({ ctx, input }) => {
			const { startDate, endDate } =
				input.startDate && input.endDate
					? { startDate: input.startDate, endDate: input.endDate }
					: getDefaultDateRange();

			const cacheKey = `funnels:analytics:${input.funnelId}:${input.websiteId}:${startDate}:${endDate}`;

			return drizzleCache.withCache({
				key: cacheKey,
				ttl: ANALYTICS_CACHE_TTL,
				tables: ['funnelDefinitions'],
				queryFn: async () => {
					await authorizeWebsiteAccess(ctx, input.websiteId, 'read');

					try {
						const funnel = await ctx.db
							.select()
							.from(funnelDefinitions)
							.where(
								and(
									eq(funnelDefinitions.id, input.funnelId),
									eq(funnelDefinitions.websiteId, input.websiteId),
									isNull(funnelDefinitions.deletedAt)
								)
							)
							.limit(1);

						if (funnel.length === 0) {
							throw new TRPCError({
								code: 'NOT_FOUND',
								message: 'Funnel not found',
							});
						}

						const funnelData = funnel[0];
						const steps = funnelData.steps as Array<{
							type: string;
							target: string;
							name: string;
							conditions?: Record<string, unknown>;
						}>;

						const filters =
							(funnelData.filters as Array<{
								field: string;
								operator: string;
								value: string | string[];
							}>) || [];

						const params: Record<string, unknown> = {
							websiteId: input.websiteId,
							startDate,
							endDate: `${endDate} 23:59:59`,
						};

						const analyticsSteps: AnalyticsStep[] = steps.map(
							(step, index) => ({
								step_number: index + 1,
								type: step.type as 'PAGE_VIEW' | 'EVENT',
								target: step.target,
								name: step.name,
							})
						);

						return processFunnelAnalytics(analyticsSteps, filters, params);
					} catch (error) {
						if (error instanceof TRPCError) {
							throw error;
						}

						logger.error('Failed to fetch funnel analytics', {
							error: error instanceof Error ? error.message : String(error),
							funnelId: input.funnelId,
							websiteId: input.websiteId,
						});
						throw new TRPCError({
							code: 'INTERNAL_SERVER_ERROR',
							message: 'Failed to fetch funnel analytics',
						});
					}
				},
			});
		}),

	getAnalyticsByReferrer: publicProcedure
		.input(funnelAnalyticsSchema)
		.query(({ ctx, input }) => {
			const { startDate, endDate } =
				input.startDate && input.endDate
					? { startDate: input.startDate, endDate: input.endDate }
					: getDefaultDateRange();

			const cacheKey = `funnels:analyticsByReferrer:${input.funnelId}:${input.websiteId}:${startDate}:${endDate}`;

			return drizzleCache.withCache({
				key: cacheKey,
				ttl: ANALYTICS_CACHE_TTL,
				tables: ['funnelDefinitions'],
				queryFn: async () => {
					await authorizeWebsiteAccess(ctx, input.websiteId, 'read');

					try {
						const funnel = await ctx.db
							.select()
							.from(funnelDefinitions)
							.where(
								and(
									eq(funnelDefinitions.id, input.funnelId),
									eq(funnelDefinitions.websiteId, input.websiteId),
									isNull(funnelDefinitions.deletedAt)
								)
							)
							.limit(1);

						if (funnel.length === 0) {
							throw new TRPCError({
								code: 'NOT_FOUND',
								message: 'Funnel not found',
							});
						}

						const funnelData = funnel[0];
						const steps = funnelData.steps as Array<{
							type: string;
							target: string;
							name: string;
							conditions?: Record<string, unknown>;
						}>;

						if (!steps || steps.length === 0) {
							throw new TRPCError({
								code: 'BAD_REQUEST',
								message: 'Funnel has no steps',
							});
						}

						const filters =
							(funnelData.filters as Array<{
								field: string;
								operator: string;
								value: string | string[];
							}>) || [];

						const params: Record<string, unknown> = {
							websiteId: input.websiteId,
							startDate,
							endDate: `${endDate} 23:59:59`,
						};

						const analyticsSteps: AnalyticsStep[] = steps.map(
							(step, index) => ({
								step_number: index + 1,
								type: step.type as 'PAGE_VIEW' | 'EVENT',
								target: step.target,
								name: step.name,
							})
						);

						return processFunnelAnalyticsByReferrer(
							analyticsSteps,
							filters,
							params
						);
					} catch (error) {
						if (error instanceof TRPCError) {
							throw error;
						}

						logger.error('Failed to fetch funnel analytics by referrer', {
							error: error instanceof Error ? error.message : String(error),
							funnelId: input.funnelId,
							websiteId: input.websiteId,
						});
						throw new TRPCError({
							code: 'INTERNAL_SERVER_ERROR',
							message: 'Failed to fetch funnel analytics by referrer',
						});
					}
				},
			});
		}),
});
