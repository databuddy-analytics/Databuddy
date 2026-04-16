import { and, db, eq, inArray } from "@databuddy/db";
import { chQuery } from "@databuddy/db/clickhouse";
import {
	organization,
	statusPageMonitors,
	statusPages,
	uptimeSchedules,
	websites,
} from "@databuddy/db/schema";
import { cacheable, invalidateCacheableWithArgs } from "@databuddy/redis";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import { protectedProcedure, publicProcedure } from "../orpc";
import { withFeatureAccess } from "../procedures/with-feature-access";
import { withWorkspace } from "../procedures/with-workspace";

const monitorsProcedure = protectedProcedure.use(withFeatureAccess("monitors"));

const UPTIME_TABLE = "uptime.uptime_monitor";

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
	hideBranding: z.boolean(),
	customCss: z.string().nullable(),
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
});

type StatusPageOutput = z.infer<typeof statusPageOutputSchema>;

function deriveOverallStatus(
	monitors: { currentStatus: "up" | "down" | "degraded" | "unknown" }[]
): "operational" | "degraded" | "outage" {
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

async function _fetchStatusPageData(
	slug: string,
	days = 90
): Promise<StatusPageOutput | null> {
	const rows = await db
		.select({
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
			hideBranding: statusPages.hideBranding,
			customCss: statusPages.customCss,
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

	const first = rows[0];
	const statusPageInfo = {
		name: first.statusPageName,
		description: first.statusPageDescription,
		logoUrl: first.logoUrl,
		faviconUrl: first.faviconUrl,
		websiteUrl: first.websiteUrl,
		supportUrl: first.supportUrl,
		theme: first.theme,
		hideBranding: first.hideBranding,
		customCss: first.customCss,
	};

	const schedules = rows
		.filter((r) => r.scheduleId)
		.map((r) => ({
			id: r.scheduleId as string,
			websiteId: r.websiteId,
			displayName: r.monitorDisplayName,
			name: r.scheduleName,
			url: r.scheduleUrl as string,
			hideUrl: r.hideUrl,
			hideUptimePercentage: r.hideUptimePercentage,
			hideLatency: r.hideLatency,
		}));

	const today = new Date();
	const ninetyDaysAgo = new Date(today);
	ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - (days - 1));

	const startDate = ninetyDaysAgo.toISOString().split("T").at(0) ?? "";
	const endDate = today.toISOString().split("T").at(0) ?? "";

	const websiteIds = schedules
		.map((s) => s.websiteId)
		.filter((id): id is string => id !== null);

	const siteIds = schedules.map((s) => s.websiteId ?? s.id);

	const [websiteRows, allDailyData, allRecentChecks] = await Promise.all([
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
			? chQuery<DailyRow>(
					`SELECT
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
				ORDER BY site_id, date ASC`,
					{ siteIds, startDate, endDate }
				)
			: Promise.resolve([]),
		siteIds.length > 0
			? chQuery<LatestCheckRow>(
					`SELECT
						site_id,
						max(timestamp) as last_timestamp,
						argMax(status, timestamp) as last_status,
						argMax(http_code, timestamp) as last_http_code
					FROM ${UPTIME_TABLE}
					WHERE site_id IN ({siteIds:Array(String)})
						AND timestamp >= now() - INTERVAL 7 DAY
					GROUP BY site_id`,
					{ siteIds }
				)
			: Promise.resolve([]),
	]);

	const websiteMap = new Map(websiteRows.map((w) => [w.id, w]));

	const dailyBySite = new Map<string, DailyRow[]>();
	for (const row of allDailyData) {
		const existing = dailyBySite.get(row.site_id);
		if (existing) {
			existing.push(row);
		} else {
			dailyBySite.set(row.site_id, [row]);
		}
	}

	const latestBySite = new Map<string, LatestCheckRow>();
	for (const row of allRecentChecks) {
		latestBySite.set(row.site_id, row);
	}

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

	return {
		organization: org,
		statusPage: statusPageInfo,
		overallStatus: deriveOverallStatus(monitors),
		monitors,
	};
}

const fetchStatusPageData = cacheable(_fetchStatusPageData, {
	expireInSec: 60,
	prefix: "status-page",
	staleWhileRevalidate: true,
	staleTime: 30,
});

export const statusPageRouter = {
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

	list: monitorsProcedure
		.route({
			method: "POST",
			path: "/statusPage/list",
			summary: "List status pages for organization",
			tags: ["StatusPage"],
		})
		.input(
			z.object({
				organizationId: z.string(),
			})
		)
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "website",
				permissions: ["read"],
			});

			const pages = await db.query.statusPages.findMany({
				where: eq(statusPages.organizationId, input.organizationId),
				orderBy: (statusPages, { desc }) => [desc(statusPages.createdAt)],
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

	get: monitorsProcedure
		.route({
			method: "POST",
			path: "/statusPage/get",
			summary: "Get status page details including monitors",
			tags: ["StatusPage"],
		})
		.input(
			z.object({
				statusPageId: z.string(),
			})
		)
		.handler(async ({ context, input }) => {
			const statusPage = await db.query.statusPages.findFirst({
				where: eq(statusPages.id, input.statusPageId),
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
						orderBy: (monitors, { asc }) => [asc(monitors.order)],
					},
				},
			});

			if (!statusPage) {
				throw rpcError.notFound("StatusPage", input.statusPageId);
			}

			await withWorkspace(context, {
				organizationId: statusPage.organizationId,
				resource: "website",
				permissions: ["read"],
			});

			const { statusPageMonitors: monitors, ...page } = statusPage;

			return {
				...page,
				monitors,
			};
		}),

	create: monitorsProcedure
		.route({
			method: "POST",
			path: "/statusPage/create",
			summary: "Create status page",
			tags: ["StatusPage"],
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
				hideBranding: z.boolean().optional(),
				customCss: z.string().nullish(),
			})
		)
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "website",
				permissions: ["update"],
			});

			const existing = await db.query.statusPages.findFirst({
				where: eq(statusPages.slug, input.slug),
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
				hideBranding: input.hideBranding ?? false,
				customCss: input.customCss ?? null,
			});

			return db.query.statusPages.findFirst({
				where: eq(statusPages.id, id),
			});
		}),

	update: monitorsProcedure
		.route({
			method: "POST",
			path: "/statusPage/update",
			summary: "Update status page details",
			tags: ["StatusPage"],
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
				hideBranding: z.boolean().optional(),
				customCss: z.string().nullish(),
			})
		)
		.handler(async ({ context, input }) => {
			const statusPage = await db.query.statusPages.findFirst({
				where: eq(statusPages.id, input.statusPageId),
			});

			if (!statusPage) {
				throw rpcError.notFound("StatusPage", input.statusPageId);
			}

			await withWorkspace(context, {
				organizationId: statusPage.organizationId,
				resource: "website",
				permissions: ["update"],
			});

			if (input.slug && input.slug !== statusPage.slug) {
				const existing = await db.query.statusPages.findFirst({
					where: eq(statusPages.slug, input.slug),
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
					...(input.hideBranding !== undefined && {
						hideBranding: input.hideBranding,
					}),
					...(input.customCss !== undefined && { customCss: input.customCss }),
					updatedAt: new Date(),
				})
				.where(eq(statusPages.id, input.statusPageId));

			await invalidateCacheableWithArgs("status-page", [statusPage.slug]);
			if (input.slug && input.slug !== statusPage.slug) {
				await invalidateCacheableWithArgs("status-page", [input.slug]);
			}

			return db.query.statusPages.findFirst({
				where: eq(statusPages.id, input.statusPageId),
			});
		}),

	delete: monitorsProcedure
		.route({
			method: "POST",
			path: "/statusPage/delete",
			summary: "Delete status page",
			tags: ["StatusPage"],
		})
		.input(
			z.object({
				statusPageId: z.string(),
			})
		)
		.handler(async ({ context, input }) => {
			const statusPage = await db.query.statusPages.findFirst({
				where: eq(statusPages.id, input.statusPageId),
			});

			if (!statusPage) {
				throw rpcError.notFound("StatusPage", input.statusPageId);
			}

			await withWorkspace(context, {
				organizationId: statusPage.organizationId,
				resource: "website",
				permissions: ["update"],
			});

			await db
				.delete(statusPages)
				.where(eq(statusPages.id, input.statusPageId));

			await invalidateCacheableWithArgs("status-page", [statusPage.slug]);

			return { success: true };
		}),

	transfer: monitorsProcedure
		.route({
			method: "POST",
			path: "/statusPage/transfer",
			summary: "Transfer status page to another organization",
			tags: ["StatusPage"],
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
			const statusPage = await db.query.statusPages.findFirst({
				where: eq(statusPages.id, input.statusPageId),
				with: {
					statusPageMonitors: {
						columns: { uptimeScheduleId: true },
					},
				},
			});

			if (!statusPage) {
				throw rpcError.notFound("StatusPage", input.statusPageId);
			}

			if (statusPage.organizationId === input.targetOrganizationId) {
				throw rpcError.badRequest(
					"Status page already belongs to this organization"
				);
			}

			await withWorkspace(context, {
				organizationId: statusPage.organizationId,
				resource: "website",
				permissions: ["update"],
			});

			await withWorkspace(context, {
				organizationId: input.targetOrganizationId,
				resource: "website",
				permissions: ["create"],
			});

			await db
				.update(statusPages)
				.set({
					organizationId: input.targetOrganizationId,
					updatedAt: new Date(),
				})
				.where(eq(statusPages.id, input.statusPageId));

			if (input.includeMonitors) {
				const monitorIds = statusPage.statusPageMonitors.map(
					(m: { uptimeScheduleId: string }) => m.uptimeScheduleId
				);

				if (monitorIds.length > 0) {
					await db
						.update(uptimeSchedules)
						.set({
							organizationId: input.targetOrganizationId,
							updatedAt: new Date(),
						})
						.where(inArray(uptimeSchedules.id, monitorIds));
				}
			}

			await invalidateCacheableWithArgs("status-page", [statusPage.slug]);

			return { success: true };
		}),

	addMonitor: monitorsProcedure
		.route({
			method: "POST",
			path: "/statusPage/addMonitor",
			summary: "Add a monitor to a status page",
			tags: ["StatusPage"],
		})
		.input(
			z.object({
				statusPageId: z.string(),
				uptimeScheduleId: z.string(),
			})
		)
		.handler(async ({ context, input }) => {
			const statusPage = await db.query.statusPages.findFirst({
				where: eq(statusPages.id, input.statusPageId),
			});

			if (!statusPage) {
				throw rpcError.notFound("StatusPage", input.statusPageId);
			}

			await withWorkspace(context, {
				organizationId: statusPage.organizationId,
				resource: "website",
				permissions: ["update"],
			});

			const existing = await db.query.statusPageMonitors.findFirst({
				where: and(
					eq(statusPageMonitors.statusPageId, input.statusPageId),
					eq(statusPageMonitors.uptimeScheduleId, input.uptimeScheduleId)
				),
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

			await invalidateCacheableWithArgs("status-page", [statusPage.slug]);

			return db.query.statusPageMonitors.findFirst({
				where: eq(statusPageMonitors.id, id),
			});
		}),

	removeMonitor: monitorsProcedure
		.route({
			method: "POST",
			path: "/statusPage/removeMonitor",
			summary: "Remove a monitor from a status page",
			tags: ["StatusPage"],
		})
		.input(
			z.object({
				statusPageId: z.string(),
				uptimeScheduleId: z.string(),
			})
		)
		.handler(async ({ context, input }) => {
			const statusPage = await db.query.statusPages.findFirst({
				where: eq(statusPages.id, input.statusPageId),
			});

			if (!statusPage) {
				throw rpcError.notFound("StatusPage", input.statusPageId);
			}

			await withWorkspace(context, {
				organizationId: statusPage.organizationId,
				resource: "website",
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

			await invalidateCacheableWithArgs("status-page", [statusPage.slug]);

			return { success: true };
		}),

	updateMonitorSettings: monitorsProcedure
		.route({
			method: "POST",
			path: "/statusPage/updateMonitorSettings",
			summary: "Update visibility settings for a status page monitor",
			tags: ["StatusPage"],
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
				where: eq(statusPageMonitors.id, input.monitorId),
				with: {
					statusPage: true,
				},
			});

			if (!monitor) {
				throw rpcError.notFound("StatusPageMonitor", input.monitorId);
			}

			await withWorkspace(context, {
				organizationId: monitor.statusPage.organizationId,
				resource: "website",
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

			await invalidateCacheableWithArgs("status-page", [
				monitor.statusPage.slug,
			]);

			return db.query.statusPageMonitors.findFirst({
				where: eq(statusPageMonitors.id, input.monitorId),
			});
		}),
};
