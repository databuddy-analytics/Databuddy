import { getClientIp } from "@databuddy/shared/utils/client-ip";
import {
	and,
	db,
	eq,
	inArray,
	isUniqueViolationFor,
	ne,
	withTransaction,
} from "@databuddy/db";
import {
	incidentAffectedMonitors,
	incidentUpdates,
	incidents,
	statusPageMonitors,
	statusPages,
	uptimeSchedules,
} from "@databuddy/db/schema";
import { invalidateStatusPageCache } from "@databuddy/redis";
import { ratelimit } from "@databuddy/redis/rate-limit";
import type { Route } from "@orpc/server";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import {
	createAssetUpload,
	isStorageConfigured,
} from "@databuddy/services/storage";
import {
	MAX_UPLOAD_BYTES,
	UPLOAD_CONTENT_TYPES,
} from "@databuddy/shared/uploads";
import { rpcError } from "../errors";
import { setAuditOrganization } from "../lib/audit";
import { setTrackProperties } from "../middleware/track-mutation";
import {
	type Context,
	protectedProcedure,
	publicProcedure,
	trackedProcedure,
} from "../orpc";
import { RESERVED_STATUS_PAGE_SLUGS } from "@databuddy/shared/uptime";
import { authorizeTransfer, withResource } from "../procedures/with-resource";
import { withWorkspace } from "../procedures/with-workspace";
import {
	fetchStatusPageData,
	listPublicStatusPageSitemapEntries,
} from "./status-page-data";
import {
	incidentImpact,
	incidentSeverity,
	incidentStatus,
	publicStatusPageSitemapEntrySchema,
	statusPageOutputSchema,
	statusPageTheme,
} from "./status-page-schemas";

async function enforcePublicRateLimit(
	headers: Headers,
	bucket: string,
	limit: number
): Promise<void> {
	const result = await ratelimit(
		`status-page:${bucket}:${getClientIp(headers) ?? "unknown"}`,
		limit,
		60
	);
	if (!result.success) {
		throw rpcError.rateLimited(60);
	}
}

const httpUrl = z
	.string()
	.max(2048)
	.url()
	.refine(
		(value) => value.startsWith("https://"),
		"URL must start with https://"
	);

const statusPageSlug = z
	.string()
	.min(1)
	.max(100)
	.regex(
		/^[a-z0-9-]+$/,
		"Slug must only contain lowercase letters, numbers, and dashes"
	)
	.refine(
		(slug) => !RESERVED_STATUS_PAGE_SLUGS.has(slug),
		"This slug is reserved"
	);

const statusPageFields = z.object({
	name: z.string().min(1).max(120),
	slug: statusPageSlug,
	description: z.string().max(500).optional(),
	logoUrl: httpUrl.nullish(),
	faviconUrl: httpUrl.nullish(),
	websiteUrl: httpUrl.nullish(),
	supportUrl: httpUrl.nullish(),
	theme: statusPageTheme.optional(),
});

function statusPageRoute(
	name: string,
	summary: string,
	access: "read" | "write",
	description: string
): Route {
	return {
		description,
		method: "POST",
		path: `/statusPage/${name}`,
		summary,
		tags: ["StatusPage"],
		spec: (s) => ({ ...s, "x-required-scopes": [`${access}:status_pages`] }),
	};
}

function isSlugConflict(error: unknown): boolean {
	return isUniqueViolationFor(error, "status_pages_slug_unique");
}

async function requireIncidentForUpdate(context: Context, incidentId: string) {
	const incident = await db.query.incidents.findFirst({
		where: { id: incidentId },
		with: { statusPage: true },
	});

	if (!incident) {
		throw rpcError.notFound("Incident", incidentId);
	}

	await withWorkspace(context, {
		organizationId: incident.statusPage.organizationId,
		resource: "status_page",
		permissions: ["update"],
	});

	return incident;
}

function describeSchedules(
	schedules: Array<{ id: string; name: string | null; url: string | null }>
): string {
	const names = schedules.slice(0, 3).map((s) => s.name || s.url || s.id);
	const extra = schedules.length - names.length;
	return extra > 0 ? `${names.join(", ")} and ${extra} more` : names.join(", ");
}

export const statusPageRouter = {
	listPublic: publicProcedure
		.route({
			method: "POST",
			path: "/statusPage/listPublic",
			summary: "List public status pages for sitemap generation",
			tags: ["StatusPage"],
			spec: (spec) => ({ ...spec, security: [] }),
		})
		.output(z.array(publicStatusPageSitemapEntrySchema))
		.handler(async ({ context }) => {
			await enforcePublicRateLimit(context.headers, "sitemap", 60);
			return listPublicStatusPageSitemapEntries();
		}),

	getBySlug: publicProcedure
		.route({
			method: "POST",
			path: "/statusPage/getBySlug",
			summary: "Get public status page",
			tags: ["StatusPage"],
			spec: (spec) => ({ ...spec, security: [] }),
		})
		.input(z.object({ slug: z.string().min(1).max(100) }))
		.output(statusPageOutputSchema)
		.handler(async ({ context, input }) => {
			await enforcePublicRateLimit(context.headers, "page", 600);
			await enforcePublicRateLimit(context.headers, `page:${input.slug}`, 120);
			const { page } = await fetchStatusPageData(input.slug);

			if (!page) {
				throw rpcError.notFound("StatusPage", input.slug);
			}

			return page;
		}),

	list: protectedProcedure
		.route(
			statusPageRoute(
				"list",
				"List status pages for organization",
				"read",
				"Lists status pages for an organization. Requires read:status_pages scope."
			)
		)
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

			return pages.map(({ statusPageMonitors: monitors, ...page }) => ({
				...page,
				monitorCount: monitors.length,
			}));
		}),

	get: protectedProcedure
		.route(
			statusPageRoute(
				"get",
				"Get status page details including monitors",
				"read",
				"Returns status page details including monitors. Requires read:status_pages scope."
			)
		)
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

	createAssetUploadUrl: trackedProcedure
		.route(
			statusPageRoute(
				"createAssetUploadUrl",
				"Create an asset upload URL",
				"write",
				"Returns a short-lived presigned URL for uploading a status page logo or favicon. Requires write:status_pages scope."
			)
		)
		.input(
			z.object({
				asset: z.enum(["logo", "favicon"]),
				contentLength: z.number().int().positive().max(MAX_UPLOAD_BYTES),
				contentType: z.enum(UPLOAD_CONTENT_TYPES),
				organizationId: z.string(),
			})
		)
		.handler(async ({ context, input }) => {
			setTrackProperties({ asset: input.asset });
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "status_page",
				permissions: ["update"],
			});

			if (!isStorageConfigured()) {
				throw rpcError.serviceUnavailable(
					60,
					"Asset uploads are not available because object storage is not configured."
				);
			}

			return createAssetUpload(input);
		}),

	create: trackedProcedure
		.route(
			statusPageRoute(
				"create",
				"Create status page",
				"write",
				"Creates a status page. Requires write:status_pages scope."
			)
		)
		.input(statusPageFields.extend({ organizationId: z.string() }))
		.handler(async ({ context, input }) => {
			setTrackProperties({ theme: input.theme ?? "default" });
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "status_page",
				permissions: ["create"],
			});

			const [page] = await db
				.insert(statusPages)
				.values({ id: randomUUIDv7(), ...input })
				.returning()
				.catch((error) => {
					throw isSlugConflict(error)
						? rpcError.badRequest("Slug is already taken")
						: error;
				});

			await invalidateStatusPageCache(input.slug);

			return page;
		}),

	update: trackedProcedure
		.route(
			statusPageRoute(
				"update",
				"Update status page details",
				"write",
				"Updates status page details. Requires write:status_pages scope."
			)
		)
		.input(statusPageFields.partial().extend({ statusPageId: z.string() }))
		.handler(async ({ context, input }) => {
			const statusPage = await withResource(context, {
				resource: "status_page",
				id: input.statusPageId,
				permissions: ["update"],
			});
			const { statusPageId, ...fields } = input;

			const [page] = await db
				.update(statusPages)
				.set({ ...fields, updatedAt: new Date() })
				.where(eq(statusPages.id, statusPageId))
				.returning()
				.catch((error) => {
					throw isSlugConflict(error)
						? rpcError.badRequest("Slug is already taken")
						: error;
				});

			await invalidateStatusPageCache(statusPage.slug);
			if (input.slug && input.slug !== statusPage.slug) {
				await invalidateStatusPageCache(input.slug);
			}

			return page;
		}),

	delete: trackedProcedure
		.route(
			statusPageRoute(
				"delete",
				"Delete status page",
				"write",
				"Deletes a status page. Requires write:status_pages scope."
			)
		)
		.input(
			z.object({
				statusPageId: z.string(),
			})
		)
		.handler(async ({ context, input }) => {
			const statusPage = await withResource(context, {
				resource: "status_page",
				id: input.statusPageId,
				permissions: ["delete"],
			});

			await db
				.delete(statusPages)
				.where(eq(statusPages.id, input.statusPageId));

			await invalidateStatusPageCache(statusPage.slug);

			return { success: true };
		}),

	transfer: trackedProcedure
		.route(
			statusPageRoute(
				"transfer",
				"Transfer status page to another organization",
				"write",
				"Transfers a status page to another organization. Requires write:status_pages scope on source and target."
			)
		)
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
			setAuditOrganization(context, statusPage.organizationId);

			await withTransaction(async (tx) => {
				const pageMonitors = await tx
					.select({ uptimeScheduleId: statusPageMonitors.uptimeScheduleId })
					.from(statusPageMonitors)
					.where(eq(statusPageMonitors.statusPageId, input.statusPageId));
				const scheduleIds = pageMonitors.map((m) => m.uptimeScheduleId);

				if (input.includeMonitors && scheduleIds.length > 0) {
					const schedules = await tx
						.select({
							id: uptimeSchedules.id,
							name: uptimeSchedules.name,
							url: uptimeSchedules.url,
							websiteId: uptimeSchedules.websiteId,
						})
						.from(uptimeSchedules)
						.where(inArray(uptimeSchedules.id, scheduleIds));

					const websiteBound = schedules.filter((s) => s.websiteId !== null);
					if (websiteBound.length > 0) {
						throw rpcError.badRequest(
							`Cannot transfer website-linked monitors: ${describeSchedules(websiteBound)}. Transfer the website instead, or remove these monitors from the page first.`
						);
					}

					const sharedRows = await tx
						.selectDistinct({
							uptimeScheduleId: statusPageMonitors.uptimeScheduleId,
						})
						.from(statusPageMonitors)
						.where(
							and(
								inArray(statusPageMonitors.uptimeScheduleId, scheduleIds),
								ne(statusPageMonitors.statusPageId, input.statusPageId)
							)
						);
					if (sharedRows.length > 0) {
						const sharedIds = new Set(
							sharedRows.map((r) => r.uptimeScheduleId)
						);
						const shared = schedules.filter((s) => sharedIds.has(s.id));
						throw rpcError.badRequest(
							`Cannot transfer monitors used by other status pages: ${describeSchedules(shared)}. Remove them from the other pages first, or transfer without monitors.`
						);
					}

					await tx
						.update(uptimeSchedules)
						.set({
							organizationId: input.targetOrganizationId,
							updatedAt: new Date(),
						})
						.where(inArray(uptimeSchedules.id, scheduleIds));
				}

				if (!input.includeMonitors && scheduleIds.length > 0) {
					await tx
						.delete(statusPageMonitors)
						.where(eq(statusPageMonitors.statusPageId, input.statusPageId));
				}

				await tx
					.update(statusPages)
					.set({
						organizationId: input.targetOrganizationId,
						updatedAt: new Date(),
					})
					.where(eq(statusPages.id, input.statusPageId));
			});

			await invalidateStatusPageCache(statusPage.slug);

			return { success: true };
		}),

	addMonitor: trackedProcedure
		.route(
			statusPageRoute(
				"addMonitor",
				"Add a monitor to a status page",
				"write",
				"Adds a monitor to a status page. Requires write:status_pages scope."
			)
		)
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

			const [monitor] = await db
				.insert(statusPageMonitors)
				.values({ id: randomUUIDv7(), ...input })
				.returning()
				.catch((error) => {
					throw isUniqueViolationFor(
						error,
						"status_page_monitors_page_schedule_unique"
					)
						? rpcError.badRequest("Monitor is already on this status page")
						: error;
				});

			await invalidateStatusPageCache(statusPage.slug);

			return monitor;
		}),

	removeMonitor: trackedProcedure
		.route(
			statusPageRoute(
				"removeMonitor",
				"Remove a monitor from a status page",
				"write",
				"Removes a monitor from a status page. Requires write:status_pages scope."
			)
		)
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
		.route(
			statusPageRoute(
				"updateMonitorSettings",
				"Update visibility settings for a status page monitor",
				"write",
				"Updates visibility settings for a status page monitor. Requires write:status_pages scope."
			)
		)
		.input(
			z.object({
				monitorId: z.string(),
				displayName: z.string().max(120).nullable().optional(),
				hideUrl: z.boolean().optional(),
				hideUptimePercentage: z.boolean().optional(),
				hideLatency: z.boolean().optional(),
				order: z.number().int().min(0).max(100_000).optional(),
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

			const { monitorId, ...settings } = input;
			const [updated] = await db
				.update(statusPageMonitors)
				.set({ ...settings, updatedAt: new Date() })
				.where(eq(statusPageMonitors.id, monitorId))
				.returning();

			await invalidateStatusPageCache(monitor.statusPage.slug);

			return updated;
		}),

	createIncident: trackedProcedure
		.route(
			statusPageRoute(
				"createIncident",
				"Create a new incident",
				"write",
				"Creates a new status page incident. Requires write:status_pages scope."
			)
		)
		.input(
			z.object({
				statusPageId: z.string(),
				title: z.string().min(1).max(200),
				severity: incidentSeverity.optional().default("minor"),
				message: z.string().min(1).max(5000),
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
			setTrackProperties({ severity: input.severity });
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

			await withTransaction(async (tx) => {
				await tx.insert(incidents).values({
					id: incidentId,
					statusPageId: input.statusPageId,
					title: input.title,
					severity: input.severity,
					status: "investigating",
				});

				await tx.insert(incidentUpdates).values({
					id: randomUUIDv7(),
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
		.route(
			statusPageRoute(
				"updateIncident",
				"Post an update to an incident",
				"write",
				"Posts an update to a status page incident. Requires write:status_pages scope."
			)
		)
		.input(
			z.object({
				incidentId: z.string(),
				status: incidentStatus,
				message: z.string().min(1).max(5000),
			})
		)
		.handler(async ({ context, input }) => {
			setTrackProperties({ status: input.status });
			const incident = await requireIncidentForUpdate(
				context,
				input.incidentId
			);

			await withTransaction(async (tx) => {
				await tx.insert(incidentUpdates).values({
					id: randomUUIDv7(),
					incidentId: input.incidentId,
					status: input.status,
					message: input.message,
				});

				const resolvedAt =
					input.status === "resolved"
						? (incident.resolvedAt ?? new Date())
						: null;

				await tx
					.update(incidents)
					.set({ status: input.status, resolvedAt })
					.where(eq(incidents.id, input.incidentId));
			});

			await invalidateStatusPageCache(incident.statusPage.slug);

			return db.query.incidents.findFirst({
				where: { id: input.incidentId },
				with: { updates: { orderBy: { createdAt: "desc" } } },
			});
		}),

	deleteIncident: trackedProcedure
		.route(
			statusPageRoute(
				"deleteIncident",
				"Delete an incident",
				"write",
				"Deletes a status page incident. Requires write:status_pages scope."
			)
		)
		.input(z.object({ incidentId: z.string() }))
		.handler(async ({ context, input }) => {
			const incident = await requireIncidentForUpdate(
				context,
				input.incidentId
			);

			await db.delete(incidents).where(eq(incidents.id, input.incidentId));

			await invalidateStatusPageCache(incident.statusPage.slug);

			return { deleted: true };
		}),

	listIncidents: protectedProcedure
		.route(
			statusPageRoute(
				"listIncidents",
				"List incidents for a status page",
				"read",
				"Lists incidents for a status page. Requires read:status_pages scope."
			)
		)
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
