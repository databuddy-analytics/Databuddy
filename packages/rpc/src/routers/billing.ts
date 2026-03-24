import { chQuery, eq, websites } from "@databuddy/db";
import type {
	DailyUsageByTypeRow,
	DailyUsageRow,
	EventTypeBreakdown,
} from "@databuddy/shared/types/billing";
import { z } from "zod";
import { rpcError } from "../errors";
import { logger } from "../lib/logger";
import { protectedProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

const DAYS_IN_MONTH = 30;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const EVENT_CATEGORIES = {
	EVENT: "event",
	ERROR: "error",
	WEB_VITALS: "web_vitals",
	CUSTOM_EVENT: "custom_event",
	OUTGOING_LINK: "outgoing_link",
} as const;

type EventCategory = (typeof EVENT_CATEGORIES)[keyof typeof EVENT_CATEGORIES];

interface EventSource {
	table: string;
	dateColumn: string;
	category: EventCategory;
	filterColumn?: string;
}

const EVENT_SOURCES: EventSource[] = [
	{
		table: "analytics.events",
		dateColumn: "time",
		category: EVENT_CATEGORIES.EVENT,
	},
	{
		table: "analytics.error_spans",
		dateColumn: "timestamp",
		category: EVENT_CATEGORIES.ERROR,
	},
	{
		table: "analytics.web_vitals_spans",
		dateColumn: "timestamp",
		category: EVENT_CATEGORIES.WEB_VITALS,
	},
	{
		table: "analytics.custom_events",
		dateColumn: "timestamp",
		category: EVENT_CATEGORIES.CUSTOM_EVENT,
		filterColumn: "website_id",
	},
	{
		table: "analytics.outgoing_links",
		dateColumn: "timestamp",
		category: EVENT_CATEGORIES.OUTGOING_LINK,
	},
];

const getDefaultDateRange = () => {
	const endDate = new Date().toISOString().split("T")[0];
	const startDate = new Date(Date.now() - DAYS_IN_MONTH * MILLISECONDS_PER_DAY)
		.toISOString()
		.split("T")[0];
	return { startDate, endDate };
};

const buildEventSourceQuery = (source: EventSource): string => {
	const filterCol = source.filterColumn ?? "client_id";
	return `
		SELECT 
			toDate(${source.dateColumn}) as date,
			'${source.category}' as event_category
		FROM ${source.table}
		WHERE ${filterCol} IN {websiteIds:Array(String)}
			AND ${source.dateColumn} >= parseDateTimeBestEffort({startDate:String})
			AND ${source.dateColumn} <= parseDateTimeBestEffort({endDate:String})`;
};

const getDailyUsageByTypeQuery = (): string => {
	const eventQueries = EVENT_SOURCES.map(buildEventSourceQuery).join(
		"\n\t\tUNION ALL"
	);

	return `
	WITH all_events AS (${eventQueries}
	)
	SELECT 
		date,
		event_category,
		count() as event_count
	FROM all_events
	GROUP BY date, event_category
	ORDER BY date ASC, event_category ASC`;
};

const aggregateUsageData = (
	results: DailyUsageByTypeRow[]
): {
	dailyUsage: DailyUsageRow[];
	eventTypeBreakdown: EventTypeBreakdown[];
	totalEvents: number;
} => {
	const dailyUsageMap = new Map<string, number>();
	const eventTypeBreakdownMap = new Map<string, number>();
	let totalEvents = 0;

	for (const row of results) {
		const currentDaily = dailyUsageMap.get(row.date) || 0;
		dailyUsageMap.set(row.date, currentDaily + row.event_count);

		const currentTypeTotal = eventTypeBreakdownMap.get(row.event_category) || 0;
		eventTypeBreakdownMap.set(
			row.event_category,
			currentTypeTotal + row.event_count
		);

		totalEvents += row.event_count;
	}

	const dailyUsage: DailyUsageRow[] = Array.from(dailyUsageMap.entries())
		.map(([date, event_count]) => ({ date, event_count }))
		.sort((a, b) => a.date.localeCompare(b.date));

	const eventTypeBreakdown: EventTypeBreakdown[] = Array.from(
		eventTypeBreakdownMap.entries()
	)
		.map(([event_category, event_count]) => ({
			event_category,
			event_count,
		}))
		.sort((a, b) => b.event_count - a.event_count);

	return {
		dailyUsage,
		eventTypeBreakdown,
		totalEvents,
	};
};

export const billingRouter = {
	getUsage: protectedProcedure
		.route({
			description: "Returns billing usage for organization or user workspaces.",
			method: "POST",
			path: "/billing/getUsage",
			summary: "Get usage",
			tags: ["Billing"],
		})
		.input(
			z
				.object({
					startDate: z.string().optional(),
					endDate: z.string().optional(),
					organizationId: z.string().nullable().optional(),
				})
				.default({})
		)
		.output(z.record(z.string(), z.unknown()))
		.handler(async ({ context, input }) => {
			const { startDate, endDate } =
				input.startDate && input.endDate
					? { startDate: input.startDate, endDate: input.endDate }
					: getDefaultDateRange();

			const resolvedOrgId =
				(input.organizationId?.trim() || null) ?? context.organizationId;

			if (!resolvedOrgId) {
				throw rpcError.badRequest("Organization ID is required");
			}

			await withWorkspace(context, {
				organizationId: resolvedOrgId,
				resource: "website",
				permissions: ["read"],
			});

			try {
				const userWebsites = await context.db.query.websites.findMany({
					where: eq(websites.organizationId, resolvedOrgId),
					columns: { id: true },
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

				const { dailyUsage, eventTypeBreakdown, totalEvents } =
					aggregateUsageData(dailyUsageByTypeResults);

				logger.info(
					{
						userId: context.user?.id,
						organizationId: resolvedOrgId,
						websiteCount: websiteIds.length,
						totalEvents,
						dateRange: { startDate, endDate },
					},
					`Billing usage calculated: ${totalEvents} events across ${websiteIds.length} websites`
				);

				return {
					totalEvents,
					dailyUsage,
					dailyUsageByType: dailyUsageByTypeResults,
					eventTypeBreakdown,
					websiteCount: websiteIds.length,
					dateRange: { startDate, endDate },
				};
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);

				logger.error(
					{
						error: errorMessage,
						userId: context.user?.id,
						organizationId: resolvedOrgId,
					},
					`Failed to fetch billing usage: ${errorMessage}`
				);

				throw rpcError.internal("Failed to fetch billing usage data");
			}
		}),
};
