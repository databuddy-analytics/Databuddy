import { beforeEach, describe, expect, it } from "bun:test";
import {
	createScheduleWithScheduler,
	deleteScheduleWithScheduler,
	type ManualCheckDeps,
	pauseScheduleWithScheduler,
	resumeScheduleWithScheduler,
	triggerManualUptimeCheck,
	updateScheduleWithScheduler,
	type UptimeLifecycleDeps,
	type UptimeScheduleSnapshot,
	type UptimeScheduleUpdate,
} from "./uptime-lifecycle";
import type { UptimeGranularity } from "./uptime-scheduler";

type StoredSchedule = {
	id: string;
	cacheBust: boolean;
	granularity: string;
	isPaused: boolean;
	name: string | null;
	timeout: number | null;
	updatedAt?: Date;
};

const schedules = new Map<string, StoredSchedule>();
const calls = {
	delete: [] as string[],
	enqueue: [] as string[],
	insert: [] as string[],
	rateLimit: [] as string[],
	remove: [] as string[],
	update: [] as Array<{ scheduleId: string; values: Record<string, unknown> }>,
	upsert: [] as Array<{ scheduleId: string; granularity: UptimeGranularity }>,
};

let failRemove = false;
let failUpsert = false;
let failEnqueue = false;
let rateLimitOk = true;

function schedule(values: Partial<StoredSchedule> = {}): StoredSchedule {
	return {
		id: "schedule-1",
		cacheBust: false,
		granularity: "minute",
		isPaused: false,
		name: "Before",
		timeout: 1000,
		...values,
	};
}

function snapshot(row: StoredSchedule): UptimeScheduleSnapshot {
	return {
		cacheBust: row.cacheBust,
		granularity: row.granularity,
		name: row.name,
		timeout: row.timeout,
	};
}

function deps(): UptimeLifecycleDeps {
	return {
		now: () => new Date("2026-04-26T00:00:00.000Z"),
		removeScheduler: async (scheduleId) => {
			calls.remove.push(scheduleId);
			if (failRemove) {
				throw new Error("remove failed");
			}
		},
		upsertScheduler: async (scheduleId, granularity) => {
			calls.upsert.push({ scheduleId, granularity });
			if (failUpsert) {
				throw new Error("upsert failed");
			}
		},
		store: {
			delete: async (scheduleId) => {
				calls.delete.push(scheduleId);
				schedules.delete(scheduleId);
			},
			insert: async (values) => {
				calls.insert.push(values.id ?? "");
				schedules.set(
					values.id ?? "",
					schedule({
						id: values.id,
						cacheBust: values.cacheBust ?? false,
						granularity: values.granularity,
						isPaused: values.isPaused ?? false,
						name: values.name ?? null,
						timeout: values.timeout ?? null,
					})
				);
			},
			update: async (scheduleId, values) => {
				calls.update.push({ scheduleId, values });
				const row = schedules.get(scheduleId);
				if (row) {
					Object.assign(row, values);
				}
			},
		},
	};
}

function manualDeps(): ManualCheckDeps {
	return {
		enqueueCheck: async (scheduleId) => {
			calls.enqueue.push(scheduleId);
			if (failEnqueue) {
				throw new Error("enqueue failed");
			}
		},
		rateLimit: async (scheduleId) => {
			calls.rateLimit.push(scheduleId);
			return { success: rateLimitOk };
		},
	};
}

async function expectCode(promise: Promise<unknown>, code: string) {
	try {
		await promise;
		throw new Error(`Expected ${code} but resolved`);
	} catch (error) {
		expect((error as { code?: string }).code).toBe(code);
	}
}

beforeEach(() => {
	schedules.clear();
	calls.delete = [];
	calls.enqueue = [];
	calls.insert = [];
	calls.rateLimit = [];
	calls.remove = [];
	calls.update = [];
	calls.upsert = [];
	failEnqueue = false;
	failRemove = false;
	failUpsert = false;
	rateLimitOk = true;
});

describe("uptime lifecycle drift guards", () => {
	it("creates storage first, then creates the BullMQ scheduler", async () => {
		await createScheduleWithScheduler(
			{
				id: "schedule-1",
				organizationId: "org-1",
				url: "https://example.com",
				granularity: "five_minutes",
				isPaused: false,
				cacheBust: false,
			},
			deps()
		);

		expect(schedules.has("schedule-1")).toBe(true);
		expect(calls.insert).toEqual(["schedule-1"]);
		expect(calls.upsert).toEqual([
			{ scheduleId: "schedule-1", granularity: "five_minutes" },
		]);
	});

	it("deletes storage if scheduler creation fails", async () => {
		failUpsert = true;

		await expectCode(
			createScheduleWithScheduler(
				{
					id: "schedule-1",
					organizationId: "org-1",
					url: "https://example.com",
					granularity: "minute",
					isPaused: false,
					cacheBust: false,
				},
				deps()
			),
			"INTERNAL_SERVER_ERROR"
		);

		expect(schedules.has("schedule-1")).toBe(false);
		expect(calls.remove).toEqual(["schedule-1"]);
		expect(calls.delete).toEqual(["schedule-1"]);
	});

	it("still deletes storage if scheduler cleanup also fails after create failure", async () => {
		failRemove = true;
		failUpsert = true;

		await expectCode(
			createScheduleWithScheduler(
				{
					id: "schedule-1",
					organizationId: "org-1",
					url: "https://example.com",
					granularity: "minute",
					isPaused: false,
					cacheBust: false,
				},
				deps()
			),
			"INTERNAL_SERVER_ERROR"
		);

		expect(schedules.has("schedule-1")).toBe(false);
		expect(calls.remove).toEqual(["schedule-1"]);
		expect(calls.delete).toEqual(["schedule-1"]);
	});

	it("deletes storage and then best-effort removes the scheduler", async () => {
		schedules.set("schedule-1", schedule());
		failRemove = true;

		await deleteScheduleWithScheduler("schedule-1", deps());

		expect(schedules.has("schedule-1")).toBe(false);
		expect(calls.delete).toEqual(["schedule-1"]);
		expect(calls.remove).toEqual(["schedule-1"]);
	});

	it("updates storage without touching BullMQ when granularity is unchanged", async () => {
		const row = schedule();
		schedules.set(row.id, row);

		await updateScheduleWithScheduler(
			"schedule-1",
			{
				name: "Renamed",
				timeout: 2000,
				updatedAt: new Date("2026-04-26T01:00:00.000Z"),
			},
			snapshot(row),
			deps()
		);

		expect(schedules.get("schedule-1")).toMatchObject({
			name: "Renamed",
			timeout: 2000,
			granularity: "minute",
		});
		expect(calls.upsert).toEqual([]);
	});

	it("updates storage and scheduler together for granularity changes", async () => {
		const row = schedule();
		schedules.set(row.id, row);
		const values: UptimeScheduleUpdate = {
			granularity: "ten_minutes",
			updatedAt: new Date("2026-04-26T01:00:00.000Z"),
		};

		await updateScheduleWithScheduler("schedule-1", values, snapshot(row), deps());

		expect(schedules.get("schedule-1")).toMatchObject({
			granularity: "ten_minutes",
		});
		expect(calls.upsert).toEqual([
			{ scheduleId: "schedule-1", granularity: "ten_minutes" },
		]);
	});

	it("rolls storage back when scheduler update fails", async () => {
		const row = schedule();
		schedules.set(row.id, row);
		failUpsert = true;

		await expectCode(
			updateScheduleWithScheduler(
				"schedule-1",
				{
					name: "After",
					granularity: "hour",
					timeout: 2000,
					cacheBust: true,
					updatedAt: new Date("2026-04-26T01:00:00.000Z"),
				},
				snapshot(row),
				deps()
			),
			"INTERNAL_SERVER_ERROR"
		);

		expect(schedules.get("schedule-1")).toMatchObject({
			name: "Before",
			granularity: "minute",
			timeout: 1000,
			cacheBust: false,
		});
	});

	it("pauses by marking storage paused and removing the scheduler", async () => {
		schedules.set("schedule-1", schedule());

		await pauseScheduleWithScheduler("schedule-1", deps());

		expect(schedules.get("schedule-1")?.isPaused).toBe(true);
		expect(calls.remove).toEqual(["schedule-1"]);
	});

	it("does not mark storage active when scheduler resume fails", async () => {
		schedules.set("schedule-1", schedule({ isPaused: true }));
		failUpsert = true;

		await expect(resumeScheduleWithScheduler("schedule-1", "minute", deps()))
			.rejects.toThrow("upsert failed");

		expect(schedules.get("schedule-1")?.isPaused).toBe(true);
		expect(calls.update).toEqual([]);
	});

	it("resumes by creating the scheduler before marking storage active", async () => {
		schedules.set("schedule-1", schedule({ isPaused: true }));

		await resumeScheduleWithScheduler("schedule-1", "minute", deps());

		expect(calls.upsert).toEqual([
			{ scheduleId: "schedule-1", granularity: "minute" },
		]);
		expect(schedules.get("schedule-1")?.isPaused).toBe(false);
	});

	it("enqueues a manual check after rate limiting active schedules", async () => {
		await triggerManualUptimeCheck("schedule-1", false, manualDeps());

		expect(calls.rateLimit).toEqual(["schedule-1"]);
		expect(calls.enqueue).toEqual(["schedule-1"]);
	});

	it("rejects manual checks for paused schedules before rate limiting", async () => {
		await expectCode(
			triggerManualUptimeCheck("schedule-1", true, manualDeps()),
			"BAD_REQUEST"
		);

		expect(calls.rateLimit).toEqual([]);
		expect(calls.enqueue).toEqual([]);
	});

	it("rejects manual checks when rate limited", async () => {
		rateLimitOk = false;

		await expectCode(
			triggerManualUptimeCheck("schedule-1", false, manualDeps()),
			"RATE_LIMITED"
		);

		expect(calls.rateLimit).toEqual(["schedule-1"]);
		expect(calls.enqueue).toEqual([]);
	});

	it("converts manual enqueue failures into internal errors", async () => {
		failEnqueue = true;

		await expectCode(
			triggerManualUptimeCheck("schedule-1", false, manualDeps()),
			"INTERNAL_SERVER_ERROR"
		);

		expect(calls.rateLimit).toEqual(["schedule-1"]);
		expect(calls.enqueue).toEqual(["schedule-1"]);
	});
});
