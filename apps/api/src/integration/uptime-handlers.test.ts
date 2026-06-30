import "@databuddy/test/env";

import { flags, uptimeSchedules } from "@databuddy/db/schema";
import { readBooleanEnv } from "@databuddy/env/boolean";
import {
	closeUptimeQueue,
	getUptimeQueue,
	type UptimeCheckJobData,
	UPTIME_CHECK_JOB_NAME,
	UPTIME_JOB_OPTIONS,
	uptimeSchedulerId,
} from "@databuddy/redis";
import { appRouter, type Context } from "@databuddy/rpc";
import {
	addToOrganization,
	cleanup,
	db,
	expectCode,
	hasTestDb,
	insertOrganization,
	insertWebsite,
	reset,
	signUp,
	userContext,
} from "@databuddy/test";
import { createProcedureClient, type AnyProcedure } from "@orpc/server";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUIDv7 } from "bun";
import type { Job } from "bullmq";

const canRun =
	hasTestDb &&
	Boolean(process.env.BULLMQ_REDIS_URL) &&
	readBooleanEnv("UPTIME_ROUTER_INTEGRATION");
const iit = canRun ? it : it.skip;
const scheduleIds = new Set<string>();

function call<T extends AnyProcedure>(procedure: T, context: Context) {
	return createProcedureClient(procedure, { context });
}

beforeEach(async () => {
	await reset();
	scheduleIds.clear();
});

afterEach(async () => {
	await cleanupBullMQ();
});

afterAll(async () => {
	await cleanupBullMQ();
	await closeUptimeQueue();
	await cleanup();
});

function scheduleIdFrom(result: unknown): string {
	const scheduleId = (result as { scheduleId?: unknown }).scheduleId;
	if (typeof scheduleId !== "string") {
		throw new Error("Expected scheduleId in uptime response");
	}
	scheduleIds.add(scheduleId);
	return scheduleId;
}

async function enableMonitorsFeature(userId: string, organizationId: string) {
	await db()
		.insert(flags)
		.values({
			id: randomUUIDv7(),
			key: "monitors",
			name: "Monitors",
			defaultValue: true,
			status: "active",
			organizationId,
			createdBy: userId,
		});
}

async function workspace(role = "owner") {
	const user = await signUp();
	const org = await insertOrganization();
	await addToOrganization(user.id, org.id, role);
	await enableMonitorsFeature(user.id, org.id);
	return {
		context: userContext(user, org.id),
		org,
		user,
	};
}

async function createSchedule(values: {
	organizationId: string;
	context: Context;
	websiteId?: string;
	url?: string;
}) {
	const result = await call(appRouter.uptime.createSchedule, values.context)({
		url: values.url ?? `https://${randomUUIDv7()}.example.com/health`,
		name: "Primary API",
		organizationId: values.organizationId,
		websiteId: values.websiteId,
		granularity: "five_minutes" as const,
		timeout: 5000,
		cacheBust: true,
		jsonParsingConfig: { enabled: false },
	});
	return scheduleIdFrom(result);
}

async function scheduleRow(scheduleId: string) {
	return db().query.uptimeSchedules.findFirst({
		where: { id: scheduleId },
	});
}

async function scheduler(scheduleId: string) {
	return getUptimeQueue().getJobScheduler(uptimeSchedulerId(scheduleId));
}

async function jobsForSchedule(
	scheduleId: string
): Promise<Job<UptimeCheckJobData>[]> {
	const jobs = await getUptimeQueue().getJobs(
		["waiting", "delayed", "prioritized", "paused", "completed", "failed"],
		0,
		-1
	);
	return jobs.filter((job) => job.data?.scheduleId === scheduleId);
}

async function cleanupBullMQ() {
	if (!canRun) {
		return;
	}
	const queue = getUptimeQueue();
	await Promise.allSettled(
		[...scheduleIds].map((scheduleId) =>
			queue.removeJobScheduler(uptimeSchedulerId(scheduleId))
		)
	);
	const jobs = await queue.getJobs(
		["waiting", "delayed", "prioritized", "paused", "completed", "failed"],
		0,
		-1
	);
	await Promise.allSettled(
		jobs
			.filter((job) => scheduleIds.has(job.data?.scheduleId))
			.map((job) => job.remove())
	);
}

describe("uptime router BullMQ integration", () => {
	iit("creates a schedule in Postgres and BullMQ together", async () => {
		const { context, org } = await workspace();
		const website = await insertWebsite({ organizationId: org.id });

		const scheduleId = await createSchedule({
			context,
			organizationId: org.id,
			websiteId: website.id,
			url: "https://create.example.com/health",
		});

		const row = await scheduleRow(scheduleId);
		expect(row?.url).toBe("https://create.example.com/health");
		expect(row?.websiteId).toBe(website.id);
		expect(row?.granularity).toBe("five_minutes");
		expect(row?.cron).toBe("*/5 * * * *");
		expect(row?.isPaused).toBe(false);
		expect(row?.timeout).toBe(5000);
		expect(row?.cacheBust).toBe(true);
		expect(row?.jsonParsingConfig).toEqual({ enabled: false });

		expect(await scheduler(scheduleId)).toBeTruthy();
		const jobs = await jobsForSchedule(scheduleId);
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.name).toBe(UPTIME_CHECK_JOB_NAME);
		expect(jobs[0]?.data).toEqual({ scheduleId, trigger: "scheduled" });
		expect(jobs[0]?.opts.attempts).toBe(UPTIME_JOB_OPTIONS.attempts);
	});

	iit("updates granularity without duplicating scheduled jobs", async () => {
		const { context, org } = await workspace();
		const scheduleId = await createSchedule({
			context,
			organizationId: org.id,
		});

		await call(appRouter.uptime.updateSchedule, context)({
			scheduleId,
			name: "Renamed API",
			granularity: "ten_minutes",
			timeout: null,
			cacheBust: false,
			jsonParsingConfig: { enabled: true },
		});

		const row = await scheduleRow(scheduleId);
		expect(row?.name).toBe("Renamed API");
		expect(row?.granularity).toBe("ten_minutes");
		expect(row?.cron).toBe("*/10 * * * *");
		expect(row?.timeout).toBeNull();
		expect(row?.cacheBust).toBe(false);
		expect(row?.jsonParsingConfig).toEqual({ enabled: true });
		expect(await scheduler(scheduleId)).toBeTruthy();
		expect(await jobsForSchedule(scheduleId)).toHaveLength(1);
	});

	iit("pauses and resumes by syncing Postgres and BullMQ state", async () => {
		const { context, org } = await workspace();
		const scheduleId = await createSchedule({
			context,
			organizationId: org.id,
		});

		await call(appRouter.uptime.togglePause, context)({
			scheduleId,
			pause: true,
		});

		expect((await scheduleRow(scheduleId))?.isPaused).toBe(true);
		expect(await scheduler(scheduleId)).toBeFalsy();

		await call(appRouter.uptime.togglePause, context)({
			scheduleId,
			pause: false,
		});

		expect((await scheduleRow(scheduleId))?.isPaused).toBe(false);
		expect(await scheduler(scheduleId)).toBeTruthy();
		expect(await jobsForSchedule(scheduleId)).toHaveLength(1);
	});

	iit("manual checks enqueue an immediate job and reject paused schedules", async () => {
		const { context, org } = await workspace();
		const scheduleId = await createSchedule({
			context,
			organizationId: org.id,
		});

		await call(appRouter.uptime.manualCheck, context)({ scheduleId });

		const manualJobs = (await jobsForSchedule(scheduleId)).filter(
			(job) => job.data.trigger === "manual"
		);
		expect(manualJobs).toHaveLength(1);
		expect(manualJobs[0]?.name).toBe(UPTIME_CHECK_JOB_NAME);

		await call(appRouter.uptime.togglePause, context)({
			scheduleId,
			pause: true,
		});

		await expectCode(
			call(appRouter.uptime.manualCheck, context)({ scheduleId }),
			"BAD_REQUEST"
		);
	});

	iit("deletes schedule storage and scheduler state together", async () => {
		const { context, org } = await workspace();
		const scheduleId = await createSchedule({
			context,
			organizationId: org.id,
		});

		await call(appRouter.uptime.deleteSchedule, context)({ scheduleId });

		expect(await scheduleRow(scheduleId)).toBeUndefined();
		expect(await scheduler(scheduleId)).toBeFalsy();
		expect(await jobsForSchedule(scheduleId)).toHaveLength(0);
	});

	iit("does not let another organization mutate a monitor", async () => {
		const source = await workspace();
		const other = await workspace();
		const scheduleId = await createSchedule({
			context: source.context,
			organizationId: source.org.id,
		});

		await expectCode(
			call(appRouter.uptime.deleteSchedule, other.context)({ scheduleId }),
			"FORBIDDEN"
		);

		expect(await scheduleRow(scheduleId)).toBeTruthy();
		expect(await scheduler(scheduleId)).toBeTruthy();
	});
});
