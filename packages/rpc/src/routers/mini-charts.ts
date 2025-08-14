import { createHash } from 'node:crypto';
import {
	and,
	chQuery,
	db,
	eq,
	inArray,
	member,
	or,
	websites,
} from '@databuddy/db';
import { createDrizzleCache, redis } from '@databuddy/redis';
import type { ProcessedMiniChartData } from '@databuddy/shared';
import { z } from 'zod/v4';
import { createTRPCRouter, protectedProcedure } from '../trpc';

const drizzleCache = createDrizzleCache({ redis, namespace: 'mini-charts' });

const CACHE_TTL = 300;
const AUTH_CACHE_TTL = 60;
const DEFAULT_DAYS = 7;
const MIN_DAYS = 3;
const MAX_DAYS = 30;

interface MiniChartRow {
	websiteId: string;
	date: string;
	value: number;
}

const normalizeWebsiteIds = (ids: string[]): string[] => {
	// Deduplicate, copy, and sort for stable cache keys and efficient queries
	return Array.from(new Set(ids)).sort();
};

const getAuthorizedWebsiteIds = (
	userId: string,
	requestedIds: string[]
): Promise<string[]> => {
	if (!userId || requestedIds.length === 0) {
		return Promise.resolve([]);
	}

	const authCacheKey = `auth:${userId}:${[...requestedIds].sort().join(',')}`;

	return drizzleCache.withCache({
		key: authCacheKey,
		ttl: AUTH_CACHE_TTL,
		tables: ['websites', 'member'],
		queryFn: async () => {
			const userOrgs = await db.query.member.findMany({
				where: eq(member.userId, userId),
				columns: { organizationId: true },
			});

			const orgIds = userOrgs.map((m) => m.organizationId);

			const orgFilter =
				orgIds.length > 0
					? inArray(websites.organizationId, orgIds)
					: undefined;

			const accessibleWebsites = await db.query.websites.findMany({
				where: and(
					inArray(websites.id, requestedIds),
					orgFilter
						? or(eq(websites.userId, userId), orgFilter)
						: eq(websites.userId, userId)
				),
				columns: {
					id: true,
				},
			});

			return accessibleWebsites.map((w) => w.id);
		},
	});
};

const calculateTrend = (data: { date: string; value: number }[]) => {
	if (!data || data.length < 4) {
		return null;
	}

	const mid = Math.floor(data.length / 2);
	const [first, second] = [data.slice(0, mid), data.slice(mid)];

	const avg = (arr: { value: number }[]) =>
		arr.length > 0 ? arr.reduce((sum, p) => sum + p.value, 0) / arr.length : 0;
	const [prevAvg, currAvg] = [avg(first), avg(second)];

	if (prevAvg === 0) {
		return currAvg > 0
			? { type: 'up' as const, value: 100 }
			: { type: 'neutral' as const, value: 0 };
	}

	const change = ((currAvg - prevAvg) / prevAvg) * 100;
	let type: 'up' | 'down' | 'neutral' = 'neutral';
	if (change > 5) {
		type = 'up';
	} else if (change < -5) {
		type = 'down';
	}
	return { type, value: Math.abs(change) };
};

const getBatchedMiniChartData = async (
	websiteIds: string[],
	days: number
): Promise<Record<string, ProcessedMiniChartData>> => {
	const uniqueIds = Array.from(new Set(websiteIds));
	if (uniqueIds.length === 0) {
		return {};
	}

	const query = `
    WITH
      date_range AS (
        SELECT arrayJoin(arrayMap(d -> toDate(today()) - d, range({days:UInt16}))) AS date
      ),
      daily_pageviews AS (
        SELECT
          client_id,
          toDate(time) as event_date,
          countIf(event_name = 'screen_view') as pageviews
        FROM analytics.events
        WHERE
          client_id IN {websiteIds:Array(String)}
          AND toDate(time) >= (today() - {daysMinusOne:UInt16})
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

	const queryResult = await chQuery<MiniChartRow>(query, {
		websiteIds: uniqueIds,
		days,
		daysMinusOne: days - 1,
	});

	const rawData = uniqueIds.reduce(
		(acc, id) => {
			acc[id] = [];
			return acc;
		},
		{} as Record<string, { date: string; value: number }[]>
	);

	for (const row of queryResult) {
		if (rawData[row.websiteId]) {
			rawData[row.websiteId].push({
				date: row.date,
				value: row.value,
			});
		}
	}

	const result: Record<string, ProcessedMiniChartData> = {};

	for (const websiteId of uniqueIds) {
		const data = rawData[websiteId] || [];
		const totalViews = data.reduce((sum, point) => sum + point.value, 0);
		const trend = calculateTrend(data);

		result[websiteId] = {
			data,
			totalViews,
			trend,
		};
	}

	return result;
};

export const miniChartsRouter = createTRPCRouter({
	getMiniCharts: protectedProcedure
		.input(
			z.object({
				websiteIds: z.array(z.string().min(1).max(64)).min(1).max(5000),
				days: z.number().int().optional(),
			})
		)
		.query(({ ctx, input }) => {
			const normalizedIds = normalizeWebsiteIds(input.websiteIds);
			const requestedDays = input.days ?? DEFAULT_DAYS;
			const clampedDays = Math.max(MIN_DAYS, Math.min(MAX_DAYS, requestedDays));

			const idsHash = createHash('sha1')
				.update(normalizedIds.join(','))
				.digest('base64url')
				.slice(0, 16);
			const cacheKey = `mini-charts:${ctx.user.id}:d${clampedDays}:${idsHash}`;

			return drizzleCache.withCache({
				key: cacheKey,
				ttl: CACHE_TTL,
				tables: ['websites', 'member'],
				queryFn: async () => {
					const authorizedIds = await getAuthorizedWebsiteIds(
						ctx.user.id,
						normalizedIds
					);
					return getBatchedMiniChartData(authorizedIds, clampedDays);
				},
			});
		}),
});
