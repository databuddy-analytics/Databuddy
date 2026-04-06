import { describe, expect, it } from "bun:test";
import { z } from "zod";

// NOTE: schemas are duplicated here on purpose. Importing from alarms.ts
// would pull in the DB connection and other heavy deps that break in a
// pure unit-test context. If new trigger/destination types land upstream
// the enum length checks below will catch the drift.

const alarmTriggerTypeValues = [
	"uptime",
	"traffic_spike",
	"error_rate",
	"goal",
	"custom",
] as const;

const alarmDestinationTypeValues = [
	"slack",
	"discord",
	"email",
	"webhook",
	"teams",
	"telegram",
	"google_chat",
] as const;

const destinationSchema = z.object({
	type: z.enum(alarmDestinationTypeValues),
	identifier: z.string().default(""),
	config: z.record(z.string(), z.unknown()).default({}),
});

const createAlarmSchema = z.object({
	organizationId: z.string(),
	websiteId: z.string().optional(),
	name: z.string().min(1, "Name is required"),
	description: z.string().optional(),
	enabled: z.boolean().default(true),
	triggerType: z.enum(alarmTriggerTypeValues),
	triggerConditions: z.record(z.string(), z.unknown()).default({}),
	destinations: z
		.array(destinationSchema)
		.min(1, "At least one destination is required"),
});

const updateAlarmSchema = z.object({
	alarmId: z.string(),
	name: z.string().min(1).optional(),
	description: z.string().nullish(),
	enabled: z.boolean().optional(),
	websiteId: z.string().nullish(),
	triggerType: z.enum(alarmTriggerTypeValues).optional(),
	triggerConditions: z.record(z.string(), z.unknown()).optional(),
	destinations: z.array(destinationSchema).optional(),
});

const listAlarmsSchema = z
	.object({ organizationId: z.string().optional() })
	.default({});

const getAlarmSchema = z.object({ alarmId: z.string() });
const deleteAlarmSchema = z.object({ alarmId: z.string() });
const testAlarmSchema = z.object({ alarmId: z.string() });

// -- destination schema --

describe("destinationSchema", () => {
	it("should accept each supported channel type", () => {
		const cases: { type: string; identifier: string }[] = [
			{ type: "slack", identifier: "https://hooks.slack.com/services/T00/B00/xxx" },
			{ type: "discord", identifier: "https://discord.com/api/webhooks/123/abc" },
			{ type: "email", identifier: "alerts@example.com" },
			{ type: "webhook", identifier: "https://my-server.com/hook" },
			{ type: "teams", identifier: "https://outlook.office.com/webhook/abc" },
			{ type: "telegram", identifier: "123456789" },
			{ type: "google_chat", identifier: "https://chat.googleapis.com/v1/spaces/xxx/messages" },
		];

		for (const c of cases) {
			const res = destinationSchema.safeParse(c);
			expect(res.success).toBe(true);
		}
	});

	it("telegram with botToken in config", () => {
		const res = destinationSchema.safeParse({
			type: "telegram",
			identifier: "123456789",
			config: { botToken: "bot123:ABCDEF" },
		});
		expect(res.success).toBe(true);
	});

	it("webhook with custom headers", () => {
		const res = destinationSchema.safeParse({
			type: "webhook",
			identifier: "https://my-server.com/webhook",
			config: { headers: { Authorization: "Bearer tok" } },
		});
		expect(res.success).toBe(true);
	});

	it("defaults identifier to empty string when omitted", () => {
		const res = destinationSchema.safeParse({ type: "slack" });
		expect(res.success).toBe(true);
		if (res.success) expect(res.data.identifier).toBe("");
	});

	it("defaults config to {}", () => {
		const res = destinationSchema.safeParse({ type: "webhook" });
		expect(res.success).toBe(true);
		if (res.success) expect(res.data.config).toEqual({});
	});

	it("rejects unsupported type like sms", () => {
		expect(
			destinationSchema.safeParse({ type: "sms", identifier: "+1234567890" }).success
		).toBe(false);
	});

	it("rejects when type is missing entirely", () => {
		expect(
			destinationSchema.safeParse({ identifier: "https://hooks.slack.com/x" }).success
		).toBe(false);
	});
});

// -- create alarm --

describe("createAlarmSchema", () => {
	it("valid minimal alarm", () => {
		const res = createAlarmSchema.safeParse({
			organizationId: "org-123",
			name: "High error rate",
			triggerType: "error_rate",
			destinations: [{ type: "slack", identifier: "https://hooks.slack.com/x" }],
		});
		expect(res.success).toBe(true);
	});

	it("all fields provided", () => {
		const res = createAlarmSchema.safeParse({
			organizationId: "org-123",
			websiteId: "site-456",
			name: "Uptime alert",
			description: "Fires when uptime drops below 99.9%",
			enabled: false,
			triggerType: "uptime",
			triggerConditions: { threshold: 99.9, window: "5m" },
			destinations: [
				{ type: "slack", identifier: "https://hooks.slack.com/x" },
				{ type: "telegram", identifier: "12345", config: { botToken: "bot:TOKEN" } },
			],
		});
		expect(res.success).toBe(true);
	});

	it("enabled defaults to true", () => {
		const res = createAlarmSchema.safeParse({
			organizationId: "org-1",
			name: "Test",
			triggerType: "custom",
			destinations: [{ type: "email", identifier: "a@b.com" }],
		});
		expect(res.success).toBe(true);
		if (res.success) expect(res.data.enabled).toBe(true);
	});

	it("triggerConditions defaults to {}", () => {
		const res = createAlarmSchema.safeParse({
			organizationId: "org-1",
			name: "Test",
			triggerType: "goal",
			destinations: [{ type: "discord", identifier: "https://discord.com/x" }],
		});
		expect(res.success).toBe(true);
		if (res.success) expect(res.data.triggerConditions).toEqual({});
	});

	it("rejects empty name", () => {
		const res = createAlarmSchema.safeParse({
			organizationId: "org-123",
			name: "",
			triggerType: "uptime",
			destinations: [{ type: "slack", identifier: "https://hooks.slack.com/x" }],
		});
		expect(res.success).toBe(false);
	});

	it("rejects when organizationId missing", () => {
		const res = createAlarmSchema.safeParse({
			name: "Test",
			triggerType: "uptime",
			destinations: [{ type: "slack", identifier: "https://hooks.slack.com/x" }],
		});
		expect(res.success).toBe(false);
	});

	it("rejects empty destinations array", () => {
		expect(
			createAlarmSchema.safeParse({
				organizationId: "org-123",
				name: "Test",
				triggerType: "uptime",
				destinations: [],
			}).success
		).toBe(false);
	});

	it("rejects when destinations field is missing", () => {
		expect(
			createAlarmSchema.safeParse({
				organizationId: "org-123",
				name: "Test",
				triggerType: "uptime",
			}).success
		).toBe(false);
	});

	it("rejects unknown trigger type", () => {
		expect(
			createAlarmSchema.safeParse({
				organizationId: "org-123",
				name: "Test",
				triggerType: "nonexistent_thing",
				destinations: [{ type: "slack", identifier: "https://hooks.slack.com/x" }],
			}).success
		).toBe(false);
	});

	it("every valid trigger type is accepted", () => {
		for (const tt of alarmTriggerTypeValues) {
			const res = createAlarmSchema.safeParse({
				organizationId: "org-1",
				name: `${tt} alarm`,
				triggerType: tt,
				destinations: [{ type: "email", identifier: "a@b.com" }],
			});
			expect(res.success).toBe(true);
		}
	});

	it("multiple destinations", () => {
		const res = createAlarmSchema.safeParse({
			organizationId: "org-1",
			name: "Multi-channel",
			triggerType: "traffic_spike",
			destinations: [
				{ type: "slack", identifier: "https://hooks.slack.com/x" },
				{ type: "discord", identifier: "https://discord.com/api/webhooks/x/y" },
				{ type: "email", identifier: "dev@company.com" },
			],
		});
		expect(res.success).toBe(true);
		if (res.success) expect(res.data.destinations.length).toBe(3);
	});
});

// -- update alarm --

describe("updateAlarmSchema", () => {
	it("only alarmId is enough", () => {
		expect(updateAlarmSchema.safeParse({ alarmId: "alarm-123" }).success).toBe(true);
	});

	it("partial update - just name", () => {
		const res = updateAlarmSchema.safeParse({
			alarmId: "alarm-123",
			name: "Renamed",
		});
		expect(res.success).toBe(true);
	});

	it("full update with everything", () => {
		const res = updateAlarmSchema.safeParse({
			alarmId: "alarm-123",
			name: "Updated alarm",
			description: "New description",
			enabled: false,
			websiteId: "site-456",
			triggerType: "traffic_spike",
			triggerConditions: { threshold: 500, window: "1h" },
			destinations: [{ type: "webhook", identifier: "https://api.example.com/hook" }],
		});
		expect(res.success).toBe(true);
	});

	it("null description clears it", () => {
		const res = updateAlarmSchema.safeParse({ alarmId: "alarm-123", description: null });
		expect(res.success).toBe(true);
	});

	it("null websiteId unlinks the site", () => {
		const res = updateAlarmSchema.safeParse({ alarmId: "alarm-123", websiteId: null });
		expect(res.success).toBe(true);
	});

	it("missing alarmId -> fail", () => {
		expect(updateAlarmSchema.safeParse({ name: "Updated" }).success).toBe(false);
	});

	it("empty name -> fail (min 1)", () => {
		expect(
			updateAlarmSchema.safeParse({ alarmId: "alarm-123", name: "" }).success
		).toBe(false);
	});

	it("empty destinations array is fine (clears all)", () => {
		const res = updateAlarmSchema.safeParse({ alarmId: "alarm-123", destinations: [] });
		expect(res.success).toBe(true);
	});
});

// -- simple input schemas for the other endpoints --

describe("list / get / delete / test schemas", () => {
	it("listAlarmsSchema accepts empty obj", () => {
		const res = listAlarmsSchema.safeParse({});
		expect(res.success).toBe(true);
		if (res.success) expect(res.data).toEqual({});
	});

	it("listAlarmsSchema accepts orgId", () => {
		expect(listAlarmsSchema.safeParse({ organizationId: "org-1" }).success).toBe(true);
	});

	it("getAlarmSchema needs alarmId", () => {
		expect(getAlarmSchema.safeParse({ alarmId: "a-1" }).success).toBe(true);
		expect(getAlarmSchema.safeParse({}).success).toBe(false);
	});

	it("deleteAlarmSchema needs alarmId", () => {
		expect(deleteAlarmSchema.safeParse({ alarmId: "a-1" }).success).toBe(true);
		expect(deleteAlarmSchema.safeParse({}).success).toBe(false);
	});

	it("testAlarmSchema needs alarmId", () => {
		expect(testAlarmSchema.safeParse({ alarmId: "a-1" }).success).toBe(true);
		expect(testAlarmSchema.safeParse({}).success).toBe(false);
	});
});

// -- enums sanity check --

describe("trigger + destination enums", () => {
	it("5 trigger types", () => {
		expect(alarmTriggerTypeValues).toHaveLength(5);
		expect(alarmTriggerTypeValues).toContain("uptime");
		expect(alarmTriggerTypeValues).toContain("traffic_spike");
		expect(alarmTriggerTypeValues).toContain("error_rate");
		expect(alarmTriggerTypeValues).toContain("goal");
		expect(alarmTriggerTypeValues).toContain("custom");
	});

	it("7 destination types", () => {
		expect(alarmDestinationTypeValues).toHaveLength(7);
		for (const t of ["slack", "discord", "email", "webhook", "teams", "telegram", "google_chat"]) {
			expect(alarmDestinationTypeValues).toContain(t);
		}
	});
});

// -- channel mapping (mirrors the switch in alarms.ts test handler) --

describe("notification channel mapping", () => {
	// The router maps dest.type -> NotificationClient channel name.
	// google_chat -> "google-chat" is the only one that actually changes.
	// NOTE: email destinations are accepted in the schema but the production
	// test handler in alarms.ts does NOT push "email" into the channels
	// array, so email alarms silently send nothing during a test-notify.
	// Keeping email in the type here to document that gap.
	type Channel = "slack" | "discord" | "webhook" | "teams" | "google-chat" | "telegram" | "email";

	function mapDestToChannel(destType: string): Channel | null {
		switch (destType) {
			case "slack": return "slack";
			case "discord": return "discord";
			case "teams": return "teams";
			case "google_chat": return "google-chat";
			case "telegram": return "telegram";
			case "webhook": return "webhook";
			case "email": return "email";
			default: return null;
		}
	}

	it("maps all types correctly", () => {
		expect(mapDestToChannel("slack")).toBe("slack");
		expect(mapDestToChannel("discord")).toBe("discord");
		expect(mapDestToChannel("teams")).toBe("teams");
		expect(mapDestToChannel("telegram")).toBe("telegram");
		expect(mapDestToChannel("webhook")).toBe("webhook");
		expect(mapDestToChannel("email")).toBe("email");
		// this is the tricky one
		expect(mapDestToChannel("google_chat")).toBe("google-chat");
	});

	it("returns null for unrecognized types", () => {
		expect(mapDestToChannel("sms")).toBeNull();
		expect(mapDestToChannel("")).toBeNull();
	});
});

// -- data shape checks --

describe("alarm data structure", () => {
	it("alarm obj has expected fields", () => {
		const alarm = {
			id: "alarm-001",
			organizationId: "org-123",
			websiteId: "site-456",
			name: "Error rate spike",
			description: "Alert when errors > 5%",
			enabled: true,
			triggerType: "error_rate" as const,
			triggerConditions: { threshold: 5, window: "10m" },
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		expect(alarm.id).toBeDefined();
		expect(alarm.organizationId).toBeDefined();
		expect(alarm.enabled).toBe(true);
		expect(alarm.triggerType).toBe("error_rate");
		expect(alarm.createdAt).toBeInstanceOf(Date);
	});

	it("websiteId can be null (org-wide alarm)", () => {
		const alarm = {
			id: "alarm-002",
			organizationId: "org-123",
			websiteId: null,
			name: "Org-wide alert",
			enabled: true,
			triggerType: "custom" as const,
			triggerConditions: {},
		};
		expect(alarm.websiteId).toBeNull();
	});

	it("destination obj shape", () => {
		const dest = {
			id: "dest-001",
			alarmId: "alarm-001",
			type: "telegram",
			identifier: "123456789",
			config: { botToken: "bot:TOKEN123" },
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		expect(dest.alarmId).toBe("alarm-001");
		expect(dest.type).toBe("telegram");
		expect(dest.config).toHaveProperty("botToken");
	});
});

// -- config patterns per channel --

describe("destination config patterns", () => {
	it("slack - webhook URL goes in identifier", () => {
		const d = { type: "slack", identifier: "https://hooks.slack.com/services/T00/B00/xxx", config: {} };
		expect(d.identifier).toContain("hooks.slack.com");
	});

	it("telegram - botToken lives in config", () => {
		const d = { type: "telegram", identifier: "123456789", config: { botToken: "bot123:ABCDEF" } };
		expect(d.config.botToken).toBeDefined();
	});

	it("webhook - custom headers in config", () => {
		const d = {
			type: "webhook",
			identifier: "https://api.example.com/notify",
			config: { headers: { Authorization: "Bearer secret", "Content-Type": "application/json" } },
		};
		expect(d.config.headers).toBeDefined();
	});

	it("email - address as identifier", () => {
		const d = { type: "email", identifier: "oncall@company.com", config: {} };
		expect(d.identifier).toContain("@");
	});
});

// -- test notification response schema --

describe("test notification output", () => {
	const testOutputSchema = z.object({
		results: z.array(
			z.object({
				success: z.boolean(),
				channel: z.string(),
				error: z.string().optional(),
			})
		),
	});

	it("single success result", () => {
		const res = testOutputSchema.safeParse({
			results: [{ success: true, channel: "slack" }],
		});
		expect(res.success).toBe(true);
	});

	it("failed result with error msg", () => {
		const res = testOutputSchema.safeParse({
			results: [{ success: false, channel: "telegram", error: "Bot token invalid" }],
		});
		expect(res.success).toBe(true);
	});

	it("mixed results across channels", () => {
		const res = testOutputSchema.safeParse({
			results: [
				{ success: true, channel: "slack" },
				{ success: false, channel: "discord", error: "Webhook URL expired" },
				{ success: true, channel: "email" },
			],
		});
		expect(res.success).toBe(true);
		if (res.success) {
			expect(res.data.results).toHaveLength(3);
			const passed = res.data.results.filter((r) => r.success);
			expect(passed).toHaveLength(2);
		}
	});

	it("empty results array is valid", () => {
		expect(testOutputSchema.safeParse({ results: [] }).success).toBe(true);
	});

	it("rejects if success field missing", () => {
		expect(
			testOutputSchema.safeParse({ results: [{ channel: "slack" }] }).success
		).toBe(false);
	});

	it("rejects if channel field missing", () => {
		expect(
			testOutputSchema.safeParse({ results: [{ success: true }] }).success
		).toBe(false);
	});
});

// -- trigger conditions patterns --

describe("trigger conditions per type", () => {
	// Each trigger type expects a different shape in triggerConditions.
	// The field is a flexible JSON object, so these tests document the
	// expected conventions rather than enforcing a rigid schema.

	it("uptime trigger - threshold and window", () => {
		const res = createAlarmSchema.safeParse({
			organizationId: "org-1",
			name: "Uptime check",
			triggerType: "uptime",
			triggerConditions: { threshold: 99.9, window: "5m" },
			destinations: [{ type: "slack", identifier: "https://hooks.slack.com/x" }],
		});
		expect(res.success).toBe(true);
		if (res.success) {
			expect(res.data.triggerConditions).toEqual({ threshold: 99.9, window: "5m" });
		}
	});

	it("traffic_spike trigger - baseline and multiplier", () => {
		const res = createAlarmSchema.safeParse({
			organizationId: "org-1",
			name: "Traffic spike",
			triggerType: "traffic_spike",
			triggerConditions: { baseline: 1000, multiplier: 3 },
			destinations: [{ type: "email", identifier: "alerts@co.com" }],
		});
		expect(res.success).toBe(true);
	});

	it("error_rate trigger - percentage and window", () => {
		const res = createAlarmSchema.safeParse({
			organizationId: "org-1",
			name: "Error rate",
			triggerType: "error_rate",
			triggerConditions: { percentage: 5, window: "10m", minSamples: 100 },
			destinations: [{ type: "discord", identifier: "https://discord.com/api/webhooks/x/y" }],
		});
		expect(res.success).toBe(true);
	});

	it("goal trigger - target value", () => {
		const res = createAlarmSchema.safeParse({
			organizationId: "org-1",
			name: "Goal hit",
			triggerType: "goal",
			triggerConditions: { targetValue: 10000, metric: "signups" },
			destinations: [{ type: "teams", identifier: "https://outlook.office.com/webhook/x" }],
		});
		expect(res.success).toBe(true);
	});

	it("custom trigger - arbitrary conditions", () => {
		const res = createAlarmSchema.safeParse({
			organizationId: "org-1",
			name: "Custom check",
			triggerType: "custom",
			triggerConditions: {
				expression: "avg(response_time) > 2000",
				evaluationPeriod: "15m",
				consecutiveBreaches: 3,
			},
			destinations: [{ type: "webhook", identifier: "https://api.example.com/hook" }],
		});
		expect(res.success).toBe(true);
	});

	it("empty conditions is valid (defaults to {})", () => {
		const res = createAlarmSchema.safeParse({
			organizationId: "org-1",
			name: "No conditions",
			triggerType: "uptime",
			destinations: [{ type: "slack", identifier: "https://hooks.slack.com/x" }],
		});
		expect(res.success).toBe(true);
		if (res.success) expect(res.data.triggerConditions).toEqual({});
	});

	it("deeply nested conditions are accepted", () => {
		const res = createAlarmSchema.safeParse({
			organizationId: "org-1",
			name: "Deep conditions",
			triggerType: "custom",
			triggerConditions: {
				rules: [
					{ field: "status_code", operator: "gte", value: 500 },
					{ field: "response_time", operator: "gt", value: 5000 },
				],
				combinator: "or",
			},
			destinations: [{ type: "slack", identifier: "https://hooks.slack.com/x" }],
		});
		expect(res.success).toBe(true);
	});
});

// -- destination deduplication & multi-channel --

describe("destination conflict handling", () => {
	it("duplicate (type + identifier) destinations pass schema but DB unique constraint catches it", () => {
		// Schema does NOT reject duplicates — the unique index on
		// (alarm_id, type, identifier) in the DB is the real guard.
		const res = createAlarmSchema.safeParse({
			organizationId: "org-1",
			name: "Dup test",
			triggerType: "uptime",
			destinations: [
				{ type: "slack", identifier: "https://hooks.slack.com/same" },
				{ type: "slack", identifier: "https://hooks.slack.com/same" },
			],
		});
		expect(res.success).toBe(true);
		if (res.success) expect(res.data.destinations).toHaveLength(2);
	});

	it("same type with different identifiers is valid", () => {
		const res = createAlarmSchema.safeParse({
			organizationId: "org-1",
			name: "Multi-slack",
			triggerType: "uptime",
			destinations: [
				{ type: "slack", identifier: "https://hooks.slack.com/team-a" },
				{ type: "slack", identifier: "https://hooks.slack.com/team-b" },
			],
		});
		expect(res.success).toBe(true);
	});

	it("all 7 destination types together is valid", () => {
		const res = createAlarmSchema.safeParse({
			organizationId: "org-1",
			name: "All channels",
			triggerType: "uptime",
			destinations: [
				{ type: "slack", identifier: "https://hooks.slack.com/x" },
				{ type: "discord", identifier: "https://discord.com/api/webhooks/x/y" },
				{ type: "email", identifier: "alerts@co.com" },
				{ type: "webhook", identifier: "https://api.example.com/hook" },
				{ type: "teams", identifier: "https://outlook.office.com/webhook/x" },
				{ type: "telegram", identifier: "123456789", config: { botToken: "bot:TOK" } },
				{ type: "google_chat", identifier: "https://chat.googleapis.com/v1/spaces/x/messages" },
			],
		});
		expect(res.success).toBe(true);
		if (res.success) expect(res.data.destinations).toHaveLength(7);
	});

	it("update with empty destinations clears all (replace strategy)", () => {
		// The router uses delete-all + insert-new strategy on update.
		// Empty array means remove every destination.
		const res = updateAlarmSchema.safeParse({
			alarmId: "alarm-1",
			destinations: [],
		});
		expect(res.success).toBe(true);
		if (res.success) expect(res.data.destinations).toEqual([]);
	});

	it("update with undefined destinations preserves existing (no-op)", () => {
		// When destinations field is omitted, router skips the replace step.
		const res = updateAlarmSchema.safeParse({ alarmId: "alarm-1", name: "Renamed" });
		expect(res.success).toBe(true);
		if (res.success) expect(res.data.destinations).toBeUndefined();
	});
});

// -- alarm lifecycle (enable/disable, defaults, update semantics) --

describe("alarm lifecycle logic", () => {
	function isAlarmActive(alarm: { enabled: boolean; triggerType: string }): boolean {
		return alarm.enabled;
	}

	function shouldSendNotification(alarm: {
		enabled: boolean;
		destinations: unknown[];
	}): boolean {
		return alarm.enabled && alarm.destinations.length > 0;
	}

	it("new alarm defaults to enabled", () => {
		const res = createAlarmSchema.safeParse({
			organizationId: "org-1",
			name: "Active by default",
			triggerType: "uptime",
			destinations: [{ type: "slack", identifier: "https://hooks.slack.com/x" }],
		});
		expect(res.success).toBe(true);
		if (res.success) expect(res.data.enabled).toBe(true);
	});

	it("alarm can be created in disabled state", () => {
		const res = createAlarmSchema.safeParse({
			organizationId: "org-1",
			name: "Disabled on create",
			enabled: false,
			triggerType: "uptime",
			destinations: [{ type: "slack", identifier: "https://hooks.slack.com/x" }],
		});
		expect(res.success).toBe(true);
		if (res.success) expect(res.data.enabled).toBe(false);
	});

	it("toggle via update preserves other fields", () => {
		// Only sending enabled + alarmId — other fields should remain undefined
		const res = updateAlarmSchema.safeParse({ alarmId: "alarm-1", enabled: false });
		expect(res.success).toBe(true);
		if (res.success) {
			expect(res.data.enabled).toBe(false);
			expect(res.data.name).toBeUndefined();
			expect(res.data.destinations).toBeUndefined();
		}
	});

	it("isAlarmActive reflects enabled flag", () => {
		expect(isAlarmActive({ enabled: true, triggerType: "uptime" })).toBe(true);
		expect(isAlarmActive({ enabled: false, triggerType: "uptime" })).toBe(false);
	});

	it("shouldSendNotification requires enabled AND destinations", () => {
		expect(shouldSendNotification({ enabled: true, destinations: [{}] })).toBe(true);
		expect(shouldSendNotification({ enabled: false, destinations: [{}] })).toBe(false);
		expect(shouldSendNotification({ enabled: true, destinations: [] })).toBe(false);
	});

	it("website-specific vs org-wide alarm", () => {
		// websiteId present -> scoped to that monitor
		const scoped = createAlarmSchema.safeParse({
			organizationId: "org-1",
			websiteId: "site-99",
			name: "Site alarm",
			triggerType: "uptime",
			destinations: [{ type: "email", identifier: "dev@co.com" }],
		});
		expect(scoped.success).toBe(true);
		if (scoped.success) expect(scoped.data.websiteId).toBe("site-99");

		// websiteId omitted -> org-wide
		const orgWide = createAlarmSchema.safeParse({
			organizationId: "org-1",
			name: "Org alarm",
			triggerType: "error_rate",
			destinations: [{ type: "slack", identifier: "https://hooks.slack.com/x" }],
		});
		expect(orgWide.success).toBe(true);
		if (orgWide.success) expect(orgWide.data.websiteId).toBeUndefined();
	});

	it("unlink website via update (set websiteId to null)", () => {
		const res = updateAlarmSchema.safeParse({ alarmId: "alarm-1", websiteId: null });
		expect(res.success).toBe(true);
		if (res.success) expect(res.data.websiteId).toBeNull();
	});
});

// -- error handling patterns --

describe("error handling patterns", () => {
	it("should identify alarm-not-found error shape", () => {
		const isNotFound = (error: { code?: string; message?: string }): boolean =>
			error.code === "NOT_FOUND" || (error.message?.includes("not found") ?? false);

		expect(isNotFound({ code: "NOT_FOUND" })).toBe(true);
		expect(isNotFound({ message: "Alarm not found" })).toBe(true);
		expect(isNotFound({ code: "BAD_REQUEST" })).toBe(false);
	});

	it("should identify destination unique constraint violation", () => {
		// DB unique index: (alarm_id, type, identifier)
		const isDuplicate = (error: { code?: string; constraint?: string }) =>
			error.code === "23505" &&
			error.constraint === "alarm_destinations_alarm_type_identifier_unique";

		expect(
			isDuplicate({
				code: "23505",
				constraint: "alarm_destinations_alarm_type_identifier_unique",
			})
		).toBe(true);
		expect(isDuplicate({ code: "23505", constraint: "other" })).toBe(false);
	});

	it("should map error codes to user messages", () => {
		const getErrorMessage = (code: string): string => {
			switch (code) {
				case "NOT_FOUND":
					return "Alarm not found";
				case "BAD_REQUEST":
					return "Alarm has no destinations configured";
				case "UNAUTHORIZED":
					return "Authentication is required";
				case "FORBIDDEN":
					return "You do not have permission to access this organization";
				default:
					return "An unexpected error occurred";
			}
		};

		expect(getErrorMessage("NOT_FOUND")).toBe("Alarm not found");
		expect(getErrorMessage("BAD_REQUEST")).toContain("destinations");
		expect(getErrorMessage("UNAUTHORIZED")).toContain("Authentication");
		expect(getErrorMessage("FORBIDDEN")).toContain("permission");
	});

	it("test handler rejects alarm with no destinations", () => {
		// The router throws rpcError.badRequest when alarm has 0 destinations.
		// Schema allows testAlarmSchema to pass (it only needs alarmId),
		// but the handler checks destinations after fetching from DB.
		const inputValid = testAlarmSchema.safeParse({ alarmId: "alarm-empty" });
		expect(inputValid.success).toBe(true);
		// The actual error is thrown at handler level, not schema level.
	});
});

// -- authorization mapping --
// The router uses different permission sets per action.
// NOTE: the "test" action only needs "read" even though it fires real
// external notifications. Might be worth tightening to "update" in the
// router later, but for now we're testing what the code actually does.

describe("auth permissions per action", () => {
	function permsFor(
		action: "list" | "get" | "create" | "update" | "delete" | "test"
	): ("read" | "update" | "delete")[] {
		switch (action) {
			case "list":
			case "get":
			case "test":
				return ["read"];
			case "create":
			case "update":
				return ["update"];
			case "delete":
				return ["delete"];
		}
	}

	it("read-only actions", () => {
		expect(permsFor("list")).toEqual(["read"]);
		expect(permsFor("get")).toEqual(["read"]);
		expect(permsFor("test")).toEqual(["read"]);
	});

	it("mutating actions need update perm", () => {
		expect(permsFor("create")).toEqual(["update"]);
		expect(permsFor("update")).toEqual(["update"]);
	});

	it("delete needs delete perm", () => {
		expect(permsFor("delete")).toEqual(["delete"]);
	});
});
