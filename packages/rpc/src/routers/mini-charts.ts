import {
	and,
	chQuery,
	db,
	eq,
	inArray,
	isNull,
	member,
	or,
	websites,
} from '@databuddy/db';
import { createDrizzleCache, redis } from '@databuddy/redis';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

const drizzleCache = createDrizzleCache({ redis, namespace: 'mini-charts' });

const CACHE_TTL = 300;
const AUTH_CACHE_TTL = 60;

interface MiniChartRow {
	websiteId: string;
	date: string;
	value: number;
}

const getAuthorizedWebsiteIds = (
	userId: string,
	requestedIds: string[]
): Promise<string[]> => {
	if (!userId || requestedIds.length === 0) {
		return Promise.resolve([]);
	}

	const authCacheKey = `auth:${userId}:${requestedIds.sort().join(',')}`;

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

			const accessibleWebsites = await db.query.websites.findMany({
				where: and(
					inArray(websites.id, requestedIds),
					or(
						eq(websites.userId, userId),
						orgIds.length > 0
							? inArray(websites.organizationId, orgIds)
							: isNull(websites.organizationId)
					)
				),
				columns: {
					id: true,
				},
			});

			return accessibleWebsites.map((w) => w.id);
		},
	});
};

const getBatchedMiniChartData = async (websiteIds: string[]) => {
	if (websiteIds.length === 0) {
		return {};
	}

	const query = `
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

	const queryResult = await chQuery<MiniChartRow>(query, { websiteIds });

	const result = websiteIds.reduce(
		(acc, id) => {
			acc[id] = [];
			return acc;
		},
		{} as Record<string, { date: string; value: number }[]>
	);

	for (const row of queryResult) {
		if (result[row.websiteId]) {
			result[row.websiteId].push({
				date: row.date,
				value: row.value,
			});
		}
	}

	return result;
};

export const miniChartsRouter = createTRPCRouter({
	getMiniCharts: protectedProcedure
		.input(
			z.object({
				websiteIds: z.array(z.string()),
			})
		)
		.query(({ ctx, input }) => {
			const cacheKey = `mini-charts:${ctx.user.id}:${input.websiteIds.sort().join(',')}`;

			return drizzleCache.withCache({
				key: cacheKey,
				ttl: CACHE_TTL,
				tables: ['websites', 'member'],
				queryFn: () => {
					return getAuthorizedWebsiteIds(ctx.user.id, input.websiteIds).then(
						(authorizedIds) => getBatchedMiniChartData(authorizedIds)
					);
				},
			});
		}),
});
