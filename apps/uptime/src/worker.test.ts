import { beforeEach, describe, expect, it } from "bun:test";
import type { ScheduleData } from "./actions";
import type { UptimeData } from "./types";
import type {
	MonitorState,
	MonitorStateLookup,
} from "./uptime-transition-alerts";
import {
	DEFAULT_UPTIME_WORKER_CONCURRENCY,
	getUptimeWorkerConcurrency,
	processUptimeCheck,
	processUptimeDeliveryJob,
	processUptimeJob,
	resolveFailureStreak,
	type UptimeWorkerDeps,
} from "./worker";

process.env.UPTIME_CHECK_RETRY_DELAY_MS = "0";

const calls = {
	captureError: [] as Array<{ error: unknown; context: Record<string, unknown> }>,
	check: [] as Array<{
		monitorId: string;
		url: string;
		attempt: number;
		timeout: number | undefined;
		cacheBust: boolean | undefined;
	}>,
	checkpoint: [] as UptimeData[],
	delivery: [] as UptimeData[],
	email: [] as Array<{ schedule: ScheduleData; data: UptimeData }>,
	loggerFields: [] as Array<Record<string, unknown>>,
	loggerEmitted: [] as Array<boolean>,
	monitorState: [] as Array<{ monitorId: string; state: MonitorState }>,
	order: [] as string[],
	reaped: [] as string[],
	send: [] as Array<{ event: unknown; key: string | undefined }>,
};

type CheckResult =
	| { success: true; data: UptimeData }
	| { success: false; error: string };

let lookupResult:
	| { success: true; data: ScheduleData }
	| { success: false; error: string; reason?: "not_found" | "malformed" | "transient" };
let checkResults: CheckResult[];
let previousState: MonitorStateLookup;
let reapBehaviour: "ok" | "throw" = "ok";

function schedule(values: Partial<ScheduleData> = {}): ScheduleData {
	return {
		id: "schedule-1",
		organizationId: "org-1",
		websiteId: "website-1",
		website: { name: "Site", domain: "example.com" },
		url: "https://example.com/health",
		name: "Example",
		isPaused: false,
		timeout: 5000,
		cacheBust: true,
		...values,
	};
}

function uptimeData(values: Partial<UptimeData> = {}): UptimeData {
	return {
		attempt: 1,
		check_type: "http",
		event_id: "uptime-event-1",
		env: "test",
		error: "",
		failure_streak: 0,
		http_code: 200,
		probe_ip: "127.0.0.1",
		probe_region: "local",
		redirect_count: 0,
		response_bytes: 100,
		retries: 0,
		site_id: "website-1",
		ssl_expiry: 0,
		ssl_valid: 1,
		status: 1,
		timestamp: 1_775_000_000,
		total_ms: 30,
		ttfb_ms: 10,
		url: "https://example.com/health",
		user_agent: "test",
		...values,
	};
}

function deps(): UptimeWorkerDeps {
	return {
		captureError: (error, context) => {
			calls.captureError.push({ error, context: context ?? {} });
		},
		checkUptime: async (monitorId, url, attempt, options) => {
			calls.check.push({
				monitorId,
				url,
				attempt,
				timeout: options.timeout,
				cacheBust: options.cacheBust,
			});
			const next = checkResults.length > 1 ? checkResults.shift() : checkResults[0];
			if (!next) {
				throw new Error("no check result configured");
			}
			return next;
		},
		createLogger: (fields) => {
			calls.loggerFields.push({ ...fields });
			return {
				set: (f: Record<string, unknown>) => {
					calls.loggerFields.push({ ...f });
				},
				emit: () => {
					calls.loggerEmitted.push(true);
				},
				error: () => {},
			} as never;
		},
		enqueueUptimeDelivery: async (data) => {
			calls.delivery.push(data);
			calls.order.push("enqueue");
		},
		getPreviousMonitorState: async () => previousState,
		setMonitorState: async (monitorId, state) => {
			calls.monitorState.push({ monitorId, state });
		},
		lookupSchedule: async () => lookupResult,
		reapOrphanScheduler: async (scheduleId: string) => {
			calls.reaped.push(scheduleId);
			if (reapBehaviour === "throw") {
				throw new Error("redis reap blew up");
			}
		},
		sendUptimeEvent: async (event, key) => {
			calls.send.push({ event, key });
		},
		fireTransitionAlerts: async (payload) => {
			calls.email.push(payload);
			calls.order.push("alert");
			return { transition_kind: null, alarms_fired: 0 };
		},
	};
}

beforeEach(() => {
	calls.captureError = [];
	calls.check = [];
	calls.checkpoint = [];
	calls.delivery = [];
	calls.email = [];
	calls.loggerFields = [];
	calls.loggerEmitted = [];
	calls.monitorState = [];
	calls.order = [];
	calls.reaped = [];
	calls.send = [];
	lookupResult = { success: true, data: schedule() };
	checkResults = [{ success: true, data: uptimeData() }];
	previousState = { kind: "found", state: { status: 0, failureStreak: 1 } };
	reapBehaviour = "ok";
});

async function flushMicrotasks(): Promise<void> {
	await new Promise<void>((resolve) => setImmediate(resolve));
}

type UptimeEventCheckpoint = (data: UptimeData) => Promise<void>;
const noOpCheckpoint: UptimeEventCheckpoint = async () => {};

function processUptimeCheckForTest(
	scheduleId: string,
	trigger: "manual" | "scheduled",
	workerDeps: UptimeWorkerDeps = deps(),
	jobMeta?: { id?: string; attempt?: number },
	checkpoint: UptimeEventCheckpoint = noOpCheckpoint
) {
	return processUptimeCheck(
		scheduleId,
		trigger,
		workerDeps,
		jobMeta,
		checkpoint
	);
}

describe("getUptimeWorkerConcurrency", () => {
	it("rejects invalid configured values", () => {
		expect(getUptimeWorkerConcurrency("0")).toBe(
			DEFAULT_UPTIME_WORKER_CONCURRENCY
		);
		expect(getUptimeWorkerConcurrency("nope")).toBe(
			DEFAULT_UPTIME_WORKER_CONCURRENCY
		);
	});

	it("uses explicit configured values without an arbitrary cap", () => {
		expect(getUptimeWorkerConcurrency("25000")).toBe(25_000);
	});
});

describe("processUptimeCheck", () => {
	it("rejects unknown BullMQ job names before loading schedules", async () => {
		await expect(
			processUptimeJob(
				{
					name: "surprise",
					data: { scheduleId: "schedule-1", trigger: "scheduled" },
					attemptsMade: 0,
					updateData: async () => {},
				},
				deps()
			)
		).rejects.toThrow("Unknown uptime job: surprise");

		expect(calls.check).toEqual([]);
	});

	it("routes BullMQ jobs into uptime checks", async () => {
		await processUptimeJob(
			{
				name: "uptime-check",
				data: { scheduleId: "schedule-1", trigger: "manual" },
				attemptsMade: 0,
				updateData: async (data) => {
					calls.checkpoint.push(data.delivery?.event as UptimeData);
				},
			},
			deps()
		);

		expect(calls.check).toHaveLength(1);
		expect(calls.checkpoint).toEqual([uptimeData()]);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ uptime_trigger: "manual" })
		);
	});

	it("runs a scheduled check and emits events, status, and transition email work", async () => {
		await processUptimeCheckForTest("schedule-1", "scheduled", deps());

		expect(calls.check).toEqual([
			{
				monitorId: "website-1",
				url: "https://example.com/health",
				attempt: 1,
				timeout: 5000,
				cacheBust: true,
			},
		]);
		expect(calls.delivery).toEqual([uptimeData()]);
		expect(calls.email).toHaveLength(1);
		expect(calls.order).toEqual(["enqueue", "alert"]);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({
				schedule_id: "schedule-1",
				uptime_trigger: "scheduled",
			})
		);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ organization_id: "org-1" })
		);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({
				monitor_id: "website-1",
				website_id: "website-1",
			})
		);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({
				event_id: "uptime-event-1",
				outcome: "up",
				previous_uptime_status: 0,
				ttfb_ms: 10,
				total_ms: 30,
			})
		);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ delivery_queue_admitted: true })
		);
		expect(calls.loggerEmitted).toHaveLength(1);
	});

	it("records -1 when no previous monitor status exists", async () => {
		previousState = { kind: "missing" };

		await processUptimeCheckForTest("schedule-1", "scheduled", deps());

		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ previous_uptime_status: -1 })
		);
	});

	it("uses the schedule id as monitor id when no website is attached", async () => {
		lookupResult = {
			success: true,
			data: schedule({ website: null, websiteId: null, timeout: null }),
		};

		await processUptimeCheckForTest("schedule-only", "manual", deps());

		expect(calls.check).toEqual([
			{
				monitorId: "schedule-only",
				url: "https://example.com/health",
				attempt: 1,
				timeout: undefined,
				cacheBust: true,
			},
		]);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({
				schedule_id: "schedule-only",
				uptime_trigger: "manual",
			})
		);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ monitor_id: "schedule-only" })
		);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ organization_id: "org-1" })
		);
	});

	it("skips paused schedules without running the check", async () => {
		lookupResult = { success: true, data: schedule({ isPaused: true }) };

		await processUptimeCheckForTest("schedule-1", "scheduled", deps());

		expect(calls.check).toEqual([]);
		expect(calls.delivery).toEqual([]);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ organization_id: "org-1" })
		);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ outcome: "skipped_paused" })
		);
		expect(calls.loggerEmitted).toHaveLength(1);
	});

	it("skips missing schedules without throwing", async () => {
		lookupResult = { success: false, error: "not found", reason: "not_found" };

		await processUptimeCheckForTest("schedule-1", "scheduled", deps());

		expect(calls.check).toEqual([]);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({
				outcome: "schedule_not_found",
				error_message: "not found",
			})
		);
		expect(calls.loggerEmitted).toHaveLength(1);
	});

	it("reaps the BullMQ scheduler when reason is not_found", async () => {
		lookupResult = {
			success: false,
			error: "Schedule schedule-1 not found",
			reason: "not_found",
		};

		await processUptimeCheckForTest("schedule-1", "scheduled", deps());
		await flushMicrotasks();

		expect(calls.reaped).toEqual(["schedule-1"]);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ schedule_lookup_reason: "not_found" })
		);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ orphan_scheduler_reaped: true })
		);
	});

	it("throws transient DB lookup failures so BullMQ retries, without reaping", async () => {
		lookupResult = {
			success: false,
			error: "ECONNRESET",
			reason: "transient",
		};

		await expect(
			processUptimeCheckForTest("schedule-1", "scheduled", deps())
		).rejects.toThrow("ECONNRESET");
		await flushMicrotasks();

		expect(calls.reaped).toEqual([]);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ schedule_lookup_reason: "transient" })
		);
	});

	it("treats a missing reason as transient: throws and does not reap", async () => {
		lookupResult = { success: false, error: "boom" };

		await expect(
			processUptimeCheckForTest("schedule-1", "scheduled", deps())
		).rejects.toThrow("boom");
		await flushMicrotasks();

		expect(calls.reaped).toEqual([]);
	});

	it("survives reap failures without crashing the job", async () => {
		lookupResult = {
			success: false,
			error: "Schedule schedule-1 not found",
			reason: "not_found",
		};
		reapBehaviour = "throw";

		await processUptimeCheckForTest("schedule-1", "scheduled", deps());
		await flushMicrotasks();

		expect(calls.reaped).toEqual(["schedule-1"]);
		expect(calls.captureError).toContainEqual(
			expect.objectContaining({
				context: expect.objectContaining({
					error_step: "reap_orphan_scheduler",
					schedule_id: "schedule-1",
					schedule_lookup_reason: "not_found",
				}),
			})
		);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({
				orphan_scheduler_reaped: false,
				orphan_scheduler_reap_error: "redis reap blew up",
			})
		);
	});

	it("throws failed checks so BullMQ retry/backoff can run", async () => {
		checkResults = [{ success: false, error: "timeout" }];

		await expect(
			processUptimeCheckForTest("schedule-1", "scheduled", deps())
		).rejects.toThrow("timeout");
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({
				outcome: "check_failed",
				error_message: "timeout",
			})
		);
		expect(calls.loggerEmitted).toHaveLength(1);
	});

	it("retries a down check and delivers the recovered attempt", async () => {
		checkResults = [
			{ success: true, data: uptimeData({ status: 0, error: "HTTP 503" }) },
			{ success: true, data: uptimeData({ attempt: 2, retries: 1 }) },
		];

		await processUptimeCheckForTest("schedule-1", "scheduled", deps());

		expect(calls.check.map((c) => c.attempt)).toEqual([1, 2]);
		expect(calls.delivery).toEqual([uptimeData({ attempt: 2, retries: 1 })]);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ outcome: "up", check_retries: 1 })
		);
	});

	it("marks down only after exhausting in-process attempts", async () => {
		checkResults = [
			{ success: true, data: uptimeData({ status: 0, error: "HTTP 503" }) },
		];
		previousState = { kind: "found", state: { status: 1, failureStreak: 0 } };

		await processUptimeCheckForTest("schedule-1", "scheduled", deps());

		expect(calls.check.map((c) => c.attempt)).toEqual([1, 2, 3]);
		expect(calls.delivery).toEqual([
			uptimeData({ status: 0, error: "HTTP 503", failure_streak: 1 }),
		]);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ outcome: "down", failure_streak: 1 })
		);
	});

	it("continues the failure streak from the previous monitor state", async () => {
		checkResults = [
			{ success: true, data: uptimeData({ status: 0, error: "HTTP 503" }) },
		];
		previousState = { kind: "found", state: { status: 0, failureStreak: 4 } };

		await processUptimeCheckForTest("schedule-1", "scheduled", deps());

		expect(calls.delivery).toEqual([
			uptimeData({ status: 0, error: "HTTP 503", failure_streak: 5 }),
		]);
	});

	it("persists the resolved streak as the next previous state", async () => {
		checkResults = [
			{ success: true, data: uptimeData({ status: 0, error: "HTTP 503" }) },
		];
		previousState = { kind: "found", state: { status: 0, failureStreak: 4 } };

		await processUptimeCheckForTest("schedule-1", "scheduled", deps());

		expect(calls.monitorState).toEqual([
			{ monitorId: "website-1", state: { status: 0, failureStreak: 5 } },
		]);
	});

	it("does not reset the streak when the previous state is unavailable", async () => {
		checkResults = [
			{ success: true, data: uptimeData({ status: 0, error: "HTTP 503" }) },
		];
		previousState = { kind: "unavailable" };

		await processUptimeCheckForTest("schedule-1", "scheduled", deps());

		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ previous_state_source: "unavailable" })
		);
	});

	it("persists the exact event before enqueueing it for delivery", async () => {
		await processUptimeCheckForTest(
			"schedule-1",
			"manual",
			deps(),
			undefined,
			async (data) => {
				calls.checkpoint.push(data);
				calls.order.push("checkpoint");
			}
		);

		expect(calls.checkpoint).toEqual([uptimeData()]);
		expect(calls.delivery).toEqual([uptimeData()]);
		expect(calls.order).toEqual(["checkpoint", "enqueue", "alert"]);
	});

	it("retries the source job when the durable checkpoint fails", async () => {
		await expect(
			processUptimeCheckForTest(
				"schedule-1",
				"manual",
				deps(),
				undefined,
				async () => {
					throw new Error("redis unavailable");
				}
			)
		).rejects.toThrow("redis unavailable");

		expect(calls.delivery).toEqual([]);
		expect(calls.email).toEqual([]);
		expect(calls.captureError).toContainEqual(
			expect.objectContaining({
				context: expect.objectContaining({
					error_step: "uptime_delivery_checkpoint",
					event_id: "uptime-event-1",
				}),
			})
		);
	});

	it("retries the source job when delivery queue admission fails", async () => {
		const failingDeps = deps();
		failingDeps.enqueueUptimeDelivery = async () => {
			throw new Error("redis unavailable");
		};

		await expect(
			processUptimeCheckForTest("schedule-1", "manual", failingDeps)
		).rejects.toThrow("redis unavailable");

		expect(calls.email).toEqual([]);
		expect(calls.captureError).toContainEqual(
			expect.objectContaining({
				context: expect.objectContaining({
					error_step: "uptime_delivery_enqueue",
					event_id: "uptime-event-1",
				}),
			})
		);
	});

	it("replays a checkpointed event without running another probe", async () => {
		await processUptimeJob(
			{
				name: "uptime-check",
				data: {
					delivery: { event: uptimeData() },
					scheduleId: "schedule-1",
					trigger: "scheduled",
				},
				attemptsMade: 0,
				updateData: async () => {},
			},
			deps()
		);

		expect(calls.check).toEqual([]);
		expect(calls.delivery).toEqual([uptimeData()]);
		expect(calls.email).toHaveLength(1);
	});

	it("rejects malformed checkpointed delivery payloads before replaying", async () => {
		await expect(
			processUptimeJob(
				{
					name: "uptime-check",
					data: {
						delivery: { event: { ...uptimeData(), http_code: "200" } },
						scheduleId: "schedule-1",
						trigger: "scheduled",
					},
					attemptsMade: 0,
					updateData: async () => {},
				},
				deps()
			)
		).rejects.toThrow("Invalid persisted uptime delivery payload");

		expect(calls.check).toEqual([]);
		expect(calls.delivery).toEqual([]);
	});

	it("retries a delivery job when Redpanda rejects it", async () => {
		const failingDeps = deps();
		failingDeps.sendUptimeEvent = async () => {
			throw new Error("Redpanda send failed");
		};

		await expect(
			processUptimeDeliveryJob(
				{
					data: { event: uptimeData() },
					id: "uptime-delivery-uptime-event-1",
					name: "uptime-event-delivery",
					attemptsMade: 0,
				},
				failingDeps
			)
		).rejects.toThrow("Redpanda send failed");

		expect(calls.captureError).toContainEqual(
			expect.objectContaining({
				context: expect.objectContaining({
					error_step: "uptime_delivery_send",
					event_id: "uptime-event-1",
				}),
			})
		);
	});

	it("delivers the checkpointed payload without its relay-only ID", async () => {
		await processUptimeDeliveryJob(
			{
				data: { event: uptimeData() },
				id: "uptime-delivery-uptime-event-1",
				name: "uptime-event-delivery",
				attemptsMade: 0,
			},
			deps()
		);

		const { event_id: _eventId, ...event } = uptimeData();
		expect(calls.send).toEqual([{ event, key: "website-1" }]);
	});

	it("resolves failure streaks from previous state", () => {
		expect(
			resolveFailureStreak(1, {
				kind: "found",
				state: { status: 0, failureStreak: 3 },
			})
		).toBe(0);
		expect(resolveFailureStreak(0, { kind: "missing" })).toBe(1);
		expect(resolveFailureStreak(0, { kind: "unavailable" })).toBe(1);
		expect(
			resolveFailureStreak(0, {
				kind: "found",
				state: { status: 1, failureStreak: 0 },
			})
		).toBe(1);
		expect(
			resolveFailureStreak(0, {
				kind: "found",
				state: { status: 0, failureStreak: 3 },
			})
		).toBe(4);
	});

	it("rejects malformed delivery payloads before sending", async () => {
		await expect(
			processUptimeDeliveryJob(
				{
					data: { event: { ...uptimeData(), site_id: 1 } },
					id: "uptime-delivery-uptime-event-1",
					name: "uptime-event-delivery",
					attemptsMade: 0,
				},
				deps()
			)
		).rejects.toThrow("Invalid uptime delivery payload");

		expect(calls.captureError).toEqual([]);
	});
});
