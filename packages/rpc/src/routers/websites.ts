import { websitesApi } from '@databuddy/auth';
import { and, chQuery, eq, isNull, websites } from '@databuddy/db';
import { createDrizzleCache, redis } from '@databuddy/redis';
import { logger, type ProcessedMiniChartData } from '@databuddy/shared';
import {
	createWebsiteSchema,
	transferWebsiteSchema,
	updateWebsiteSchema,
} from '@databuddy/validation';
import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';
import { authorizeWebsiteAccess } from '../utils/auth';
import {
	checkAndTrackWebsiteCreation,
	getBillingCustomerId,
	trackWebsiteUsage,
} from '../utils/billing';

// Cache configuration
const websiteCache = createDrizzleCache({ redis, namespace: 'websites' });
const CACHE_DURATION = 60; // seconds
const TREND_THRESHOLD = 5; // percentage

// Types
interface ChartDataPoint {
	websiteId: string;
	date: string;
	value: number;
}

// Helper functions
const buildFullDomain = (domain: string, subdomain?: string) =>
	subdomain ? `${subdomain}.${domain}` : domain;

const buildWebsiteFilter = (userId: string, organizationId?: string) =>
	organizationId
		? eq(websites.organizationId, organizationId)
		: and(eq(websites.userId, userId), isNull(websites.organizationId));

const calculateAverage = (values: { value: number }[]) =>
	values.length > 0
		? values.reduce((sum, item) => sum + item.value, 0) / values.length
		: 0;

const calculateTrend = (dataPoints: { date: string; value: number }[]) => {
	if (!dataPoints?.length) {
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

// Router definition
export const websitesRouter = createTRPCRouter({
	list: protectedProcedure
		.input(z.object({ organizationId: z.string().optional() }).default({}))
		.query(({ ctx, input }) => {
			const listCacheKey = `list:${ctx.user.id}:${input.organizationId || ''}`;
			return websiteCache.withCache({
				key: listCacheKey,
				ttl: CACHE_DURATION,
				tables: ['websites'],
				queryFn: () => {
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
				tables: ['websites', 'member'],
				queryFn: async () => {
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
			// Validate organization permissions upfront
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

			const billingCustomerId = await getBillingCustomerId(
				ctx.user.id,
				input.organizationId
			);

			// Check billing limits before starting transaction
			const creationLimitCheck =
				await checkAndTrackWebsiteCreation(billingCustomerId);
			if (!creationLimitCheck.allowed) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: creationLimitCheck.error,
				});
			}

			const domainToCreate = buildFullDomain(input.domain, input.subdomain);
			const websiteFilter = and(
				eq(websites.domain, domainToCreate),
				buildWebsiteFilter(ctx.user.id, input.organizationId)
			);

			// Execute database operations in transaction
			const createdWebsite = await ctx.db.transaction(async (tx) => {
				// Check for duplicate websites within transaction
				const duplicateWebsite = await tx.query.websites.findFirst({
					where: websiteFilter,
				});

				if (duplicateWebsite) {
					const scopeDescription = input.organizationId
						? 'in this organization'
						: 'for your account';
					throw new TRPCError({
						code: 'CONFLICT',
						message: `A website with the domain "${domainToCreate}" already exists ${scopeDescription}.`,
					});
				}

				// Create website
				const [website] = await tx
					.insert(websites)
					.values({
						id: nanoid(),
						name: input.name,
						domain: domainToCreate,
						userId: ctx.user.id,
						organizationId: input.organizationId,
						status: 'ACTIVE',
					})
					.returning();

				return website;
			});

			// Log success after transaction completes
			logger.success(
				'Website Created',
				`New website "${createdWebsite.name}" was created with domain "${createdWebsite.domain}"`,
				{
					websiteId: createdWebsite.id,
					domain: createdWebsite.domain,
					userId: ctx.user.id,
					organizationId: createdWebsite.organizationId,
				}
			);

			// Invalidate cache after successful creation
			await websiteCache.invalidateByTables(['websites']);

			return createdWebsite;
		}),

	update: protectedProcedure
		.input(updateWebsiteSchema)
		.mutation(async ({ ctx, input }) => {
			// Authorize access before transaction
			const websiteToUpdate = await authorizeWebsiteAccess(
				ctx,
				input.id,
				'update'
			);

			// Execute update in transaction
			const updatedWebsite = await ctx.db.transaction(async (tx) => {
				const [website] = await tx
					.update(websites)
					.set({ name: input.name })
					.where(eq(websites.id, input.id))
					.returning();

				if (!website) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: 'Website not found',
					});
				}

				return website;
			});

			// Log success after transaction
			logger.info(
				'Website Updated',
				`Website "${websiteToUpdate.name}" was renamed to "${updatedWebsite.name}"`,
				{
					websiteId: updatedWebsite.id,
					oldName: websiteToUpdate.name,
					newName: updatedWebsite.name,
					userId: ctx.user.id,
				}
			);

			// Invalidate cache after successful update
			await Promise.all([
				websiteCache.invalidateByTables(['websites']),
				websiteCache.invalidateByKey(`getById:${input.id}`),
			]);

			return updatedWebsite;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			// Authorize access and get billing info before transaction
			const websiteToDelete = await authorizeWebsiteAccess(
				ctx,
				input.id,
				'delete'
			);
			const billingCustomerId = await getBillingCustomerId(
				ctx.user.id,
				websiteToDelete.organizationId
			);

			// Execute deletion and billing update in transaction
			await ctx.db.transaction(async (tx) => {
				// Delete website
				await tx.delete(websites).where(eq(websites.id, input.id));

				// Track billing usage (decrement)
				await trackWebsiteUsage(billingCustomerId, -1);
			});

			// Log after successful deletion
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

			// Invalidate cache after successful deletion
			await Promise.all([
				websiteCache.invalidateByTables(['websites']),
				websiteCache.invalidateByKey(`getById:${input.id}`),
			]);

			return { success: true };
		}),

	transfer: protectedProcedure
		.input(transferWebsiteSchema)
		.mutation(async ({ ctx, input }) => {
			// Authorize access before transaction
			await authorizeWebsiteAccess(ctx, input.websiteId, 'update');

			// Validate organization permissions upfront
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

			// Execute transfer in transaction
			const transferredWebsite = await ctx.db.transaction(async (tx) => {
				const [website] = await tx
					.update(websites)
					.set({ organizationId: input.organizationId ?? null })
					.where(eq(websites.id, input.websiteId))
					.returning();

				if (!website) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: 'Website not found',
					});
				}

				return website;
			});

			// Log success after transaction
			logger.success(
				'Website Transferred',
				`Website "${transferredWebsite.name}" was transferred to organization "${input.organizationId}"`,
				{
					websiteId: transferredWebsite.id,
					organizationId: input.organizationId,
					userId: ctx.user.id,
				}
			);

			// Invalidate cache after successful transfer
			await Promise.all([
				websiteCache.invalidateByTables(['websites']),
				websiteCache.invalidateByKey(`getById:${input.websiteId}`),
			]);

			return transferredWebsite;
		}),

	isTrackingSetup: publicProcedure
		.input(z.object({ websiteId: z.string() }))
		.query(async ({ ctx, input }) => {
			await authorizeWebsiteAccess(ctx, input.websiteId, 'read');
			const trackingCheckResult = await chQuery<{ count: number }>(
				`SELECT COUNT(*) as count FROM analytics.events WHERE client_id = {websiteId:String} AND event_name = 'screen_view' LIMIT 1`,
				{ websiteId: input.websiteId }
			);
			return { tracking_setup: (trackingCheckResult[0]?.count ?? 0) > 0 };
		}),
});
