import { websitesApi } from '@databuddy/auth';
import { chQuery } from '@databuddy/db';
import { createDrizzleCache, redis } from '@databuddy/redis';
import { logger, type ProcessedMiniChartData } from '@databuddy/shared';
import { transferWebsiteSchema } from '@databuddy/validation';
import { TRPCError } from '@trpc/server';
import { Effect, pipe } from 'effect';
import { z } from 'zod';
import {
	buildWebsiteFilter,
	DuplicateDomainError,
	domainSchema,
	subdomainSchema,
	ValidationError,
	type WebsiteError,
	WebsiteNotFoundError,
	WebsiteService,
	websiteNameSchema,
} from '../services/website-service';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';
import { authorizeWebsiteAccess } from '../utils/auth';
import { invalidateWebsiteCaches } from '../utils/cache-invalidation';

const createWebsiteSchema = z.object({
	name: websiteNameSchema,
	domain: domainSchema,
	subdomain: subdomainSchema,
	organizationId: z.string().optional(),
});

const updateWebsiteSchema = z.object({
	id: z.string(),
	name: websiteNameSchema,
	domain: domainSchema.optional(),
});

const togglePublicWebsiteSchema = z.object({
	id: z.string(),
	isPublic: z.boolean(),
});

const websiteCache = createDrizzleCache({ redis, namespace: 'websites' });
const CACHE_DURATION = 60; // seconds
const TREND_THRESHOLD = 5; // percentage

interface ChartDataPoint {
	websiteId: string;
	date: string;
	value: number;
}

const calculateAverage = (values: { value: number }[]) =>
	values.length > 0
		? values.reduce((sum, item) => sum + item.value, 0) / values.length
		: 0;

const calculateTrend = (dataPoints: { date: string; value: number }[]) => {
	if (!dataPoints?.length || dataPoints.length < 4) {
		return null;
	}

	const midPoint = Math.floor(dataPoints.length / 2);
	const firstHalf = dataPoints.slice(0, midPoint);
	const secondHalf = dataPoints.slice(midPoint);

	const previousAverage = calculateAverage(firstHalf);
	const currentAverage = calculateAverage(secondHalf);

	if (previousAverage === 0) {
		return currentAverage > 0
			? { type: 'up' as const, value: 100 }
			: { type: 'neutral' as const, value: 0 };
	}

	const percentageChange =
		((currentAverage - previousAverage) / previousAverage) * 100;

	if (percentageChange > TREND_THRESHOLD) {
		return { type: 'up' as const, value: Math.abs(percentageChange) };
	}
	if (percentageChange < -TREND_THRESHOLD) {
		return { type: 'down' as const, value: Math.abs(percentageChange) };
	}
	return { type: 'neutral' as const, value: Math.abs(percentageChange) };
};

const fetchChartData = async (
	websiteIds: string[]
): Promise<Record<string, ProcessedMiniChartData>> => {
	if (!websiteIds.length) {
		return {};
	}

	const chartQuery = `
    WITH
      date_range AS (
        SELECT arrayJoin(arrayMap(d -> toDate(today()) - d, range(7))) AS date
      ),
      daily_pageviews AS (
        SELECT
          client_id,
          toDate(time) as event_date,
          countIf(event_name = 'screen_view') as pageviews
        FROM analytics.events
        WHERE
          client_id IN {websiteIds:Array(String)}
          AND toDate(time) >= (today() - 6)
        GROUP BY client_id, event_date
      )
    SELECT
      all_websites.website_id AS websiteId,
      toString(date_range.date) AS date,
      COALESCE(daily_pageviews.pageviews, 0) AS value
    FROM
      (SELECT arrayJoin({websiteIds:Array(String)}) AS website_id) AS all_websites
    CROSS JOIN
      date_range
    LEFT JOIN
      daily_pageviews ON all_websites.website_id = daily_pageviews.client_id AND date_range.date = daily_pageviews.event_date
    ORDER BY
      websiteId,
      date ASC
  `;

	const queryResults = await chQuery<ChartDataPoint>(chartQuery, {
		websiteIds,
	});

	const groupedData = websiteIds.reduce(
		(acc, id) => {
			acc[id] = [];
			return acc;
		},
		{} as Record<string, { date: string; value: number }[]>
	);

	for (const row of queryResults) {
		groupedData[row.websiteId]?.push({
			date: row.date,
			value: row.value,
		});
	}

	const processedData: Record<string, ProcessedMiniChartData> = {};

	for (const websiteId of websiteIds) {
		const dataPoints = groupedData[websiteId] || [];
		const totalViews = dataPoints.reduce((sum, point) => sum + point.value, 0);
		const trend = calculateTrend(dataPoints);

		processedData[websiteId] = {
			data: dataPoints,
			totalViews,
			trend,
		};
	}

	return processedData;
};

export const websitesRouter = createTRPCRouter({
	list: protectedProcedure
		.input(z.object({ organizationId: z.string().optional() }).default({}))
		.query(({ ctx, input }) => {
			const listCacheKey = `list:${ctx.user.id}:${input.organizationId || ''}`;
			return websiteCache.withCache({
				key: listCacheKey,
				ttl: CACHE_DURATION,
				tables: ['websites'],
				queryFn: async () => {
					if (input.organizationId) {
						const { success } = await websitesApi.hasPermission({
							headers: ctx.headers,
							body: { permissions: { website: ['read'] } },
						});
						if (!success) {
							throw new TRPCError({
								code: 'FORBIDDEN',
								message: 'Missing organization permissions.',
							});
						}
					}
					const whereClause = buildWebsiteFilter(
						ctx.user.id,
						input.organizationId
					);
					return ctx.db.query.websites.findMany({
						where: whereClause,
						orderBy: (table, { desc }) => [desc(table.createdAt)],
					});
				},
			});
		}),

	listWithCharts: protectedProcedure
		.input(z.object({ organizationId: z.string().optional() }).default({}))
		.query(({ ctx, input }) => {
			const chartsListCacheKey = `listWithCharts:${ctx.user.id}:${input.organizationId || ''}`;

			return websiteCache.withCache({
				key: chartsListCacheKey,
				ttl: CACHE_DURATION,
				tables: ['websites'],
				queryFn: async () => {
					if (input.organizationId) {
						const { success } = await websitesApi.hasPermission({
							headers: ctx.headers,
							body: { permissions: { website: ['read'] } },
						});
						if (!success) {
							throw new TRPCError({
								code: 'FORBIDDEN',
								message: 'Missing organization permissions.',
							});
						}
					}
					const whereClause = buildWebsiteFilter(
						ctx.user.id,
						input.organizationId
					);

					const websitesList = await ctx.db.query.websites.findMany({
						where: whereClause,
						orderBy: (table, { desc }) => [desc(table.createdAt)],
					});

					const websiteIds = websitesList.map((site) => site.id);
					const chartData = await fetchChartData(websiteIds);

					return {
						websites: websitesList,
						chartData,
					};
				},
			});
		}),

	getById: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(({ ctx, input }) => {
			const getByIdCacheKey = `getById:${input.id}`;
			return websiteCache.withCache({
				key: getByIdCacheKey,
				ttl: CACHE_DURATION,
				tables: ['websites'],
				queryFn: () => authorizeWebsiteAccess(ctx, input.id, 'read'),
			});
		}),

	create: protectedProcedure
		.input(createWebsiteSchema)
		.mutation(async ({ ctx, input }) => {
			if (input.organizationId) {
				const { success } = await websitesApi.hasPermission({
					headers: ctx.headers,
					body: { permissions: { website: ['create'] } },
				});
				if (!success) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: 'Missing organization permissions.',
					});
				}
			}

			const serviceInput = {
				name: input.name,
				domain: input.domain,
				subdomain: input.subdomain,
				userId: ctx.user.id,
				organizationId: input.organizationId,
			};

			const result = await pipe(
				new WebsiteService(ctx.db).createWebsite(serviceInput),
				Effect.mapError((error: WebsiteError) => {
					if (error instanceof ValidationError) {
						return new TRPCError({
							code: 'BAD_REQUEST',
							message: error.message,
						});
					}
					if (error instanceof DuplicateDomainError) {
						return new TRPCError({ code: 'CONFLICT', message: error.message });
					}
					return new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: error.message,
					});
				}),
				Effect.runPromise
			);

			return result;
		}),

	update: protectedProcedure
		.input(updateWebsiteSchema)
		.mutation(async ({ ctx, input }) => {
			const websiteToUpdate = await authorizeWebsiteAccess(
				ctx,
				input.id,
				'update'
			);

			const serviceInput = {
				name: input.name,
				domain: input.domain,
			};

			const updatedWebsite = await pipe(
				new WebsiteService(ctx.db).updateWebsite(
					input.id,
					serviceInput,
					ctx.user.id,
					websiteToUpdate.organizationId
				),
				Effect.mapError((error: WebsiteError) => {
					if (error instanceof ValidationError) {
						return new TRPCError({
							code: 'BAD_REQUEST',
							message: error.message,
						});
					}
					if (error instanceof DuplicateDomainError) {
						return new TRPCError({ code: 'CONFLICT', message: error.message });
					}
					if (error instanceof WebsiteNotFoundError) {
						return new TRPCError({ code: 'NOT_FOUND', message: error.message });
					}
					return new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: error.message,
					});
				}),
				Effect.runPromise
			);

			const changes: string[] = [];
			if (input.name !== websiteToUpdate.name) {
				changes.push(`name: "${websiteToUpdate.name}" → "${input.name}"`);
			}
			if (input.domain && input.domain !== websiteToUpdate.domain) {
				changes.push(
					`domain: "${websiteToUpdate.domain}" → "${updatedWebsite.domain}"`
				);
			}

			if (changes.length > 0) {
				logger.info('Website Updated', changes.join(', '), {
					websiteId: updatedWebsite.id,
					userId: ctx.user.id,
				});
			}

			return updatedWebsite;
		}),

	togglePublic: protectedProcedure
		.input(togglePublicWebsiteSchema)
		.mutation(async ({ ctx, input }) => {
			const website = await authorizeWebsiteAccess(ctx, input.id, 'update');

			const updatedWebsite = await pipe(
				new WebsiteService(ctx.db).toggleWebsitePublic(
					input.id,
					input.isPublic,
					ctx.user.id
				),
				Effect.mapError((error: WebsiteError) => {
					if (error instanceof WebsiteNotFoundError) {
						return new TRPCError({ code: 'NOT_FOUND', message: error.message });
					}
					return new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: error.message,
					});
				}),
				Effect.runPromise
			);

			logger.info(
				'Website Privacy Updated',
				`${website.domain} is now ${input.isPublic ? 'public' : 'private'}`,
				{
					websiteId: input.id,
					isPublic: input.isPublic,
					userId: ctx.user.id,
				}
			);

			return updatedWebsite;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const websiteToDelete = await authorizeWebsiteAccess(
				ctx,
				input.id,
				'delete'
			);

			await pipe(
				new WebsiteService(ctx.db).deleteWebsite(input.id, ctx.user.id),
				Effect.mapError((error: WebsiteError) => {
					return new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: error.message,
					});
				}),
				Effect.runPromise
			);

			logger.warning(
				'Website Deleted',
				`Website "${websiteToDelete.name}" with domain "${websiteToDelete.domain}" was deleted`,
				{
					websiteId: websiteToDelete.id,
					websiteName: websiteToDelete.name,
					domain: websiteToDelete.domain,
					userId: ctx.user.id,
				}
			);

			return { success: true };
		}),

	transfer: protectedProcedure
		.input(transferWebsiteSchema)
		.mutation(async ({ ctx, input }) => {
			await authorizeWebsiteAccess(ctx, input.websiteId, 'update');

			if (input.organizationId) {
				const { success } = await websitesApi.hasPermission({
					headers: ctx.headers,
					body: {
						organizationId: input.organizationId,
						permissions: { website: ['create'] },
					},
				});
				if (!success) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: 'Missing organization permissions.',
					});
				}
			}

			const result = await pipe(
				new WebsiteService(ctx.db).transferWebsite(
					input.websiteId,
					input.organizationId ?? null,
					ctx.user.id
				),
				Effect.mapError((error: WebsiteError) => {
					if (error instanceof WebsiteNotFoundError) {
						return new TRPCError({ code: 'NOT_FOUND', message: error.message });
					}
					return new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: error.message,
					});
				}),
				Effect.runPromise
			);

			return result;
		}),

	invalidateCaches: protectedProcedure
		.input(z.object({ websiteId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			await authorizeWebsiteAccess(ctx, input.websiteId, 'update');

			await pipe(
				Effect.tryPromise({
					try: () => invalidateWebsiteCaches(input.websiteId, ctx.user.id),
					catch: (error: WebsiteError) => new Error(String(error)),
				}),
				Effect.mapError(
					() =>
						new TRPCError({
							code: 'INTERNAL_SERVER_ERROR',
							message: 'Failed to invalidate caches',
						})
				),
				Effect.runPromise
			);

			return { success: true };
		}),

	isTrackingSetup: publicProcedure
		.input(z.object({ websiteId: z.string() }))
		.query(async ({ ctx, input }) => {
			const website = await authorizeWebsiteAccess(
				ctx,
				input.websiteId,
				'read'
			);

			const hasVercelIntegration = !!(
				website.integrations as unknown as {
					vercel?: { environments: unknown[] };
				}
			)?.vercel?.environments?.length;

			const trackingCheckResult = await chQuery<{ count: number }>(
				`SELECT COUNT(*) as count FROM analytics.events WHERE client_id = {websiteId:String} AND event_name = 'screen_view' LIMIT 1`,
				{ websiteId: input.websiteId }
			);

			const hasTrackingEvents = (trackingCheckResult[0]?.count ?? 0) > 0;

			// Determine integration type
			let integrationType: 'vercel' | 'manual' | null = null;
			if (hasVercelIntegration) {
				integrationType = 'vercel';
			} else if (hasTrackingEvents) {
				integrationType = 'manual';
			}

			return {
				tracking_setup: hasTrackingEvents,
				integration_type: integrationType,
			};
		}),
});
