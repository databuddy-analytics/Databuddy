/**
 * Tests for alarm-trigger.ts
 *
 * These tests import and exercise the real module (not duplicated logic).
 * DB and notification calls are mocked at the module boundary.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { MonitorStatus } from "../types";

// ---- Mock @databuddy/db -----------------------------------------------
const mockFindFirst = mock(() => Promise.resolve(null));
const mockSelect = mock(() => ({
	from: mock(() => ({
		where: mock(() => Promise.resolve([])),
	})),
}));

mock.module("@databuddy/db", () => ({
	db: {
		query: {
			uptimeSchedules: { findFirst: mockFindFirst },
		},
		select: mockSelect,
	},
	alarms: {},
	alarmDestinations: {},
	uptimeSchedules: {},
	eq: (_col: unknown, _val: unknown) => ({ type: "eq", _col, _val }),
	and: (...args: unknown[]) => ({ type: "and", args }),
	or: (...args: unknown[]) => ({ type: "or", args }),
	isNull: (_col: unknown) => ({ type: "isNull", _col }),
}));

// ---- Mock @databuddy/redis -------------------------------------------
const mockRedisGet = mock(() => Promise.resolve(null));
const mockRedisSetex = mock(() => Promise.resolve("OK"));
mock.module("@databuddy/redis", () => ({
	getRedisCache: () => ({ get: mockRedisGet, setex: mockRedisSetex }),
}));

// ---- Mock @databuddy/notifications ------------------------------------
const mockSend = mock(() => Promise.resolve([{ success: true, channel: "slack" }]));
const MockNotificationClient = mock(() => ({ send: mockSend }));

mock.module("@databuddy/notifications", () => ({
	NotificationClient: MockNotificationClient,
}));

// ---- Mock evlog -------------------------------------------------------
mock.module("evlog", () => ({
	log: {
		info: mock(() => {}),
		warn: mock(() => {}),
		debug: mock(() => {}),
		error: mock(() => {}),
	},
}));

// ---- Mock tracing -----------------------------------------------------
mock.module("./tracing", () => ({
	captureError: mock(() => {}),
}));

// Import AFTER mocks are set up
const { checkAndTriggerAlarms } = await import("./alarm-trigger");

const baseUptimeData = {
	site_id: "site_1",
	url: "https://example.com",
	timestamp: Date.now(),
	status: 0, // DOWN
	http_code: 0,
	ttfb_ms: 0,
	total_ms: 0,
	attempt: 1,
	retries: 0,
	failure_streak: 3,
	response_bytes: 0,
	content_hash: "",
	redirect_count: 0,
	probe_region: "us-east",
	probe_ip: "1.2.3.4",
	ssl_expiry: 0,
	ssl_valid: 0,
	env: "prod",
	check_type: "http",
	user_agent: "test",
	error: "connection refused",
	json_data: undefined,
};

const mockSchedule = {
	id: "sched_1",
	organizationId: "org_1",
	websiteId: "web_1",
	name: "My Site",
	url: "https://example.com",
	website: { name: "My Site", domain: "example.com" },
};

describe("checkAndTriggerAlarms", () => {
	beforeEach(() => {
		mockFindFirst.mockReset();
		mockSelect.mockReset();
		mockSend.mockReset();
		MockNotificationClient.mockReset();
		mockRedisGet.mockReset();
		mockRedisSetex.mockReset();
		mockSend.mockImplementation(() => Promise.resolve([{ success: true, channel: "slack" }]));
		MockNotificationClient.mockImplementation(() => ({ send: mockSend }));
		mockRedisGet.mockResolvedValue(null); // default: no prior state
		mockRedisSetex.mockResolvedValue("OK");
	});

	test("returns early when schedule not found", async () => {
		mockFindFirst.mockResolvedValueOnce(null);
		await checkAndTriggerAlarms("nonexistent", baseUptimeData);
		expect(mockSelect).not.toHaveBeenCalled();
	});

	test("returns early when failure_streak below threshold on first DOWN", async () => {
		mockFindFirst.mockResolvedValueOnce(mockSchedule);
		const data = { ...baseUptimeData, status: 0, failure_streak: 1 };
		await checkAndTriggerAlarms("sched_1", data);
		expect(mockSelect).not.toHaveBeenCalled();
	});

	test("queries alarms when DOWN transition exceeds threshold", async () => {
		mockFindFirst.mockResolvedValueOnce(mockSchedule);
		const mockAlarmQuery = mock(() => ({ where: mock(() => Promise.resolve([])) }));
		mockSelect.mockReturnValueOnce({ from: mockAlarmQuery });

		const data = { ...baseUptimeData, status: 0, failure_streak: 3 };
		await checkAndTriggerAlarms("sched_1", data);
		expect(mockSelect).toHaveBeenCalled();
	});

	test("sends notification when alarm matches and DOWN transition", async () => {
		mockFindFirst.mockResolvedValueOnce(mockSchedule);

		const mockAlarm = {
			id: "alarm_1",
			organizationId: "org_1",
			websiteId: "web_1",
			name: "Test Alarm",
			enabled: true,
			triggerType: "uptime",
		};
		const mockDestination = {
			alarmId: "alarm_1",
			type: "slack",
			identifier: "https://hooks.slack.com/test",
			config: {},
		};

		// First select = alarms query, second = destinations query
		let callCount = 0;
		mockSelect.mockImplementation(() => ({
			from: () => ({
				where: () => {
					callCount++;
					if (callCount === 1) return Promise.resolve([mockAlarm]);
					return Promise.resolve([mockDestination]);
				},
			}),
		}));

		const data = { ...baseUptimeData, status: 0, failure_streak: 3 };
		await checkAndTriggerAlarms("sched_1", data);
		expect(mockSend).toHaveBeenCalledTimes(1);
		const [payload] = mockSend.mock.calls[0] as [{ title: string }];
		expect(payload.title).toContain("Site Down");
	});

	test("sends recovery notification on UP transition after DOWN", async () => {
		mockFindFirst.mockResolvedValue(mockSchedule);

		// Redis reports the last status as DOWN (simulates previous notification)
		mockRedisGet.mockResolvedValue(String(MonitorStatus.DOWN));

		const mockAlarm = {
			id: "alarm_2",
			organizationId: "org_1",
			websiteId: null,
			name: "Org Alarm",
			enabled: true,
			triggerType: "uptime",
		};
		const mockDest = {
			alarmId: "alarm_2",
			type: "discord",
			identifier: "https://discord.com/api/webhooks/test",
			config: {},
		};

		let callCount = 0;
		mockSelect.mockImplementation(() => ({
			from: () => ({
				where: () => {
					callCount++;
					if (callCount === 1) return Promise.resolve([mockAlarm]);
					return Promise.resolve([mockDest]);
				},
			}),
		}));
		mockSend.mockImplementation(() => Promise.resolve([{ success: true, channel: "discord" }]));
		MockNotificationClient.mockImplementation(() => ({ send: mockSend }));

		const upData = { ...baseUptimeData, status: 1, failure_streak: 0 };
		await checkAndTriggerAlarms("sched_recovery_2", upData);

		expect(mockSend).toHaveBeenCalledTimes(1);
		const [payload] = mockSend.mock.calls[0] as [{ title: string }];
		expect(payload.title).toContain("Site Recovered");
		// Redis should be updated to UP
		expect(mockRedisSetex).toHaveBeenCalledWith(
			expect.stringContaining("sched_recovery_2"),
			expect.any(Number),
			String(MonitorStatus.UP)
		);
	});

	test("no notification when same status repeated (deduplication via Redis)", async () => {
		mockFindFirst.mockResolvedValue(mockSchedule);
		// Redis reports last status was already DOWN
		mockRedisGet.mockResolvedValue(String(MonitorStatus.DOWN));

		const data = { ...baseUptimeData, status: 0, failure_streak: 3 };
		await checkAndTriggerAlarms("sched_dedup", data);
		// No transition (DOWN→DOWN), so alarm query should not be called
		expect(mockSelect).not.toHaveBeenCalled();
		expect(mockSend).not.toHaveBeenCalled();
	});

	test("org-level alarms (null websiteId) match all monitors", async () => {
		const scheduleNoWebsite = { ...mockSchedule, websiteId: null };
		mockFindFirst.mockResolvedValueOnce(scheduleNoWebsite);

		let whereArg: unknown;
		mockSelect.mockImplementation(() => ({
			from: () => ({
				where: (arg: unknown) => {
					whereArg = arg;
					return Promise.resolve([]);
				},
			}),
		}));

		const data = { ...baseUptimeData, status: 0, failure_streak: 3 };
		await checkAndTriggerAlarms("sched_no_website", data);
		// Should have called select (alarm query)
		expect(mockSelect).toHaveBeenCalled();
		// The where condition should use isNull (not eq) when no websiteId
		expect(JSON.stringify(whereArg)).toContain("isNull");
	});
});
