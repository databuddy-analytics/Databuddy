import { describe, expect, it } from "bun:test";
import {
	alarmFormSchema,
	createAlarmSchema,
	updateAlarmSchema,
	listAlarmsSchema,
	triggerTypeSchema,
	notificationChannelSchema,
} from "@databuddy/shared/alarms";

describe("Alarm validation schemas", () => {
	describe("notificationChannelSchema", () => {
		it("accepts valid channels", () => {
			expect(notificationChannelSchema.parse("slack")).toBe("slack");
			expect(notificationChannelSchema.parse("discord")).toBe("discord");
			expect(notificationChannelSchema.parse("email")).toBe("email");
			expect(notificationChannelSchema.parse("webhook")).toBe("webhook");
		});

		it("rejects invalid channels", () => {
			expect(() => notificationChannelSchema.parse("sms")).toThrow();
			expect(() => notificationChannelSchema.parse("")).toThrow();
		});
	});

	describe("triggerTypeSchema", () => {
		it("accepts valid trigger types", () => {
			expect(triggerTypeSchema.parse("uptime")).toBe("uptime");
			expect(triggerTypeSchema.parse("traffic_spike")).toBe("traffic_spike");
			expect(triggerTypeSchema.parse("error_rate")).toBe("error_rate");
			expect(triggerTypeSchema.parse("goal")).toBe("goal");
			expect(triggerTypeSchema.parse("custom")).toBe("custom");
		});

		it("rejects invalid trigger types", () => {
			expect(() => triggerTypeSchema.parse("invalid")).toThrow();
		});
	});

	describe("alarmFormSchema", () => {
		it("validates a minimal valid alarm", () => {
			const result = alarmFormSchema.parse({
				name: "Test Alarm",
				triggerType: "uptime",
			});
			expect(result.name).toBe("Test Alarm");
			expect(result.triggerType).toBe("uptime");
			expect(result.enabled).toBe(true);
			expect(result.notificationChannels).toEqual([]);
		});

		it("validates a full alarm form", () => {
			const result = alarmFormSchema.parse({
				name: "Full Alarm",
				description: "A complete alarm",
				enabled: false,
				notificationChannels: ["slack", "email"],
				slackWebhookUrl: "https://hooks.slack.com/services/test",
				discordWebhookUrl: "",
				emailAddresses: ["user@example.com"],
				webhookUrl: "",
				webhookHeaders: { Authorization: "Bearer token" },
				triggerType: "traffic_spike",
				triggerConditions: { threshold: 1000 },
			});
			expect(result.name).toBe("Full Alarm");
			expect(result.notificationChannels).toEqual(["slack", "email"]);
			expect(result.emailAddresses).toEqual(["user@example.com"]);
		});

		it("rejects empty name", () => {
			expect(() =>
				alarmFormSchema.parse({
					name: "",
					triggerType: "uptime",
				})
			).toThrow();
		});

		it("rejects name exceeding 100 characters", () => {
			expect(() =>
				alarmFormSchema.parse({
					name: "a".repeat(101),
					triggerType: "uptime",
				})
			).toThrow();
		});

		it("rejects invalid email addresses", () => {
			expect(() =>
				alarmFormSchema.parse({
					name: "Test",
					triggerType: "uptime",
					emailAddresses: ["not-an-email"],
				})
			).toThrow();
		});

		it("rejects invalid webhook URLs", () => {
			expect(() =>
				alarmFormSchema.parse({
					name: "Test",
					triggerType: "uptime",
					webhookUrl: "not-a-url",
				})
			).toThrow();
		});
	});

	describe("createAlarmSchema", () => {
		it("requires websiteId or organizationId", () => {
			expect(() =>
				createAlarmSchema.parse({
					name: "Test",
					triggerType: "uptime",
				})
			).toThrow("Either websiteId or organizationId must be provided");
		});

		it("accepts valid input with organizationId", () => {
			const result = createAlarmSchema.parse({
				name: "Test Alarm",
				triggerType: "uptime",
				organizationId: "org-123",
			});
			expect(result.organizationId).toBe("org-123");
		});

		it("accepts valid input with websiteId", () => {
			const result = createAlarmSchema.parse({
				name: "Test Alarm",
				triggerType: "error_rate",
				websiteId: "web-123",
			});
			expect(result.websiteId).toBe("web-123");
		});
	});

	describe("updateAlarmSchema", () => {
		it("requires id", () => {
			expect(() => updateAlarmSchema.parse({})).toThrow();
		});

		it("allows partial updates", () => {
			const result = updateAlarmSchema.parse({
				id: "alarm-123",
				name: "Updated Name",
			});
			expect(result.id).toBe("alarm-123");
			expect(result.name).toBe("Updated Name");
			expect(result.description).toBeUndefined();
		});

		it("validates optional fields when provided", () => {
			const result = updateAlarmSchema.parse({
				id: "alarm-123",
				enabled: false,
				notificationChannels: ["discord"],
				triggerType: "goal",
			});
			expect(result.enabled).toBe(false);
			expect(result.notificationChannels).toEqual(["discord"]);
			expect(result.triggerType).toBe("goal");
		});

		it("allows nullable fields", () => {
			const result = updateAlarmSchema.parse({
				id: "alarm-123",
				description: null,
				slackWebhookUrl: null,
				discordWebhookUrl: null,
				webhookUrl: null,
			});
			expect(result.description).toBeNull();
			expect(result.slackWebhookUrl).toBeNull();
		});
	});

	describe("listAlarmsSchema", () => {
		it("requires websiteId or organizationId", () => {
			expect(() => listAlarmsSchema.parse({})).toThrow(
				"Either websiteId or organizationId must be provided"
			);
		});

		it("accepts organizationId", () => {
			const result = listAlarmsSchema.parse({
				organizationId: "org-123",
			});
			expect(result.organizationId).toBe("org-123");
		});

		it("accepts websiteId", () => {
			const result = listAlarmsSchema.parse({
				websiteId: "web-123",
			});
			expect(result.websiteId).toBe("web-123");
		});
	});
});
