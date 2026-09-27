import { db, eq } from "@databuddy/db";
import {
	statusPageMonitors,
	statusPages,
	uptimeSchedules,
} from "@databuddy/db/schema";
import { invalidateStatusPageCache } from "@databuddy/redis";
import {
	CRON_GRANULARITIES,
	uptimeGranularitySchema,
} from "@databuddy/shared/uptime";
import type { Route } from "@orpc/server";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import { logger } from "../lib/logger";
import { protectedProcedure, trackedProcedure } from "../orpc";
import { setAuditOrganization } from "../lib/audit";
import { setTrackProperties } from "../middleware/track-mutation";
import { authorizeTransfer, withResource } from "../procedures/with-resource";
import { withWorkspace } from "../procedures/with-workspace";
import {
	createScheduleWithScheduler,
	deleteScheduleWithScheduler,
	pauseScheduleWithScheduler,
	resumeScheduleWithScheduler,
	triggerManualUptimeCheck,
	updateScheduleWithScheduler,
} from "../services/uptime-lifecycle";
import { hasUptimeSchedule } from "../services/uptime-scheduler";

function uptimeRoute(
	name: string,
	summary: string,
	access: "read" | "write",
	description: string
): Route {
	return {
		description,
		method: "POST",
		path: `/uptime/${name}`,
		summary,
		tags: ["Uptime"],
		spec: (s) => ({ ...s, "x-required-scopes": [`${access}:monitors`] }),
	};
}

async function statusPageSlugsForSchedule(
	scheduleId: string
): Promise<string[]> {
	const rows = await db
		.select({ slug: statusPages.slug })
		.from(statusPageMonitors)
		.innerJoin(statusPages, eq(statusPageMonitors.statusPageId, statusPages.id))
		.where(eq(statusPageMonitors.uptimeScheduleId, scheduleId));
	return rows.map((row) => row.slug);
}

async function invalidateStatusPageCachesForSchedule(
	scheduleId: string,
	slugs?: string[]
): Promise<void> {
	const results = await Promise.allSettled(
		(slugs ?? (await statusPageSlugsForSchedule(scheduleId))).map(
			invalidateStatusPageCache
		)
	);
	const failed = results.filter((result) => result.status === "rejected");
	if (failed.length > 0) {
		logger.warn(
			{ failedCount: failed.length, scheduleId },
			"Failed to invalidate status page caches for uptime schedule"
		);
	}
}

const getScheduleOutputSchema = z.object({
	id: z.string(),
	websiteId: z.string().nullable(),
	organizationId: z.string(),
	url: z.string(),
	name: z.string().nullable(),
	granularity: uptimeGranularitySchema,
	isPaused: z.boolean(),
	timeout: z.number().nullable().optional(),
	cacheBust: z.boolean(),
	createdAt: z.union([z.date(), z.string()]),
	updatedAt: z.union([z.date(), z.string()]),
	schedulerStatus: z.enum(["active", "missing"]),
	website: z
		.object({
			id: z.string(),
			name: z.string().nullable(),
			domain: z.string(),
		})
		.nullable()
		.optional(),
});

const scheduleMutationOutputSchema = z.object({
	scheduleId: z.string(),
	url: z.string().optional(),
	name: z.string().nullish(),
	granularity: uptimeGranularitySchema.optional(),
});

const listScheduleItemSchema = getScheduleOutputSchema.omit({
	schedulerStatus: true,
});

export const uptimeRouter = {
	getScheduleByWebsiteId: protectedProcedure
		.route(
			uptimeRoute(
				"getScheduleByWebsiteId",
				"Get schedule by website",
				"read",
				"Returns uptime schedule for a website with BullMQ scheduler status. Requires read:monitors scope."
			)
		)
		.input(z.object({ websiteId: z.string() }))
		.output(getScheduleOutputSchema.nullable())
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				websiteId: input.websiteId,
				resource: "monitor",
				permissions: ["read"],
			});

			const schedule = await db.query.uptimeSchedules.findFirst({
				where: { websiteId: input.websiteId },
				orderBy: { createdAt: "desc" },
				with: { website: true },
			});
			if (!schedule) {
				return null;
			}

			const schedulerActive = await hasUptimeSchedule(schedule.id).catch(
				() => false
			);
			return {
				...schedule,
				schedulerStatus: schedulerActive ? "active" : "missing",
			};
		}),

	listSchedules: protectedProcedure
		.route(
			uptimeRoute(
				"listSchedules",
				"List schedules",
				"read",
				"Returns uptime schedules for one organization or all accessible organizations. Requires read:monitors scope."
			)
		)
		.input(
			z
				.object({
					organizationId: z.string().optional(),
				})
				.default({})
		)
		.output(z.array(listScheduleItemSchema))
		.handler(async ({ context, input }) => {
			const orgId = input.organizationId ?? context.organizationId;

			if (!orgId) {
				throw rpcError.badRequest("Organization ID is required");
			}

			await withWorkspace(context, {
				organizationId: orgId,
				resource: "monitor",
				permissions: ["read"],
			});

			return db.query.uptimeSchedules.findMany({
				where: { organizationId: orgId },
				orderBy: { createdAt: "desc" },
				with: { website: true },
				limit: 100,
			});
		}),

	getSchedule: protectedProcedure
		.route(
			uptimeRoute(
				"getSchedule",
				"Get schedule",
				"read",
				"Returns schedule with BullMQ scheduler status. Requires read:monitors scope."
			)
		)
		.input(z.object({ scheduleId: z.string() }))
		.output(getScheduleOutputSchema)
		.handler(async ({ context, input }) => {
			const [dbSchedule, schedulerActive] = await Promise.all([
				db.query.uptimeSchedules.findFirst({
					where: { id: input.scheduleId },
					with: { website: true },
				}),
				hasUptimeSchedule(input.scheduleId).catch(() => false),
			]);

			if (!dbSchedule) {
				throw rpcError.notFound("Schedule", input.scheduleId);
			}

			await withWorkspace(context, {
				organizationId: dbSchedule.organizationId,
				resource: "monitor",
				permissions: ["read"],
			});

			return {
				...dbSchedule,
				schedulerStatus: schedulerActive ? "active" : "missing",
			};
		}),

	createSchedule: trackedProcedure
		.route(
			uptimeRoute(
				"createSchedule",
				"Create schedule",
				"write",
				"Creates an uptime monitor. Requires write:monitors scope."
			)
		)
		.input(
			z.object({
				url: z.string().url(),
				name: z.string().optional(),
				organizationId: z.string().optional(),
				websiteId: z.string().optional(),
				granularity: uptimeGranularitySchema,
				timeout: z.number().int().min(1000).max(120_000).optional(),
				cacheBust: z.boolean().optional(),
			})
		)
		.output(scheduleMutationOutputSchema)
		.handler(async ({ context, input }) => {
			setTrackProperties({ granularity: input.granularity });
			const organizationId =
				input.organizationId?.trim() || context.organizationId || null;
			if (!organizationId) {
				throw rpcError.badRequest("Organization ID is required");
			}

			if (input.websiteId) {
				await withWorkspace(context, {
					organizationId,
					websiteId: input.websiteId,
					resource: "monitor",
					permissions: ["create"],
				});
			} else {
				await withWorkspace(context, {
					organizationId,
					resource: "monitor",
					permissions: ["create"],
				});
			}

			const existing = await db.query.uptimeSchedules.findFirst({
				where: {
					organizationId,
					OR: [
						{ url: input.url },
						...(input.websiteId ? [{ websiteId: input.websiteId }] : []),
					],
				},
			});

			if (existing) {
				throw rpcError.conflict(
					existing.url === input.url
						? "Monitor already exists for this URL in this organization"
						: "This website already has a monitor"
				);
			}

			const scheduleId = randomUUIDv7();

			await createScheduleWithScheduler({
				id: scheduleId,
				organizationId,
				websiteId: input.websiteId ?? null,
				url: input.url,
				name: input.name ?? null,
				granularity: input.granularity,
				cron: CRON_GRANULARITIES[input.granularity],
				isPaused: false,
				timeout: input.timeout ?? null,
				cacheBust: input.cacheBust ?? false,
			});

			logger.info({ scheduleId, url: input.url }, "Schedule created");

			return {
				scheduleId,
				url: input.url,
				name: input.name,
				granularity: input.granularity,
			};
		}),

	updateSchedule: trackedProcedure
		.route(
			uptimeRoute(
				"updateSchedule",
				"Update schedule",
				"write",
				"Updates an uptime schedule. Requires write:monitors scope."
			)
		)
		.input(
			z.object({
				scheduleId: z.string(),
				name: z.string().nullish(),
				granularity: uptimeGranularitySchema.optional(),
				timeout: z.number().int().min(1000).max(120_000).nullish(),
				cacheBust: z.boolean().optional(),
			})
		)
		.output(scheduleMutationOutputSchema)
		.handler(async ({ context, input }) => {
			const existingSchedule = await withResource(context, {
				resource: "monitor",
				id: input.scheduleId,
				permissions: ["update"],
			});

			await updateScheduleWithScheduler(
				input.scheduleId,
				{
					name:
						input.name === undefined ? undefined : input.name?.trim() || null,
					granularity: input.granularity,
					cron: input.granularity && CRON_GRANULARITIES[input.granularity],
					timeout: input.timeout,
					cacheBust: input.cacheBust,
					updatedAt: new Date(),
				},
				existingSchedule
			);
			await invalidateStatusPageCachesForSchedule(input.scheduleId);

			logger.info({ scheduleId: input.scheduleId }, "Schedule updated");

			const schedule = await db.query.uptimeSchedules.findFirst({
				where: { id: input.scheduleId },
			});

			return {
				scheduleId: input.scheduleId,
				name: schedule?.name ?? null,
				granularity: schedule?.granularity,
			};
		}),

	deleteSchedule: trackedProcedure
		.route(
			uptimeRoute(
				"deleteSchedule",
				"Delete schedule",
				"write",
				"Deletes an uptime schedule. Requires write:monitors scope."
			)
		)
		.input(z.object({ scheduleId: z.string() }))
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			await withResource(context, {
				resource: "monitor",
				id: input.scheduleId,
				permissions: ["delete"],
			});
			const slugs = await statusPageSlugsForSchedule(input.scheduleId);

			await deleteScheduleWithScheduler(input.scheduleId);
			await invalidateStatusPageCachesForSchedule(input.scheduleId, slugs);

			logger.info({ scheduleId: input.scheduleId }, "Schedule deleted");
			return { success: true };
		}),

	pauseSchedule: trackedProcedure
		.route(
			uptimeRoute(
				"pauseSchedule",
				"Pause schedule",
				"write",
				"Pauses an uptime schedule. Legacy compatibility. Requires write:monitors scope."
			)
		)
		.input(z.object({ scheduleId: z.string() }))
		.output(z.object({ success: z.literal(true), isPaused: z.literal(true) }))
		.handler(async ({ context, input }) => {
			const schedule = await withResource(context, {
				resource: "monitor",
				id: input.scheduleId,
				permissions: ["update"],
			});

			if (schedule.isPaused) {
				throw rpcError.badRequest("Schedule is already paused");
			}

			try {
				await pauseScheduleWithScheduler(input.scheduleId);
			} catch (error) {
				logger.error(
					{ scheduleId: input.scheduleId, error },
					"Failed to pause"
				);
				throw rpcError.internal("Failed to pause monitor");
			}

			await invalidateStatusPageCachesForSchedule(input.scheduleId);

			logger.info({ scheduleId: input.scheduleId }, "Schedule paused");
			return { success: true, isPaused: true };
		}),

	transfer: trackedProcedure
		.route(
			uptimeRoute(
				"transfer",
				"Transfer monitor",
				"write",
				"Transfers an uptime monitor to another organization. Requires write:monitors scope on source and target."
			)
		)
		.input(
			z.object({
				scheduleId: z.string(),
				targetOrganizationId: z.string(),
			})
		)
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			const schedule = await authorizeTransfer(context, {
				resource: "monitor",
				id: input.scheduleId,
				targetOrganizationId: input.targetOrganizationId,
			});
			setAuditOrganization(context, schedule.organizationId);

			if (schedule.websiteId) {
				throw rpcError.badRequest(
					"This monitor is linked to a website. Transfer the website instead."
				);
			}

			const attachedSlugs = await statusPageSlugsForSchedule(input.scheduleId);
			if (attachedSlugs.length > 0) {
				throw rpcError.badRequest(
					`This monitor is used by status pages (${attachedSlugs.slice(0, 3).join(", ")}). Remove it from them first, or transfer the status page instead.`
				);
			}

			await db
				.update(uptimeSchedules)
				.set({
					organizationId: input.targetOrganizationId,
					updatedAt: new Date(),
				})
				.where(eq(uptimeSchedules.id, input.scheduleId));

			logger.info(
				{
					scheduleId: input.scheduleId,
					from: schedule.organizationId,
					to: input.targetOrganizationId,
				},
				"Monitor transferred"
			);

			return { success: true };
		}),

	manualCheck: trackedProcedure
		.route(
			uptimeRoute(
				"manualCheck",
				"Manual check",
				"write",
				"Triggers an immediate uptime check for a monitor. Monitor must not be paused. Requires write:monitors scope."
			)
		)
		.input(z.object({ scheduleId: z.string() }))
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			const schedule = await withResource(context, {
				resource: "monitor",
				id: input.scheduleId,
				permissions: ["update"],
			});

			await triggerManualUptimeCheck(input.scheduleId, schedule.isPaused);

			logger.info({ scheduleId: input.scheduleId }, "Manual check triggered");
			return { success: true };
		}),

	resumeSchedule: trackedProcedure
		.route(
			uptimeRoute(
				"resumeSchedule",
				"Resume schedule",
				"write",
				"Resumes an uptime schedule. Legacy compatibility. Requires write:monitors scope."
			)
		)
		.input(z.object({ scheduleId: z.string() }))
		.output(z.object({ success: z.literal(true), isPaused: z.literal(false) }))
		.handler(async ({ context, input }) => {
			const schedule = await withResource(context, {
				resource: "monitor",
				id: input.scheduleId,
				permissions: ["update"],
			});

			if (!schedule.isPaused) {
				throw rpcError.badRequest("Schedule is not paused");
			}

			try {
				await resumeScheduleWithScheduler(
					input.scheduleId,
					uptimeGranularitySchema.parse(schedule.granularity)
				);
			} catch (error) {
				logger.error(
					{ scheduleId: input.scheduleId, error },
					"Failed to resume"
				);
				throw rpcError.internal("Failed to resume monitor");
			}

			await invalidateStatusPageCachesForSchedule(input.scheduleId);

			logger.info({ scheduleId: input.scheduleId }, "Schedule resumed");
			return { success: true, isPaused: false };
		}),
};
