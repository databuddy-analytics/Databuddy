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
} from "@databuddy/shared/uptime-status";
import type {
	Incident,
	Monitor,
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

const HISTORY_DAYS = 90;

function daysAgo(days: number): Date {
	const date = new Date();
	date.setDate(date.getDate() - days);
	return date;
}

function monitorLabel(
	monitor: {
		displayName: string | null;
		hideUrl: boolean;
		name: string | null;
		url: string | null;
	},
	website: { domain: string; name: string | null } | undefined
): string {
	return (
		monitor.displayName ??
		monitor.name ??
		website?.name ??
		website?.domain ??
		(monitor.hideUrl ? null : monitor.url) ??
		"Monitor"
	);
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

function applyIncidentImpacts(
	monitors: Monitor[],
	activeIncidents: Incident[],
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
	slug: string
): Promise<{ page: StatusPageOutput | null }> {
	const rows = await db
		.select({
			statusPageId: statusPages.id,
			organization: {
				name: organization.name,
				slug: organization.slug,
				logo: organization.logo,
			},
			statusPage: {
				name: statusPages.name,
				description: statusPages.description,
				logoUrl: statusPages.logoUrl,
				faviconUrl: statusPages.faviconUrl,
				websiteUrl: statusPages.websiteUrl,
				supportUrl: statusPages.supportUrl,
				theme: statusPages.theme,
			},
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
		return { page: null };
	}

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

	const startDate = daysAgo(HISTORY_DAYS - 1)
		.toISOString()
		.slice(0, 10);
	const endDate = new Date().toISOString().slice(0, 10);

	const websiteIds = [
		...new Set(schedules.flatMap((s) => (s.websiteId ? [s.websiteId] : []))),
	];

	const siteIds = [...new Set(schedules.map((s) => s.websiteId ?? s.id))];

	const [websiteRows, allDailyData, allRecentChecks, recentIncidents] =
		await Promise.all([
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
					OR: [
						{ createdAt: { gte: daysAgo(HISTORY_DAYS) } },
						{ status: { ne: "resolved" } },
					],
				},
				orderBy: { createdAt: "desc" },
				limit: 50,
				with: {
					updates: { orderBy: { createdAt: "desc" }, limit: 20 },
					affectedMonitors: true,
				},
			}),
		]);

	const websiteMap = new Map(websiteRows.map((w) => [w.id, w] as const));

	const dailyBySite = groupDailyRows(allDailyData);
	const latestBySite = new Map(
		allRecentChecks.map((row) => [row.site_id, row])
	);

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

		const freshness = deriveMonitorFreshness(
			lastCheckedAt,
			parseUptimeGranularity(schedule.granularity)
		);
		const currentStatus = deriveMonitorStatus({
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
			name: monitorLabel(schedule, website),
			domain: schedule.hideUrl ? undefined : (website?.domain ?? schedule.url),
			currentStatus,
			freshness,
			uptimePercentage:
				schedule.hideUptimePercentage || dailyData.length === 0
					? undefined
					: Math.round(uptimePercentageRaw * 100) / 100,
			dailyData: dailyData.map(
				({
					site_id: _siteId,
					date,
					avg_response_time,
					p95_response_time,
					...uptime
				}) => ({
					date: String(date),
					...(schedule.hideUptimePercentage ? {} : uptime),
					...(schedule.hideLatency
						? {}
						: { avg_response_time, p95_response_time }),
				})
			),
			lastCheckedAt,
		};
	});

	const spmIdToName = new Map(
		rows.flatMap((r) =>
			r.statusPageMonitorId
				? [
						[
							r.statusPageMonitorId,
							monitorLabel(
								{
									displayName: r.monitorDisplayName,
									hideUrl: r.hideUrl ?? false,
									name: r.scheduleName,
									url: r.scheduleUrl,
								},
								r.websiteId ? websiteMap.get(r.websiteId) : undefined
							),
						] as const,
					]
				: []
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
		page: {
			organization: {
				...rows[0].organization,
				slug: rows[0].organization.slug ?? slug,
			},
			statusPage: rows[0].statusPage,
			overallStatus: deriveOverallStatus(monitors, formattedIncidents),
			monitors,
			incidents: formattedIncidents,
		},
	};
}

export const fetchStatusPageData = cacheable(_fetchStatusPageData, {
	expireInSec: 60,
	prefix: cacheNamespaces.statusPage,
	reviveDates: false,
	staleWhileRevalidate: true,
	staleTime: 30,
});
