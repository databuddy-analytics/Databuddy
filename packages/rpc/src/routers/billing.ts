import { websitesApi } from "@databuddy/auth";
import { chQuery } from "@databuddy/db";
import type {
	DailyUsageByTypeRow,
	DailyUsageRow,
	EventTypeBreakdown,
} from "@databuddy/shared/types/billing";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { logger } from "../lib/logger";
import { buildWebsiteFilter } from "../services/website-service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const usageQuerySchema = z.object({
	startDate: z.string().optional(),
	endDate: z.string().optional(),
	organizationId: z.string().nullable().optional(),
});

const getDefaultDateRange = () => {
	const endDate = new Date().toISOString().split("T")[0];
	const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
		.toISOString()
		.split("T")[0];
	return { startDate, endDate };
};

const getDailyUsageByTypeQuery = () => `
	WITH all_events AS (
		SELECT 
			toDate(time) as date,
			'event' as event_category
		FROM analytics.events 
		WHERE client_id IN {websiteIds:Array(String)}
			AND time >= parseDateTimeBestEffort({startDate:String})
			AND time <= parseDateTimeBestEffort({endDate:String})
		
		UNION ALL
		
		SELECT 
			toDate(timestamp) as date,
			'error' as event_category
		FROM analytics.errors 
		WHERE client_id IN {websiteIds:Array(String)}
			AND timestamp >= parseDateTimeBestEffort({startDate:String})
			AND timestamp <= parseDateTimeBestEffort({endDate:String})
		
		UNION ALL
		
		SELECT 
			toDate(timestamp) as date,
			'web_vitals' as event_category
		FROM analytics.web_vitals 
		WHERE client_id IN {websiteIds:Array(String)}
			AND timestamp >= parseDateTimeBestEffort({startDate:String})
			AND timestamp <= parseDateTimeBestEffort({endDate:String})
		
		UNION ALL
		
		SELECT 
			toDate(timestamp) as date,
			'custom_event' as event_category
		FROM analytics.custom_events 
		WHERE client_id IN {websiteIds:Array(String)}
			AND timestamp >= parseDateTimeBestEffort({startDate:String})
			AND timestamp <= parseDateTimeBestEffort({endDate:String})
		
		UNION ALL
		
		SELECT 
			toDate(timestamp) as date,
			'outgoing_link' as event_category
		FROM analytics.outgoing_links 
		WHERE client_id IN {websiteIds:Array(String)}
			AND timestamp >= parseDateTimeBestEffort({startDate:String})
			AND timestamp <= parseDateTimeBestEffort({endDate:String})
	)
	SELECT 
		date,
		event_category,
		count() as event_count
	FROM all_events
	GROUP BY date, event_category
	ORDER BY date ASC, event_category ASC
`;

export const billingRouter = createTRPCRouter({
	getUsage: protectedProcedure
		.input(usageQuerySchema.default({}))
		.query(async ({ ctx, input }) => {
			const { startDate, endDate } =
				input.startDate && input.endDate
					? { startDate: input.startDate, endDate: input.endDate }
					: getDefaultDateRange();

			const organizationIdRaw = input.organizationId;
			const organizationId =
				organizationIdRaw && organizationIdRaw.trim().length > 0
					? organizationIdRaw
					: null;

			if (organizationId) {
				const { success } = await websitesApi.hasPermission({
					headers: ctx.headers,
					body: { permissions: { website: ["read"] } },
				});
				if (!success) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "Missing organization permissions.",
					});
				}
			}

			try {
				const whereClause = buildWebsiteFilter(
					ctx.user.id,
					organizationId ?? undefined
				);

				const userWebsites = await ctx.db.query.websites.findMany({
					where: whereClause,
					columns: {
						id: true,
					},
				});

				const websiteIds = userWebsites.map((site) => site.id);

				if (websiteIds.length === 0) {
					return {
						totalEvents: 0,
						dailyUsage: [],
						dailyUsageByType: [],
						eventTypeBreakdown: [],
						websiteCount: 0,
						dateRange: { startDate, endDate },
					};
				}

				const dailyUsageByTypeResults = await chQuery<DailyUsageByTypeRow>(
					getDailyUsageByTypeQuery(),
					{
						websiteIds,
						startDate,
						endDate,
					}
				);

				const dailyUsageMap = new Map<string, number>();
				const eventTypeBreakdownMap = new Map<string, number>();
				let totalEvents = 0;

				for (const row of dailyUsageByTypeResults) {
					const currentDaily = dailyUsageMap.get(row.date) || 0;
					dailyUsageMap.set(row.date, currentDaily + row.event_count);

					const currentTypeTotal =
						eventTypeBreakdownMap.get(row.event_category) || 0;
					eventTypeBreakdownMap.set(
						row.event_category,
						currentTypeTotal + row.event_count
					);

					totalEvents += row.event_count;
				}

				const dailyUsageResults: DailyUsageRow[] = Array.from(
					dailyUsageMap.entries()
				)
					.map(([date, event_count]) => ({ date, event_count }))
					.sort((a, b) => a.date.localeCompare(b.date));

				const eventTypeBreakdownResults: EventTypeBreakdown[] = Array.from(
					eventTypeBreakdownMap.entries()
				)
					.map(([event_category, event_count]) => ({
						event_category,
						event_count,
					}))
					.sort((a, b) => b.event_count - a.event_count);

				logger.info(
					`Billing usage calculated for user ${ctx.user.id}: ${totalEvents} events across ${websiteIds.length} websites`,
					{
						userId: ctx.user.id,
						organizationId,
						websiteCount: websiteIds.length,
						totalEvents,
						dateRange: { startDate, endDate },
					}
				);

				return {
					totalEvents,
					dailyUsage: dailyUsageResults,
					dailyUsageByType: dailyUsageByTypeResults,
					eventTypeBreakdown: eventTypeBreakdownResults,
					websiteCount: websiteIds.length,
					dateRange: { startDate, endDate },
				};
			} catch (error) {
				logger.error(
					`Failed to fetch billing usage for user ${ctx.user.id}: ${error instanceof Error ? error.message : String(error)}`,
					{
						error: error instanceof Error ? error.message : String(error),
						userId: ctx.user.id,
						organizationId,
					}
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch billing usage data",
				});
			}
		}),
});
