import { describe, expect, it } from "bun:test";
import { z } from "zod";

// Re-create schemas locally for testing (matching the router)
const notificationChannelSchema = z.enum([
	"slack",
	"discord",
	"email",
	"webhook",
]);

const triggerTypeSchema = z.enum([
	"uptime",
	"traffic_spike",
	"error_rate",
	"goal",
	"custom",
]);

const createAlarmSchema = z.object({
	organizationId: z.string(),
	websiteId: z.string().optional(),
	name: z.string().min(1).max(100),
	description: z.string().optional(),
	enabled: z.boolean().default(true),
	notificationChannels: z.array(notificationChannelSchema).min(1),
	slackWebhookUrl: z.string().url().optional(),
	discordWebhookUrl: z.string().url().optional(),
	emailAddresses: z.array(z.string().email()).optional(),
	webhookUrl: z.string().url().optional(),
	webhookHeaders: z.record(z.string(), z.string()).optional(),
	triggerType: triggerTypeSchema,
	triggerConditions: z.record(z.string(), z.unknown()),
});

const updateAlarmSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100).optional(),
	description: z.string().optional(),
	enabled: z.boolean().optional(),
	notificationChannels: z.array(notificationChannelSchema).min(1).optional(),
	slackWebhookUrl: z.string().url().optional(),
	discordWebhookUrl: z.string().url().optional(),
	emailAddresses: z.array(z.string().email()).optional(),
	webhookUrl: z.string().url().optional(),
	webhookHeaders: z.record(z.string(), z.string()).optional(),
	triggerType: triggerTypeSchema.optional(),
	triggerConditions: z.record(z.string(), z.unknown()).optional(),
});

describe("createAlarmSchema validation", () => {
	it("accepts valid minimal input", () => {
		const result = createAlarmSchema.safeParse({
			organizationId: "org-123",
			name: "Traffic Spike Alert",
			notificationChannels: ["slack"],
			slackWebhookUrl: "https://hooks.slack.com/services/xxx",
			triggerType: "traffic_spike",
			triggerConditions: { threshold: 1000 },
		});
		expect(result.success).toBe(true);
	});

	it("accepts valid input with all fields", () => {
		const result = createAlarmSchema.safeParse({
			organizationId: "org-123",
			websiteId: "site-456",
			name: "Multi-Channel Alert",
			description: "Alert for critical events",
			enabled: true,
			notificationChannels: ["slack", "discord", "email", "webhook"],
			slackWebhookUrl: "https://hooks.slack.com/services/xxx",
			discordWebhookUrl: "https://discord.com/api/webhooks/xxx",
			emailAddresses: ["admin@example.com", "ops@example.com"],
			webhookUrl: "https://api.example.com/webhook",
			webhookHeaders: { Authorization: "Bearer token123" },
			triggerType: "error_rate",
			triggerConditions: { threshold: 5, window: "5m" },
		});
		expect(result.success).toBe(true);
	});

	it("rejects empty name", () => {
		const result = createAlarmSchema.safeParse({
			organizationId: "org-123",
			name: "",
			notificationChannels: ["slack"],
			slackWebhookUrl: "https://hooks.slack.com/services/xxx",
			triggerType: "uptime",
			triggerConditions: {},
		});
		expect(result.success).toBe(false);
	});

	it("rejects name over 100 characters", () => {
		const result = createAlarmSchema.safeParse({
			organizationId: "org-123",
			name: "a".repeat(101),
			notificationChannels: ["slack"],
			slackWebhookUrl: "https://hooks.slack.com/services/xxx",
			triggerType: "uptime",
			triggerConditions: {},
		});
		expect(result.success).toBe(false);
	});

	it("rejects empty notification channels array", () => {
		const result = createAlarmSchema.safeParse({
			organizationId: "org-123",
			name: "Test Alarm",
			notificationChannels: [],
			triggerType: "uptime",
			triggerConditions: {},
		});
		expect(result.success).toBe(false);
	});

	it("rejects invalid notification channel", () => {
		const result = createAlarmSchema.safeParse({
			organizationId: "org-123",
			name: "Test Alarm",
			notificationChannels: ["invalid_channel"],
			triggerType: "uptime",
			triggerConditions: {},
		});
		expect(result.success).toBe(false);
	});

	it("rejects invalid webhook URL", () => {
		const result = createAlarmSchema.safeParse({
			organizationId: "org-123",
			name: "Test Alarm",
			notificationChannels: ["slack"],
			slackWebhookUrl: "not-a-url",
			triggerType: "uptime",
			triggerConditions: {},
		});
		expect(result.success).toBe(false);
	});

	it("rejects invalid email addresses", () => {
		const result = createAlarmSchema.safeParse({
			organizationId: "org-123",
			name: "Test Alarm",
			notificationChannels: ["email"],
			emailAddresses: ["not-an-email", "also-invalid"],
			triggerType: "uptime",
			triggerConditions: {},
		});
		expect(result.success).toBe(false);
	});

	it("accepts valid email addresses", () => {
		const result = createAlarmSchema.safeParse({
			organizationId: "org-123",
			name: "Test Alarm",
			notificationChannels: ["email"],
			emailAddresses: ["user@example.com", "admin@test.org"],
			triggerType: "uptime",
			triggerConditions: {},
		});
		expect(result.success).toBe(true);
	});

	it("rejects invalid trigger type", () => {
		const result = createAlarmSchema.safeParse({
			organizationId: "org-123",
			name: "Test Alarm",
			notificationChannels: ["slack"],
			slackWebhookUrl: "https://hooks.slack.com/services/xxx",
			triggerType: "invalid_trigger",
			triggerConditions: {},
		});
		expect(result.success).toBe(false);
	});

	it("accepts all valid trigger types", () => {
		const triggerTypes = [
			"uptime",
			"traffic_spike",
			"error_rate",
			"goal",
			"custom",
		];

		for (const triggerType of triggerTypes) {
			const result = createAlarmSchema.safeParse({
				organizationId: "org-123",
				name: "Test Alarm",
				notificationChannels: ["slack"],
				slackWebhookUrl: "https://hooks.slack.com/services/xxx",
				triggerType,
				triggerConditions: {},
			});
			expect(result.success).toBe(true);
		}
	});
});

describe("updateAlarmSchema validation", () => {
	it("accepts valid update with only id", () => {
		const result = updateAlarmSchema.safeParse({
			id: "alarm-123",
		});
		expect(result.success).toBe(true);
	});

	it("accepts valid partial update", () => {
		const result = updateAlarmSchema.safeParse({
			id: "alarm-123",
			name: "Updated Alarm Name",
			enabled: false,
		});
		expect(result.success).toBe(true);
	});

	it("accepts valid full update", () => {
		const result = updateAlarmSchema.safeParse({
			id: "alarm-123",
			name: "Updated Alarm",
			description: "New description",
			enabled: true,
			notificationChannels: ["discord"],
			discordWebhookUrl: "https://discord.com/api/webhooks/xxx",
			triggerType: "goal",
			triggerConditions: { goalId: "goal-456" },
		});
		expect(result.success).toBe(true);
	});

	it("requires id field", () => {
		const result = updateAlarmSchema.safeParse({
			name: "Updated Name",
		});
		expect(result.success).toBe(false);
	});

	it("rejects invalid name length in update", () => {
		const result = updateAlarmSchema.safeParse({
			id: "alarm-123",
			name: "a".repeat(101),
		});
		expect(result.success).toBe(false);
	});
});

describe("notification channel validation", () => {
	it("accepts all valid notification channels", () => {
		const channels = ["slack", "discord", "email", "webhook"];

		for (const channel of channels) {
			const result = notificationChannelSchema.safeParse(channel);
			expect(result.success).toBe(true);
		}
	});

	it("rejects invalid notification channels", () => {
		const invalidChannels = ["sms", "push", "telegram", "teams"];

		for (const channel of invalidChannels) {
			const result = notificationChannelSchema.safeParse(channel);
			expect(result.success).toBe(false);
		}
	});
});

describe("trigger type validation", () => {
	it("accepts all valid trigger types", () => {
		const types = ["uptime", "traffic_spike", "error_rate", "goal", "custom"];

		for (const type of types) {
			const result = triggerTypeSchema.safeParse(type);
			expect(result.success).toBe(true);
		}
	});

	it("rejects invalid trigger types", () => {
		const invalidTypes = ["downtime", "cpu_usage", "memory", "disk"];

		for (const type of invalidTypes) {
			const result = triggerTypeSchema.safeParse(type);
			expect(result.success).toBe(false);
		}
	});
});

describe("webhook headers validation", () => {
	it("accepts valid webhook headers", () => {
		const result = createAlarmSchema.safeParse({
			organizationId: "org-123",
			name: "Test Alarm",
			notificationChannels: ["webhook"],
			webhookUrl: "https://api.example.com/webhook",
			webhookHeaders: {
				Authorization: "Bearer token123",
				"Content-Type": "application/json",
				"X-Custom-Header": "value",
			},
			triggerType: "uptime",
			triggerConditions: {},
		});
		expect(result.success).toBe(true);
	});

	it("accepts empty webhook headers object", () => {
		const result = createAlarmSchema.safeParse({
			organizationId: "org-123",
			name: "Test Alarm",
			notificationChannels: ["webhook"],
			webhookUrl: "https://api.example.com/webhook",
			webhookHeaders: {},
			triggerType: "uptime",
			triggerConditions: {},
		});
		expect(result.success).toBe(true);
	});
});

describe("trigger conditions validation", () => {
	it("accepts various trigger condition structures", () => {
		const conditions = [
			{ threshold: 1000 },
			{ threshold: 5, window: "5m" },
			{ goalId: "goal-123" },
			{ errorType: "TypeError", count: 10 },
			{},
		];

		for (const triggerConditions of conditions) {
			const result = createAlarmSchema.safeParse({
				organizationId: "org-123",
				name: "Test Alarm",
				notificationChannels: ["slack"],
				slackWebhookUrl: "https://hooks.slack.com/services/xxx",
				triggerType: "custom",
				triggerConditions,
			});
			expect(result.success).toBe(true);
		}
	});
});
