import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { DelayedError } from "bullmq";
import { Effect } from "effect";
import {
	type ScheduleData,
	ScheduleLookupError,
	UptimeCheckError,
} from "./actions";
import { type UptimeData, uptimeDataSchema } from "./types";
import type {
	MonitorState,
	MonitorStateLookup,
} from "./uptime-transition-alerts";
import {
	processUptimeDeliveryJob,
	processUptimeJob,
	resolveFailureStreak,
	type UptimeWorkerDeps,
} from "./worker";

process.env.UPTIME_CHECK_RETRY_DELAY_MS = "0";
const originalSelfHost = process.env.SELFHOST;

afterEach(() => {
	if (originalSelfHost === undefined) {
		Reflect.deleteProperty(process.env, "SELFHOST");
	} else {
		process.env.SELFHOST = originalSelfHost;
	}
});

const calls = {
	captureError: [] as Array<{
		error: unknown;
		context: Record<string, unknown>;
	}>,
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
	loggerFields: [] as Record<string, unknown>[],
	locks: [] as string[],
	loggerEmitted: [] as boolean[],
	monitorState: [] as Array<{ monitorId: string; state: MonitorState }>,
	order: [] as string[],
	previousStateReads: [] as string[],
	reaped: [] as string[],
	send: [] as Array<{ event: unknown; key: string | undefined }>,
};

let lookupResult: ScheduleData | ScheduleLookupError;
let checkResults: Array<UptimeData | UptimeCheckError>;
let previousState: MonitorStateLookup;
let reapBehaviour: "ok" | "throw" = "ok";
let lockHeld = false;

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
		acquireCheckLock: async (scheduleId) => {
			calls.locks.push(`acquire:${scheduleId}`);
			return lockHeld ? null : "lock-token";
		},
		captureError: (error, context) => {
			calls.captureError.push({ error, context: context ?? {} });
		},
		checkUptime: (monitorId, url, attempt, options) => {
			calls.check.push({
				monitorId,
				url,
				attempt,
				timeout: options.timeout,
				cacheBust: options.cacheBust,
			});
			const next =
				checkResults.length > 1 ? checkResults.shift() : checkResults[0];
			if (!next) {
				throw new Error("no check result configured");
			}
			return next instanceof UptimeCheckError
				? Effect.fail(next)
				: Effect.succeed(next);
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
		getPreviousMonitorState: async (monitorId) => {
			calls.previousStateReads.push(monitorId);
			return previousState;
		},
		setMonitorState: async (monitorId, state) => {
			calls.monitorState.push({ monitorId, state });
			calls.order.push("state");
		},
		lookupSchedule: () =>
			lookupResult instanceof ScheduleLookupError
				? Effect.fail(lookupResult)
				: Effect.succeed(lookupResult),
		reapScheduler: async (scheduleId: string) => {
			calls.reaped.push(scheduleId);
			if (reapBehaviour === "throw") {
				throw new Error("redis reap blew up");
			}
		},
		releaseCheckLock: async (scheduleId, token) => {
			calls.locks.push(`release:${scheduleId}:${token}`);
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
	process.env.SELFHOST = "false";
	calls.captureError = [];
	calls.check = [];
	calls.checkpoint = [];
	calls.delivery = [];
	calls.email = [];
	calls.loggerFields = [];
	calls.locks = [];
	calls.loggerEmitted = [];
	calls.monitorState = [];
	calls.order = [];
	calls.previousStateReads = [];
	calls.reaped = [];
	calls.send = [];
	lookupResult = schedule();
	checkResults = [uptimeData()];
	previousState = { kind: "found", state: { status: 0, failureStreak: 1 } };
	reapBehaviour = "ok";
	lockHeld = false;
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
	checkpoint: UptimeEventCheckpoint = noOpCheckpoint
) {
	return processUptimeJob(
		{
			name: "uptime-check",
			data: { scheduleId, trigger },
			attemptsMade: 0,
			updateData: async (data) => {
				await checkpoint(uptimeDataSchema.parse(data.delivery?.event));
			},
		},
		workerDeps
	);
}

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
					calls.checkpoint.push(uptimeDataSchema.parse(data.delivery?.event));
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
		expect(calls.order).toEqual(["state", "enqueue", "alert"]);
		expect(calls.locks).toEqual([
			"acquire:schedule-1",
			"release:schedule-1:lock-token",
		]);
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
				previous_state_source: "skipped",
				previous_uptime_status: -1,
				ttfb_ms: 10,
				total_ms: 30,
			})
		);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ delivery_queue_admitted: true })
		);
		expect(calls.loggerEmitted).toHaveLength(1);
	});

	it("skips the previous state read for up checks", async () => {
		await processUptimeCheckForTest("schedule-1", "scheduled", deps());

		expect(calls.previousStateReads).toEqual([]);
		expect(calls.monitorState).toEqual([
			{ monitorId: "website-1", state: { status: 1, failureStreak: 0 } },
		]);
	});

	it("starts a streak at 1 when a down check has no previous monitor status", async () => {
		checkResults = [uptimeData({ status: 0, error: "HTTP 503" })];
		previousState = { kind: "missing" };

		await processUptimeCheckForTest("schedule-1", "scheduled", deps());

		expect(calls.previousStateReads).toEqual(["website-1"]);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({
				previous_state_source: "missing",
				previous_uptime_status: -1,
				failure_streak: 1,
			})
		);
	});

	it("skips without checking when another job holds the schedule lock", async () => {
		lockHeld = true;

		await processUptimeCheckForTest("schedule-1", "manual", deps());

		expect(calls.check).toEqual([]);
		expect(calls.delivery).toEqual([]);
		expect(calls.locks).toEqual(["acquire:schedule-1"]);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ outcome: "skipped_overlap" })
		);
		expect(calls.loggerEmitted).toHaveLength(1);
	});

	it("releases the schedule lock when the check fails", async () => {
		checkResults = [new UptimeCheckError({ message: "boom" })];

		await expect(
			processUptimeCheckForTest("schedule-1", "scheduled", deps())
		).rejects.toThrow("boom");

		expect(calls.locks).toEqual([
			"acquire:schedule-1",
			"release:schedule-1:lock-token",
		]);
	});

	it("runs without the lock when the lock store is unavailable", async () => {
		const lockDeps = deps();
		lockDeps.acquireCheckLock = async () => {
			throw new Error("redis down");
		};

		await processUptimeCheckForTest("schedule-1", "scheduled", lockDeps);

		expect(calls.check).toHaveLength(1);
		expect(calls.locks).toEqual([]);
		expect(calls.captureError).toContainEqual(
			expect.objectContaining({
				context: expect.objectContaining({ error_step: "check_lock_acquire" }),
			})
		);
	});

	it("uses the schedule id as monitor id when no website is attached", async () => {
		lookupResult = schedule({ website: null, websiteId: null, timeout: null });

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

	it("skips paused schedules and reaps their scheduler", async () => {
		lookupResult = schedule({ isPaused: true });

		await processUptimeCheckForTest("schedule-1", "scheduled", deps());
		await flushMicrotasks();

		expect(calls.check).toEqual([]);
		expect(calls.reaped).toEqual(["schedule-1"]);
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
		lookupResult = new ScheduleLookupError({
			message: "not found",
			reason: "not_found",
		});

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
		lookupResult = new ScheduleLookupError({
			message: "Schedule schedule-1 not found",
			reason: "not_found",
		});

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
		lookupResult = new ScheduleLookupError({
			message: "ECONNRESET",
			reason: "transient",
		});

		await expect(
			processUptimeCheckForTest("schedule-1", "scheduled", deps())
		).rejects.toThrow("ECONNRESET");
		await flushMicrotasks();

		expect(calls.reaped).toEqual([]);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ schedule_lookup_reason: "transient" })
		);
	});

	it("survives reap failures without crashing the job", async () => {
		lookupResult = new ScheduleLookupError({
			message: "Schedule schedule-1 not found",
			reason: "not_found",
		});
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
		checkResults = [new UptimeCheckError({ message: "timeout" })];

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
			uptimeData({ status: 0, error: "HTTP 503" }),
			uptimeData({ attempt: 2, retries: 1 }),
		];

		await processUptimeCheckForTest("schedule-1", "scheduled", deps());

		expect(calls.check.map((c) => c.attempt)).toEqual([1, 2]);
		expect(calls.delivery).toEqual([uptimeData({ attempt: 2, retries: 1 })]);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ outcome: "up", check_retries: 1 })
		);
	});

	it("marks down only after exhausting in-process attempts", async () => {
		checkResults = [uptimeData({ status: 0, error: "HTTP 503" })];
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

	it("continues the failure streak and persists it as the next previous state", async () => {
		checkResults = [uptimeData({ status: 0, error: "HTTP 503" })];
		previousState = { kind: "found", state: { status: 0, failureStreak: 4 } };

		await processUptimeCheckForTest("schedule-1", "scheduled", deps());

		expect(calls.delivery).toEqual([
			uptimeData({ status: 0, error: "HTTP 503", failure_streak: 5 }),
		]);
		expect(calls.monitorState).toEqual([
			{ monitorId: "website-1", state: { status: 0, failureStreak: 5 } },
		]);
	});

	it("does not retry an attempt that timed out", async () => {
		checkResults = [uptimeData({ status: 0, error: "Timeout after 5000ms" })];

		await processUptimeCheckForTest("schedule-1", "scheduled", deps());

		expect(calls.check.map((c) => c.attempt)).toEqual([1]);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ outcome: "down" })
		);
	});

	it("fails the job instead of resetting the streak when previous state is unavailable", async () => {
		checkResults = [uptimeData({ status: 0, error: "HTTP 503" })];
		previousState = { kind: "unavailable" };
		const checkpoints: UptimeData[] = [];

		await expect(
			processUptimeCheckForTest(
				"schedule-1",
				"scheduled",
				deps(),
				async (data) => {
					checkpoints.push(data);
				}
			)
		).rejects.toThrow("Previous monitor state unavailable");

		expect(checkpoints).toEqual([]);
		expect(calls.monitorState).toEqual([]);
		expect(calls.delivery).toEqual([]);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ outcome: "previous_state_unavailable" })
		);
	});

	it("persists the exact event before enqueueing it for delivery", async () => {
		await processUptimeCheckForTest(
			"schedule-1",
			"manual",
			deps(),
			async (data) => {
				calls.checkpoint.push(data);
				calls.order.push("checkpoint");
			}
		);

		expect(calls.checkpoint).toEqual([uptimeData()]);
		expect(calls.delivery).toEqual([uptimeData()]);
		expect(calls.order).toEqual(["checkpoint", "state", "enqueue", "alert"]);
	});

	it("retries the source job when the durable checkpoint fails", async () => {
		await expect(
			processUptimeCheckForTest("schedule-1", "manual", deps(), async () => {
				throw new Error("redis unavailable");
			})
		).rejects.toThrow("redis unavailable");

		expect(calls.delivery).toEqual([]);
		expect(calls.email).toEqual([]);
		expect(calls.monitorState).toEqual([]);
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
					moveToDelayed: async () => {
						throw new Error("Hosted delivery must keep bounded retries");
					},
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

	it("keeps self-hosted delivery pending beyond the retry limit until storage recovers", async () => {
		process.env.SELFHOST = "true";
		const failingDeps = deps();
		failingDeps.sendUptimeEvent = async () => {
			throw new Error("ClickHouse unavailable");
		};
		const delayed: Array<{ timestamp: number; token?: string }> = [];
		const data = { event: uptimeData() };
		const job = {
			data,
			id: "uptime-delivery-uptime-event-1",
			name: "uptime-event-delivery",
			attemptsMade: 20,
			moveToDelayed: async (timestamp: number, token?: string) => {
				delayed.push({ timestamp, token });
			},
		};
		const startedAt = Date.now();
		await expect(
			processUptimeDeliveryJob(job, failingDeps, "worker-lock")
		).rejects.toBeInstanceOf(DelayedError);
		expect(delayed).toHaveLength(1);
		expect(delayed[0]?.timestamp).toBeGreaterThanOrEqual(startedAt + 30_000);
		expect(delayed[0]?.timestamp).toBeLessThanOrEqual(Date.now() + 30_000);
		expect(delayed[0]?.token).toBe("worker-lock");
		await processUptimeDeliveryJob(job, deps(), "worker-lock");
		const { event_id: _eventId, ...event } = data.event;
		expect(calls.send).toEqual([{ event, key: "website-1" }]);
		expect(job.data).toBe(data);
		expect(delayed).toHaveLength(1);
	});

	it("delivers the checkpointed payload without its relay-only ID", async () => {
		await processUptimeDeliveryJob(
			{
				data: { event: uptimeData() },
				id: "uptime-delivery-uptime-event-1",
				name: "uptime-event-delivery",
				attemptsMade: 0,
				moveToDelayed: async () => {},
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
		process.env.SELFHOST = "true";
		await expect(
			processUptimeDeliveryJob(
				{
					data: { event: { ...uptimeData(), site_id: 1 } },
					id: "uptime-delivery-uptime-event-1",
					name: "uptime-event-delivery",
					attemptsMade: 0,
					moveToDelayed: async () => {
						throw new Error("Malformed payload must keep bounded retries");
					},
				},
				deps()
			)
		).rejects.toThrow("Invalid uptime delivery payload");

		expect(calls.captureError).toEqual([]);
	});
});
