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
	);

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
			await enforcePublicRateLimit(context.headers, "sitemap", 10);
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
		.input(
			z.object({
				slug: z.string().min(1),
				days: z
					.union([z.literal(7), z.literal(30), z.literal(90)])
					.optional()
					.default(90),
			})
		)
		.output(statusPageOutputSchema)
		.handler(async ({ context, input }) => {
			await enforcePublicRateLimit(context.headers, "page", 120);
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

	createAssetUploadUrl: trackedProcedure
		.route({
			description:
				"Returns a short-lived presigned URL for uploading a status page logo or favicon. Requires write:status_pages scope.",
			method: "POST",
			path: "/statusPage/createAssetUploadUrl",
			summary: "Create an asset upload URL",
			tags: ["StatusPage"],
			spec: (s) => ({
				...s,
				"x-required-scopes": ["write:status_pages"] as const,
			}),
		})
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

			return createAssetUpload({
				asset: input.asset,
				contentLength: input.contentLength,
				contentType: input.contentType,
				organizationId: input.organizationId,
			});
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
				name: z.string().min(1).max(120),
				slug: statusPageSlug,
				description: z.string().max(500).optional(),
				logoUrl: httpUrl.nullish(),
				faviconUrl: httpUrl.nullish(),
				websiteUrl: httpUrl.nullish(),
				supportUrl: httpUrl.nullish(),
				theme: z.enum(["system", "light", "dark"]).optional(),
			})
		)
		.handler(async ({ context, input }) => {
			setTrackProperties({ theme: input.theme ?? "default" });
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "status_page",
				permissions: ["create"],
			});

			const existing = await db.query.statusPages.findFirst({
				where: { slug: input.slug },
			});

			if (existing) {
				throw rpcError.badRequest("Slug is already taken");
			}

			const id = randomUUIDv7();

			try {
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
			} catch (error) {
				if (isSlugConflict(error)) {
					throw rpcError.badRequest("Slug is already taken");
				}
				throw error;
			}

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
				name: z.string().min(1).max(120).optional(),
				slug: statusPageSlug.optional(),
				description: z.string().max(500).optional(),
				logoUrl: httpUrl.nullish(),
				faviconUrl: httpUrl.nullish(),
				websiteUrl: httpUrl.nullish(),
				supportUrl: httpUrl.nullish(),
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

			try {
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
			} catch (error) {
				if (isSlugConflict(error)) {
					throw rpcError.badRequest("Slug is already taken");
				}
				throw error;
			}

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
				permissions: ["delete"],
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
			const incident = await requireIncidentForUpdate(
				context,
				input.incidentId
			);

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
