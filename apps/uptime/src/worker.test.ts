import { beforeEach, describe, expect, it } from "bun:test";
import type { ScheduleData } from "./actions";
import type { UptimeData } from "./types";
import {
	DEFAULT_UPTIME_WORKER_CONCURRENCY,
	getUptimeWorkerConcurrency,
	processUptimeCheck,
	processUptimeJob,
	type UptimeWorkerDeps,
} from "./worker";

const calls = {
	captureError: [] as Array<{ error: unknown; context: Record<string, unknown> }>,
	check: [] as Array<{
		monitorId: string;
		url: string;
		timeout: number | undefined;
		cacheBust: boolean | undefined;
		extractHealth: boolean | undefined;
	}>,
	email: [] as Array<{ schedule: ScheduleData; data: UptimeData }>,
	loggerFields: [] as Array<Record<string, unknown>>,
	loggerEmitted: [] as Array<boolean>,
	reaped: [] as string[],
	send: [] as Array<{ data: UptimeData; monitorId: string }>,
};

let lookupResult:
	| { success: true; data: ScheduleData }
	| { success: false; error: string; reason?: "not_found" | "malformed" | "transient" };
let checkResult:
	| { success: true; data: UptimeData }
	| { success: false; error: string };
let previousStatus: number | undefined;
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
		jsonParsingConfig: { enabled: true },
		...values,
	};
}

function uptimeData(values: Partial<UptimeData> = {}): UptimeData {
	return {
		attempt: 1,
		check_type: "http",
		content_hash: "hash",
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
		checkUptime: async (monitorId, url, _attempt, options) => {
			calls.check.push({
				monitorId,
				url,
				timeout: options.timeout,
				cacheBust: options.cacheBust,
				extractHealth: options.extractHealth,
			});
			return checkResult;
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
		getPreviousMonitorStatus: async () => previousStatus,
		isHealthExtractionEnabled: (config) =>
			typeof config === "object" &&
			config !== null &&
			"enabled" in config &&
			config.enabled === true,
		lookupSchedule: async () => lookupResult,
		reapOrphanScheduler: async (scheduleId: string) => {
			calls.reaped.push(scheduleId);
			if (reapBehaviour === "throw") {
				throw new Error("redis reap blew up");
			}
		},
		sendUptimeEvent: async (data, monitorId) => {
			calls.send.push({ data, monitorId });
		},
		fireTransitionAlerts: async (payload) => {
			calls.email.push(payload);
			return { transition_kind: null, alarms_fired: 0 };
		},
	};
}

beforeEach(() => {
	calls.captureError = [];
	calls.check = [];
	calls.email = [];
	calls.loggerFields = [];
	calls.loggerEmitted = [];
	calls.reaped = [];
	calls.send = [];
	lookupResult = { success: true, data: schedule() };
	checkResult = { success: true, data: uptimeData() };
	previousStatus = 0;
	reapBehaviour = "ok";
});

async function flushMicrotasks(): Promise<void> {
	await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("getUptimeWorkerConcurrency", () => {
	it("keeps the high Bun worker default when no override is configured", () => {
		expect(getUptimeWorkerConcurrency(undefined)).toBe(
			DEFAULT_UPTIME_WORKER_CONCURRENCY
		);
	});

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
			},
			deps()
		);

		expect(calls.check).toHaveLength(1);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ uptime_trigger: "manual" })
		);
	});

	it("runs a scheduled check and emits events, status, and transition email work", async () => {
		await processUptimeCheck("schedule-1", "scheduled", deps());

		expect(calls.check).toEqual([
			{
				monitorId: "website-1",
				url: "https://example.com/health",
				timeout: 5000,
				cacheBust: true,
				extractHealth: true,
			},
		]);
		expect(calls.send).toEqual([
			{ data: uptimeData(), monitorId: "website-1" },
		]);
		expect(calls.email).toHaveLength(1);
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
				outcome: "up",
				previous_uptime_status: 0,
				ttfb_ms: 10,
				total_ms: 30,
			})
		);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ kafka_sent: true })
		);
		expect(calls.loggerEmitted).toHaveLength(1);
	});

	it("records -1 when no previous monitor status exists", async () => {
		previousStatus = undefined;

		await processUptimeCheck("schedule-1", "scheduled", deps());

		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ previous_uptime_status: -1 })
		);
	});

	it("uses the schedule id as monitor id when no website is attached", async () => {
		lookupResult = {
			success: true,
			data: schedule({ website: null, websiteId: null, timeout: null }),
		};

		await processUptimeCheck("schedule-only", "manual", deps());

		expect(calls.check).toEqual([
			{
				monitorId: "schedule-only",
				url: "https://example.com/health",
				timeout: undefined,
				cacheBust: true,
				extractHealth: true,
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

		await processUptimeCheck("schedule-1", "scheduled", deps());

		expect(calls.check).toEqual([]);
		expect(calls.send).toEqual([]);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ organization_id: "org-1" })
		);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ outcome: "skipped_paused" })
		);
		expect(calls.loggerEmitted).toHaveLength(1);
	});

	it("skips missing schedules without throwing", async () => {
		lookupResult = { success: false, error: "not found" };

		await processUptimeCheck("schedule-1", "scheduled", deps());

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

		await processUptimeCheck("schedule-1", "scheduled", deps());
		await flushMicrotasks();

		expect(calls.reaped).toEqual(["schedule-1"]);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ schedule_lookup_reason: "not_found" })
		);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ orphan_scheduler_reaped: true })
		);
	});

	it("reaps the BullMQ scheduler when reason is malformed", async () => {
		lookupResult = {
			success: false,
			error: "Schedule schedule-1 has invalid data (missing url)",
			reason: "malformed",
		};

		await processUptimeCheck("schedule-1", "scheduled", deps());
		await flushMicrotasks();

		expect(calls.reaped).toEqual(["schedule-1"]);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ schedule_lookup_reason: "malformed" })
		);
	});

	it("does NOT reap the scheduler on transient DB failure (fail-open)", async () => {
		lookupResult = {
			success: false,
			error: "ECONNRESET",
			reason: "transient",
		};

		await processUptimeCheck("schedule-1", "scheduled", deps());
		await flushMicrotasks();

		expect(calls.reaped).toEqual([]);
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({ schedule_lookup_reason: "transient" })
		);
	});

	it("does NOT reap when reason is missing on legacy failures (fail-open)", async () => {
		lookupResult = { success: false, error: "boom" };

		await processUptimeCheck("schedule-1", "scheduled", deps());
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

		await processUptimeCheck("schedule-1", "scheduled", deps());
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
		checkResult = { success: false, error: "timeout" };

		await expect(
			processUptimeCheck("schedule-1", "scheduled", deps())
		).rejects.toThrow("timeout");
		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({
				outcome: "check_failed",
				error_message: "timeout",
			})
		);
		expect(calls.loggerEmitted).toHaveLength(1);
	});

	it("captures producer errors on the wide event without failing the job", async () => {
		const failingDeps = deps();
		failingDeps.sendUptimeEvent = async () => {
			throw new Error("producer unavailable");
		};

		await processUptimeCheck("schedule-1", "manual", failingDeps);

		expect(calls.loggerFields).toContainEqual(
			expect.objectContaining({
				kafka_sent: false,
				kafka_error: "producer unavailable",
			})
		);
		expect(calls.loggerEmitted).toHaveLength(1);
	});
});
