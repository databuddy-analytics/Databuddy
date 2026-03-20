import { describe, expect, it } from "bun:test";
import { z } from "zod";

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
	name: z.string().min(1).max(200),
	description: z.string().max(1000).optional(),
	enabled: z.boolean().optional(),
	notificationChannels: z.array(notificationChannelSchema).min(1),
	slackWebhookUrl: z.string().url().optional(),
	discordWebhookUrl: z.string().url().optional(),
	emailAddresses: z.array(z.string().email()).optional(),
	webhookUrl: z.string().url().optional(),
	webhookHeaders: z.record(z.string(), z.string()).optional(),
	triggerType: triggerTypeSchema,
	triggerConditions: z.record(z.string(), z.unknown()).optional(),
});

const updateAlarmSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(200).optional(),
	description: z.string().max(1000).optional(),
	enabled: z.boolean().optional(),
	websiteId: z.string().nullish(),
	notificationChannels: z.array(notificationChannelSchema).min(1).optional(),
	slackWebhookUrl: z.string().url().nullish(),
	discordWebhookUrl: z.string().url().nullish(),
	emailAddresses: z.array(z.string().email()).nullish(),
	webhookUrl: z.string().url().nullish(),
	webhookHeaders: z.record(z.string(), z.string()).nullish(),
	triggerType: triggerTypeSchema.optional(),
	triggerConditions: z.record(z.string(), z.unknown()).nullish(),
});

describe("Alarm validation schemas", () => {
	describe("createAlarmSchema", () => {
		it("should validate a valid alarm creation payload", () => {
			const valid = createAlarmSchema.safeParse({
				organizationId: "org-123",
				name: "Site Down Alert",
				notificationChannels: ["slack"],
				slackWebhookUrl: "https://hooks.slack.com/services/T/B/X",
				triggerType: "uptime",
				triggerConditions: { consecutiveFailures: 3 },
			});
			expect(valid.success).toBe(true);
		});

		it("should reject empty name", () => {
			const invalid = createAlarmSchema.safeParse({
				organizationId: "org-123",
				name: "",
				notificationChannels: ["slack"],
				triggerType: "uptime",
			});
			expect(invalid.success).toBe(false);
		});

		it("should reject name exceeding max length", () => {
			const invalid = createAlarmSchema.safeParse({
				organizationId: "org-123",
				name: "a".repeat(201),
				notificationChannels: ["slack"],
				triggerType: "uptime",
			});
			expect(invalid.success).toBe(false);
		});

		it("should reject empty notification channels", () => {
			const invalid = createAlarmSchema.safeParse({
				organizationId: "org-123",
				name: "Test Alarm",
				notificationChannels: [],
				triggerType: "uptime",
			});
			expect(invalid.success).toBe(false);
		});

		it("should reject invalid notification channel", () => {
			const invalid = createAlarmSchema.safeParse({
				organizationId: "org-123",
				name: "Test Alarm",
				notificationChannels: ["sms"],
				triggerType: "uptime",
			});
			expect(invalid.success).toBe(false);
		});

		it("should reject invalid trigger type", () => {
			const invalid = createAlarmSchema.safeParse({
				organizationId: "org-123",
				name: "Test Alarm",
				notificationChannels: ["slack"],
				triggerType: "invalid_type",
			});
			expect(invalid.success).toBe(false);
		});

		it("should reject invalid webhook URLs", () => {
			const invalid = createAlarmSchema.safeParse({
				organizationId: "org-123",
				name: "Test Alarm",
				notificationChannels: ["slack"],
				slackWebhookUrl: "not-a-url",
				triggerType: "uptime",
			});
			expect(invalid.success).toBe(false);
		});

		it("should reject invalid email addresses", () => {
			const invalid = createAlarmSchema.safeParse({
				organizationId: "org-123",
				name: "Test Alarm",
				notificationChannels: ["email"],
				emailAddresses: ["not-an-email"],
				triggerType: "uptime",
			});
			expect(invalid.success).toBe(false);
		});

		it("should accept multiple notification channels", () => {
			const valid = createAlarmSchema.safeParse({
				organizationId: "org-123",
				name: "Multi-Channel Alert",
				notificationChannels: ["slack", "discord", "email", "webhook"],
				slackWebhookUrl: "https://hooks.slack.com/services/T/B/X",
				discordWebhookUrl: "https://discord.com/api/webhooks/123/abc",
				emailAddresses: ["admin@example.com"],
				webhookUrl: "https://example.com/webhook",
				triggerType: "traffic_spike",
			});
			expect(valid.success).toBe(true);
		});

		it("should accept all trigger types", () => {
			const triggerTypes = [
				"uptime",
				"traffic_spike",
				"error_rate",
				"goal",
				"custom",
			] as const;

			for (const triggerType of triggerTypes) {
				const result = createAlarmSchema.safeParse({
					organizationId: "org-123",
					name: `${triggerType} alarm`,
					notificationChannels: ["slack"],
					triggerType,
				});
				expect(result.success).toBe(true);
			}
		});

		it("should accept optional websiteId", () => {
			const valid = createAlarmSchema.safeParse({
				organizationId: "org-123",
				websiteId: "site-456",
				name: "Site Alert",
				notificationChannels: ["slack"],
				triggerType: "uptime",
			});
			expect(valid.success).toBe(true);
		});
	});

	describe("updateAlarmSchema", () => {
		it("should validate a valid update payload", () => {
			const valid = updateAlarmSchema.safeParse({
				id: "alarm-123",
				name: "Updated Alert Name",
				enabled: false,
			});
			expect(valid.success).toBe(true);
		});

		it("should require the id field", () => {
			const invalid = updateAlarmSchema.safeParse({
				name: "Updated Alert Name",
			});
			expect(invalid.success).toBe(false);
		});

		it("should allow partial updates", () => {
			const valid = updateAlarmSchema.safeParse({
				id: "alarm-123",
				enabled: false,
			});
			expect(valid.success).toBe(true);
		});

		it("should allow setting fields to null", () => {
			const valid = updateAlarmSchema.safeParse({
				id: "alarm-123",
				slackWebhookUrl: null,
				discordWebhookUrl: null,
				webhookUrl: null,
			});
			expect(valid.success).toBe(true);
		});

		it("should reject invalid webhook URL on update", () => {
			const invalid = updateAlarmSchema.safeParse({
				id: "alarm-123",
				slackWebhookUrl: "not-a-url",
			});
			expect(invalid.success).toBe(false);
		});
	});
});
