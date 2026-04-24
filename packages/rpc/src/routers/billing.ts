import { eq } from "@databuddy/db";
import { chQuery } from "@databuddy/db/clickhouse";
import { websites } from "@databuddy/db/schema";
import type {
	DailyUsageByTypeRow,
	DailyUsageRow,
	EventTypeBreakdown,
} from "@databuddy/shared/types/billing";
import { z } from "zod";
import { rpcError } from "../errors";
import { getAutumn } from "../lib/autumn-client";
import { logger } from "../lib/logger";
import { protectedProcedure, sessionProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";
import { getBillingOwner } from "../utils/billing";

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
	category: EventCategory;
	dateColumn: string;
	filterColumn?: string;
	table: string;
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

const AUTO_TOPUP_FEATURE_ID = "agent_credits";
const EVENTS_FEATURE_ID = "events";
const SPEND_LIMIT_FEATURE_ID = "agent_credits";
const MIN_AUTO_TOPUP_THRESHOLD = 10;
const MAX_AUTO_TOPUP_THRESHOLD = 50_000;
const MIN_AUTO_TOPUP_QUANTITY = 100;
const MAX_AUTO_TOPUP_QUANTITY = 100_000;
const MIN_ALERT_PERCENTAGE = 1;
const MAX_ALERT_PERCENTAGE = 99;
const MIN_SPEND_LIMIT_USD = 1;
const MAX_SPEND_LIMIT_USD = 10_000;

const autoTopupConfigSchema = z
	.object({
		enabled: z.boolean(),
		threshold: z.number().int(),
		quantity: z.number().int(),
	})
	.refine(
		(v) =>
			!v.enabled ||
			(v.threshold >= MIN_AUTO_TOPUP_THRESHOLD &&
				v.threshold <= MAX_AUTO_TOPUP_THRESHOLD),
		{
			message: `threshold must be between ${MIN_AUTO_TOPUP_THRESHOLD} and ${MAX_AUTO_TOPUP_THRESHOLD}`,
			path: ["threshold"],
		}
	)
	.refine(
		(v) =>
			!v.enabled ||
			(v.quantity >= MIN_AUTO_TOPUP_QUANTITY &&
				v.quantity <= MAX_AUTO_TOPUP_QUANTITY),
		{
			message: `quantity must be between ${MIN_AUTO_TOPUP_QUANTITY} and ${MAX_AUTO_TOPUP_QUANTITY}`,
			path: ["quantity"],
		}
	);

const usageAlertConfigSchema = z
	.object({
		enabled: z.boolean(),
		threshold: z.number().int(),
	})
	.refine(
		(v) =>
			!v.enabled ||
			(v.threshold >= MIN_ALERT_PERCENTAGE &&
				v.threshold <= MAX_ALERT_PERCENTAGE),
		{
			message: `threshold must be between ${MIN_ALERT_PERCENTAGE} and ${MAX_ALERT_PERCENTAGE}`,
			path: ["threshold"],
		}
	);

const spendLimitConfigSchema = z
	.object({
		enabled: z.boolean(),
		overageLimit: z.number().int(),
	})
	.refine(
		(v) =>
			!v.enabled ||
			(v.overageLimit >= MIN_SPEND_LIMIT_USD &&
				v.overageLimit <= MAX_SPEND_LIMIT_USD),
		{
			message: `overageLimit must be between ${MIN_SPEND_LIMIT_USD} and ${MAX_SPEND_LIMIT_USD}`,
			path: ["overageLimit"],
		}
	);

interface AutoTopupEntry {
	enabled: boolean;
	featureId: string;
	quantity: number;
	threshold: number;
}

interface UsageAlertEntry {
	enabled: boolean;
	featureId: string;
	name?: string;
	threshold: number;
	thresholdType: "usage_percentage";
}

interface SpendLimitEntry {
	enabled: boolean;
	featureId: string;
	overageLimit: number;
}

export const billingRouter = {
	setAutoTopup: sessionProcedure
		.route({
			description:
				"Configures auto top-up for agent credits on the current billing customer.",
			method: "POST",
			path: "/billing/setAutoTopup",
			summary: "Set auto top-up",
			tags: ["Billing"],
		})
		.input(autoTopupConfigSchema)
		.output(autoTopupConfigSchema)
		.handler(async ({ context, input }) => {
			const { customerId, canUserUpgrade } = await getBillingOwner(
				context.user.id,
				context.organizationId
			);
			if (!canUserUpgrade) {
				throw rpcError.forbidden(
					"Only an organization owner or admin can change billing settings."
				);
			}

			try {
				const autumn = getAutumn();
				const customer = await autumn.customers.getOrCreate({ customerId });
				const existing = (customer.billingControls?.autoTopups ??
					[]) as AutoTopupEntry[];
				const nextEntry: AutoTopupEntry = {
					featureId: AUTO_TOPUP_FEATURE_ID,
					enabled: input.enabled,
					threshold: input.threshold,
					quantity: input.quantity,
				};
				const merged = [
					...existing.filter((t) => t.featureId !== AUTO_TOPUP_FEATURE_ID),
					nextEntry,
				];

				await autumn.customers.update({
					customerId,
					billingControls: { autoTopups: merged },
				});

				return {
					enabled: nextEntry.enabled,
					threshold: nextEntry.threshold,
					quantity: nextEntry.quantity,
				};
			} catch (error) {
				logger.error(
					{ error, customerId, userId: context.user.id },
					"Failed to update auto top-up configuration"
				);
				throw rpcError.internal("Failed to update auto top-up settings");
			}
		}),

	setUsageAlert: sessionProcedure
		.route({
			description:
				"Configures a usage alert (percentage of included events consumed) for the events feature.",
			method: "POST",
			path: "/billing/setUsageAlert",
			summary: "Set usage alert",
			tags: ["Billing"],
		})
		.input(usageAlertConfigSchema)
		.output(usageAlertConfigSchema)
		.handler(async ({ context, input }) => {
			const { customerId, canUserUpgrade } = await getBillingOwner(
				context.user.id,
				context.organizationId
			);
			if (!canUserUpgrade) {
				throw rpcError.forbidden(
					"Only an organization owner or admin can change billing settings."
				);
			}

			try {
				const autumn = getAutumn();
				const customer = await autumn.customers.getOrCreate({ customerId });
				const existing = (customer.billingControls?.usageAlerts ??
					[]) as UsageAlertEntry[];
				const nextEntry: UsageAlertEntry = {
					featureId: EVENTS_FEATURE_ID,
					enabled: input.enabled,
					threshold: input.threshold,
					thresholdType: "usage_percentage",
				};
				const merged = [
					...existing.filter((a) => a.featureId !== EVENTS_FEATURE_ID),
					nextEntry,
				];

				await autumn.customers.update({
					customerId,
					billingControls: { usageAlerts: merged },
				});

				return {
					enabled: nextEntry.enabled,
					threshold: nextEntry.threshold,
				};
			} catch (error) {
				logger.error(
					{ error, customerId, userId: context.user.id },
					"Failed to update usage alert configuration"
				);
				throw rpcError.internal("Failed to update usage alert settings");
			}
		}),

	setSpendLimit: sessionProcedure
		.route({
			description:
				"Configures a spend limit (maximum overage in USD) for agent credits.",
			method: "POST",
			path: "/billing/setSpendLimit",
			summary: "Set spend limit",
			tags: ["Billing"],
		})
		.input(spendLimitConfigSchema)
		.output(spendLimitConfigSchema)
		.handler(async ({ context, input }) => {
			const { customerId, canUserUpgrade } = await getBillingOwner(
				context.user.id,
				context.organizationId
			);
			if (!canUserUpgrade) {
				throw rpcError.forbidden(
					"Only an organization owner or admin can change billing settings."
				);
			}

			try {
				const autumn = getAutumn();
				const customer = await autumn.customers.getOrCreate({ customerId });
				const existing = (customer.billingControls?.spendLimits ??
					[]) as SpendLimitEntry[];
				const nextEntry: SpendLimitEntry = {
					featureId: SPEND_LIMIT_FEATURE_ID,
					enabled: input.enabled,
					overageLimit: input.overageLimit,
				};
				const merged = [
					...existing.filter((s) => s.featureId !== SPEND_LIMIT_FEATURE_ID),
					nextEntry,
				];

				await autumn.customers.update({
					customerId,
					billingControls: { spendLimits: merged },
				});

				return {
					enabled: nextEntry.enabled,
					overageLimit: nextEntry.overageLimit,
				};
			} catch (error) {
				logger.error(
					{ error, customerId, userId: context.user.id },
					"Failed to update spend limit configuration"
				);
				throw rpcError.internal("Failed to update spend limit settings");
			}
		}),

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
