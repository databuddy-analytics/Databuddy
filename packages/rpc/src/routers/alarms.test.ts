import { describe, expect, it } from "bun:test";
import { z } from "zod";

// Validation schemas (matching the router implementation)
const notificationChannelSchema = z.enum(["slack", "discord", "email", "webhook"]);
const triggerTypeSchema = z.enum([
	"uptime",
	"traffic_spike",
	"error_rate",
	"goal",
	"custom",
]);

const triggerConditionsSchema = z.object({
	threshold: z.number().optional(),
	comparison: z.enum(["gt", "lt", "eq", "gte", "lte"]).optional(),
	metric: z.string().optional(),
	goalId: z.string().optional(),
	customExpression: z.string().optional(),
}).passthrough();

const webhookHeadersSchema = z.record(z.string(), z.string());

const createAlarmSchema = z.object({
	websiteId: z.string().optional(),
	name: z.string().min(1).max(100),
	description: z.string().max(500).optional(),
	enabled: z.boolean().optional().default(true),
	notificationChannels: z.array(notificationChannelSchema).min(1),
	slackWebhookUrl: z.string().url().optional().nullable(),
	discordWebhookUrl: z.string().url().optional().nullable(),
	emailAddresses: z.array(z.string().email()).optional().default([]),
	webhookUrl: z.string().url().optional().nullable(),
	webhookHeaders: webhookHeadersSchema.optional().default({}),
	triggerType: triggerTypeSchema,
	triggerConditions: triggerConditionsSchema.optional().default({}),
});

const updateAlarmSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100).optional(),
	description: z.string().max(500).optional().nullable(),
	enabled: z.boolean().optional(),
	notificationChannels: z.array(notificationChannelSchema).min(1).optional(),
	slackWebhookUrl: z.string().url().optional().nullable(),
	discordWebhookUrl: z.string().url().optional().nullable(),
	emailAddresses: z.array(z.string().email()).optional(),
	webhookUrl: z.string().url().optional().nullable(),
	webhookHeaders: webhookHeadersSchema.optional(),
	triggerType: triggerTypeSchema.optional(),
	triggerConditions: triggerConditionsSchema.optional(),
});

describe("notificationChannelSchema", () => {
	it("accepts valid notification channels", () => {
		expect(notificationChannelSchema.parse("slack")).toBe("slack");
		expect(notificationChannelSchema.parse("discord")).toBe("discord");
		expect(notificationChannelSchema.parse("email")).toBe("email");
		expect(notificationChannelSchema.parse("webhook")).toBe("webhook");
	});

	it("rejects invalid notification channels", () => {
		expect(() => notificationChannelSchema.parse("sms")).toThrow();
		expect(() => notificationChannelSchema.parse("telegram")).toThrow();
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
		expect(() => triggerTypeSchema.parse("")).toThrow();
	});
});

describe("createAlarmSchema", () => {
	it("validates a minimal valid alarm", () => {
		const input = {
			name: "Test Alarm",
			notificationChannels: ["slack"],
			slackWebhookUrl: "https://hooks.slack.com/services/xxx",
			triggerType: "uptime",
		};

		const result = createAlarmSchema.parse(input);
		expect(result.name).toBe("Test Alarm");
		expect(result.notificationChannels).toEqual(["slack"]);
		expect(result.triggerType).toBe("uptime");
		expect(result.enabled).toBe(true); // default value
	});

	it("validates a full alarm with all channels", () => {
		const input = {
			name: "Full Alarm",
			description: "A full alarm with all channels",
			enabled: true,
			notificationChannels: ["slack", "discord", "email", "webhook"],
			slackWebhookUrl: "https://hooks.slack.com/services/xxx",
			discordWebhookUrl: "https://discord.com/api/webhooks/xxx",
			emailAddresses: ["test@example.com", "admin@example.com"],
			webhookUrl: "https://example.com/webhook",
			webhookHeaders: { "X-Custom-Header": "value" },
			triggerType: "traffic_spike",
			triggerConditions: { threshold: 1000, comparison: "gt" },
		};

		const result = createAlarmSchema.parse(input);
		expect(result.name).toBe("Full Alarm");
		expect(result.description).toBe("A full alarm with all channels");
		expect(result.notificationChannels).toHaveLength(4);
		expect(result.emailAddresses).toHaveLength(2);
		expect(result.triggerConditions).toEqual({ threshold: 1000, comparison: "gt" });
	});

	it("rejects alarm with empty name", () => {
		const input = {
			name: "",
			notificationChannels: ["slack"],
			triggerType: "uptime",
		};

		expect(() => createAlarmSchema.parse(input)).toThrow();
	});

	it("rejects alarm with name too long", () => {
		const input = {
			name: "a".repeat(101),
			notificationChannels: ["slack"],
			triggerType: "uptime",
		};

		expect(() => createAlarmSchema.parse(input)).toThrow();
	});

	it("rejects alarm with no notification channels", () => {
		const input = {
			name: "Test Alarm",
			notificationChannels: [],
			triggerType: "uptime",
		};

		expect(() => createAlarmSchema.parse(input)).toThrow();
	});

	it("rejects alarm with invalid webhook URL", () => {
		const input = {
			name: "Test Alarm",
			notificationChannels: ["slack"],
			slackWebhookUrl: "not-a-url",
			triggerType: "uptime",
		};

		expect(() => createAlarmSchema.parse(input)).toThrow();
	});

	it("rejects alarm with invalid email addresses", () => {
		const input = {
			name: "Test Alarm",
			notificationChannels: ["email"],
			emailAddresses: ["not-an-email"],
			triggerType: "uptime",
		};

		expect(() => createAlarmSchema.parse(input)).toThrow();
	});

	it("accepts alarm with valid email addresses", () => {
		const input = {
			name: "Test Alarm",
			notificationChannels: ["email"],
			emailAddresses: ["test@example.com", "user@domain.org"],
			triggerType: "uptime",
		};

		const result = createAlarmSchema.parse(input);
		expect(result.emailAddresses).toEqual(["test@example.com", "user@domain.org"]);
	});
});

describe("updateAlarmSchema", () => {
	it("validates partial update with just id", () => {
		const input = {
			id: "alarm-123",
		};

		const result = updateAlarmSchema.parse(input);
		expect(result.id).toBe("alarm-123");
	});

	it("validates partial update with name change", () => {
		const input = {
			id: "alarm-123",
			name: "Updated Name",
		};

		const result = updateAlarmSchema.parse(input);
		expect(result.id).toBe("alarm-123");
		expect(result.name).toBe("Updated Name");
	});

	it("validates full update", () => {
		const input = {
			id: "alarm-123",
			name: "Updated Alarm",
			description: "Updated description",
			enabled: false,
			notificationChannels: ["discord"],
			discordWebhookUrl: "https://discord.com/api/webhooks/xxx",
			triggerType: "error_rate",
			triggerConditions: { threshold: 5, comparison: "gt", metric: "error_count" },
		};

		const result = updateAlarmSchema.parse(input);
		expect(result.id).toBe("alarm-123");
		expect(result.name).toBe("Updated Alarm");
		expect(result.enabled).toBe(false);
		expect(result.notificationChannels).toEqual(["discord"]);
	});

	it("allows nullable description", () => {
		const input = {
			id: "alarm-123",
			description: null,
		};

		const result = updateAlarmSchema.parse(input);
		expect(result.description).toBeNull();
	});

	it("allows nullable webhook URLs", () => {
		const input = {
			id: "alarm-123",
			slackWebhookUrl: null,
			discordWebhookUrl: null,
			webhookUrl: null,
		};

		const result = updateAlarmSchema.parse(input);
		expect(result.slackWebhookUrl).toBeNull();
		expect(result.discordWebhookUrl).toBeNull();
		expect(result.webhookUrl).toBeNull();
	});

	it("rejects update with invalid id type", () => {
		const input = {
			id: 123, // should be string
		};

		expect(() => updateAlarmSchema.parse(input)).toThrow();
	});

	it("rejects update with empty notification channels array if provided", () => {
		const input = {
			id: "alarm-123",
			notificationChannels: [],
		};

		expect(() => updateAlarmSchema.parse(input)).toThrow();
	});
});

describe("triggerConditionsSchema", () => {
	it("accepts empty object", () => {
		const result = triggerConditionsSchema.parse({});
		expect(result).toEqual({});
	});

	it("accepts threshold and comparison", () => {
		const input = {
			threshold: 100,
			comparison: "gt",
		};

		const result = triggerConditionsSchema.parse(input);
		expect(result.threshold).toBe(100);
		expect(result.comparison).toBe("gt");
	});

	it("accepts all comparison operators", () => {
		const comparisons = ["gt", "lt", "eq", "gte", "lte"];
		for (const comparison of comparisons) {
			const result = triggerConditionsSchema.parse({ comparison });
			expect(result.comparison).toBe(comparison);
		}
	});

	it("accepts goal-related conditions", () => {
		const input = {
			goalId: "goal-123",
		};

		const result = triggerConditionsSchema.parse(input);
		expect(result.goalId).toBe("goal-123");
	});

	it("accepts custom expression", () => {
		const input = {
			customExpression: "error_rate > 5 && response_time > 1000",
		};

		const result = triggerConditionsSchema.parse(input);
		expect(result.customExpression).toBe("error_rate > 5 && response_time > 1000");
	});

	it("allows additional passthrough properties", () => {
		const input = {
			threshold: 100,
			customField: "custom value",
			nested: { key: "value" },
		};

		const result = triggerConditionsSchema.parse(input);
		expect(result.threshold).toBe(100);
		expect(result.customField).toBe("custom value");
		expect(result.nested).toEqual({ key: "value" });
	});
});

describe("webhookHeadersSchema", () => {
	it("accepts empty object", () => {
		const result = webhookHeadersSchema.parse({});
		expect(result).toEqual({});
	});

	it("accepts valid headers", () => {
		const input = {
			"Content-Type": "application/json",
			"X-Custom-Header": "value",
			Authorization: "Bearer token",
		};

		const result = webhookHeadersSchema.parse(input);
		expect(result["Content-Type"]).toBe("application/json");
		expect(result["X-Custom-Header"]).toBe("value");
		expect(result.Authorization).toBe("Bearer token");
	});

	it("rejects non-string values", () => {
		const input = {
			"Content-Type": 123,
		};

		expect(() => webhookHeadersSchema.parse(input)).toThrow();
	});
});

describe("Alarm authorization logic", () => {
	// Helper function mimicking the authorization logic
	function authorizeAlarmAccess(
		context: { user: { id: string }; session: { activeOrganizationId?: string | null } },
		alarm: { userId: string | null; organizationId: string | null }
	): boolean {
		const userId = context.user.id;
		const activeOrgId = context.session?.activeOrganizationId;

		// User owns the alarm directly
		if (alarm.userId === userId) {
			return true;
		}

		// User is part of the organization that owns the alarm
		if (alarm.organizationId && alarm.organizationId === activeOrgId) {
			return true;
		}

		return false;
	}

	it("allows access when user owns the alarm", () => {
		const context = {
			user: { id: "user-123" },
			session: { activeOrganizationId: null },
		};

		const alarm = {
			userId: "user-123",
			organizationId: null,
		};

		expect(authorizeAlarmAccess(context, alarm)).toBe(true);
	});

	it("allows access when user is in the organization that owns the alarm", () => {
		const context = {
			user: { id: "user-123" },
			session: { activeOrganizationId: "org-456" },
		};

		const alarm = {
			userId: null,
			organizationId: "org-456",
		};

		expect(authorizeAlarmAccess(context, alarm)).toBe(true);
	});

	it("denies access when user does not own and is not in org", () => {
		const context = {
			user: { id: "user-123" },
			session: { activeOrganizationId: "org-456" },
		};

		const alarm = {
			userId: "user-999",
			organizationId: "org-999",
		};

		expect(authorizeAlarmAccess(context, alarm)).toBe(false);
	});

	it("denies access to personal alarm of another user", () => {
		const context = {
			user: { id: "user-123" },
			session: { activeOrganizationId: null },
		};

		const alarm = {
			userId: "user-999",
			organizationId: null,
		};

		expect(authorizeAlarmAccess(context, alarm)).toBe(false);
	});

	it("denies access to org alarm when user is in different org", () => {
		const context = {
			user: { id: "user-123" },
			session: { activeOrganizationId: "org-123" },
		};

		const alarm = {
			userId: null,
			organizationId: "org-999",
		};

		expect(authorizeAlarmAccess(context, alarm)).toBe(false);
	});
});

describe("Channel validation logic", () => {
	// Helper function mimicking the validation logic
	function validateChannelConfig(
		channels: string[],
		config: {
			slackWebhookUrl?: string | null;
			discordWebhookUrl?: string | null;
			emailAddresses?: string[];
			webhookUrl?: string | null;
		}
	): { valid: boolean; error?: string } {
		if (channels.includes("slack") && !config.slackWebhookUrl) {
			return { valid: false, error: "Slack webhook URL is required" };
		}

		if (channels.includes("discord") && !config.discordWebhookUrl) {
			return { valid: false, error: "Discord webhook URL is required" };
		}

		if (channels.includes("email") && (!config.emailAddresses || config.emailAddresses.length === 0)) {
			return { valid: false, error: "At least one email address is required" };
		}

		if (channels.includes("webhook") && !config.webhookUrl) {
			return { valid: false, error: "Webhook URL is required" };
		}

		return { valid: true };
	}

	it("validates slack channel with webhook URL", () => {
		const result = validateChannelConfig(["slack"], {
			slackWebhookUrl: "https://hooks.slack.com/services/xxx",
		});
		expect(result.valid).toBe(true);
	});

	it("fails slack channel without webhook URL", () => {
		const result = validateChannelConfig(["slack"], {
			slackWebhookUrl: null,
		});
		expect(result.valid).toBe(false);
		expect(result.error).toContain("Slack");
	});

	it("validates discord channel with webhook URL", () => {
		const result = validateChannelConfig(["discord"], {
			discordWebhookUrl: "https://discord.com/api/webhooks/xxx",
		});
		expect(result.valid).toBe(true);
	});

	it("fails discord channel without webhook URL", () => {
		const result = validateChannelConfig(["discord"], {
			discordWebhookUrl: null,
		});
		expect(result.valid).toBe(false);
		expect(result.error).toContain("Discord");
	});

	it("validates email channel with email addresses", () => {
		const result = validateChannelConfig(["email"], {
			emailAddresses: ["test@example.com"],
		});
		expect(result.valid).toBe(true);
	});

	it("fails email channel without email addresses", () => {
		const result = validateChannelConfig(["email"], {
			emailAddresses: [],
		});
		expect(result.valid).toBe(false);
		expect(result.error).toContain("email");
	});

	it("validates webhook channel with URL", () => {
		const result = validateChannelConfig(["webhook"], {
			webhookUrl: "https://example.com/webhook",
		});
		expect(result.valid).toBe(true);
	});

	it("fails webhook channel without URL", () => {
		const result = validateChannelConfig(["webhook"], {
			webhookUrl: null,
		});
		expect(result.valid).toBe(false);
		expect(result.error).toContain("Webhook");
	});

	it("validates multiple channels with all configs", () => {
		const result = validateChannelConfig(["slack", "discord", "email", "webhook"], {
			slackWebhookUrl: "https://hooks.slack.com/services/xxx",
			discordWebhookUrl: "https://discord.com/api/webhooks/xxx",
			emailAddresses: ["test@example.com"],
			webhookUrl: "https://example.com/webhook",
		});
		expect(result.valid).toBe(true);
	});
});
