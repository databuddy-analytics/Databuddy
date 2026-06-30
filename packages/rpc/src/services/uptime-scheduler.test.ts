import { beforeEach, describe, expect, it, mock } from "bun:test";

const UPTIME_CHECK_JOB_NAME = "uptime-check";
const UPTIME_JOB_OPTIONS = {
	attempts: 3,
	backoff: {
		type: "exponential",
		delay: 2000,
	},
	removeOnComplete: {
		age: 24 * 3600,
		count: 1000,
	},
	removeOnFail: {
		age: 7 * 24 * 3600,
		count: 5000,
	},
};

const calls: {
	add: unknown[];
	getJobScheduler: string[];
	removeJobScheduler: string[];
	upsertJobScheduler: unknown[];
} = {
	add: [],
	getJobScheduler: [],
	removeJobScheduler: [],
	upsertJobScheduler: [],
};

let schedulerResult: unknown = null;

const queue = {
	add: async (...args: unknown[]) => {
		calls.add.push(args);
	},
	getJobScheduler: async (id: string) => {
		calls.getJobScheduler.push(id);
		return schedulerResult;
	},
	removeJobScheduler: async (id: string) => {
		calls.removeJobScheduler.push(id);
		return true;
	},
	upsertJobScheduler: async (...args: unknown[]) => {
		calls.upsertJobScheduler.push(args);
	},
};

mock.module("@databuddy/redis/uptime-queue", () => ({
	getUptimeQueue: () => queue,
	UPTIME_CHECK_JOB_NAME,
	UPTIME_JOB_OPTIONS,
	uptimeImmediateJobId: (scheduleId: string) =>
		`uptime-manual-${scheduleId}-test-id`,
	uptimeSchedulerId: (scheduleId: string) => `uptime-${scheduleId}`,
}));

mock.module("../lib/logger", () => ({
	logger: {
		error: () => {},
		info: () => {},
		warn: () => {},
	},
}));

const {
	CRON_GRANULARITIES,
	enqueueUptimeCheck,
	hasUptimeSchedule,
	removeUptimeSchedule,
	upsertUptimeSchedule,
} = await import("./uptime-scheduler");

beforeEach(() => {
	calls.add = [];
	calls.getJobScheduler = [];
	calls.removeJobScheduler = [];
	calls.upsertJobScheduler = [];
	schedulerResult = null;
});

describe("uptime scheduler service", () => {
	it("keeps the supported granularities mapped to cron patterns", () => {
		expect(CRON_GRANULARITIES).toEqual({
			minute: "* * * * *",
			five_minutes: "*/5 * * * *",
			ten_minutes: "*/10 * * * *",
			thirty_minutes: "*/30 * * * *",
			hour: "0 * * * *",
			six_hours: "0 */6 * * *",
			twelve_hours: "0 */12 * * *",
			day: "0 0 * * *",
		});
	});

	it("upserts a BullMQ job scheduler with cron repeat settings and job template options", async () => {
		await upsertUptimeSchedule("schedule-1", "five_minutes");

		expect(calls.upsertJobScheduler).toEqual([
			[
				"uptime-schedule-1",
				{ pattern: "*/5 * * * *" },
				{
					name: UPTIME_CHECK_JOB_NAME,
					data: { scheduleId: "schedule-1", trigger: "scheduled" },
					opts: UPTIME_JOB_OPTIONS,
				},
			],
		]);
	});

	it("removes the matching BullMQ job scheduler id", async () => {
		await removeUptimeSchedule("schedule-2");

		expect(calls.removeJobScheduler).toEqual(["uptime-schedule-2"]);
	});

	it("reports scheduler presence from BullMQ", async () => {
		schedulerResult = { id: "uptime-schedule-3" };

		await expect(hasUptimeSchedule("schedule-3")).resolves.toBe(true);
		expect(calls.getJobScheduler).toEqual(["uptime-schedule-3"]);

		schedulerResult = null;
		await expect(hasUptimeSchedule("schedule-3")).resolves.toBe(false);
	});

	it("enqueues manual checks without creating a scheduler", async () => {
		await enqueueUptimeCheck("schedule-4");

		expect(calls.add).toEqual([
			[
				UPTIME_CHECK_JOB_NAME,
				{ scheduleId: "schedule-4", trigger: "manual" },
				{ jobId: "uptime-manual-schedule-4-test-id" },
			],
		]);
		expect(calls.upsertJobScheduler).toEqual([]);
	});
});
