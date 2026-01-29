import { describe, expect, it } from "bun:test";
import type { NotificationPayload, NotificationResult } from "@databuddy/notifications";
import type { AlarmRecord, AlarmStateRecord, AlarmTriggerDetails } from "./alarms";
import { processUptimeAlarmsWithDeps } from "./alarms";
import type { UptimeData } from "./types";

const baseUptimeData: UptimeData = {
	site_id: "site-1",
	url: "https://example.com",
	timestamp: Date.now(),
	status: 0,
	http_code: 503,
	ttfb_ms: 120,
	total_ms: 240,
	attempt: 1,
	retries: 0,
	failure_streak: 0,
	response_bytes: 0,
	content_hash: "",
	redirect_count: 0,
	probe_region: "us-east",
	probe_ip: "127.0.0.1",
	ssl_expiry: 0,
	ssl_valid: 0,
	env: "test",
	check_type: "http",
	user_agent: "test",
	error: "",
};

type AlarmStateUpsert = {
	alarmId: string;
	websiteId: string;
	status: "up" | "down";
	consecutiveFailures: number;
	downStartedAt: Date | null;
	lastCheckedAt: Date;
	updatedAt: Date;
};

type AlarmHistoryEntry = {
	id: string;
	alarmId: string;
	websiteId: string;
	status: "down" | "up";
	details: AlarmTriggerDetails;
	triggeredAt: Date;
};

describe("processUptimeAlarmsWithDeps", () => {
	it("triggers after threshold and avoids duplicates", async () => {
		const alarm: AlarmRecord = {
			id: "alarm-1",
			userId: "user-1",
			organizationId: "org-1",
			websiteId: "site-1",
			name: "Uptime Alarm",
			description: null,
			enabled: true,
			notificationChannels: ["slack", "discord", "email", "webhook"],
			slackWebhookUrl: "https://hooks.slack.com/services/test",
			discordWebhookUrl: "https://discord.com/api/webhooks/test",
			emailAddresses: ["alerts@databuddy.cc"],
			webhookUrl: "https://example.com/webhook",
			webhookHeaders: { Authorization: "Bearer token" },
			triggerType: "uptime",
			triggerConditions: { failureThreshold: 2 },
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		const states: AlarmStateRecord[] = [];
		const histories: AlarmHistoryEntry[] = [];
		const sentChannels: string[] = [];

		const deps = {
			fetchAlarms: async () => [alarm],
			fetchStates: async () => states,
			upsertState: async (state: AlarmStateUpsert) => {
				const index = states.findIndex((s) => s.alarmId === state.alarmId);
				if (index >= 0) {
					states[index] = { ...states[index], ...state };
				} else {
					states.push(state);
				}
			},
			logHistory: async (entry: AlarmHistoryEntry) => {
				histories.push(entry);
			},
			senders: {
				slack: async (_url: string, _payload: NotificationPayload) => {
					sentChannels.push("slack");
					const result: NotificationResult = {
						success: true,
						channel: "slack",
					};
					return result;
				},
				discord: async (_url: string, _payload: NotificationPayload) => {
					sentChannels.push("discord");
					const result: NotificationResult = {
						success: true,
						channel: "discord",
					};
					return result;
				},
				email: async (_payload: NotificationPayload & { to: string | string[] }) => {
					sentChannels.push("email");
					const result: NotificationResult = {
						success: true,
						channel: "email",
					};
					return result;
				},
				webhook: async (
					_url: string,
					_payload: NotificationPayload,
					_headers: Record<string, string>
				) => {
					sentChannels.push("webhook");
					const result: NotificationResult = {
						success: true,
						channel: "webhook",
					};
					return result;
				},
			},
		};

		await processUptimeAlarmsWithDeps(
			{ ...baseUptimeData, timestamp: Date.now(), status: 0 },
			"site-1",
			deps
		);
		expect(histories).toHaveLength(0);

		await processUptimeAlarmsWithDeps(
			{ ...baseUptimeData, timestamp: Date.now() + 1000, status: 0 },
			"site-1",
			deps
		);
		expect(histories).toHaveLength(1);
		expect(sentChannels).toHaveLength(4);

		await processUptimeAlarmsWithDeps(
			{ ...baseUptimeData, timestamp: Date.now() + 2000, status: 0 },
			"site-1",
			deps
		);
		expect(histories).toHaveLength(1);
	});

	it("sends recovery notification and logs history", async () => {
		const alarm: AlarmRecord = {
			id: "alarm-2",
			userId: "user-1",
			organizationId: "org-1",
			websiteId: "site-1",
			name: "Recovery Alarm",
			description: null,
			enabled: true,
			notificationChannels: ["slack", "discord"],
			slackWebhookUrl: "https://hooks.slack.com/services/test",
			discordWebhookUrl: "https://discord.com/api/webhooks/test",
			emailAddresses: [],
			webhookUrl: null,
			webhookHeaders: {},
			triggerType: "uptime",
			triggerConditions: { failureThreshold: 1 },
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		const states: AlarmStateRecord[] = [];
		const histories: AlarmHistoryEntry[] = [];
		const sentChannels: string[] = [];

		const deps = {
			fetchAlarms: async () => [alarm],
			fetchStates: async () => states,
			upsertState: async (state: AlarmStateUpsert) => {
				const index = states.findIndex((s) => s.alarmId === state.alarmId);
				if (index >= 0) {
					states[index] = { ...states[index], ...state };
				} else {
					states.push(state);
				}
			},
			logHistory: async (entry: AlarmHistoryEntry) => {
				histories.push(entry);
			},
			senders: {
				slack: async (_url: string, _payload: NotificationPayload) => {
					sentChannels.push("slack");
					return { success: true, channel: "slack" };
				},
				discord: async (_url: string, _payload: NotificationPayload) => {
					sentChannels.push("discord");
					return { success: true, channel: "discord" };
				},
				email: async (_payload: NotificationPayload & { to: string | string[] }) => {
					sentChannels.push("email");
					return { success: true, channel: "email" };
				},
				webhook: async (
					_url: string,
					_payload: NotificationPayload,
					_headers: Record<string, string>
				) => {
					sentChannels.push("webhook");
					return { success: true, channel: "webhook" };
				},
			},
		};

		await processUptimeAlarmsWithDeps(
			{ ...baseUptimeData, timestamp: Date.now(), status: 0 },
			"site-1",
			deps
		);
		await processUptimeAlarmsWithDeps(
			{ ...baseUptimeData, timestamp: Date.now() + 5000, status: 1 },
			"site-1",
			deps
		);

		expect(histories).toHaveLength(2);
		expect(sentChannels).toContain("slack");
		expect(sentChannels).toContain("discord");
	});
});
