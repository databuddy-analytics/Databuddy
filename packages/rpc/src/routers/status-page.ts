import { createHash } from "node:crypto";
import {
	and,
	chQuery,
	db,
	eq,
	inArray,
	organization,
	statusPageMonitors,
	statusPageSections,
	statusPages,
	uptimeSchedules,
	websites,
} from "@databuddy/db";
import { cacheable } from "@databuddy/redis";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import { logger } from "../lib/logger";
import { protectedProcedure, publicProcedure } from "../orpc";
import { withFeatureAccess } from "../procedures/with-feature-access";
import { withWorkspace } from "../procedures/with-workspace";

const UPTIME_TABLE = "uptime.uptime_monitor";

const monitorsProcedure = protectedProcedure.use(withFeatureAccess("monitors"));

const themeValues = ["light", "dark", "system"] as const;

function slugifyInput(raw: string): string {
	return raw
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

async function getPageAndAuthorize(
	pageId: string,
	context: Parameters<typeof withWorkspace>[0]
) {
	const page = await db.query.statusPages.findFirst({
		where: eq(statusPages.id, pageId),
	});

	if (!page) {
		throw rpcError.notFound("StatusPage", pageId);
	}

	await withWorkspace(context, {
		organizationId: page.organizationId,
		resource: "website",
		permissions: ["configure"],
	});

	return page;
}

const statusPageOutputSchema = z
	.object({
		id: z.string(),
		organizationId: z.string(),
		slug: z.string(),
		title: z.string(),
		description: z.string().nullable(),
		logoUrl: z.string().nullable(),
		faviconUrl: z.string().nullable(),
		theme: z.string(),
		accentColor: z.string().nullable(),
		customDomain: z.string().nullable(),
		isPublished: z.boolean(),
		isPasswordProtected: z.boolean(),
		showOverallUptime: z.boolean(),
		defaultTimeRange: z.number(),
		showSubscribeButton: z.boolean(),
		createdAt: z.union([z.date(), z.string()]),
		updatedAt: z.union([z.date(), z.string()]),
	})
	.loose();

const sectionOutputSchema = z
	.object({
		id: z.string(),
		statusPageId: z.string(),
		name: z.string(),
		description: z.string().nullable(),
		sortOrder: z.number(),
		isCollapsed: z.boolean(),
	})
	.loose();

const monitorEntryOutputSchema = z
	.object({
		id: z.string(),
		statusPageId: z.string(),
		sectionId: z.string().nullable(),
		scheduleId: z.string(),
		displayName: z.string().nullable(),
		sortOrder: z.number(),
		showLink: z.boolean(),
		showLatency: z.boolean(),
		showUptimePct: z.boolean(),
		showStatus: z.boolean(),
		showLastChecked: z.boolean(),
	})
	.loose();

const statusPageDetailSchema = statusPageOutputSchema.extend({
	sections: z.array(sectionOutputSchema),
	monitors: z.array(
		monitorEntryOutputSchema.extend({
			schedule: z.record(z.string(), z.unknown()).nullable(),
		})
	),
});

interface DailyRow {
	site_id: string;
	date: string;
	uptime_percentage: number;
	avg_response_time: number;
	p95_response_time: number;
}

interface LatestCheckRow {
	site_id: string;
	last_timestamp: string;
	last_status: number;
	last_http_code: number;
}

const dailyUptimeSchema = z.object({
	date: z.string(),
	uptime_percentage: z.number(),
	avg_response_time: z.number().optional(),
	p95_response_time: z.number().optional(),
});

const publicMonitorSchema = z.object({
	id: z.string(),
	name: z.string(),
	domain: z.string().nullable(),
	currentStatus: z.enum(["up", "down", "degraded", "unknown"]),
	uptimePercentage: z.number(),
	dailyData: z.array(dailyUptimeSchema),
	lastCheckedAt: z.string().nullable(),
	sectionId: z.string().nullable(),
	sortOrder: z.number(),
	showLink: z.boolean(),
	showLatency: z.boolean(),
	showUptimePct: z.boolean(),
	showStatus: z.boolean(),
	showLastChecked: z.boolean(),
});

const publicSectionSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	sortOrder: z.number(),
	isCollapsed: z.boolean(),
});

const publicStatusPageOutputSchema = z.object({
	page: z.object({
		title: z.string(),
		slug: z.string(),
		description: z.string().nullable(),
		logoUrl: z.string().nullable(),
		faviconUrl: z.string().nullable(),
		theme: z.string(),
		accentColor: z.string().nullable(),
		showOverallUptime: z.boolean(),
		defaultTimeRange: z.number(),
		isPasswordProtected: z.boolean(),
	}),
	organization: z.object({
		name: z.string(),
		slug: z.string().nullable(),
		logo: z.string().nullable(),
	}),
	overallStatus: z.enum(["operational", "degraded", "outage"]),
	sections: z.array(publicSectionSchema),
	monitors: z.array(publicMonitorSchema),
});

function deriveOverallStatus(
	monitors: { currentStatus: "up" | "down" | "degraded" | "unknown" }[]
): "operational" | "degraded" | "outage" {
	if (monitors.length === 0) {
		return "operational";
	}
	const allDown = monitors.every((m) => m.currentStatus === "down");
	if (allDown) {
		return "outage";
	}
	const hasDown = monitors.some((m) => m.currentStatus === "down");
	if (hasDown) {
		return "degraded";
	}
	const hasDegraded = monitors.some((m) => m.currentStatus === "degraded");
	if (hasDegraded) {
		return "degraded";
	}
	return "operational";
}

type PublicStatusPageOutput = z.infer<typeof publicStatusPageOutputSchema>;

async function _fetchPublicStatusPage(
	slug: string,
	days = 90
): Promise<PublicStatusPageOutput | null> {
	const page = await db.query.statusPages.findFirst({
		where: and(eq(statusPages.slug, slug), eq(statusPages.isPublished, true)),
		with: {
			organization: true,
			sections: true,
			monitors: {
				with: {
					schedule: {
						with: { website: true },
					},
				},
			},
		},
	});

	if (!page) {
		return null;
	}

	const activeMonitors = page.monitors.filter(
		(m) => m.schedule && !m.schedule.isPaused
	);

	if (activeMonitors.length === 0) {
		return {
			page: {
				title: page.title,
				slug: page.slug,
				description: page.description,
				logoUrl: page.logoUrl,
				faviconUrl: page.faviconUrl,
				theme: page.theme,
				accentColor: page.accentColor,
				showOverallUptime: page.showOverallUptime,
				defaultTimeRange: page.defaultTimeRange,
				isPasswordProtected: page.isPasswordProtected,
			},
			organization: {
				name: page.organization.name,
				slug: page.organization.slug,
				logo: page.organization.logo,
			},
			overallStatus: "operational",
			sections: page.sections.map((s) => ({
				id: s.id,
				name: s.name,
				description: s.description,
				sortOrder: s.sortOrder,
				isCollapsed: s.isCollapsed,
			})),
			monitors: [],
		};
	}

	const siteIds = activeMonitors.map(
		(m) => m.schedule.websiteId ?? m.schedule.id
	);

	const today = new Date();
	const startDay = new Date(today);
	startDay.setDate(startDay.getDate() - (days - 1));
	const startDate = startDay.toISOString().split("T").at(0) ?? "";
	const endDate = today.toISOString().split("T").at(0) ?? "";

	const websiteIds = activeMonitors
		.map((m) => m.schedule.websiteId)
		.filter((id): id is string => id !== null);

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
		chQuery<DailyRow>(
			`SELECT
				site_id,
				toDate(timestamp) as date,
				if((countIf(status = 1) + countIf(status = 0)) = 0, 0, round((countIf(status = 1) / (countIf(status = 1) + countIf(status = 0))) * 100, 2)) as uptime_percentage,
				round(avg(total_ms), 2) as avg_response_time,
				round(quantile(0.95)(total_ms), 2) as p95_response_time
			FROM ${UPTIME_TABLE}
			WHERE
				site_id IN ({siteIds:Array(String)})
				AND timestamp >= toDateTime({startDate:String})
				AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
			GROUP BY site_id, date
			ORDER BY site_id, date ASC`,
			{ siteIds, startDate, endDate }
		),
		chQuery<LatestCheckRow>(
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
		),
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

	const monitors = activeMonitors.map((entry) => {
		const schedule = entry.schedule;
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

		const uptimePercentage =
			dailyData.length > 0
				? dailyData.reduce((sum, d) => sum + d.uptime_percentage, 0) /
					dailyData.length
				: 0;

		return {
			id: entry.id,
			name:
				entry.displayName ??
				schedule.name ??
				website?.name ??
				website?.domain ??
				schedule.url,
			domain: entry.showLink ? (website?.domain ?? schedule.url) : null,
			currentStatus,
			uptimePercentage: Math.round(uptimePercentage * 100) / 100,
			dailyData: dailyData.map((d) => ({
				date: String(d.date),
				uptime_percentage: d.uptime_percentage,
				avg_response_time: d.avg_response_time,
				p95_response_time: d.p95_response_time,
			})),
			lastCheckedAt: latestCheck?.last_timestamp ?? null,
			sectionId: entry.sectionId,
			sortOrder: entry.sortOrder,
			showLink: entry.showLink,
			showLatency: entry.showLatency,
			showUptimePct: entry.showUptimePct,
			showStatus: entry.showStatus,
			showLastChecked: entry.showLastChecked,
		};
	});

	return {
		page: {
			title: page.title,
			slug: page.slug,
			description: page.description,
			logoUrl: page.logoUrl,
			faviconUrl: page.faviconUrl,
			theme: page.theme,
			accentColor: page.accentColor,
			showOverallUptime: page.showOverallUptime,
			defaultTimeRange: page.defaultTimeRange,
			isPasswordProtected: page.isPasswordProtected,
		},
		organization: {
			name: page.organization.name,
			slug: page.organization.slug,
			logo: page.organization.logo,
		},
		overallStatus: deriveOverallStatus(monitors),
		sections: page.sections.map((s) => ({
			id: s.id,
			name: s.name,
			description: s.description,
			sortOrder: s.sortOrder,
			isCollapsed: s.isCollapsed,
		})),
		monitors,
	};
}

const fetchPublicStatusPage = cacheable(_fetchPublicStatusPage, {
	expireInSec: 60,
	prefix: "status-page-v2",
	staleWhileRevalidate: true,
	staleTime: 30,
});

export const statusPageRouter = {
	list: monitorsProcedure
		.route({
			method: "POST",
			path: "/statusPage/list",
			summary: "List status pages for organization",
			tags: ["StatusPage"],
		})
		.input(z.object({ organizationId: z.string().optional() }).default({}))
		.output(z.array(statusPageOutputSchema))
		.handler(async ({ context, input }) => {
			const orgId = input.organizationId ?? context.organizationId;
			if (!orgId) {
				throw rpcError.badRequest("Organization ID is required");
			}

			await withWorkspace(context, {
				organizationId: orgId,
				resource: "website",
				permissions: ["read"],
			});

			return db.query.statusPages.findMany({
				where: eq(statusPages.organizationId, orgId),
				orderBy: (table, { desc }) => [desc(table.createdAt)],
			});
		}),

	get: monitorsProcedure
		.route({
			method: "POST",
			path: "/statusPage/get",
			summary: "Get status page with sections and monitors",
			tags: ["StatusPage"],
		})
		.input(z.object({ id: z.string() }))
		.output(statusPageDetailSchema)
		.handler(async ({ context, input }) => {
			const page = await db.query.statusPages.findFirst({
				where: eq(statusPages.id, input.id),
				with: {
					sections: {
						orderBy: (table, { asc }) => [asc(table.sortOrder)],
					},
					monitors: {
						orderBy: (table, { asc }) => [asc(table.sortOrder)],
						with: {
							schedule: {
								with: { website: true },
							},
						},
					},
				},
			});

			if (!page) {
				throw rpcError.notFound("StatusPage", input.id);
			}

			await withWorkspace(context, {
				organizationId: page.organizationId,
				resource: "website",
				permissions: ["read"],
			});

			return {
				...page,
				monitors: page.monitors.map((m) => ({
					...m,
					schedule: m.schedule ?? null,
				})),
			};
		}),

	create: monitorsProcedure
		.route({
			method: "POST",
			path: "/statusPage/create",
			summary: "Create a new status page",
			tags: ["StatusPage"],
		})
		.input(
			z.object({
				organizationId: z.string().optional(),
				title: z.string().min(1).max(100),
				slug: z.string().min(1).max(100),
				description: z.string().max(500).optional(),
				theme: z.enum(themeValues).optional(),
				accentColor: z
					.string()
					.regex(/^#[0-9a-fA-F]{6}$/)
					.optional(),
				logoUrl: z.string().url().optional(),
				faviconUrl: z.string().url().optional(),
				isPublished: z.boolean().optional(),
				defaultTimeRange: z.enum(["7", "30", "90"]).optional(),
			})
		)
		.output(statusPageOutputSchema)
		.handler(async ({ context, input }) => {
			const orgId = input.organizationId ?? context.organizationId;
			if (!orgId) {
				throw rpcError.badRequest("Organization ID is required");
			}

			await withWorkspace(context, {
				organizationId: orgId,
				resource: "website",
				permissions: ["configure"],
			});

			const slug = slugifyInput(input.slug);
			if (!slug) {
				throw rpcError.badRequest("Invalid slug");
			}

			const existing = await db.query.statusPages.findFirst({
				where: eq(statusPages.slug, slug),
				columns: { id: true },
			});

			if (existing) {
				throw rpcError.conflict("A status page with this slug already exists");
			}

			const id = randomUUIDv7();

			await db.insert(statusPages).values({
				id,
				organizationId: orgId,
				slug,
				title: input.title,
				description: input.description ?? null,
				theme: input.theme ?? "system",
				accentColor: input.accentColor ?? null,
				logoUrl: input.logoUrl ?? null,
				faviconUrl: input.faviconUrl ?? null,
				isPublished: input.isPublished ?? false,
				defaultTimeRange: input.defaultTimeRange
					? Number.parseInt(input.defaultTimeRange, 10)
					: 90,
			});

			logger.info({ statusPageId: id, slug }, "Status page created");

			const created = await db.query.statusPages.findFirst({
				where: eq(statusPages.id, id),
			});
			if (!created) {
				throw rpcError.internal("Failed to create status page");
			}

			return created;
		}),

	update: monitorsProcedure
		.route({
			method: "POST",
			path: "/statusPage/update",
			summary: "Update status page settings",
			tags: ["StatusPage"],
		})
		.input(
			z.object({
				id: z.string(),
				title: z.string().min(1).max(100).optional(),
				slug: z.string().min(1).max(100).optional(),
				description: z.string().max(500).nullish(),
				theme: z.enum(themeValues).optional(),
				accentColor: z
					.string()
					.regex(/^#[0-9a-fA-F]{6}$/)
					.nullish(),
				logoUrl: z.string().url().nullish(),
				faviconUrl: z.string().url().nullish(),
				isPublished: z.boolean().optional(),
				isPasswordProtected: z.boolean().optional(),
				password: z.string().min(4).max(100).optional(),
				showOverallUptime: z.boolean().optional(),
				defaultTimeRange: z.enum(["7", "30", "90"]).optional(),
				showSubscribeButton: z.boolean().optional(),
			})
		)
		.output(statusPageOutputSchema)
		.handler(async ({ context, input }) => {
			await getPageAndAuthorize(input.id, context);

			const updates: Record<string, unknown> = {
				updatedAt: new Date(),
			};

			if (input.title !== undefined) {
				updates.title = input.title;
			}
			if (input.slug !== undefined) {
				const slug = slugifyInput(input.slug);
				if (!slug) {
					throw rpcError.badRequest("Invalid slug");
				}
				const existing = await db.query.statusPages.findFirst({
					where: and(eq(statusPages.slug, slug)),
					columns: { id: true },
				});
				if (existing && existing.id !== input.id) {
					throw rpcError.conflict(
						"A status page with this slug already exists"
					);
				}
				updates.slug = slug;
			}
			if (input.description !== undefined) {
				updates.description = input.description;
			}
			if (input.theme !== undefined) {
				updates.theme = input.theme;
			}
			if (input.accentColor !== undefined) {
				updates.accentColor = input.accentColor;
			}
			if (input.logoUrl !== undefined) {
				updates.logoUrl = input.logoUrl;
			}
			if (input.faviconUrl !== undefined) {
				updates.faviconUrl = input.faviconUrl;
			}
			if (input.isPublished !== undefined) {
				updates.isPublished = input.isPublished;
			}
			if (input.isPasswordProtected !== undefined) {
				updates.isPasswordProtected = input.isPasswordProtected;
			}
			if (input.password !== undefined) {
				updates.passwordHash = createHash("sha256")
					.update(input.password)
					.digest("hex");
			}
			if (input.showOverallUptime !== undefined) {
				updates.showOverallUptime = input.showOverallUptime;
			}
			if (input.defaultTimeRange !== undefined) {
				updates.defaultTimeRange = Number.parseInt(input.defaultTimeRange, 10);
			}
			if (input.showSubscribeButton !== undefined) {
				updates.showSubscribeButton = input.showSubscribeButton;
			}

			await db
				.update(statusPages)
				.set(updates)
				.where(eq(statusPages.id, input.id));

			logger.info({ statusPageId: input.id }, "Status page updated");

			const updated = await db.query.statusPages.findFirst({
				where: eq(statusPages.id, input.id),
			});
			if (!updated) {
				throw rpcError.internal("Failed to update status page");
			}

			return updated;
		}),

	delete: monitorsProcedure
		.route({
			method: "POST",
			path: "/statusPage/delete",
			summary: "Delete a status page",
			tags: ["StatusPage"],
		})
		.input(z.object({ id: z.string() }))
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			await getPageAndAuthorize(input.id, context);

			await db.delete(statusPages).where(eq(statusPages.id, input.id));

			logger.info({ statusPageId: input.id }, "Status page deleted");
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
				scheduleId: z.string(),
				sectionId: z.string().optional(),
				displayName: z.string().max(100).optional(),
				sortOrder: z.number().int().optional(),
				showLink: z.boolean().optional(),
				showLatency: z.boolean().optional(),
				showUptimePct: z.boolean().optional(),
				showStatus: z.boolean().optional(),
				showLastChecked: z.boolean().optional(),
			})
		)
		.output(monitorEntryOutputSchema)
		.handler(async ({ context, input }) => {
			const page = await getPageAndAuthorize(input.statusPageId, context);

			const schedule = await db.query.uptimeSchedules.findFirst({
				where: eq(uptimeSchedules.id, input.scheduleId),
			});
			if (!schedule) {
				throw rpcError.notFound("Schedule", input.scheduleId);
			}
			if (schedule.organizationId !== page.organizationId) {
				throw rpcError.forbidden(
					"Monitor does not belong to this organization"
				);
			}

			if (input.sectionId) {
				const section = await db.query.statusPageSections.findFirst({
					where: and(
						eq(statusPageSections.id, input.sectionId),
						eq(statusPageSections.statusPageId, input.statusPageId)
					),
				});
				if (!section) {
					throw rpcError.notFound("Section", input.sectionId);
				}
			}

			const id = randomUUIDv7();

			await db.insert(statusPageMonitors).values({
				id,
				statusPageId: input.statusPageId,
				sectionId: input.sectionId ?? null,
				scheduleId: input.scheduleId,
				displayName: input.displayName ?? null,
				sortOrder: input.sortOrder ?? 0,
				showLink: input.showLink ?? true,
				showLatency: input.showLatency ?? true,
				showUptimePct: input.showUptimePct ?? true,
				showStatus: input.showStatus ?? true,
				showLastChecked: input.showLastChecked ?? true,
			});

			logger.info(
				{ statusPageId: input.statusPageId, scheduleId: input.scheduleId },
				"Monitor added to status page"
			);

			const created = await db.query.statusPageMonitors.findFirst({
				where: eq(statusPageMonitors.id, id),
			});
			if (!created) {
				throw rpcError.internal("Failed to add monitor");
			}

			return created;
		}),

	updateMonitor: monitorsProcedure
		.route({
			method: "POST",
			path: "/statusPage/updateMonitor",
			summary: "Update per-monitor display config",
			tags: ["StatusPage"],
		})
		.input(
			z.object({
				id: z.string(),
				sectionId: z.string().nullish(),
				displayName: z.string().max(100).nullish(),
				sortOrder: z.number().int().optional(),
				showLink: z.boolean().optional(),
				showLatency: z.boolean().optional(),
				showUptimePct: z.boolean().optional(),
				showStatus: z.boolean().optional(),
				showLastChecked: z.boolean().optional(),
			})
		)
		.output(monitorEntryOutputSchema)
		.handler(async ({ context, input }) => {
			const entry = await db.query.statusPageMonitors.findFirst({
				where: eq(statusPageMonitors.id, input.id),
			});
			if (!entry) {
				throw rpcError.notFound("StatusPageMonitor", input.id);
			}

			await getPageAndAuthorize(entry.statusPageId, context);

			const updates: Record<string, unknown> = {
				updatedAt: new Date(),
			};

			if (input.sectionId !== undefined) {
				updates.sectionId = input.sectionId;
			}
			if (input.displayName !== undefined) {
				updates.displayName = input.displayName;
			}
			if (input.sortOrder !== undefined) {
				updates.sortOrder = input.sortOrder;
			}
			if (input.showLink !== undefined) {
				updates.showLink = input.showLink;
			}
			if (input.showLatency !== undefined) {
				updates.showLatency = input.showLatency;
			}
			if (input.showUptimePct !== undefined) {
				updates.showUptimePct = input.showUptimePct;
			}
			if (input.showStatus !== undefined) {
				updates.showStatus = input.showStatus;
			}
			if (input.showLastChecked !== undefined) {
				updates.showLastChecked = input.showLastChecked;
			}

			await db
				.update(statusPageMonitors)
				.set(updates)
				.where(eq(statusPageMonitors.id, input.id));

			const updated = await db.query.statusPageMonitors.findFirst({
				where: eq(statusPageMonitors.id, input.id),
			});
			if (!updated) {
				throw rpcError.internal("Failed to update monitor entry");
			}

			return updated;
		}),

	removeMonitor: monitorsProcedure
		.route({
			method: "POST",
			path: "/statusPage/removeMonitor",
			summary: "Remove a monitor from a status page",
			tags: ["StatusPage"],
		})
		.input(z.object({ id: z.string() }))
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			const entry = await db.query.statusPageMonitors.findFirst({
				where: eq(statusPageMonitors.id, input.id),
			});
			if (!entry) {
				throw rpcError.notFound("StatusPageMonitor", input.id);
			}

			await getPageAndAuthorize(entry.statusPageId, context);

			await db
				.delete(statusPageMonitors)
				.where(eq(statusPageMonitors.id, input.id));

			logger.info(
				{ entryId: input.id, statusPageId: entry.statusPageId },
				"Monitor removed from status page"
			);

			return { success: true };
		}),

	addSection: monitorsProcedure
		.route({
			method: "POST",
			path: "/statusPage/addSection",
			summary: "Add a section to a status page",
			tags: ["StatusPage"],
		})
		.input(
			z.object({
				statusPageId: z.string(),
				name: z.string().min(1).max(100),
				description: z.string().max(500).optional(),
				sortOrder: z.number().int().optional(),
				isCollapsed: z.boolean().optional(),
			})
		)
		.output(sectionOutputSchema)
		.handler(async ({ context, input }) => {
			await getPageAndAuthorize(input.statusPageId, context);

			const id = randomUUIDv7();

			await db.insert(statusPageSections).values({
				id,
				statusPageId: input.statusPageId,
				name: input.name,
				description: input.description ?? null,
				sortOrder: input.sortOrder ?? 0,
				isCollapsed: input.isCollapsed ?? false,
			});

			logger.info(
				{ statusPageId: input.statusPageId, sectionId: id },
				"Section added to status page"
			);

			const created = await db.query.statusPageSections.findFirst({
				where: eq(statusPageSections.id, id),
			});
			if (!created) {
				throw rpcError.internal("Failed to create section");
			}

			return created;
		}),

	updateSection: monitorsProcedure
		.route({
			method: "POST",
			path: "/statusPage/updateSection",
			summary: "Update a section",
			tags: ["StatusPage"],
		})
		.input(
			z.object({
				id: z.string(),
				name: z.string().min(1).max(100).optional(),
				description: z.string().max(500).nullish(),
				sortOrder: z.number().int().optional(),
				isCollapsed: z.boolean().optional(),
			})
		)
		.output(sectionOutputSchema)
		.handler(async ({ context, input }) => {
			const section = await db.query.statusPageSections.findFirst({
				where: eq(statusPageSections.id, input.id),
			});
			if (!section) {
				throw rpcError.notFound("Section", input.id);
			}

			await getPageAndAuthorize(section.statusPageId, context);

			const updates: Record<string, unknown> = {
				updatedAt: new Date(),
			};

			if (input.name !== undefined) {
				updates.name = input.name;
			}
			if (input.description !== undefined) {
				updates.description = input.description;
			}
			if (input.sortOrder !== undefined) {
				updates.sortOrder = input.sortOrder;
			}
			if (input.isCollapsed !== undefined) {
				updates.isCollapsed = input.isCollapsed;
			}

			await db
				.update(statusPageSections)
				.set(updates)
				.where(eq(statusPageSections.id, input.id));

			const updated = await db.query.statusPageSections.findFirst({
				where: eq(statusPageSections.id, input.id),
			});
			if (!updated) {
				throw rpcError.internal("Failed to update section");
			}

			return updated;
		}),

	removeSection: monitorsProcedure
		.route({
			method: "POST",
			path: "/statusPage/removeSection",
			summary: "Remove a section (monitors become ungrouped)",
			tags: ["StatusPage"],
		})
		.input(z.object({ id: z.string() }))
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			const section = await db.query.statusPageSections.findFirst({
				where: eq(statusPageSections.id, input.id),
			});
			if (!section) {
				throw rpcError.notFound("Section", input.id);
			}

			await getPageAndAuthorize(section.statusPageId, context);

			await db
				.update(statusPageMonitors)
				.set({ sectionId: null, updatedAt: new Date() })
				.where(eq(statusPageMonitors.sectionId, input.id));

			await db
				.delete(statusPageSections)
				.where(eq(statusPageSections.id, input.id));

			logger.info(
				{ sectionId: input.id, statusPageId: section.statusPageId },
				"Section removed from status page"
			);

			return { success: true };
		}),

	reorder: monitorsProcedure
		.route({
			method: "POST",
			path: "/statusPage/reorder",
			summary: "Bulk reorder sections and monitors",
			tags: ["StatusPage"],
		})
		.input(
			z.object({
				statusPageId: z.string(),
				sections: z
					.array(z.object({ id: z.string(), sortOrder: z.number().int() }))
					.optional(),
				monitors: z
					.array(
						z.object({
							id: z.string(),
							sortOrder: z.number().int(),
							sectionId: z.string().nullable(),
						})
					)
					.optional(),
			})
		)
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			await getPageAndAuthorize(input.statusPageId, context);

			const now = new Date();

			const promises: Promise<unknown>[] = [];

			if (input.sections) {
				for (const s of input.sections) {
					promises.push(
						db
							.update(statusPageSections)
							.set({ sortOrder: s.sortOrder, updatedAt: now })
							.where(eq(statusPageSections.id, s.id))
					);
				}
			}

			if (input.monitors) {
				for (const m of input.monitors) {
					promises.push(
						db
							.update(statusPageMonitors)
							.set({
								sortOrder: m.sortOrder,
								sectionId: m.sectionId,
								updatedAt: now,
							})
							.where(eq(statusPageMonitors.id, m.id))
					);
				}
			}

			await Promise.all(promises);

			logger.info(
				{ statusPageId: input.statusPageId },
				"Status page reordered"
			);

			return { success: true };
		}),

	getPublic: publicProcedure
		.route({
			method: "POST",
			path: "/statusPage/getPublic",
			summary: "Get public status page data",
			tags: ["StatusPage"],
		})
		.input(
			z.object({
				slug: z.string().min(1),
				days: z.number().int().min(7).max(90).optional().default(90),
				password: z.string().optional(),
			})
		)
		.output(publicStatusPageOutputSchema)
		.handler(async ({ input }) => {
			const data = await fetchPublicStatusPage(input.slug, input.days);

			if (!data) {
				throw rpcError.notFound("StatusPage", input.slug);
			}

			if (data.page.isPasswordProtected) {
				if (!input.password) {
					return {
						...data,
						monitors: [],
						overallStatus: "operational" as const,
					};
				}
				const page = await db.query.statusPages.findFirst({
					where: eq(statusPages.slug, input.slug),
					columns: { passwordHash: true },
				});
				if (page?.passwordHash) {
					const hash = createHash("sha256")
						.update(input.password)
						.digest("hex");
					if (hash !== page.passwordHash) {
						throw rpcError.forbidden("Incorrect password");
					}
				}
			}

			return data;
		}),

	/** @deprecated Use getPublic instead - kept for backward compat */
	getBySlug: publicProcedure
		.route({
			method: "POST",
			path: "/statusPage/getBySlug",
			summary: "Get public status page (legacy)",
			tags: ["StatusPage"],
		})
		.input(
			z.object({
				slug: z.string().min(1),
				days: z.number().int().min(7).max(90).optional().default(90),
			})
		)
		.output(
			z.object({
				organization: z.object({
					name: z.string(),
					slug: z.string(),
					logo: z.string().nullable(),
				}),
				overallStatus: z.enum(["operational", "degraded", "outage"]),
				monitors: z.array(
					z.object({
						id: z.string(),
						name: z.string(),
						domain: z.string(),
						currentStatus: z.enum(["up", "down", "unknown"]),
						uptimePercentage: z.number(),
						dailyData: z.array(dailyUptimeSchema),
						lastCheckedAt: z.string().nullable(),
					})
				),
			})
		)
		.handler(async ({ input }) => {
			const data = await fetchPublicStatusPage(input.slug, input.days);

			if (data) {
				return {
					organization: data.organization,
					overallStatus: data.overallStatus,
					monitors: data.monitors.map((m) => ({
						id: m.id,
						name: m.name,
						domain: m.domain ?? "",
						currentStatus:
							m.currentStatus === "degraded"
								? ("down" as const)
								: (m.currentStatus as "up" | "down" | "unknown"),
						uptimePercentage: m.uptimePercentage,
						dailyData: m.dailyData,
						lastCheckedAt: m.lastCheckedAt,
					})),
				};
			}

			const orgFallback = await _legacyFetchByOrgSlug(input.slug, input.days);
			if (!orgFallback) {
				throw rpcError.notFound("StatusPage", input.slug);
			}

			return orgFallback;
		}),

	togglePublicMonitor: protectedProcedure
		.route({
			method: "POST",
			path: "/statusPage/togglePublicMonitor",
			summary: "Toggle monitor public visibility (legacy)",
			tags: ["StatusPage"],
		})
		.input(
			z.object({
				scheduleId: z.string(),
				isPublic: z.boolean(),
			})
		)
		.output(z.object({ success: z.literal(true), isPublic: z.boolean() }))
		.handler(async ({ context, input }) => {
			const schedule = await db.query.uptimeSchedules.findFirst({
				where: eq(uptimeSchedules.id, input.scheduleId),
			});

			if (!schedule) {
				throw rpcError.notFound("Schedule", input.scheduleId);
			}

			await withWorkspace(context, {
				organizationId: schedule.organizationId,
				resource: "website",
				permissions: ["configure"],
			});

			await db
				.update(uptimeSchedules)
				.set({ isPublic: input.isPublic, updatedAt: new Date() })
				.where(eq(uptimeSchedules.id, input.scheduleId));

			logger.info(
				{ scheduleId: input.scheduleId, isPublic: input.isPublic },
				"Monitor public visibility toggled"
			);

			return { success: true, isPublic: input.isPublic };
		}),
};

async function _legacyFetchByOrgSlug(slug: string, days = 90) {
	const rows = await db
		.select({
			orgName: organization.name,
			orgSlug: organization.slug,
			orgLogo: organization.logo,
			scheduleId: uptimeSchedules.id,
			websiteId: uptimeSchedules.websiteId,
			scheduleName: uptimeSchedules.name,
			scheduleUrl: uptimeSchedules.url,
		})
		.from(organization)
		.innerJoin(
			uptimeSchedules,
			and(
				eq(uptimeSchedules.organizationId, organization.id),
				eq(uptimeSchedules.isPublic, true),
				eq(uptimeSchedules.isPaused, false)
			)
		)
		.where(eq(organization.slug, slug));

	if (rows.length === 0) {
		return null;
	}

	const org = {
		name: rows[0].orgName,
		slug: rows[0].orgSlug ?? slug,
		logo: rows[0].orgLogo,
	};

	const schedules = rows.map((r) => ({
		id: r.scheduleId,
		websiteId: r.websiteId,
		name: r.scheduleName,
		url: r.scheduleUrl,
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
		chQuery<DailyRow>(
			`SELECT
				site_id,
				toDate(timestamp) as date,
				if((countIf(status = 1) + countIf(status = 0)) = 0, 0, round((countIf(status = 1) / (countIf(status = 1) + countIf(status = 0))) * 100, 2)) as uptime_percentage,
				round(avg(total_ms), 2) as avg_response_time,
				round(quantile(0.95)(total_ms), 2) as p95_response_time
			FROM ${UPTIME_TABLE}
			WHERE
				site_id IN ({siteIds:Array(String)})
				AND timestamp >= toDateTime({startDate:String})
				AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
			GROUP BY site_id, date
			ORDER BY site_id, date ASC`,
			{ siteIds, startDate, endDate }
		),
		chQuery<LatestCheckRow>(
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
		),
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

		const currentStatus: "up" | "down" | "unknown" = latestCheck
			? latestCheck.last_status === 1
				? "up"
				: "down"
			: "unknown";

		const uptimePercentage =
			dailyData.length > 0
				? dailyData.reduce((sum, d) => sum + d.uptime_percentage, 0) /
					dailyData.length
				: 0;

		return {
			id: schedule.id,
			name: schedule.name ?? website?.name ?? website?.domain ?? schedule.url,
			domain: website?.domain ?? schedule.url,
			currentStatus,
			uptimePercentage: Math.round(uptimePercentage * 100) / 100,
			dailyData: dailyData.map((d) => ({
				date: String(d.date),
				uptime_percentage: d.uptime_percentage,
				avg_response_time: d.avg_response_time,
				p95_response_time: d.p95_response_time,
			})),
			lastCheckedAt: latestCheck?.last_timestamp ?? null,
		};
	});

	return {
		organization: org,
		overallStatus: deriveOverallStatus(
			monitors.map((m) => ({
				currentStatus: m.currentStatus === "down" ? "down" : m.currentStatus,
			}))
		),
		monitors,
	};
}
