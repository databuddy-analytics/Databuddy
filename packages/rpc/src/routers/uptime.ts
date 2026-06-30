import { db, eq } from "@databuddy/db";
import {
	statusPageMonitors,
	statusPages,
	uptimeSchedules,
} from "@databuddy/db/schema";
import { invalidateStatusPageCache } from "@databuddy/redis";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import { logger } from "../lib/logger";
import { protectedProcedure, trackedProcedure } from "../orpc";
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
	type UptimeScheduleUpdate,
} from "../services/uptime-lifecycle";
import {
	CRON_GRANULARITIES,
	hasUptimeSchedule,
} from "../services/uptime-scheduler";

const granularityEnum = z.enum([
	"minute",
	"five_minutes",
	"ten_minutes",
	"thirty_minutes",
	"hour",
	"six_hours",
	"twelve_hours",
	"day",
]);

function parseStoredGranularity(
	value: string
): z.infer<typeof granularityEnum> {
	const parsed = granularityEnum.safeParse(value);
	if (!parsed.success) {
		throw rpcError.internal("Invalid monitor granularity");
	}
	return parsed.data;
}

async function invalidateStatusPageCachesForSchedule(
	scheduleId: string
): Promise<void> {
	const rows = await db
		.select({ slug: statusPages.slug })
		.from(statusPageMonitors)
		.innerJoin(statusPages, eq(statusPageMonitors.statusPageId, statusPages.id))
		.where(eq(statusPageMonitors.uptimeScheduleId, scheduleId));

	const results = await Promise.allSettled(
		rows.map((row) =>
			Promise.resolve().then(() => invalidateStatusPageCache(row.slug))
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

const getScheduleOutputSchema = z
	.object({
		id: z.string(),
		websiteId: z.string().nullable(),
		organizationId: z.string(),
		url: z.string(),
		name: z.string().nullable(),
		granularity: z.string(),
		cron: z.string(),
		isPaused: z.boolean(),
		timeout: z.number().nullable().optional(),
		cacheBust: z.boolean(),
		jsonParsingConfig: z.unknown().nullable(),
		createdAt: z.union([z.date(), z.string()]),
		updatedAt: z.union([z.date(), z.string()]),
		schedulerStatus: z.enum(["active", "missing"]),
		website: z
			.object({
				id: z.string(),
				name: z.string().nullable(),
				domain: z.string(),
			})
			.loose()
			.nullable()
			.optional(),
	})
	.loose();

const scheduleOutputSchema = z.record(z.string(), z.unknown());

const listScheduleItemSchema = getScheduleOutputSchema
	.omit({ schedulerStatus: true })
	.loose();

export const uptimeRouter = {
	getScheduleByWebsiteId: protectedProcedure
		.route({
			description:
				"Returns uptime schedule for a website. Requires read:monitors scope.",
			method: "POST",
			path: "/uptime/getScheduleByWebsiteId",
			summary: "Get schedule by website",
			tags: ["Uptime"],
			spec: (s) => ({ ...s, "x-required-scopes": ["read:monitors"] as const }),
		})
		.input(z.object({ websiteId: z.string() }))
		.output(scheduleOutputSchema.nullable())
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				websiteId: input.websiteId,
				resource: "monitor",
				permissions: ["read"],
			});

			const schedule = await db.query.uptimeSchedules.findFirst({
				where: { websiteId: input.websiteId },
				orderBy: { createdAt: "desc" },
			});

			return schedule ?? null;
		}),

	listSchedules: protectedProcedure
		.route({
			description:
				"Returns uptime schedules for organization or all user workspaces. Requires read:monitors scope.",
			method: "POST",
			path: "/uptime/listSchedules",
			summary: "List schedules",
			tags: ["Uptime"],
			spec: (s) => ({ ...s, "x-required-scopes": ["read:monitors"] as const }),
		})
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
		.route({
			description:
				"Returns schedule with BullMQ scheduler status. Requires read:monitors scope.",
			method: "POST",
			path: "/uptime/getSchedule",
			summary: "Get schedule",
			tags: ["Uptime"],
			spec: (s) => ({ ...s, "x-required-scopes": ["read:monitors"] as const }),
		})
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
		.route({
			description: "Creates an uptime monitor. Requires write:monitors scope.",
			method: "POST",
			path: "/uptime/createSchedule",
			summary: "Create schedule",
			tags: ["Uptime"],
			spec: (s) => ({ ...s, "x-required-scopes": ["write:monitors"] as const }),
		})
		.input(
			z.object({
				url: z.string().url(),
				name: z.string().optional(),
				organizationId: z.string().optional(),
				websiteId: z.string().optional(),
				granularity: granularityEnum,
				timeout: z.number().int().min(1000).max(120_000).optional(),
				cacheBust: z.boolean().optional(),
				jsonParsingConfig: z
					.object({
						enabled: z.boolean(),
					})
					.optional(),
			})
		)
		.output(scheduleOutputSchema)
		.handler(async ({ context, input }) => {
			setTrackProperties({ granularity: input.granularity });
			const organizationId =
				input.organizationId?.trim() || context.organizationId || null;
			if (!organizationId) {
				throw rpcError.badRequest("Organization ID is required");
			}

			await withWorkspace(context, {
				organizationId,
				resource: "monitor",
				permissions: ["update"],
			});

			const existing = await db.query.uptimeSchedules.findFirst({
				where: { url: input.url, organizationId },
			});

			if (existing) {
				throw rpcError.conflict(
					"Monitor already exists for this URL in this workspace"
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
				jsonParsingConfig: input.jsonParsingConfig ?? { enabled: true },
			});

			logger.info({ scheduleId, url: input.url }, "Schedule created");

			const created = await db.query.uptimeSchedules.findFirst({
				where: { id: scheduleId },
			});

			return {
				scheduleId,
				url: input.url,
				name: input.name,
				granularity: input.granularity,
				cron: CRON_GRANULARITIES[input.granularity],
				jsonParsingConfig: created?.jsonParsingConfig ?? null,
			};
		}),

	updateSchedule: trackedProcedure
		.route({
			description: "Updates an uptime schedule. Requires write:monitors scope.",
			method: "POST",
			path: "/uptime/updateSchedule",
			summary: "Update schedule",
			tags: ["Uptime"],
			spec: (s) => ({ ...s, "x-required-scopes": ["write:monitors"] as const }),
		})
		.input(
			z.object({
				scheduleId: z.string(),
				name: z.string().nullish(),
				granularity: granularityEnum.optional(),
				timeout: z.number().int().min(1000).max(120_000).nullish(),
				cacheBust: z.boolean().optional(),
				jsonParsingConfig: z
					.object({
						enabled: z.boolean(),
					})
					.optional(),
			})
		)
		.output(scheduleOutputSchema)
		.handler(async ({ context, input }) => {
			const existingSchedule = await withResource(context, {
				resource: "monitor",
				id: input.scheduleId,
				permissions: ["update"],
			});

			const updateData: UptimeScheduleUpdate = {
				updatedAt: new Date(),
			};

			if (input.name !== undefined) {
				const trimmed = input.name?.trim();
				updateData.name = trimmed ? trimmed : null;
			}

			if (input.granularity) {
				updateData.granularity = input.granularity;
				updateData.cron = CRON_GRANULARITIES[input.granularity];
			}

			if (input.timeout !== undefined) {
				updateData.timeout = input.timeout;
			}

			if (input.cacheBust !== undefined) {
				updateData.cacheBust = input.cacheBust;
			}

			if (input.jsonParsingConfig !== undefined) {
				updateData.jsonParsingConfig = input.jsonParsingConfig;
			}

			await updateScheduleWithScheduler(
				input.scheduleId,
				updateData,
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
				cron: schedule?.cron,
				jsonParsingConfig: schedule?.jsonParsingConfig ?? null,
			};
		}),

	deleteSchedule: trackedProcedure
		.route({
			description: "Deletes an uptime schedule. Requires write:monitors scope.",
			method: "POST",
			path: "/uptime/deleteSchedule",
			summary: "Delete schedule",
			tags: ["Uptime"],
			spec: (s) => ({ ...s, "x-required-scopes": ["write:monitors"] as const }),
		})
		.input(z.object({ scheduleId: z.string() }))
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			await withResource(context, {
				resource: "monitor",
				id: input.scheduleId,
				permissions: ["update"],
			});
			await invalidateStatusPageCachesForSchedule(input.scheduleId);

			await deleteScheduleWithScheduler(input.scheduleId);

			logger.info({ scheduleId: input.scheduleId }, "Schedule deleted");
			return { success: true };
		}),

	togglePause: trackedProcedure
		.route({
			description:
				"Pauses or resumes an uptime schedule. Requires write:monitors scope.",
			method: "POST",
			path: "/uptime/togglePause",
			summary: "Toggle pause",
			tags: ["Uptime"],
			spec: (s) => ({ ...s, "x-required-scopes": ["write:monitors"] as const }),
		})
		.input(z.object({ scheduleId: z.string(), pause: z.boolean() }))
		.output(z.object({ success: z.literal(true), isPaused: z.boolean() }))
		.handler(async ({ context, input }) => {
			setTrackProperties({ paused: input.pause });
			const schedule = await withResource(context, {
				resource: "monitor",
				id: input.scheduleId,
				permissions: ["update"],
			});

			if (schedule.isPaused === input.pause) {
				throw rpcError.badRequest(
					input.pause ? "Schedule is already paused" : "Schedule is not paused"
				);
			}

			try {
				if (input.pause) {
					await pauseScheduleWithScheduler(input.scheduleId);
				} else {
					await resumeScheduleWithScheduler(
						input.scheduleId,
						parseStoredGranularity(schedule.granularity)
					);
				}
			} catch (error) {
				logger.error(
					{ scheduleId: input.scheduleId, error },
					"Failed to toggle uptime scheduler"
				);
				throw rpcError.internal("Failed to update monitor status");
			}

			await invalidateStatusPageCachesForSchedule(input.scheduleId);

			logger.info(
				{ scheduleId: input.scheduleId, paused: input.pause },
				"Schedule toggled"
			);

			return { success: true, isPaused: input.pause };
		}),

	pauseSchedule: trackedProcedure
		.route({
			description:
				"Pauses an uptime schedule. Legacy compatibility. Requires write:monitors scope.",
			method: "POST",
			path: "/uptime/pauseSchedule",
			summary: "Pause schedule",
			tags: ["Uptime"],
			spec: (s) => ({ ...s, "x-required-scopes": ["write:monitors"] as const }),
		})
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
		.route({
			description:
				"Transfers an uptime monitor to another organization. Requires write:monitors scope on source and target.",
			method: "POST",
			path: "/uptime/transfer",
			summary: "Transfer monitor",
			tags: ["Uptime"],
			spec: (s) => ({ ...s, "x-required-scopes": ["write:monitors"] as const }),
		})
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

			await db
				.update(uptimeSchedules)
				.set({
					organizationId: input.targetOrganizationId,
					updatedAt: new Date(),
				})
				.where(eq(uptimeSchedules.id, input.scheduleId));
			await invalidateStatusPageCachesForSchedule(input.scheduleId);

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
		.route({
			description:
				"Triggers an immediate uptime check for a monitor. Monitor must not be paused. Requires write:monitors scope.",
			method: "POST",
			path: "/uptime/manualCheck",
			summary: "Manual check",
			tags: ["Uptime"],
			spec: (s) => ({ ...s, "x-required-scopes": ["write:monitors"] as const }),
		})
		.input(z.object({ scheduleId: z.string() }))
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			const schedule = await withResource(context, {
				resource: "monitor",
				id: input.scheduleId,
				permissions: ["update"],
			});

			await triggerManualUptimeCheck(input.scheduleId, schedule.isPaused);
			await invalidateStatusPageCachesForSchedule(input.scheduleId);

			logger.info({ scheduleId: input.scheduleId }, "Manual check triggered");
			return { success: true };
		}),

	resumeSchedule: trackedProcedure
		.route({
			description:
				"Resumes an uptime schedule. Legacy compatibility. Requires write:monitors scope.",
			method: "POST",
			path: "/uptime/resumeSchedule",
			summary: "Resume schedule",
			tags: ["Uptime"],
			spec: (s) => ({ ...s, "x-required-scopes": ["write:monitors"] as const }),
		})
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
					parseStoredGranularity(schedule.granularity)
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
