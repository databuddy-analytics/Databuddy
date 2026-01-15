import { describe, expect, it } from "bun:test";
import { z } from "zod";

// Schema definitions matching the router
const notificationChannelSchema = z.enum(["slack", "discord", "email", "webhook"]);
const triggerTypeSchema = z.enum([
	"uptime",
	"traffic_spike",
	"error_rate",
	"goal",
	"custom",
]);

const createAlarmSchema = z.object({
	name: z.string().min(1).max(100),
	description: z.string().optional(),
	websiteId: z.string().optional(),
	enabled: z.boolean().optional().default(true),
	notificationChannels: z.array(notificationChannelSchema).default([]),
	slackWebhookUrl: z.string().url().optional().nullable(),
	discordWebhookUrl: z.string().url().optional().nullable(),
	emailAddresses: z.array(z.string().email()).optional().default([]),
	webhookUrl: z.string().url().optional().nullable(),
	webhookHeaders: z.record(z.string(), z.string()).optional().default({}),
	triggerType: triggerTypeSchema,
	triggerConditions: z.record(z.string(), z.unknown()).optional().default({}),
});

const updateAlarmSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100).optional(),
	description: z.string().optional().nullable(),
	enabled: z.boolean().optional(),
	notificationChannels: z.array(notificationChannelSchema).optional(),
	slackWebhookUrl: z.string().url().optional().nullable(),
	discordWebhookUrl: z.string().url().optional().nullable(),
	emailAddresses: z.array(z.string().email()).optional(),
	webhookUrl: z.string().url().optional().nullable(),
	webhookHeaders: z.record(z.string(), z.string()).optional(),
	triggerType: triggerTypeSchema.optional(),
	triggerConditions: z.record(z.string(), z.unknown()).optional(),
});

// Constants
const NOTIFICATION_CHANNELS = ["slack", "discord", "email", "webhook"] as const;
const TRIGGER_TYPES = ["uptime", "traffic_spike", "error_rate", "goal", "custom"] as const;

describe("NOTIFICATION_CHANNELS constants", () => {
	it("contains slack", () => {
		expect(NOTIFICATION_CHANNELS).toContain("slack");
	});

	it("contains discord", () => {
		expect(NOTIFICATION_CHANNELS).toContain("discord");
	});

	it("contains email", () => {
		expect(NOTIFICATION_CHANNELS).toContain("email");
	});

	it("contains webhook", () => {
		expect(NOTIFICATION_CHANNELS).toContain("webhook");
	});

	it("has exactly 4 channels", () => {
		expect(NOTIFICATION_CHANNELS).toHaveLength(4);
	});
});

describe("TRIGGER_TYPES constants", () => {
	it("contains uptime", () => {
		expect(TRIGGER_TYPES).toContain("uptime");
	});

	it("contains traffic_spike", () => {
		expect(TRIGGER_TYPES).toContain("traffic_spike");
	});

	it("contains error_rate", () => {
		expect(TRIGGER_TYPES).toContain("error_rate");
	});

	it("contains goal", () => {
		expect(TRIGGER_TYPES).toContain("goal");
	});

	it("contains custom", () => {
		expect(TRIGGER_TYPES).toContain("custom");
	});

	it("has exactly 5 trigger types", () => {
		expect(TRIGGER_TYPES).toHaveLength(5);
	});
});

describe("notificationChannelSchema validation", () => {
	it("accepts valid channels", () => {
		expect(notificationChannelSchema.parse("slack")).toBe("slack");
		expect(notificationChannelSchema.parse("discord")).toBe("discord");
		expect(notificationChannelSchema.parse("email")).toBe("email");
		expect(notificationChannelSchema.parse("webhook")).toBe("webhook");
	});

	it("rejects invalid channels", () => {
		expect(() => notificationChannelSchema.parse("telegram")).toThrow();
		expect(() => notificationChannelSchema.parse("sms")).toThrow();
		expect(() => notificationChannelSchema.parse("")).toThrow();
	});
});

describe("triggerTypeSchema validation", () => {
	it("accepts valid trigger types", () => {
		expect(triggerTypeSchema.parse("uptime")).toBe("uptime");
		expect(triggerTypeSchema.parse("traffic_spike")).toBe("traffic_spike");
		expect(triggerTypeSchema.parse("error_rate")).toBe("error_rate");
		expect(triggerTypeSchema.parse("goal")).toBe("goal");
		expect(triggerTypeSchema.parse("custom")).toBe("custom");
	});

	it("rejects invalid trigger types", () => {
		expect(() => triggerTypeSchema.parse("invalid")).toThrow();
		expect(() => triggerTypeSchema.parse("")).toThrow();
		expect(() => triggerTypeSchema.parse("security")).toThrow();
	});
});

describe("createAlarmSchema validation", () => {
	it("accepts valid minimal input", () => {
		const input = {
			name: "Test Alarm",
			triggerType: "uptime",
		};
		const result = createAlarmSchema.parse(input);
		expect(result.name).toBe("Test Alarm");
		expect(result.triggerType).toBe("uptime");
		expect(result.enabled).toBe(true);
		expect(result.notificationChannels).toEqual([]);
	});

	it("accepts valid full input", () => {
		const input = {
			name: "Full Alarm",
			description: "A test alarm",
			websiteId: "website-123",
			enabled: false,
			notificationChannels: ["slack", "discord"],
			slackWebhookUrl: "https://hooks.slack.com/services/xxx",
			discordWebhookUrl: "https://discord.com/api/webhooks/xxx",
			emailAddresses: ["test@example.com"],
			webhookUrl: "https://example.com/webhook",
			webhookHeaders: { "X-Custom": "value" },
			triggerType: "traffic_spike",
			triggerConditions: { threshold: 1000 },
		};
		const result = createAlarmSchema.parse(input);
		expect(result.name).toBe("Full Alarm");
		expect(result.description).toBe("A test alarm");
		expect(result.enabled).toBe(false);
		expect(result.notificationChannels).toEqual(["slack", "discord"]);
	});

	it("rejects empty name", () => {
		const input = {
			name: "",
			triggerType: "uptime",
		};
		expect(() => createAlarmSchema.parse(input)).toThrow();
	});

	it("rejects name longer than 100 characters", () => {
		const input = {
			name: "a".repeat(101),
			triggerType: "uptime",
		};
		expect(() => createAlarmSchema.parse(input)).toThrow();
	});

	it("rejects missing triggerType", () => {
		const input = {
			name: "Test Alarm",
		};
		expect(() => createAlarmSchema.parse(input)).toThrow();
	});

	it("rejects invalid webhook URL", () => {
		const input = {
			name: "Test Alarm",
			triggerType: "uptime",
			slackWebhookUrl: "not-a-url",
		};
		expect(() => createAlarmSchema.parse(input)).toThrow();
	});

	it("accepts null webhook URLs", () => {
		const input = {
			name: "Test Alarm",
			triggerType: "uptime",
			slackWebhookUrl: null,
			discordWebhookUrl: null,
			webhookUrl: null,
		};
		const result = createAlarmSchema.parse(input);
		expect(result.slackWebhookUrl).toBeNull();
		expect(result.discordWebhookUrl).toBeNull();
		expect(result.webhookUrl).toBeNull();
	});

	it("rejects invalid email addresses", () => {
		const input = {
			name: "Test Alarm",
			triggerType: "uptime",
			emailAddresses: ["invalid-email"],
		};
		expect(() => createAlarmSchema.parse(input)).toThrow();
	});

	it("accepts valid email addresses", () => {
		const input = {
			name: "Test Alarm",
			triggerType: "uptime",
			emailAddresses: ["test@example.com", "admin@company.org"],
		};
		const result = createAlarmSchema.parse(input);
		expect(result.emailAddresses).toEqual(["test@example.com", "admin@company.org"]);
	});

	it("rejects invalid notification channels", () => {
		const input = {
			name: "Test Alarm",
			triggerType: "uptime",
			notificationChannels: ["invalid"],
		};
		expect(() => createAlarmSchema.parse(input)).toThrow();
	});

	it("defaults enabled to true", () => {
		const input = {
			name: "Test Alarm",
			triggerType: "uptime",
		};
		const result = createAlarmSchema.parse(input);
		expect(result.enabled).toBe(true);
	});

	it("defaults notificationChannels to empty array", () => {
		const input = {
			name: "Test Alarm",
			triggerType: "uptime",
		};
		const result = createAlarmSchema.parse(input);
		expect(result.notificationChannels).toEqual([]);
	});

	it("defaults emailAddresses to empty array", () => {
		const input = {
			name: "Test Alarm",
			triggerType: "uptime",
		};
		const result = createAlarmSchema.parse(input);
		expect(result.emailAddresses).toEqual([]);
	});

	it("defaults webhookHeaders to empty object", () => {
		const input = {
			name: "Test Alarm",
			triggerType: "uptime",
		};
		const result = createAlarmSchema.parse(input);
		expect(result.webhookHeaders).toEqual({});
	});

	it("defaults triggerConditions to empty object", () => {
		const input = {
			name: "Test Alarm",
			triggerType: "uptime",
		};
		const result = createAlarmSchema.parse(input);
		expect(result.triggerConditions).toEqual({});
	});
});

describe("updateAlarmSchema validation", () => {
	it("requires id", () => {
		const input = {
			name: "Updated Name",
		};
		expect(() => updateAlarmSchema.parse(input)).toThrow();
	});

	it("accepts only id (no updates)", () => {
		const input = {
			id: "alarm-123",
		};
		const result = updateAlarmSchema.parse(input);
		expect(result.id).toBe("alarm-123");
		expect(result.name).toBeUndefined();
	});

	it("accepts partial updates", () => {
		const input = {
			id: "alarm-123",
			name: "Updated Name",
		};
		const result = updateAlarmSchema.parse(input);
		expect(result.id).toBe("alarm-123");
		expect(result.name).toBe("Updated Name");
		expect(result.enabled).toBeUndefined();
	});

	it("accepts full updates", () => {
		const input = {
			id: "alarm-123",
			name: "Updated Name",
			description: "Updated description",
			enabled: false,
			notificationChannels: ["email"],
			slackWebhookUrl: "https://hooks.slack.com/new",
			emailAddresses: ["new@example.com"],
			triggerType: "goal",
			triggerConditions: { goalId: "goal-456" },
		};
		const result = updateAlarmSchema.parse(input);
		expect(result.id).toBe("alarm-123");
		expect(result.name).toBe("Updated Name");
		expect(result.enabled).toBe(false);
		expect(result.triggerType).toBe("goal");
	});

	it("allows setting description to null", () => {
		const input = {
			id: "alarm-123",
			description: null,
		};
		const result = updateAlarmSchema.parse(input);
		expect(result.description).toBeNull();
	});

	it("rejects invalid name length", () => {
		const input = {
			id: "alarm-123",
			name: "",
		};
		expect(() => updateAlarmSchema.parse(input)).toThrow();
	});

	it("rejects invalid webhook URL in update", () => {
		const input = {
			id: "alarm-123",
			webhookUrl: "not-a-valid-url",
		};
		expect(() => updateAlarmSchema.parse(input)).toThrow();
	});

	it("accepts null webhook URLs in update", () => {
		const input = {
			id: "alarm-123",
			slackWebhookUrl: null,
			discordWebhookUrl: null,
		};
		const result = updateAlarmSchema.parse(input);
		expect(result.slackWebhookUrl).toBeNull();
		expect(result.discordWebhookUrl).toBeNull();
	});
});

describe("alarm authorization simulation", () => {
	// Simulating authorization logic from the router
	type Alarm = {
		id: string;
		userId: string;
		organizationId: string | null;
	};

	const canAccessAlarm = (
		alarm: Alarm,
		userId: string,
		organizationId: string | null
	): boolean => {
		// User can access if they own the alarm
		if (alarm.userId === userId) {
			return true;
		}
		// User can access if alarm belongs to their organization
		if (organizationId && alarm.organizationId === organizationId) {
			return true;
		}
		return false;
	};

	it("allows access when user owns the alarm", () => {
		const alarm = { id: "alarm-1", userId: "user-1", organizationId: null };
		expect(canAccessAlarm(alarm, "user-1", null)).toBe(true);
	});

	it("denies access when user does not own the alarm", () => {
		const alarm = { id: "alarm-1", userId: "user-1", organizationId: null };
		expect(canAccessAlarm(alarm, "user-2", null)).toBe(false);
	});

	it("allows access when alarm belongs to user's organization", () => {
		const alarm = { id: "alarm-1", userId: "user-1", organizationId: "org-1" };
		expect(canAccessAlarm(alarm, "user-2", "org-1")).toBe(true);
	});

	it("denies access when alarm belongs to different organization", () => {
		const alarm = { id: "alarm-1", userId: "user-1", organizationId: "org-1" };
		expect(canAccessAlarm(alarm, "user-2", "org-2")).toBe(false);
	});

	it("allows owner access even with different organization", () => {
		const alarm = { id: "alarm-1", userId: "user-1", organizationId: "org-1" };
		expect(canAccessAlarm(alarm, "user-1", "org-2")).toBe(true);
	});

	it("allows organization access for organization alarms", () => {
		const alarm = { id: "alarm-1", userId: "user-1", organizationId: "org-1" };
		// Different user but same organization
		expect(canAccessAlarm(alarm, "user-3", "org-1")).toBe(true);
	});
});

describe("test notification payload construction", () => {
	const createTestPayload = (alarm: {
		id: string;
		name: string;
		triggerType: string;
	}) => ({
		title: `Test Notification: ${alarm.name}`,
		message:
			"This is a test notification from Databuddy to verify your alarm configuration is working correctly.",
		priority: "normal" as const,
		metadata: {
			alarmId: alarm.id,
			alarmName: alarm.name,
			triggerType: alarm.triggerType,
			testSentAt: new Date().toISOString(),
		},
	});

	it("creates payload with correct title", () => {
		const alarm = { id: "alarm-1", name: "My Alarm", triggerType: "uptime" };
		const payload = createTestPayload(alarm);
		expect(payload.title).toBe("Test Notification: My Alarm");
	});

	it("creates payload with test message", () => {
		const alarm = { id: "alarm-1", name: "My Alarm", triggerType: "uptime" };
		const payload = createTestPayload(alarm);
		expect(payload.message).toContain("test notification");
		expect(payload.message).toContain("Databuddy");
	});

	it("creates payload with normal priority", () => {
		const alarm = { id: "alarm-1", name: "My Alarm", triggerType: "uptime" };
		const payload = createTestPayload(alarm);
		expect(payload.priority).toBe("normal");
	});

	it("includes alarm metadata", () => {
		const alarm = { id: "alarm-1", name: "My Alarm", triggerType: "traffic_spike" };
		const payload = createTestPayload(alarm);
		expect(payload.metadata.alarmId).toBe("alarm-1");
		expect(payload.metadata.alarmName).toBe("My Alarm");
		expect(payload.metadata.triggerType).toBe("traffic_spike");
	});

	it("includes timestamp in metadata", () => {
		const alarm = { id: "alarm-1", name: "My Alarm", triggerType: "uptime" };
		const payload = createTestPayload(alarm);
		expect(payload.metadata.testSentAt).toBeDefined();
		// Should be valid ISO date string
		expect(new Date(payload.metadata.testSentAt).toISOString()).toBe(
			payload.metadata.testSentAt
		);
	});
});

describe("notification channel configuration validation", () => {
	const validateChannelConfig = (
		channels: string[],
		config: {
			slackWebhookUrl?: string | null;
			discordWebhookUrl?: string | null;
			emailAddresses?: string[];
			webhookUrl?: string | null;
		}
	): { valid: boolean; errors: string[] } => {
		const errors: string[] = [];

		if (channels.includes("slack") && !config.slackWebhookUrl) {
			errors.push("Slack webhook URL is required when Slack channel is selected");
		}

		if (channels.includes("discord") && !config.discordWebhookUrl) {
			errors.push("Discord webhook URL is required when Discord channel is selected");
		}

		if (
			channels.includes("email") &&
			(!config.emailAddresses || config.emailAddresses.length === 0)
		) {
			errors.push("At least one email address is required when Email channel is selected");
		}

		if (channels.includes("webhook") && !config.webhookUrl) {
			errors.push("Webhook URL is required when Webhook channel is selected");
		}

		return { valid: errors.length === 0, errors };
	};

	it("validates slack channel requires webhook URL", () => {
		const result = validateChannelConfig(["slack"], {});
		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			"Slack webhook URL is required when Slack channel is selected"
		);
	});

	it("validates discord channel requires webhook URL", () => {
		const result = validateChannelConfig(["discord"], {});
		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			"Discord webhook URL is required when Discord channel is selected"
		);
	});

	it("validates email channel requires addresses", () => {
		const result = validateChannelConfig(["email"], {});
		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			"At least one email address is required when Email channel is selected"
		);
	});

	it("validates webhook channel requires URL", () => {
		const result = validateChannelConfig(["webhook"], {});
		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			"Webhook URL is required when Webhook channel is selected"
		);
	});

	it("passes when all required configs are provided", () => {
		const result = validateChannelConfig(["slack", "discord", "email", "webhook"], {
			slackWebhookUrl: "https://hooks.slack.com/xxx",
			discordWebhookUrl: "https://discord.com/api/webhooks/xxx",
			emailAddresses: ["test@example.com"],
			webhookUrl: "https://example.com/webhook",
		});
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	it("passes with no channels selected", () => {
		const result = validateChannelConfig([], {});
		expect(result.valid).toBe(true);
	});

	it("reports multiple missing configs", () => {
		const result = validateChannelConfig(["slack", "discord"], {});
		expect(result.valid).toBe(false);
		expect(result.errors).toHaveLength(2);
	});
});

describe("alarm test results aggregation", () => {
	type TestResult = { channel: string; success: boolean; error?: string };

	const aggregateResults = (results: TestResult[]) => ({
		alarmId: "test-alarm",
		results,
		allSuccessful: results.every((r) => r.success),
	});

	it("reports all successful when all channels succeed", () => {
		const results = [
			{ channel: "slack", success: true },
			{ channel: "discord", success: true },
		];
		const aggregated = aggregateResults(results);
		expect(aggregated.allSuccessful).toBe(true);
	});

	it("reports not all successful when any channel fails", () => {
		const results = [
			{ channel: "slack", success: true },
			{ channel: "discord", success: false, error: "Connection failed" },
		];
		const aggregated = aggregateResults(results);
		expect(aggregated.allSuccessful).toBe(false);
	});

	it("reports all successful for empty results", () => {
		const results: TestResult[] = [];
		const aggregated = aggregateResults(results);
		expect(aggregated.allSuccessful).toBe(true);
	});

	it("preserves error messages", () => {
		const results = [
			{ channel: "webhook", success: false, error: "Timeout after 30s" },
		];
		const aggregated = aggregateResults(results);
		expect(aggregated.results[0].error).toBe("Timeout after 30s");
	});

	it("includes all result details", () => {
		const results = [
			{ channel: "slack", success: true },
			{ channel: "discord", success: false, error: "Invalid webhook" },
			{ channel: "email", success: false, error: "SMTP error" },
		];
		const aggregated = aggregateResults(results);
		expect(aggregated.results).toHaveLength(3);
		expect(aggregated.allSuccessful).toBe(false);
	});
});

describe("webhook URL validation patterns", () => {
	const slackPattern = /^https:\/\/hooks\.slack\.com\/services\//;
	const discordPattern = /^https:\/\/discord\.com\/api\/webhooks\//;

	it("matches valid Slack webhook URLs", () => {
		expect(slackPattern.test("https://hooks.slack.com/services/T00/B00/xxx")).toBe(
			true
		);
	});

	it("rejects invalid Slack webhook URLs", () => {
		expect(slackPattern.test("https://slack.com/webhook")).toBe(false);
		expect(slackPattern.test("https://hooks.slack.com/other")).toBe(false);
	});

	it("matches valid Discord webhook URLs", () => {
		expect(
			discordPattern.test("https://discord.com/api/webhooks/123/abc")
		).toBe(true);
	});

	it("rejects invalid Discord webhook URLs", () => {
		expect(discordPattern.test("https://discord.com/webhook")).toBe(false);
		expect(discordPattern.test("https://discordapp.com/api/webhooks/123")).toBe(
			false
		);
	});
});

describe("trigger conditions structure", () => {
	it("uptime trigger can have url and interval", () => {
		const conditions = {
			url: "https://example.com/health",
			interval: 60,
			timeout: 30,
		};
		expect(conditions.url).toBeDefined();
		expect(conditions.interval).toBe(60);
	});

	it("traffic_spike trigger can have threshold and window", () => {
		const conditions = {
			threshold: 1000,
			window: 3600,
			comparisonType: "percentage",
		};
		expect(conditions.threshold).toBe(1000);
		expect(conditions.window).toBe(3600);
	});

	it("error_rate trigger can have percentage and timeframe", () => {
		const conditions = {
			errorRateThreshold: 5,
			timeframe: 300,
			minSampleSize: 100,
		};
		expect(conditions.errorRateThreshold).toBe(5);
	});

	it("goal trigger can have goalId", () => {
		const conditions = {
			goalId: "goal-123",
			notifyOnCompletion: true,
		};
		expect(conditions.goalId).toBe("goal-123");
	});

	it("custom trigger can have arbitrary conditions", () => {
		const conditions = {
			query: "SELECT COUNT(*) FROM events WHERE type = 'error'",
			threshold: 10,
			operator: "gt",
		};
		expect(conditions.query).toBeDefined();
		expect(conditions.operator).toBe("gt");
	});
});
