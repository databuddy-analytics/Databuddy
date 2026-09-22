import { and, db, desc, eq, inArray } from "@databuddy/db";
import { chQuery } from "@databuddy/db/clickhouse";
import {
	organization,
	statusPageMonitors,
	statusPages,
	uptimeSchedules,
	websites,
} from "@databuddy/db/schema";
import { cacheNamespaces, cacheable } from "@databuddy/redis";
import { parseUptimeGranularity } from "@databuddy/shared/uptime";
import {
	deriveMonitorFreshness,
	deriveMonitorStatus,
	deriveOverallStatus,
	normalizeCheckTimestamp,
	type MonitorFreshness,
	type MonitorStatus,
} from "@databuddy/shared/uptime-status";
import type { z } from "zod";
import type {
	incidentSchema,
	monitorSchema,
	StatusPageOutput,
} from "./status-page-schemas";

const UPTIME_TABLE = "uptime.uptime_monitor";

const DAILY_UPTIME_SQL = `SELECT
					site_id,
					date,
					round(100 * (1 - least(downtime_seconds, 86400) / 86400), 2) as uptime_percentage,
					total_checks,
					successful_checks,
					downtime_seconds,
					avg_response_time,
					p95_response_time
				FROM (
					SELECT
						site_id,
						toDate(ts) as date,
						toUInt32(countIf(status = 1) + countIf(status = 0)) as total_checks,
						toUInt32(countIf(status = 1)) as successful_checks,
						toUInt32(sumIf(
							least(dateDiff('second', ts, next_ts), 86400),
							status = 0
						)) as downtime_seconds,
						round(avg(total_ms), 2) as avg_response_time,
						round(quantile(0.95)(total_ms), 2) as p95_response_time
					FROM (
						SELECT
							site_id,
							timestamp as ts,
							status,
							total_ms,
							leadInFrame(timestamp, 1, now()) OVER (
								PARTITION BY site_id
								ORDER BY timestamp ASC
								ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING
							) as next_ts
						FROM ${UPTIME_TABLE}
						WHERE
							site_id IN ({siteIds:Array(String)})
							AND timestamp >= toDateTime({startDate:String})
							AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
					)
					GROUP BY site_id, date
				)
				ORDER BY site_id, date ASC`;

const LATEST_CHECK_SQL = `SELECT
						site_id,
						max(timestamp) as last_timestamp,
						argMax(status, timestamp) as last_status,
						argMax(http_code, timestamp) as last_http_code
					FROM ${UPTIME_TABLE}
					WHERE site_id IN ({siteIds:Array(String)})
						AND timestamp >= now() - INTERVAL 7 DAY
					GROUP BY site_id`;

const PUBLIC_SITEMAP_LIMIT = 1000;

async function _listPublicStatusPageSitemapEntries() {
	const rows = await db
		.selectDistinct({
			slug: statusPages.slug,
			updatedAt: statusPages.updatedAt,
		})
		.from(statusPages)
		.innerJoin(
			statusPageMonitors,
			eq(statusPageMonitors.statusPageId, statusPages.id)
		)
		.innerJoin(
			uptimeSchedules,
			eq(uptimeSchedules.id, statusPageMonitors.uptimeScheduleId)
		)
		.where(eq(uptimeSchedules.isPaused, false))
		.orderBy(desc(statusPages.updatedAt))
		.limit(PUBLIC_SITEMAP_LIMIT);

	return rows.map((row) => ({
		slug: row.slug,
		updatedAt: row.updatedAt.toISOString(),
	}));
}

export const listPublicStatusPageSitemapEntries = cacheable(
	_listPublicStatusPageSitemapEntries,
	{
		expireInSec: 300,
		prefix: cacheNamespaces.statusPage,
		reviveDates: false,
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);

interface DailyRow {
	avg_response_time: number;
	date: string;
	downtime_seconds: number;
	p95_response_time: number;
	site_id: string;
	successful_checks: number;
	total_checks: number;
	uptime_percentage: number;
}

interface LatestCheckRow {
	last_http_code: number;
	last_status: number;
	last_timestamp: string;
	site_id: string;
}

function getDateRange(days: number) {
	const today = new Date();
	const start = new Date(today);
	start.setDate(start.getDate() - (days - 1));
	return {
		startDate: start.toISOString().slice(0, 10),
		endDate: today.toISOString().slice(0, 10),
	};
}

function groupDailyRows(rows: DailyRow[]): Map<string, DailyRow[]> {
	const grouped = new Map<string, DailyRow[]>();
	for (const row of rows) {
		const siteRows = grouped.get(row.site_id);
		if (siteRows) {
			siteRows.push(row);
		} else {
			grouped.set(row.site_id, [row]);
		}
	}
	return grouped;
}

function indexLatestChecks(
	rows: LatestCheckRow[]
): Map<string, LatestCheckRow> {
	return new Map(rows.map((row) => [row.site_id, row]));
}

function applyIncidentImpacts(
	monitors: z.infer<typeof monitorSchema>[],
	activeIncidents: z.infer<typeof incidentSchema>[],
	rows: Array<{ scheduleId: string | null; statusPageMonitorId: string | null }>
) {
	const spmToScheduleId = new Map(
		rows.flatMap((row) =>
			row.statusPageMonitorId && row.scheduleId
				? [[row.statusPageMonitorId, row.scheduleId] as const]
				: []
		)
	);
	const monitorsById = new Map(
		monitors.map((monitor) => [monitor.id, monitor])
	);

	for (const incident of activeIncidents) {
		for (const affectedMonitor of incident.affectedMonitors) {
			const scheduleId = spmToScheduleId.get(
				affectedMonitor.statusPageMonitorId
			);
			const monitor = scheduleId ? monitorsById.get(scheduleId) : null;
			if (!monitor) {
				continue;
			}
			if (affectedMonitor.impact === "down" || monitor.currentStatus === "up") {
				monitor.currentStatus =
					affectedMonitor.impact === "down" ? "down" : "degraded";
			}
		}
	}
}

async function _fetchStatusPageData(
	slug: string,
	days = 90
): Promise<StatusPageOutput | null> {
	const rows = await db
		.select({
			statusPageId: statusPages.id,
			orgName: organization.name,
			orgSlug: organization.slug,
			orgLogo: organization.logo,
			statusPageName: statusPages.name,
			statusPageDescription: statusPages.description,
			logoUrl: statusPages.logoUrl,
			faviconUrl: statusPages.faviconUrl,
			websiteUrl: statusPages.websiteUrl,
			supportUrl: statusPages.supportUrl,
			theme: statusPages.theme,
			statusPageMonitorId: statusPageMonitors.id,
			scheduleId: uptimeSchedules.id,
			websiteId: uptimeSchedules.websiteId,
			scheduleName: uptimeSchedules.name,
			scheduleUrl: uptimeSchedules.url,
			granularity: uptimeSchedules.granularity,
			monitorDisplayName: statusPageMonitors.displayName,
			hideUrl: statusPageMonitors.hideUrl,
			hideUptimePercentage: statusPageMonitors.hideUptimePercentage,
			hideLatency: statusPageMonitors.hideLatency,
		})
		.from(statusPages)
		.innerJoin(organization, eq(statusPages.organizationId, organization.id))
		.leftJoin(
			statusPageMonitors,
			eq(statusPageMonitors.statusPageId, statusPages.id)
		)
		.leftJoin(
			uptimeSchedules,
			and(
				eq(statusPageMonitors.uptimeScheduleId, uptimeSchedules.id),
				eq(uptimeSchedules.isPaused, false)
			)
		)
		.where(eq(statusPages.slug, slug))
		.orderBy(statusPageMonitors.order, statusPageMonitors.id);

	if (rows.length === 0) {
		return null;
	}

	const org = {
		name: rows[0].orgName,
		slug: rows[0].orgSlug ?? slug,
		logo: rows[0].orgLogo,
	};

	const statusPageInfo = {
		name: rows[0].statusPageName,
		description: rows[0].statusPageDescription,
		logoUrl: rows[0].logoUrl,
		faviconUrl: rows[0].faviconUrl,
		websiteUrl: rows[0].websiteUrl,
		supportUrl: rows[0].supportUrl,
		theme: rows[0].theme,
	};

	const schedules = rows.flatMap((r) => {
		if (!(r.scheduleId && r.scheduleUrl && r.granularity)) {
			return [];
		}
		return [
			{
				id: r.scheduleId,
				websiteId: r.websiteId,
				displayName: r.monitorDisplayName,
				name: r.scheduleName,
				url: r.scheduleUrl,
				granularity: r.granularity,
				hideUrl: r.hideUrl ?? false,
				hideUptimePercentage: r.hideUptimePercentage ?? false,
				hideLatency: r.hideLatency ?? false,
			},
		];
	});

	const { startDate, endDate } = getDateRange(days);

	const websiteIds = [
		...new Set(
			schedules
				.map((s) => s.websiteId)
				.filter((id): id is string => id !== null)
		),
	];

	const siteIds = [...new Set(schedules.map((s) => s.websiteId ?? s.id))];

	const ninetyDaysAgoDate = new Date();
	ninetyDaysAgoDate.setDate(ninetyDaysAgoDate.getDate() - 90);

	const incidentRelations = {
		updates: {
			orderBy: { createdAt: "desc" },
			limit: 20,
		},
		affectedMonitors: true,
	} as const;

	const [
		websiteRows,
		allDailyData,
		allRecentChecks,
		windowedIncidents,
		unresolvedIncidents,
	] = await Promise.all([
		websiteIds.length > 0
			? db
					.select({
						id: websites.id,
						domain: websites.domain,
						name: websites.name,
					})
					.from(websites)
					.where(inArray(websites.id, websiteIds))
			: Promise.resolve([]),
		siteIds.length > 0
			? chQuery<DailyRow>(DAILY_UPTIME_SQL, { siteIds, startDate, endDate })
			: Promise.resolve([]),
		siteIds.length > 0
			? chQuery<LatestCheckRow>(LATEST_CHECK_SQL, { siteIds })
			: Promise.resolve([]),
		db.query.incidents.findMany({
			where: {
				statusPageId: rows[0].statusPageId,
				createdAt: { gte: ninetyDaysAgoDate },
			},
			orderBy: { createdAt: "desc" },
			limit: 50,
			with: incidentRelations,
		}),
		db.query.incidents.findMany({
			where: {
				statusPageId: rows[0].statusPageId,
				status: { ne: "resolved" },
			},
			orderBy: { createdAt: "desc" },
			limit: 50,
			with: incidentRelations,
		}),
	]);

	const recentIncidents = [
		...new Map(
			[...unresolvedIncidents, ...windowedIncidents].map(
				(incident) => [incident.id, incident] as const
			)
		).values(),
	].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

	const websiteMap = new Map(websiteRows.map((w) => [w.id, w] as const));

	const dailyBySite = groupDailyRows(allDailyData);
	const latestBySite = indexLatestChecks(allRecentChecks);

	const monitors = schedules.map((schedule) => {
		const siteId = schedule.websiteId ?? schedule.id;
		const website = schedule.websiteId
			? websiteMap.get(schedule.websiteId)
			: undefined;
		const dailyData = dailyBySite.get(siteId) ?? [];
		const latestCheck = latestBySite.get(siteId);
		const lastCheckedAt = normalizeCheckTimestamp(
			latestCheck?.last_timestamp ?? null
		);

		const freshness: MonitorFreshness = deriveMonitorFreshness(
			lastCheckedAt,
			parseUptimeGranularity(schedule.granularity)
		);
		const currentStatus: MonitorStatus = deriveMonitorStatus({
			lastStatus: latestCheck?.last_status ?? null,
			lastHttpCode: latestCheck?.last_http_code ?? null,
			freshness,
		});

		const secondsPerDay = 86_400;
		const totalCalendarSeconds = dailyData.length * secondsPerDay;
		const totalDowntimeSeconds = dailyData.reduce(
			(sum, d) => sum + d.downtime_seconds,
			0
		);
		const uptimePercentageRaw =
			totalCalendarSeconds > 0
				? Math.min(
						100,
						(1 -
							Math.min(totalDowntimeSeconds, totalCalendarSeconds) /
								totalCalendarSeconds) *
							100
					)
				: 0;

		return {
			id: schedule.id,
			name:
				schedule.displayName ??
				schedule.name ??
				website?.name ??
				website?.domain ??
				schedule.url,
			domain: schedule.hideUrl ? undefined : (website?.domain ?? schedule.url),
			currentStatus,
			freshness,
			uptimePercentage:
				schedule.hideUptimePercentage || dailyData.length === 0
					? undefined
					: Math.round(uptimePercentageRaw * 100) / 100,
			dailyData: dailyData.map((d) => ({
				date: String(d.date),
				uptime_percentage: schedule.hideUptimePercentage
					? undefined
					: d.uptime_percentage,
				total_checks: schedule.hideUptimePercentage
					? undefined
					: d.total_checks,
				successful_checks: schedule.hideUptimePercentage
					? undefined
					: d.successful_checks,
				downtime_seconds: schedule.hideUptimePercentage
					? undefined
					: d.downtime_seconds,
				avg_response_time: schedule.hideLatency
					? undefined
					: d.avg_response_time,
				p95_response_time: schedule.hideLatency
					? undefined
					: d.p95_response_time,
			})),
			lastCheckedAt,
		};
	});

	const spmIdToName = new Map(
		rows
			.filter((r) => r.statusPageMonitorId)
			.map(
				(r) =>
					[
						r.statusPageMonitorId,
						r.monitorDisplayName ??
							r.scheduleName ??
							r.scheduleUrl ??
							"Unknown",
					] as const
			)
	);

	const formattedIncidents = recentIncidents.map((incident) => ({
		id: incident.id,
		title: incident.title,
		status: incident.status,
		severity: incident.severity,
		createdAt: incident.createdAt.toISOString(),
		resolvedAt: incident.resolvedAt?.toISOString() ?? null,
		updates: incident.updates.map((update) => ({
			id: update.id,
			status: update.status,
			message: update.message,
			createdAt: update.createdAt.toISOString(),
		})),
		affectedMonitors: incident.affectedMonitors.map((am) => ({
			statusPageMonitorId: am.statusPageMonitorId,
			monitorName: spmIdToName.get(am.statusPageMonitorId) ?? "Unknown",
			impact: am.impact,
		})),
	}));

	const activeIncidents = formattedIncidents.filter(
		(i) => i.status !== "resolved"
	);

	applyIncidentImpacts(monitors, activeIncidents, rows);

	return {
		organization: org,
		statusPage: statusPageInfo,
		overallStatus: deriveOverallStatus(monitors, formattedIncidents),
		monitors,
		incidents: formattedIncidents,
	};
}

export const fetchStatusPageData = cacheable(_fetchStatusPageData, {
	expireInSec: 60,
	prefix: cacheNamespaces.statusPage,
	reviveDates: false,
	staleWhileRevalidate: true,
	staleTime: 30,
});
