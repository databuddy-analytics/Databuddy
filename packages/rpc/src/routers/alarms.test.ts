import { describe, expect, it } from "bun:test";

// Test constants
const NOTIFICATION_CHANNELS = ["slack", "discord", "email", "webhook"] as const;
const TRIGGER_TYPES = [
	"uptime",
	"traffic_spike",
	"error_rate",
	"goal",
	"custom",
] as const;

type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
type TriggerType = (typeof TRIGGER_TYPES)[number];

interface AlarmInput {
	name: string;
	description?: string;
	enabled?: boolean;
	websiteId?: string;
	notificationChannels: NotificationChannel[];
	slackWebhookUrl?: string;
	discordWebhookUrl?: string;
	emailAddresses?: string[];
	webhookUrl?: string;
	webhookHeaders?: Record<string, string>;
	triggerType: TriggerType;
	triggerConditions: Record<string, unknown>;
}

// Validation helpers
function validateAlarmInput(input: AlarmInput): {
	valid: boolean;
	errors: string[];
} {
	const errors: string[] = [];

	if (!input.name || input.name.length === 0) {
		errors.push("Name is required");
	}

	if (input.name && input.name.length > 255) {
		errors.push("Name must be 255 characters or less");
	}

	if (input.notificationChannels.length === 0) {
		errors.push("At least one notification channel is required");
	}

	for (const channel of input.notificationChannels) {
		if (!NOTIFICATION_CHANNELS.includes(channel)) {
			errors.push(`Invalid notification channel: ${channel}`);
		}
	}

	if (!TRIGGER_TYPES.includes(input.triggerType)) {
		errors.push(`Invalid trigger type: ${input.triggerType}`);
	}

	// Validate channel-specific URLs
	if (input.notificationChannels.includes("slack") && input.slackWebhookUrl) {
		if (!isValidUrl(input.slackWebhookUrl)) {
			errors.push("Invalid Slack webhook URL");
		}
	}

	if (
		input.notificationChannels.includes("discord") &&
		input.discordWebhookUrl
	) {
		if (!isValidUrl(input.discordWebhookUrl)) {
			errors.push("Invalid Discord webhook URL");
		}
	}

	if (input.notificationChannels.includes("webhook") && input.webhookUrl) {
		if (!isValidUrl(input.webhookUrl)) {
			errors.push("Invalid webhook URL");
		}
	}

	if (input.notificationChannels.includes("email") && input.emailAddresses) {
		for (const email of input.emailAddresses) {
			if (!isValidEmail(email)) {
				errors.push(`Invalid email address: ${email}`);
			}
		}
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}

function isValidUrl(url: string): boolean {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

function isValidEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function canAccessAlarm(
	alarm: { userId: string | null; organizationId: string | null },
	context: { userId?: string; organizationId?: string }
): boolean {
	if (alarm.userId && alarm.userId === context.userId) {
		return true;
	}
	if (alarm.organizationId && alarm.organizationId === context.organizationId) {
		return true;
	}
	return false;
}

describe("NOTIFICATION_CHANNELS constants", () => {
	it("contains all expected channels", () => {
		expect(NOTIFICATION_CHANNELS).toContain("slack");
		expect(NOTIFICATION_CHANNELS).toContain("discord");
		expect(NOTIFICATION_CHANNELS).toContain("email");
		expect(NOTIFICATION_CHANNELS).toContain("webhook");
	});

	it("has correct length", () => {
		expect(NOTIFICATION_CHANNELS.length).toBe(4);
	});
});

describe("TRIGGER_TYPES constants", () => {
	it("contains all expected trigger types", () => {
		expect(TRIGGER_TYPES).toContain("uptime");
		expect(TRIGGER_TYPES).toContain("traffic_spike");
		expect(TRIGGER_TYPES).toContain("error_rate");
		expect(TRIGGER_TYPES).toContain("goal");
		expect(TRIGGER_TYPES).toContain("custom");
	});

	it("has correct length", () => {
		expect(TRIGGER_TYPES.length).toBe(5);
	});
});

describe("validateAlarmInput", () => {
	it("validates a valid alarm input", () => {
		const input: AlarmInput = {
			name: "Test Alarm",
			notificationChannels: ["email"],
			triggerType: "uptime",
			triggerConditions: { threshold: 100 },
		};

		const result = validateAlarmInput(input);
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	it("rejects empty name", () => {
		const input: AlarmInput = {
			name: "",
			notificationChannels: ["email"],
			triggerType: "uptime",
			triggerConditions: {},
		};

		const result = validateAlarmInput(input);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Name is required");
	});

	it("rejects name longer than 255 characters", () => {
		const input: AlarmInput = {
			name: "a".repeat(256),
			notificationChannels: ["email"],
			triggerType: "uptime",
			triggerConditions: {},
		};

		const result = validateAlarmInput(input);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Name must be 255 characters or less");
	});

	it("rejects empty notification channels", () => {
		const input: AlarmInput = {
			name: "Test",
			notificationChannels: [],
			triggerType: "uptime",
			triggerConditions: {},
		};

		const result = validateAlarmInput(input);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			"At least one notification channel is required"
		);
	});

	it("rejects invalid trigger type", () => {
		const input = {
			name: "Test",
			notificationChannels: ["email"],
			triggerType: "invalid_type",
			triggerConditions: {},
		} as unknown as AlarmInput;

		const result = validateAlarmInput(input);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes("Invalid trigger type"))).toBe(
			true
		);
	});

	it("validates Slack webhook URL", () => {
		const input: AlarmInput = {
			name: "Test",
			notificationChannels: ["slack"],
			slackWebhookUrl: "invalid-url",
			triggerType: "uptime",
			triggerConditions: {},
		};

		const result = validateAlarmInput(input);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Invalid Slack webhook URL");
	});

	it("validates Discord webhook URL", () => {
		const input: AlarmInput = {
			name: "Test",
			notificationChannels: ["discord"],
			discordWebhookUrl: "not-a-url",
			triggerType: "uptime",
			triggerConditions: {},
		};

		const result = validateAlarmInput(input);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Invalid Discord webhook URL");
	});

	it("validates email addresses", () => {
		const input: AlarmInput = {
			name: "Test",
			notificationChannels: ["email"],
			emailAddresses: ["valid@example.com", "invalid-email"],
			triggerType: "uptime",
			triggerConditions: {},
		};

		const result = validateAlarmInput(input);
		expect(result.valid).toBe(false);
		expect(
			result.errors.some((e) => e.includes("Invalid email address"))
		).toBe(true);
	});

	it("accepts valid webhook URL", () => {
		const input: AlarmInput = {
			name: "Test",
			notificationChannels: ["webhook"],
			webhookUrl: "https://example.com/webhook",
			triggerType: "uptime",
			triggerConditions: {},
		};

		const result = validateAlarmInput(input);
		expect(result.valid).toBe(true);
	});
});

describe("isValidUrl", () => {
	it("accepts valid HTTPS URLs", () => {
		expect(isValidUrl("https://example.com")).toBe(true);
		expect(isValidUrl("https://hooks.slack.com/services/ABC/DEF")).toBe(true);
	});

	it("accepts valid HTTP URLs", () => {
		expect(isValidUrl("http://localhost:3000")).toBe(true);
	});

	it("rejects invalid URLs", () => {
		expect(isValidUrl("not-a-url")).toBe(false);
		expect(isValidUrl("")).toBe(false);
		expect(isValidUrl("ftp://example.com")).toBe(true); // FTP is valid URL
	});
});

describe("isValidEmail", () => {
	it("accepts valid email addresses", () => {
		expect(isValidEmail("user@example.com")).toBe(true);
		expect(isValidEmail("test.user+tag@domain.co.uk")).toBe(true);
	});

	it("rejects invalid email addresses", () => {
		expect(isValidEmail("invalid")).toBe(false);
		expect(isValidEmail("@example.com")).toBe(false);
		expect(isValidEmail("user@")).toBe(false);
		expect(isValidEmail("")).toBe(false);
	});
});

describe("canAccessAlarm", () => {
	it("allows access when userId matches", () => {
		const alarm = { userId: "user-123", organizationId: null };
		const context = { userId: "user-123" };

		expect(canAccessAlarm(alarm, context)).toBe(true);
	});

	it("allows access when organizationId matches", () => {
		const alarm = { userId: null, organizationId: "org-456" };
		const context = { userId: "user-123", organizationId: "org-456" };

		expect(canAccessAlarm(alarm, context)).toBe(true);
	});

	it("denies access when neither matches", () => {
		const alarm = { userId: "user-123", organizationId: "org-456" };
		const context = { userId: "user-999", organizationId: "org-999" };

		expect(canAccessAlarm(alarm, context)).toBe(false);
	});

	it("denies access when context is empty", () => {
		const alarm = { userId: "user-123", organizationId: "org-456" };
		const context = {};

		expect(canAccessAlarm(alarm, context)).toBe(false);
	});
});
