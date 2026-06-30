import { and, db, desc, eq, inArray, withTransaction } from "@databuddy/db";
import { chQuery } from "@databuddy/db/clickhouse";
import {
	incidentAffectedMonitors,
	incidentUpdates,
	incidents,
	organization,
	statusPageMonitors,
	statusPages,
	uptimeSchedules,
	websites,
} from "@databuddy/db/schema";
import {
	cacheNamespaces,
	cacheable,
	invalidateStatusPageCache,
} from "@databuddy/redis";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import { setTrackProperties } from "../middleware/track-mutation";
import { protectedProcedure, publicProcedure, trackedProcedure } from "../orpc";
import { authorizeTransfer, withResource } from "../procedures/with-resource";
import { withWorkspace } from "../procedures/with-workspace";

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

const dailyUptimeSchema = z.object({
	date: z.string(),
	uptime_percentage: z.number().optional(),
	total_checks: z.number().optional(),
	successful_checks: z.number().optional(),
	downtime_seconds: z.number().optional(),
	avg_response_time: z.number().optional(),
	p95_response_time: z.number().optional(),
});

const monitorSchema = z.object({
	id: z.string(),
	name: z.string(),
	domain: z.string().optional(),
	currentStatus: z.enum(["up", "down", "degraded", "unknown"]),
	uptimePercentage: z.number().optional(),
	dailyData: z.array(dailyUptimeSchema),
	lastCheckedAt: z.string().nullable(),
});

const statusPageCustomizationSchema = z.object({
	logoUrl: z.string().nullable(),
	faviconUrl: z.string().nullable(),
	websiteUrl: z.string().nullable(),
	supportUrl: z.string().nullable(),
	theme: z.enum(["system", "light", "dark"]).nullable(),
});

const incidentStatus = z.enum([
	"investigating",
	"identified",
	"monitoring",
	"resolved",
]);

const incidentSeverity = z.enum(["minor", "major", "critical"]);

const incidentUpdateSchema = z.object({
	id: z.string(),
	status: incidentStatus,
	message: z.string(),
	createdAt: z.string(),
});

const incidentImpact = z.enum(["degraded", "down"]);

const incidentAffectedMonitorSchema = z.object({
	statusPageMonitorId: z.string(),
	monitorName: z.string(),
	impact: incidentImpact,
});

const incidentSchema = z.object({
	id: z.string(),
	title: z.string(),
	status: incidentStatus,
	severity: incidentSeverity,
	createdAt: z.string(),
	resolvedAt: z.string().nullable(),
	updates: z.array(incidentUpdateSchema),
	affectedMonitors: z.array(incidentAffectedMonitorSchema),
});

const statusPageOutputSchema = z.object({
	organization: z.object({
		name: z.string(),
		slug: z.string(),
		logo: z.string().nullable(),
	}),
	statusPage: z
		.object({
			name: z.string(),
			description: z.string().nullable(),
		})
		.merge(statusPageCustomizationSchema),
	overallStatus: z.enum(["operational", "degraded", "outage"]),
	monitors: z.array(monitorSchema),
	incidents: z.array(incidentSchema),
});

const publicStatusPageSitemapEntrySchema = z.object({
	slug: z.string(),
	updatedAt: z.string().datetime(),
});

type StatusPageOutput = z.infer<typeof statusPageOutputSchema>;

async function listPublicStatusPageSitemapEntries() {
	const rows = await db
		.select({
			slug: statusPages.slug,
			updatedAt: statusPages.updatedAt,
		})
		.from(statusPages)
		.orderBy(desc(statusPages.updatedAt));

	return rows.map((row) => ({
		slug: row.slug,
		updatedAt: row.updatedAt.toISOString(),
	}));
}

function deriveOverallStatus(
	monitors: { currentStatus: "up" | "down" | "degraded" | "unknown" }[],
	incidents: {
		status: string;
		severity: string;
		affectedMonitors: { impact: string }[];
	}[] = []
): "operational" | "degraded" | "outage" {
	const activeIncidents = incidents.filter(
		(incident) => incident.status !== "resolved"
	);

	if (activeIncidents.some((i) => i.severity === "critical")) {
		return "outage";
	}
	if (
		activeIncidents.some((i) =>
			i.affectedMonitors.some((m) => m.impact === "down")
		)
	) {
		return "outage";
	}
	if (activeIncidents.length > 0) {
		return "degraded";
	}

	if (monitors.length === 0) {
		return "operational";
	}
	const hasDown = monitors.some((m) => m.currentStatus === "down");
	const allDown = monitors.every((m) => m.currentStatus === "down");

	if (allDown) {
		return "outage";
	}
	if (hasDown) {
		return "degraded";
	}
	const hasDegraded = monitors.some((m) => m.currentStatus === "degraded");
	if (hasDegraded) {
		return "degraded";
	}
	return "operational";
}

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
		.where(eq(statusPages.slug, slug));

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
		if (!(r.scheduleId && r.scheduleUrl)) {
			return [];
		}
		return [
			{
				id: r.scheduleId,
				websiteId: r.websiteId,
				displayName: r.monitorDisplayName,
				name: r.scheduleName,
				url: r.scheduleUrl,
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
					createdAt: { gte: ninetyDaysAgoDate },
				},
				orderBy: { createdAt: "desc" },
				limit: 50,
				with: {
					updates: {
						orderBy: { createdAt: "desc" },
						limit: 20,
					},
					affectedMonitors: true,
				},
			}),
		]);

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

		const currentStatus: "up" | "down" | "degraded" | "unknown" = latestCheck
			? latestCheck.last_status === 1
				? "up"
				: latestCheck.last_status === 0
					? latestCheck.last_http_code > 0 && latestCheck.last_http_code < 500
						? "degraded"
						: "down"
					: "unknown"
			: "unknown";

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
			uptimePercentage: schedule.hideUptimePercentage
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
			lastCheckedAt: latestCheck?.last_timestamp ?? null,
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

const fetchStatusPageData = cacheable(_fetchStatusPageData, {
	expireInSec: 60,
	prefix: cacheNamespaces.statusPage,
	staleWhileRevalidate: true,
	staleTime: 30,
});

export const statusPageRouter = {
	listPublic: publicProcedure
		.route({
			method: "POST",
			path: "/statusPage/listPublic",
			summary: "List public status pages for sitemap generation",
			tags: ["StatusPage"],
		})
		.output(z.array(publicStatusPageSitemapEntrySchema))
		.handler(async () => listPublicStatusPageSitemapEntries()),

	getBySlug: publicProcedure
		.route({
			method: "POST",
			path: "/statusPage/getBySlug",
			summary: "Get public status page",
			tags: ["StatusPage"],
		})
		.input(
			z.object({
				slug: z.string().min(1),
				days: z.number().int().min(7).max(90).optional().default(90),
			})
		)
		.output(statusPageOutputSchema)
		.handler(async ({ input }) => {
			const data = await fetchStatusPageData(input.slug, input.days);

			if (!data) {
				throw rpcError.notFound("StatusPage", input.slug);
			}

			return data;
		}),

	list: protectedProcedure
		.route({
			description:
				"Lists status pages for an organization. Requires read:status_pages scope.",
			method: "POST",
			path: "/statusPage/list",
			summary: "List status pages for organization",
			tags: ["StatusPage"],
			spec: (s) => ({
				...s,
				"x-required-scopes": ["read:status_pages"] as const,
			}),
		})
		.input(
			z.object({
				organizationId: z.string(),
			})
		)
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "status_page",
				permissions: ["read"],
			});

			const pages = await db.query.statusPages.findMany({
				where: { organizationId: input.organizationId },
				orderBy: { createdAt: "desc" },
				with: {
					statusPageMonitors: {
						columns: { id: true },
					},
				},
			});

			return pages.map((page) => ({
				...page,
				monitorCount: page.statusPageMonitors.length,
				statusPageMonitors: undefined,
			}));
		}),

	get: protectedProcedure
		.route({
			description:
				"Returns status page details including monitors. Requires read:status_pages scope.",
			method: "POST",
			path: "/statusPage/get",
			summary: "Get status page details including monitors",
			tags: ["StatusPage"],
			spec: (s) => ({
				...s,
				"x-required-scopes": ["read:status_pages"] as const,
			}),
		})
		.input(
			z.object({
				statusPageId: z.string(),
			})
		)
		.handler(async ({ context, input }) => {
			const statusPage = await db.query.statusPages.findFirst({
				where: { id: input.statusPageId },
				with: {
					statusPageMonitors: {
						with: {
							uptimeSchedule: {
								columns: {
									id: true,
									name: true,
									url: true,
									isPaused: true,
								},
							},
						},
						orderBy: { order: "asc" },
					},
				},
			});

			if (!statusPage) {
				throw rpcError.notFound("StatusPage", input.statusPageId);
			}

			await withWorkspace(context, {
				organizationId: statusPage.organizationId,
				resource: "status_page",
				permissions: ["read"],
			});

			const { statusPageMonitors: monitors, ...page } = statusPage;

			return {
				...page,
				monitors,
			};
		}),

	create: trackedProcedure
		.route({
			description: "Creates a status page. Requires write:status_pages scope.",
			method: "POST",
			path: "/statusPage/create",
			summary: "Create status page",
			tags: ["StatusPage"],
			spec: (s) => ({
				...s,
				"x-required-scopes": ["write:status_pages"] as const,
			}),
		})
		.input(
			z.object({
				organizationId: z.string(),
				name: z.string(),
				slug: z.string(),
				description: z.string().optional(),
				logoUrl: z.string().url().nullish(),
				faviconUrl: z.string().url().nullish(),
				websiteUrl: z.string().url().nullish(),
				supportUrl: z.string().url().nullish(),
				theme: z.enum(["system", "light", "dark"]).optional(),
			})
		)
		.handler(async ({ context, input }) => {
			setTrackProperties({ theme: input.theme ?? "default" });
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "status_page",
				permissions: ["update"],
			});

			const existing = await db.query.statusPages.findFirst({
				where: { slug: input.slug },
			});

			if (existing) {
				throw rpcError.badRequest("Slug is already taken");
			}

			const id = randomUUIDv7();

			await db.insert(statusPages).values({
				id,
				organizationId: input.organizationId,
				name: input.name,
				slug: input.slug,
				description: input.description,
				logoUrl: input.logoUrl ?? null,
				faviconUrl: input.faviconUrl ?? null,
				websiteUrl: input.websiteUrl ?? null,
				supportUrl: input.supportUrl ?? null,
				theme: input.theme ?? "system",
			});

			return db.query.statusPages.findFirst({
				where: { id },
			});
		}),

	update: trackedProcedure
		.route({
			description:
				"Updates status page details. Requires write:status_pages scope.",
			method: "POST",
			path: "/statusPage/update",
			summary: "Update status page details",
			tags: ["StatusPage"],
			spec: (s) => ({
				...s,
				"x-required-scopes": ["write:status_pages"] as const,
			}),
		})
		.input(
			z.object({
				statusPageId: z.string(),
				name: z.string().optional(),
				slug: z.string().optional(),
				description: z.string().optional(),
				logoUrl: z.string().url().nullish(),
				faviconUrl: z.string().url().nullish(),
				websiteUrl: z.string().url().nullish(),
				supportUrl: z.string().url().nullish(),
				theme: z.enum(["system", "light", "dark"]).optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const statusPage = await withResource(context, {
				resource: "status_page",
				id: input.statusPageId,
				permissions: ["update"],
			});

			if (input.slug && input.slug !== statusPage.slug) {
				const existing = await db.query.statusPages.findFirst({
					where: { slug: input.slug },
				});

				if (existing) {
					throw rpcError.badRequest("Slug is already taken");
				}
			}

			await db
				.update(statusPages)
				.set({
					...(input.name && { name: input.name }),
					...(input.slug && { slug: input.slug }),
					...(input.description !== undefined && {
						description: input.description,
					}),
					...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
					...(input.faviconUrl !== undefined && {
						faviconUrl: input.faviconUrl,
					}),
					...(input.websiteUrl !== undefined && {
						websiteUrl: input.websiteUrl,
					}),
					...(input.supportUrl !== undefined && {
						supportUrl: input.supportUrl,
					}),
					...(input.theme !== undefined && { theme: input.theme }),
					updatedAt: new Date(),
				})
				.where(eq(statusPages.id, input.statusPageId));

			await invalidateStatusPageCache(statusPage.slug);
			if (input.slug && input.slug !== statusPage.slug) {
				await invalidateStatusPageCache(input.slug);
			}

			return db.query.statusPages.findFirst({
				where: { id: input.statusPageId },
			});
		}),

	delete: trackedProcedure
		.route({
			description: "Deletes a status page. Requires write:status_pages scope.",
			method: "POST",
			path: "/statusPage/delete",
			summary: "Delete status page",
			tags: ["StatusPage"],
			spec: (s) => ({
				...s,
				"x-required-scopes": ["write:status_pages"] as const,
			}),
		})
		.input(
			z.object({
				statusPageId: z.string(),
			})
		)
		.handler(async ({ context, input }) => {
			const statusPage = await withResource(context, {
				resource: "status_page",
				id: input.statusPageId,
				permissions: ["update"],
			});

			await db
				.delete(statusPages)
				.where(eq(statusPages.id, input.statusPageId));

			await invalidateStatusPageCache(statusPage.slug);

			return { success: true };
		}),

	transfer: trackedProcedure
		.route({
			description:
				"Transfers a status page to another organization. Requires write:status_pages scope on source and target.",
			method: "POST",
			path: "/statusPage/transfer",
			summary: "Transfer status page to another organization",
			tags: ["StatusPage"],
			spec: (s) => ({
				...s,
				"x-required-scopes": ["write:status_pages"] as const,
			}),
		})
		.input(
			z.object({
				statusPageId: z.string(),
				targetOrganizationId: z.string(),
				includeMonitors: z.boolean().default(true),
			})
		)
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			const statusPage = await authorizeTransfer(context, {
				resource: "status_page",
				id: input.statusPageId,
				targetOrganizationId: input.targetOrganizationId,
			});

			const pageMonitors = await db.query.statusPageMonitors.findMany({
				where: { statusPageId: input.statusPageId },
				columns: { uptimeScheduleId: true },
			});

			await withTransaction(async (tx) => {
				await tx
					.update(statusPages)
					.set({
						organizationId: input.targetOrganizationId,
						updatedAt: new Date(),
					})
					.where(eq(statusPages.id, input.statusPageId));

				if (input.includeMonitors) {
					const monitorIds = pageMonitors.map((m) => m.uptimeScheduleId);

					if (monitorIds.length > 0) {
						await tx
							.update(uptimeSchedules)
							.set({
								organizationId: input.targetOrganizationId,
								updatedAt: new Date(),
							})
							.where(inArray(uptimeSchedules.id, monitorIds));
					}
				}
			});

			await invalidateStatusPageCache(statusPage.slug);

			return { success: true };
		}),

	addMonitor: trackedProcedure
		.route({
			description:
				"Adds a monitor to a status page. Requires write:status_pages scope.",
			method: "POST",
			path: "/statusPage/addMonitor",
			summary: "Add a monitor to a status page",
			tags: ["StatusPage"],
			spec: (s) => ({
				...s,
				"x-required-scopes": ["write:status_pages"] as const,
			}),
		})
		.input(
			z.object({
				statusPageId: z.string(),
				uptimeScheduleId: z.string(),
			})
		)
		.handler(async ({ context, input }) => {
			const statusPage = await withResource(context, {
				resource: "status_page",
				id: input.statusPageId,
				permissions: ["update"],
			});

			const schedule = await db.query.uptimeSchedules.findFirst({
				where: { id: input.uptimeScheduleId },
				columns: { organizationId: true },
			});

			if (!schedule) {
				throw rpcError.notFound("UptimeSchedule", input.uptimeScheduleId);
			}

			if (schedule.organizationId !== statusPage.organizationId) {
				throw rpcError.forbidden(
					"Uptime schedule does not belong to this status page's organization"
				);
			}

			const existing = await db.query.statusPageMonitors.findFirst({
				where: {
					statusPageId: input.statusPageId,
					uptimeScheduleId: input.uptimeScheduleId,
				},
			});

			if (existing) {
				throw rpcError.badRequest("Monitor is already on this status page");
			}

			const id = randomUUIDv7();

			await db.insert(statusPageMonitors).values({
				id,
				statusPageId: input.statusPageId,
				uptimeScheduleId: input.uptimeScheduleId,
			});

			await invalidateStatusPageCache(statusPage.slug);

			return db.query.statusPageMonitors.findFirst({
				where: { id },
			});
		}),

	removeMonitor: trackedProcedure
		.route({
			description:
				"Removes a monitor from a status page. Requires write:status_pages scope.",
			method: "POST",
			path: "/statusPage/removeMonitor",
			summary: "Remove a monitor from a status page",
			tags: ["StatusPage"],
			spec: (s) => ({
				...s,
				"x-required-scopes": ["write:status_pages"] as const,
			}),
		})
		.input(
			z.object({
				statusPageId: z.string(),
				uptimeScheduleId: z.string(),
			})
		)
		.handler(async ({ context, input }) => {
			const statusPage = await withResource(context, {
				resource: "status_page",
				id: input.statusPageId,
				permissions: ["update"],
			});

			await db
				.delete(statusPageMonitors)
				.where(
					and(
						eq(statusPageMonitors.statusPageId, input.statusPageId),
						eq(statusPageMonitors.uptimeScheduleId, input.uptimeScheduleId)
					)
				);

			await invalidateStatusPageCache(statusPage.slug);

			return { success: true };
		}),

	updateMonitorSettings: trackedProcedure
		.route({
			description:
				"Updates visibility settings for a status page monitor. Requires write:status_pages scope.",
			method: "POST",
			path: "/statusPage/updateMonitorSettings",
			summary: "Update visibility settings for a status page monitor",
			tags: ["StatusPage"],
			spec: (s) => ({
				...s,
				"x-required-scopes": ["write:status_pages"] as const,
			}),
		})
		.input(
			z.object({
				monitorId: z.string(),
				displayName: z.string().nullable().optional(),
				hideUrl: z.boolean().optional(),
				hideUptimePercentage: z.boolean().optional(),
				hideLatency: z.boolean().optional(),
				order: z.number().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const monitor = await db.query.statusPageMonitors.findFirst({
				where: { id: input.monitorId },
				with: {
					statusPage: true,
				},
			});

			if (!monitor) {
				throw rpcError.notFound("StatusPageMonitor", input.monitorId);
			}

			await withWorkspace(context, {
				organizationId: monitor.statusPage.organizationId,
				resource: "status_page",
				permissions: ["update"],
			});

			await db
				.update(statusPageMonitors)
				.set({
					...(input.displayName !== undefined && {
						displayName: input.displayName,
					}),
					...(input.hideUrl !== undefined && { hideUrl: input.hideUrl }),
					...(input.hideUptimePercentage !== undefined && {
						hideUptimePercentage: input.hideUptimePercentage,
					}),
					...(input.hideLatency !== undefined && {
						hideLatency: input.hideLatency,
					}),
					...(input.order !== undefined && { order: input.order }),
					updatedAt: new Date(),
				})
				.where(eq(statusPageMonitors.id, input.monitorId));

			await invalidateStatusPageCache(monitor.statusPage.slug);

			return db.query.statusPageMonitors.findFirst({
				where: { id: input.monitorId },
			});
		}),

	createIncident: trackedProcedure
		.route({
			description:
				"Creates a new status page incident. Requires write:status_pages scope.",
			method: "POST",
			path: "/statusPage/createIncident",
			summary: "Create a new incident",
			tags: ["StatusPage"],
			spec: (s) => ({
				...s,
				"x-required-scopes": ["write:status_pages"] as const,
			}),
		})
		.input(
			z.object({
				statusPageId: z.string(),
				title: z.string().min(1),
				severity: incidentSeverity.optional().default("minor"),
				message: z.string().min(1),
				affectedMonitors: z
					.array(
						z.object({
							statusPageMonitorId: z.string(),
							impact: incidentImpact,
						})
					)
					.optional()
					.default([]),
			})
		)
		.handler(async ({ context, input }) => {
			setTrackProperties({ severity: input.severity ?? "minor" });
			const statusPage = await withResource(context, {
				resource: "status_page",
				id: input.statusPageId,
				permissions: ["update"],
			});

			if (input.affectedMonitors.length > 0) {
				const monitorIds = input.affectedMonitors.map(
					(am) => am.statusPageMonitorId
				);
				const ownedMonitors = await db.query.statusPageMonitors.findMany({
					where: {
						statusPageId: input.statusPageId,
						id: { in: monitorIds },
					},
					columns: { id: true },
				});
				if (ownedMonitors.length !== monitorIds.length) {
					throw rpcError.badRequest(
						"Affected monitors must belong to this status page"
					);
				}
			}

			const incidentId = randomUUIDv7();
			const updateId = randomUUIDv7();

			await withTransaction(async (tx) => {
				await tx.insert(incidents).values({
					id: incidentId,
					statusPageId: input.statusPageId,
					title: input.title,
					severity: input.severity,
					status: "investigating",
				});

				await tx.insert(incidentUpdates).values({
					id: updateId,
					incidentId,
					status: "investigating",
					message: input.message,
				});

				if (input.affectedMonitors.length > 0) {
					await tx.insert(incidentAffectedMonitors).values(
						input.affectedMonitors.map((am) => ({
							id: randomUUIDv7(),
							incidentId,
							statusPageMonitorId: am.statusPageMonitorId,
							impact: am.impact,
						}))
					);
				}
			});

			await invalidateStatusPageCache(statusPage.slug);

			return db.query.incidents.findFirst({
				where: { id: incidentId },
				with: { updates: true, affectedMonitors: true },
			});
		}),

	updateIncident: trackedProcedure
		.route({
			description:
				"Posts an update to a status page incident. Requires write:status_pages scope.",
			method: "POST",
			path: "/statusPage/updateIncident",
			summary: "Post an update to an incident",
			tags: ["StatusPage"],
			spec: (s) => ({
				...s,
				"x-required-scopes": ["write:status_pages"] as const,
			}),
		})
		.input(
			z.object({
				incidentId: z.string(),
				status: incidentStatus,
				message: z.string().min(1),
			})
		)
		.handler(async ({ context, input }) => {
			setTrackProperties({ status: input.status });
			const incident = await db.query.incidents.findFirst({
				where: { id: input.incidentId },
				with: { statusPage: true },
			});

			if (!incident) {
				throw rpcError.notFound("Incident", input.incidentId);
			}

			await withWorkspace(context, {
				organizationId: incident.statusPage.organizationId,
				resource: "status_page",
				permissions: ["update"],
			});

			await withTransaction(async (tx) => {
				await tx.insert(incidentUpdates).values({
					id: randomUUIDv7(),
					incidentId: input.incidentId,
					status: input.status,
					message: input.message,
				});

				await tx
					.update(incidents)
					.set({
						status: input.status,
						...(input.status === "resolved" ? { resolvedAt: new Date() } : {}),
					})
					.where(eq(incidents.id, input.incidentId));
			});

			await invalidateStatusPageCache(incident.statusPage.slug);

			return db.query.incidents.findFirst({
				where: { id: input.incidentId },
				with: { updates: { orderBy: { createdAt: "desc" } } },
			});
		}),

	deleteIncident: trackedProcedure
		.route({
			description:
				"Deletes a status page incident. Requires write:status_pages scope.",
			method: "POST",
			path: "/statusPage/deleteIncident",
			summary: "Delete an incident",
			tags: ["StatusPage"],
			spec: (s) => ({
				...s,
				"x-required-scopes": ["write:status_pages"] as const,
			}),
		})
		.input(z.object({ incidentId: z.string() }))
		.handler(async ({ context, input }) => {
			const incident = await db.query.incidents.findFirst({
				where: { id: input.incidentId },
				with: { statusPage: true },
			});

			if (!incident) {
				throw rpcError.notFound("Incident", input.incidentId);
			}

			await withWorkspace(context, {
				organizationId: incident.statusPage.organizationId,
				resource: "status_page",
				permissions: ["update"],
			});

			await db.delete(incidents).where(eq(incidents.id, input.incidentId));

			await invalidateStatusPageCache(incident.statusPage.slug);

			return { deleted: true };
		}),

	listIncidents: protectedProcedure
		.route({
			description:
				"Lists incidents for a status page. Requires read:status_pages scope.",
			method: "POST",
			path: "/statusPage/listIncidents",
			summary: "List incidents for a status page",
			tags: ["StatusPage"],
			spec: (s) => ({
				...s,
				"x-required-scopes": ["read:status_pages"] as const,
			}),
		})
		.input(z.object({ statusPageId: z.string() }))
		.handler(async ({ context, input }) => {
			await withResource(context, {
				resource: "status_page",
				id: input.statusPageId,
				permissions: ["read"],
			});

			return db.query.incidents.findMany({
				where: { statusPageId: input.statusPageId },
				orderBy: { createdAt: "desc" },
				with: {
					updates: {
						orderBy: { createdAt: "desc" },
					},
					affectedMonitors: {
						with: {
							statusPageMonitor: {
								columns: { id: true, displayName: true },
								with: {
									uptimeSchedule: { columns: { name: true } },
								},
							},
						},
					},
				},
			});
		}),
};
