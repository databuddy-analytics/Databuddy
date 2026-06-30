import { afterAll, afterEach, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";

setDefaultTimeout(15_000);
import { Worker, type Job } from "bullmq";
import type { UptimeCheckJobData } from "@databuddy/redis";

async function waitFor(
	condition: () => boolean | Promise<boolean>,
	message: string,
	timeoutMs = 5000
): Promise<void> {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		if (await condition()) {
			return;
		}
		await Bun.sleep(50);
	}
	throw new Error(message);
}

const TEST_SCHEDULE_PREFIX = "bullmq-integration-";
const TEST_SCHEDULER_KEY_PREFIX = `uptime-${TEST_SCHEDULE_PREFIX}`;

const describeIntegration = process.env.BULLMQ_REDIS_URL ? describe : describe.skip;

describeIntegration("uptime scheduler BullMQ integration", () => {
	let redis: typeof import("@databuddy/redis") | undefined;
	let service: typeof import("./uptime-scheduler") | undefined;
	const scheduleIds = new Set<string>();
	const testRunId = `${TEST_SCHEDULE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

	beforeAll(async () => {
		redis = await import("@databuddy/redis");
		service = await import("./uptime-scheduler");
		await sweepLeakedTestSchedulers();
	});

	afterEach(async () => {
		await cleanupTestState();
	});

	afterAll(async () => {
		await cleanupTestState();
		await redis?.closeUptimeQueue();
	});

	function makeScheduleId(label: string): string {
		const scheduleId = `${testRunId}-${label}`;
		scheduleIds.add(scheduleId);
		return scheduleId;
	}

	function isTestScheduleId(scheduleId: unknown): scheduleId is string {
		return typeof scheduleId === "string" && scheduleId.startsWith(testRunId);
	}

	function isAnyTestSchedulerKey(key: unknown): key is string {
		return (
			typeof key === "string" && key.startsWith(TEST_SCHEDULER_KEY_PREFIX)
		);
	}

	function isThisRunSchedulerKey(key: unknown): key is string {
		return (
			typeof key === "string" &&
			key.startsWith(`${TEST_SCHEDULER_KEY_PREFIX}${testRunId.slice(TEST_SCHEDULE_PREFIX.length)}`)
		);
	}

	async function jobsForSchedule(scheduleId: string): Promise<Job[]> {
		const queue = redis?.getUptimeQueue();
		if (!queue) {
			return [];
		}
		const jobs = await queue.getJobs(
			["waiting", "delayed", "prioritized", "paused"],
			0,
			-1
		);
		return jobs.filter((job) => job.data?.scheduleId === scheduleId);
	}

	async function sweepLeakedTestSchedulers(): Promise<void> {
		if (!redis) {
			return;
		}
		const queue = redis.getUptimeQueue();
		try {
			const all = await queue.getJobSchedulers(0, -1, true);
			const leaked = all.filter((s) =>
				isAnyTestSchedulerKey((s as { key?: string }).key)
			);
			if (leaked.length === 0) {
				return;
			}
			await Promise.allSettled(
				leaked.map((s) =>
					queue.removeJobScheduler((s as { key: string }).key)
				)
			);
		} catch {
			// best-effort: a failed sweep should not block test startup
		}
	}

	async function cleanupTestState(): Promise<void> {
		if (!redis) {
			return;
		}
		const queue = redis.getUptimeQueue();
		try {
			await Promise.allSettled(
				[...scheduleIds].map((scheduleId) =>
					queue.removeJobScheduler(redis.uptimeSchedulerId(scheduleId))
				)
			);
			const all = await queue.getJobSchedulers(0, -1, true);
			const orphans = all.filter((s) =>
				isThisRunSchedulerKey((s as { key?: string }).key)
			);
			await Promise.allSettled(
				orphans.map((s) =>
					queue.removeJobScheduler((s as { key: string }).key)
				)
			);
			const jobs = await queue.getJobs(
				["waiting", "delayed", "prioritized", "paused", "completed", "failed"],
				0,
				-1
			);
			await Promise.allSettled(
				jobs
					.filter((job) => isTestScheduleId(job.data?.scheduleId))
					.map((job) => job.remove())
			);
		} catch {
			// cleanup is best-effort — don't let it fail the test
		}
	}

	async function assertQueueIsSafeForWorker(): Promise<void> {
		if (!redis) {
			throw new Error("Redis package unavailable");
		}
		const queue = redis.getUptimeQueue();
		const jobs = await queue.getJobs(
			["waiting", "delayed", "prioritized", "paused"],
			0,
			-1
		);
		const foreignJob = jobs.find(
			(job) => !isTestScheduleId(job.data?.scheduleId)
		);
		if (foreignJob) {
			throw new Error(
				`BULLMQ_REDIS_URL must point to an isolated test Redis queue. Found non-test job ${foreignJob.id ?? "unknown"} in ${redis.UPTIME_QUEUE_NAME}.`
			);
		}
		const schedulers = await queue.getJobSchedulers(0, -1, true);
		const foreignScheduler = schedulers.find((s) => {
			const key = (s as { key?: string }).key;
			return typeof key === "string" && !isAnyTestSchedulerKey(key);
		});
		if (foreignScheduler) {
			throw new Error(
				`BULLMQ_REDIS_URL must point to an isolated test Redis queue. Found non-test scheduler ${(foreignScheduler as { key?: string }).key ?? "unknown"} in ${redis.UPTIME_QUEUE_NAME}.`
			);
		}
	}

	async function withWorker(
		processor: (job: Job<UptimeCheckJobData>) => Promise<unknown>
	): Promise<Worker<UptimeCheckJobData>> {
		if (!redis) {
			throw new Error("Redis package unavailable");
		}
		const worker = new Worker<UptimeCheckJobData>(
			redis.UPTIME_QUEUE_NAME,
			processor,
			{
				connection: redis.getBullMQWorkerConnectionOptions(),
				concurrency: 1,
			}
		);
		await worker.waitUntilReady();
		return worker;
	}

	it("upserts a scheduler and lets BullMQ create exactly one scheduled job", async () => {
		const scheduleId = makeScheduleId("scheduler-create");

		await service.upsertUptimeSchedule(scheduleId, "minute");

		expect(await service.hasUptimeSchedule(scheduleId)).toBe(true);
		const jobs = await jobsForSchedule(scheduleId);
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.name).toBe(redis.UPTIME_CHECK_JOB_NAME);
		expect(jobs[0]?.data).toEqual({ scheduleId, trigger: "scheduled" });
		expect(jobs[0]?.opts.attempts).toBe(redis.UPTIME_JOB_OPTIONS.attempts);
		expect(jobs[0]?.opts.backoff).toEqual(redis.UPTIME_JOB_OPTIONS.backoff);
	});

	it("upserts an existing scheduler without duplicating the first scheduled job", async () => {
		const scheduleId = makeScheduleId("scheduler-update");

		await service.upsertUptimeSchedule(scheduleId, "minute");
		await service.upsertUptimeSchedule(scheduleId, "five_minutes");

		expect(await service.hasUptimeSchedule(scheduleId)).toBe(true);
		expect(await jobsForSchedule(scheduleId)).toHaveLength(1);
	});

	it("collapses concurrent scheduler upserts to one scheduler job", async () => {
		const scheduleId = makeScheduleId("scheduler-concurrent");

		await Promise.all([
			service.upsertUptimeSchedule(scheduleId, "minute"),
			service.upsertUptimeSchedule(scheduleId, "five_minutes"),
			service.upsertUptimeSchedule(scheduleId, "ten_minutes"),
			service.upsertUptimeSchedule(scheduleId, "thirty_minutes"),
			service.upsertUptimeSchedule(scheduleId, "hour"),
		]);

		expect(await service.hasUptimeSchedule(scheduleId)).toBe(true);
		expect(await jobsForSchedule(scheduleId)).toHaveLength(1);
	});

	it("removes scheduler state", async () => {
		const scheduleId = makeScheduleId("scheduler-remove");

		await service.upsertUptimeSchedule(scheduleId, "minute");
		await service.removeUptimeSchedule(scheduleId);

		expect(await service.hasUptimeSchedule(scheduleId)).toBe(false);
	});

	it("enqueues manual checks independently from scheduled jobs", async () => {
		const scheduleId = makeScheduleId("manual-check");

		await service.enqueueUptimeCheck(scheduleId);
		await service.enqueueUptimeCheck(scheduleId);

		expect(await service.hasUptimeSchedule(scheduleId)).toBe(false);
		const jobs = await jobsForSchedule(scheduleId);
		expect(jobs).toHaveLength(2);
		expect(new Set(jobs.map((job) => job.id)).size).toBe(2);
		expect(jobs.map((job) => job.data.trigger).sort()).toEqual([
			"manual",
			"manual",
		]);
	});

	it("keeps concurrent manual checks as distinct jobs", async () => {
		const scheduleId = makeScheduleId("manual-concurrent");

		await Promise.all(
			Array.from({ length: 5 }, () => service.enqueueUptimeCheck(scheduleId))
		);

		const jobs = await jobsForSchedule(scheduleId);
		expect(jobs).toHaveLength(5);
		expect(new Set(jobs.map((job) => job.id)).size).toBe(5);
		expect(jobs.every((job) => job.data.trigger === "manual")).toBe(true);
	});

	it("lets a real BullMQ worker consume manual uptime checks", async () => {
		const scheduleId = makeScheduleId("worker-manual");
		const received: UptimeCheckJobData[] = [];
		await assertQueueIsSafeForWorker();
		const worker = await withWorker(async (job) => {
			if (job.data.scheduleId !== scheduleId) {
				return;
			}
			expect(job.name).toBe(redis?.UPTIME_CHECK_JOB_NAME);
			received.push(job.data);
		});

		try {
			await service.enqueueUptimeCheck(scheduleId);
			await waitFor(
				() => received.length === 1,
				"Manual uptime job was not consumed by the worker"
			);

			expect(received).toEqual([{ scheduleId, trigger: "manual" }]);
		} finally {
			await worker.close();
		}
	});

	it("retries failed worker processing using the uptime job options", { timeout: 15000 }, async () => {
		const scheduleId = makeScheduleId("worker-retry");
		const attempts: number[] = [];
		const failures: string[] = [];
		const completed: UptimeCheckJobData[] = [];
		await assertQueueIsSafeForWorker();
		const worker = await withWorker(async (job) => {
			if (job.data.scheduleId !== scheduleId) {
				return;
			}
			attempts.push(job.attemptsMade);
			if (attempts.length === 1) {
				throw new Error("first attempt failed");
			}
			completed.push(job.data);
		});
		worker.on("failed", (job, error) => {
			if (job?.data.scheduleId === scheduleId) {
				failures.push(error.message);
			}
		});

		try {
			await service.enqueueUptimeCheck(scheduleId);
			await waitFor(
				() => completed.length === 1,
				"Manual uptime job was not retried and completed",
				8000
			);

			expect(attempts).toEqual([0, 1]);
			expect(failures).toEqual(["first attempt failed"]);
			expect(completed).toEqual([{ scheduleId, trigger: "manual" }]);
		} finally {
			await worker.close();
		}
	});

	it("fires scheduler-created jobs through a real worker and stops after removal", async () => {
		const scheduleId = makeScheduleId("worker-scheduler");
		const receivedAt: number[] = [];
		const queue = redis.getUptimeQueue();
		await assertQueueIsSafeForWorker();
		const worker = await withWorker(async (job) => {
			if (job.data.scheduleId !== scheduleId) {
				return;
			}
			expect(job.name).toBe(redis?.UPTIME_CHECK_JOB_NAME);
			expect(job.data.trigger).toBe("scheduled");
			receivedAt.push(Date.now());
		});

		try {
			const startedAt = Date.now();
			await queue.upsertJobScheduler(
				redis.uptimeSchedulerId(scheduleId),
				{ every: 300 },
				{
					name: redis.UPTIME_CHECK_JOB_NAME,
					data: { scheduleId, trigger: "scheduled" },
					opts: redis.UPTIME_JOB_OPTIONS,
				}
			);

			await waitFor(
				() => receivedAt.length >= 1,
				"Scheduled uptime job was not consumed by the worker",
				5000
			);
			expect(receivedAt[0] - startedAt).toBeGreaterThanOrEqual(0);
			expect(receivedAt[0] - startedAt).toBeLessThan(5000);

			await queue.removeJobScheduler(redis.uptimeSchedulerId(scheduleId));
			const countAfterRemoval = receivedAt.length;
			await Bun.sleep(900);
			expect(receivedAt).toHaveLength(countAfterRemoval);
		} finally {
			await queue.removeJobScheduler(redis.uptimeSchedulerId(scheduleId));
			await worker.close();
		}
	});
});
