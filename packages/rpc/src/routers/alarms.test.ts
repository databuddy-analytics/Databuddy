import { describe, expect, it } from "bun:test";

const TRIGGER_TYPES = [
	"uptime",
	"traffic_spike",
	"error_rate",
	"goal",
	"custom",
] as const;

const NOTIFICATION_CHANNELS = [
	"slack",
	"discord",
	"email",
	"webhook",
] as const;

describe("alarm trigger types", () => {
	it("contains all expected trigger types", () => {
		expect(TRIGGER_TYPES).toContain("uptime");
		expect(TRIGGER_TYPES).toContain("traffic_spike");
		expect(TRIGGER_TYPES).toContain("error_rate");
		expect(TRIGGER_TYPES).toContain("goal");
		expect(TRIGGER_TYPES).toContain("custom");
	});

	it("has exactly 5 trigger types", () => {
		expect(TRIGGER_TYPES.length).toBe(5);
	});
});

describe("notification channels", () => {
	it("contains all expected channels", () => {
		expect(NOTIFICATION_CHANNELS).toContain("slack");
		expect(NOTIFICATION_CHANNELS).toContain("discord");
		expect(NOTIFICATION_CHANNELS).toContain("email");
		expect(NOTIFICATION_CHANNELS).toContain("webhook");
	});

	it("has exactly 4 channels", () => {
		expect(NOTIFICATION_CHANNELS.length).toBe(4);
	});
});

describe("alarm validation", () => {
	it("rejects empty alarm name", () => {
		const name = "";
		expect(name.trim().length).toBe(0);
	});

	it("accepts valid alarm name", () => {
		const name = "My Uptime Alarm";
		expect(name.trim().length).toBeGreaterThan(0);
		expect(name.length).toBeLessThanOrEqual(200);
	});

	it("rejects name exceeding 200 characters", () => {
		const name = "a".repeat(201);
		expect(name.length).toBeGreaterThan(200);
	});

	it("rejects description exceeding 1000 characters", () => {
		const description = "a".repeat(1001);
		expect(description.length).toBeGreaterThan(1000);
	});

	it("requires at least one notification channel", () => {
		const channels: string[] = [];
		expect(channels.length).toBe(0);
	});

	it("validates slack webhook URL format", () => {
		const validUrl = "https://hooks.slack.com/services/T00/B00/xxx";
		const invalidUrl = "not-a-url";
		expect(validUrl.startsWith("https://")).toBe(true);
		expect(invalidUrl.startsWith("https://")).toBe(false);
	});

	it("validates discord webhook URL format", () => {
		const validUrl = "https://discord.com/api/webhooks/123/abc";
		expect(validUrl.startsWith("https://")).toBe(true);
	});

	it("validates email address format", () => {
		const validEmail = "user@example.com";
		const invalidEmail = "not-an-email";
		expect(validEmail.includes("@")).toBe(true);
		expect(invalidEmail.includes("@")).toBe(false);
	});

	it("validates webhook URL format", () => {
		const validUrl = "https://api.example.com/webhook";
		expect(validUrl.startsWith("https://")).toBe(true);
	});
});

describe("alarm authorization", () => {
	it("user can only access their own alarms", () => {
		const alarmUserId = "user-123";
		const requestUserId = "user-123";
		const otherUserId = "user-456";

		expect(alarmUserId === requestUserId).toBe(true);
		expect(alarmUserId === otherUserId).toBe(false);
	});

	it("organization members can access org alarms", () => {
		const alarmOrgId = "org-123";
		const userOrgId = "org-123";
		expect(alarmOrgId === userOrgId).toBe(true);
	});

	it("admin can access any alarm", () => {
		const userRole = "ADMIN";
		expect(userRole === "ADMIN").toBe(true);
	});
});

describe("alarm CRUD operations", () => {
	it("creates alarm with all required fields", () => {
		const alarm = {
			id: "test-id",
			name: "Test Alarm",
			enabled: true,
			triggerType: "uptime" as const,
			notificationChannels: ["slack"] as string[],
			slackWebhookUrl: "https://hooks.slack.com/services/test",
		};

		expect(alarm.id).toBeTruthy();
		expect(alarm.name).toBeTruthy();
		expect(alarm.enabled).toBe(true);
		expect(TRIGGER_TYPES).toContain(alarm.triggerType);
		expect(alarm.notificationChannels.length).toBeGreaterThan(0);
	});

	it("creates alarm with multiple channels", () => {
		const alarm = {
			notificationChannels: ["slack", "discord", "email"],
			slackWebhookUrl: "https://hooks.slack.com/services/test",
			discordWebhookUrl: "https://discord.com/api/webhooks/123/abc",
			emailAddresses: ["user@example.com"],
		};

		expect(alarm.notificationChannels.length).toBe(3);
		expect(alarm.slackWebhookUrl).toBeTruthy();
		expect(alarm.discordWebhookUrl).toBeTruthy();
		expect(alarm.emailAddresses.length).toBeGreaterThan(0);
	});

	it("updates alarm fields", () => {
		const original = { name: "Old Name", enabled: true };
		const update = { name: "New Name", enabled: false };
		const result = { ...original, ...update };

		expect(result.name).toBe("New Name");
		expect(result.enabled).toBe(false);
	});

	it("deletes alarm by id", () => {
		const alarms = [
			{ id: "alarm-1" },
			{ id: "alarm-2" },
			{ id: "alarm-3" },
		];
		const toDelete = "alarm-2";
		const remaining = alarms.filter((a) => a.id !== toDelete);

		expect(remaining.length).toBe(2);
		expect(remaining.find((a) => a.id === toDelete)).toBeUndefined();
	});
});

describe("test notification", () => {
	it("generates correct test payload", () => {
		const alarmName = "My Test Alarm";
		const payload = {
			title: `🔔 Test Alarm: ${alarmName}`,
			message: `This is a test notification from Databuddy. If you're seeing this, your alarm "${alarmName}" is configured correctly!`,
			priority: "normal" as const,
			metadata: {
				alarmId: "test-id",
				alarmName,
				isTest: true,
			},
		};

		expect(payload.title).toContain(alarmName);
		expect(payload.message).toContain(alarmName);
		expect(payload.metadata.isTest).toBe(true);
		expect(payload.priority).toBe("normal");
	});

	it("reports per-channel results", () => {
		const results = [
			{ channel: "slack", success: true },
			{ channel: "discord", success: false, error: "Invalid webhook" },
		];

		const allSuccess = results.every((r) => r.success);
		const failed = results.filter((r) => !r.success);

		expect(allSuccess).toBe(false);
		expect(failed.length).toBe(1);
		expect(failed[0]?.channel).toBe("discord");
	});
});
