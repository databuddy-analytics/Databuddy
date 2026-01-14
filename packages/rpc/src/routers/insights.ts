import { websitesApi } from "@databuddy/auth";
import { and, chQuery, db, eq, isNull, websites } from "@databuddy/db";
import { createDrizzleCache, redis } from "@databuddy/redis";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../orpc";

const insightsCache = createDrizzleCache({ redis, namespace: "insights" });
const CACHE_TTL = 300;

type InsightType =
	| "error_spike"
	| "vitals_degraded"
	| "custom_event_spike"
	| "traffic_drop"
	| "traffic_spike"
	| "uptime_issue";

type InsightSeverity = "critical" | "warning" | "info";

interface Insight {
	id: string;
	type: InsightType;
	severity: InsightSeverity;
	websiteId: string;
	websiteName: string | null;
	websiteDomain: string;
	title: string;
	description: string;
	metric?: string;
	currentValue?: number;
	previousValue?: number;
	changePercent?: number;
	link: string;
}

interface ErrorInsightRow {
	websiteId: string;
	currentErrors: number;
	previousErrors: number;
}

interface VitalInsightRow {
	websiteId: string;
	metricName: string;
	currentP75: number;
	previousP75: number;
}

interface CustomEventInsightRow {
	websiteId: string;
	eventName: string;
	currentCount: number;
	previousCount: number;
}

interface TrafficInsightRow {
	websiteId: string;
	currentViews: number;
	previousViews: number;
}

const WEB_VITAL_THRESHOLDS: Record<
	string,
	{ good: number; poor: number; unit: string; label: string }
> = {
	LCP: {
		good: 2500,
		poor: 4000,
		unit: "ms",
		label: "Largest Contentful Paint",
	},
	FCP: { good: 1800, poor: 3000, unit: "ms", label: "First Contentful Paint" },
	CLS: { good: 0.1, poor: 0.25, unit: "", label: "Cumulative Layout Shift" },
	INP: { good: 200, poor: 500, unit: "ms", label: "Interaction to Next Paint" },
	TTFB: { good: 800, poor: 1800, unit: "ms", label: "Time to First Byte" },
};


const fetchErrorInsights = (
	websiteIds: string[]
): Promise<ErrorInsightRow[]> => {
	if (websiteIds.length === 0) {
		return Promise.resolve([]);
	}

	const query = `
    WITH 
      current_period AS (
        SELECT 
          client_id as websiteId,
          count() as errors
        FROM analytics.error_spans
        WHERE 
          client_id IN {websiteIds:Array(String)}
          AND timestamp >= now() - INTERVAL 24 HOUR
        GROUP BY client_id
      ),
      previous_period AS (
        SELECT 
          client_id as websiteId,
          count() as errors
        FROM analytics.error_spans
        WHERE 
          client_id IN {websiteIds:Array(String)}
          AND timestamp >= now() - INTERVAL 48 HOUR
          AND timestamp < now() - INTERVAL 24 HOUR
        GROUP BY client_id
      )
    SELECT 
      COALESCE(c.websiteId, p.websiteId) as websiteId,
      COALESCE(c.errors, 0) as currentErrors,
      COALESCE(p.errors, 0) as previousErrors
    FROM current_period c
    FULL OUTER JOIN previous_period p ON c.websiteId = p.websiteId
    WHERE COALESCE(c.errors, 0) > COALESCE(p.errors, 0) * 1.5
      AND COALESCE(c.errors, 0) >= 5
  `;

	return chQuery<ErrorInsightRow>(query, { websiteIds });
};

const fetchVitalsInsights = (
	websiteIds: string[]
): Promise<VitalInsightRow[]> => {
	if (websiteIds.length === 0) {
		return Promise.resolve([]);
	}

	const query = `
    WITH 
      current_period AS (
        SELECT 
          client_id as websiteId,
          metric_name as metricName,
          quantile(0.75)(metric_value) as p75
        FROM analytics.web_vitals_spans
        WHERE 
          client_id IN {websiteIds:Array(String)}
          AND timestamp >= now() - INTERVAL 24 HOUR
          AND metric_name IN ('LCP', 'CLS', 'INP', 'FCP', 'TTFB')
        GROUP BY client_id, metric_name
        HAVING count() >= 10
      ),
      previous_period AS (
        SELECT 
          client_id as websiteId,
          metric_name as metricName,
          quantile(0.75)(metric_value) as p75
        FROM analytics.web_vitals_spans
        WHERE 
          client_id IN {websiteIds:Array(String)}
          AND timestamp >= now() - INTERVAL 48 HOUR
          AND timestamp < now() - INTERVAL 24 HOUR
          AND metric_name IN ('LCP', 'CLS', 'INP', 'FCP', 'TTFB')
        GROUP BY client_id, metric_name
        HAVING count() >= 10
      )
    SELECT 
      c.websiteId,
      c.metricName,
      c.p75 as currentP75,
      p.p75 as previousP75
    FROM current_period c
    INNER JOIN previous_period p ON c.websiteId = p.websiteId AND c.metricName = p.metricName
    WHERE c.p75 > p.p75 * 1.2
  `;

	return chQuery<VitalInsightRow>(query, { websiteIds });
};

const fetchCustomEventInsights = (
	websiteIds: string[]
): Promise<CustomEventInsightRow[]> => {
	if (websiteIds.length === 0) {
		return Promise.resolve([]);
	}

	const query = `
    WITH 
      current_period AS (
        SELECT 
          client_id as websiteId,
          event_name as eventName,
          count() as eventCount
        FROM analytics.custom_event_spans
        WHERE 
          client_id IN {websiteIds:Array(String)}
          AND timestamp >= now() - INTERVAL 24 HOUR
        GROUP BY client_id, event_name
      ),
      previous_period AS (
        SELECT 
          client_id as websiteId,
          event_name as eventName,
          count() as eventCount
        FROM analytics.custom_event_spans
        WHERE 
          client_id IN {websiteIds:Array(String)}
          AND timestamp >= now() - INTERVAL 48 HOUR
          AND timestamp < now() - INTERVAL 24 HOUR
        GROUP BY client_id, event_name
      )
    SELECT 
      COALESCE(c.websiteId, p.websiteId) as websiteId,
      COALESCE(c.eventName, p.eventName) as eventName,
      COALESCE(c.eventCount, 0) as currentCount,
      COALESCE(p.eventCount, 0) as previousCount
    FROM current_period c
    FULL OUTER JOIN previous_period p ON c.websiteId = p.websiteId AND c.eventName = p.eventName
    WHERE COALESCE(c.eventCount, 0) > COALESCE(p.eventCount, 0) * 2
      AND COALESCE(c.eventCount, 0) >= 20
    ORDER BY (COALESCE(c.eventCount, 0) - COALESCE(p.eventCount, 0)) DESC
    LIMIT 10
  `;

	return chQuery<CustomEventInsightRow>(query, { websiteIds });
};

const fetchTrafficInsights = (
	websiteIds: string[]
): Promise<TrafficInsightRow[]> => {
	if (websiteIds.length === 0) {
		return Promise.resolve([]);
	}

	const query = `
    WITH 
      current_period AS (
        SELECT 
          client_id as websiteId,
          countIf(event_name = 'screen_view') as views
        FROM analytics.events
        WHERE 
          client_id IN {websiteIds:Array(String)}
          AND time >= now() - INTERVAL 24 HOUR
        GROUP BY client_id
      ),
      previous_period AS (
        SELECT 
          client_id as websiteId,
          countIf(event_name = 'screen_view') as views
        FROM analytics.events
        WHERE 
          client_id IN {websiteIds:Array(String)}
          AND time >= now() - INTERVAL 48 HOUR
          AND time < now() - INTERVAL 24 HOUR
        GROUP BY client_id
      )
    SELECT 
      COALESCE(c.websiteId, p.websiteId) as websiteId,
      COALESCE(c.views, 0) as currentViews,
      COALESCE(p.views, 0) as previousViews
    FROM current_period c
    FULL OUTER JOIN previous_period p ON c.websiteId = p.websiteId
    WHERE (
      (COALESCE(p.views, 0) > 50 AND COALESCE(c.views, 0) < COALESCE(p.views, 0) * 0.5)
      OR (COALESCE(p.views, 0) > 50 AND COALESCE(c.views, 0) > COALESCE(p.views, 0) * 2)
    )
  `;

	return chQuery<TrafficInsightRow>(query, { websiteIds });
};

const buildInsights = (
	websiteMap: Map<string, { name: string | null; domain: string }>,
	errorData: ErrorInsightRow[],
	vitalsData: VitalInsightRow[],
	customEventData: CustomEventInsightRow[],
	trafficData: TrafficInsightRow[]
): Insight[] => {
	const insights: Insight[] = [];

	for (const row of errorData) {
		const website = websiteMap.get(row.websiteId);
		if (!website) {
			continue;
		}

		const changePercent =
			row.previousErrors > 0
				? ((row.currentErrors - row.previousErrors) / row.previousErrors) * 100
				: 100;

		insights.push({
			id: `error-${row.websiteId}`,
			type: "error_spike",
			severity: changePercent > 200 ? "critical" : "warning",
			websiteId: row.websiteId,
			websiteName: website.name,
			websiteDomain: website.domain,
			title: "Error spike detected",
			description: `${row.currentErrors} errors in last 24h (was ${row.previousErrors})`,
			currentValue: row.currentErrors,
			previousValue: row.previousErrors,
			changePercent: Math.round(changePercent),
			link: `/websites/${row.websiteId}/errors`,
		});
	}

	for (const row of vitalsData) {
		const website = websiteMap.get(row.websiteId);
		if (!website) {
			continue;
		}

		const threshold = WEB_VITAL_THRESHOLDS[row.metricName];
		if (!threshold) {
			continue;
		}

		const isPoor = row.currentP75 > threshold.poor;
		const changePercent =
			((row.currentP75 - row.previousP75) / row.previousP75) * 100;

		insights.push({
			id: `vitals-${row.websiteId}-${row.metricName}`,
			type: "vitals_degraded",
			severity: isPoor ? "critical" : "warning",
			websiteId: row.websiteId,
			websiteName: website.name,
			websiteDomain: website.domain,
			title: `${threshold.label} degraded`,
			description: `p75 now ${row.metricName === "CLS" ? row.currentP75.toFixed(3) : Math.round(row.currentP75)}${threshold.unit} (was ${row.metricName === "CLS" ? row.previousP75.toFixed(3) : Math.round(row.previousP75)}${threshold.unit})`,
			metric: row.metricName,
			currentValue: row.currentP75,
			previousValue: row.previousP75,
			changePercent: Math.round(changePercent),
			link: `/websites/${row.websiteId}/vitals`,
		});
	}

	for (const row of customEventData) {
		const website = websiteMap.get(row.websiteId);
		if (!website) {
			continue;
		}

		const changePercent =
			row.previousCount > 0
				? ((row.currentCount - row.previousCount) / row.previousCount) * 100
				: 100;

		insights.push({
			id: `event-${row.websiteId}-${row.eventName}`,
			type: "custom_event_spike",
			severity: "info",
			websiteId: row.websiteId,
			websiteName: website.name,
			websiteDomain: website.domain,
			title: `"${row.eventName}" event spiking`,
			description: `${row.currentCount} events in 24h (was ${row.previousCount})`,
			currentValue: row.currentCount,
			previousValue: row.previousCount,
			changePercent: Math.round(changePercent),
			link: `/websites/${row.websiteId}/events`,
		});
	}

	for (const row of trafficData) {
		const website = websiteMap.get(row.websiteId);
		if (!website) {
			continue;
		}

		const changePercent =
			row.previousViews > 0
				? ((row.currentViews - row.previousViews) / row.previousViews) * 100
				: 0;

		const isSpike = row.currentViews > row.previousViews;

		insights.push({
			id: `traffic-${row.websiteId}`,
			type: isSpike ? "traffic_spike" : "traffic_drop",
			severity: isSpike ? "info" : "warning",
			websiteId: row.websiteId,
			websiteName: website.name,
			websiteDomain: website.domain,
			title: isSpike ? "Traffic spike" : "Traffic drop",
			description: `${row.currentViews} views in 24h (was ${row.previousViews})`,
			currentValue: row.currentViews,
			previousValue: row.previousViews,
			changePercent: Math.round(Math.abs(changePercent)),
			link: `/websites/${row.websiteId}`,
		});
	}

	return insights.sort((a, b) => {
		const severityOrder = { critical: 0, warning: 1, info: 2 };
		return severityOrder[a.severity] - severityOrder[b.severity];
	});
};

export const insightsRouter = {
	getSmartInsights: protectedProcedure
		.input(z.object({ organizationId: z.string().optional() }).default({}))
		.handler(({ context, input }) => {
			const userId = context.user.id;
			const cacheKey = `smart-insights:${userId}:${input.organizationId || ""}`;

			return insightsCache.withCache({
				key: cacheKey,
				ttl: CACHE_TTL,
				tables: ["websites", "member"],
				queryFn: async () => {
					let websitesList: Array<{
						id: string;
						name: string | null;
						domain: string;
					}>;

					if (input.organizationId) {
						const { success } = await websitesApi.hasPermission({
							headers: context.headers,
							body: { permissions: { website: ["read"] } },
						});
						if (!success) {
							throw new ORPCError("FORBIDDEN", {
								message: "Missing organization permissions.",
							});
						}

						// Get websites for this organization only
						const orgWebsites = await db.query.websites.findMany({
							where: eq(websites.organizationId, input.organizationId),
							columns: {
								id: true,
								name: true,
								domain: true,
							},
						});

						websitesList = orgWebsites;
					} else {
						// Personal websites only
						const personalWebsites = await db.query.websites.findMany({
							where: and(
								eq(websites.userId, userId),
								isNull(websites.organizationId)
							),
							columns: {
								id: true,
								name: true,
								domain: true,
							},
						});

						websitesList = personalWebsites;
					}

					const websiteIds = websitesList.map((w) => w.id);

					if (websiteIds.length === 0) {
						return { insights: [] as Insight[] };
					}

					const websiteMap = new Map(
						websitesList.map((w) => [w.id, { name: w.name, domain: w.domain }])
					);

					const [errorData, vitalsData, customEventData, trafficData] =
						await Promise.all([
							fetchErrorInsights(websiteIds),
							fetchVitalsInsights(websiteIds),
							fetchCustomEventInsights(websiteIds),
							fetchTrafficInsights(websiteIds),
						]);

					const insights = buildInsights(
						websiteMap,
						errorData,
						vitalsData,
						customEventData,
						trafficData
					);

					return { insights: insights.slice(0, 10) };
				},
			});
		}),
};

export type InsightsRouter = typeof insightsRouter;
export type { Insight, InsightSeverity, InsightType };
