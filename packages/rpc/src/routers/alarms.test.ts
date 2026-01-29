import { describe, expect, it } from "bun:test";
import type { NotificationPayload, NotificationResult } from "@databuddy/notifications";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import {
	alarmSchemas,
	createAlarmHandlers,
	sendAlarmTestNotification,
	type AlarmRecordShape,
} from "./alarms-shared";

const { createAlarmInputSchema } = alarmSchemas;

type AlarmRecord = AlarmRecordShape;

type CreateAlarmInput = z.infer<typeof createAlarmInputSchema>;

type UpdateAlarmInput = z.infer<typeof alarmSchemas.updateAlarmInputSchema>;

type ListAlarmInput = z.infer<typeof alarmSchemas.listAlarmsInputSchema>;

type AlarmStore = {
	list: (userId: string, filters: ListAlarmInput) => Promise<AlarmRecord[]>;
	get: (userId: string, id: string) => Promise<AlarmRecord | null>;
	create: (userId: string, input: CreateAlarmInput) => Promise<AlarmRecord>;
	update: (userId: string, input: UpdateAlarmInput) => Promise<AlarmRecord | null>;
	delete: (userId: string, id: string) => Promise<AlarmRecord | null>;
};

function createInMemoryStore(): AlarmStore {
	const data: AlarmRecord[] = [];
	let counter = 1;

	const createRecord = (
		userId: string,
		input: CreateAlarmInput
	): AlarmRecord => {
		const now = new Date();
		return {
			id: `alarm-${counter++}`,
			userId,
			organizationId: input.organizationId,
			websiteId: input.websiteId ?? null,
			name: input.name,
			description: input.description ?? null,
			enabled: input.enabled ?? true,
			notificationChannels: input.notificationChannels,
			slackWebhookUrl: input.slackWebhookUrl ?? null,
			discordWebhookUrl: input.discordWebhookUrl ?? null,
			emailAddresses: input.emailAddresses,
			webhookUrl: input.webhookUrl ?? null,
			webhookHeaders: input.webhookHeaders,
			triggerType: input.triggerType,
			triggerConditions: input.triggerConditions,
			createdAt: now,
			updatedAt: now,
		};
	};

	return {
		list: async (userId, filters) => {
			return data.filter((alarm) => {
				if (alarm.userId !== userId) {
					return false;
				}
				if (filters.organizationId && alarm.organizationId !== filters.organizationId) {
					return false;
				}
				if (filters.websiteId && alarm.websiteId !== filters.websiteId) {
					return false;
				}
				return true;
			});
		},
		get: async (userId, id) =>
			data.find((alarm) => alarm.userId === userId && alarm.id === id) ?? null,
		create: async (userId, input) => {
			const record = createRecord(userId, input);
			data.push(record);
			return record;
		},
		update: async (userId, input) => {
			const index = data.findIndex(
				(alarm) => alarm.userId === userId && alarm.id === input.id
			);
			if (index < 0) {
				return null;
			}
			const current = data[index];
			const updated: AlarmRecord = {
				...current,
				...input,
				websiteId:
					input.websiteId === undefined ? current.websiteId : input.websiteId,
				updatedAt: new Date(),
			};
			data[index] = updated;
			return updated;
		},
		delete: async (userId, id) => {
			const index = data.findIndex(
				(alarm) => alarm.userId === userId && alarm.id === id
			);
			if (index < 0) {
				return null;
			}
			const [removed] = data.splice(index, 1);
			return removed ?? null;
		},
	};
}

const validCreateInput: CreateAlarmInput = {
	organizationId: "org-1",
	websiteId: "site-1",
	name: "Uptime Alerts",
	description: "Notify when site goes down",
	enabled: true,
	notificationChannels: ["slack", "email"],
	slackWebhookUrl: "https://hooks.slack.com/services/test",
	discordWebhookUrl: null,
	emailAddresses: ["alerts@databuddy.cc"],
	webhookUrl: null,
	webhookHeaders: {},
	triggerType: "uptime",
	triggerConditions: { failureThreshold: 3 },
};

describe("alarms router handlers", () => {
	it("creates an alarm with valid payload", async () => {
		const store = createInMemoryStore();
		const handlers = createAlarmHandlers(store);
		const alarm = await handlers.create("user-1", validCreateInput);
		expect(alarm.id).toContain("alarm-");
		expect(alarm.name).toBe("Uptime Alerts");
		expect(alarm.notificationChannels).toContain("slack");
	});

	it("updates an alarm", async () => {
		const store = createInMemoryStore();
		const handlers = createAlarmHandlers(store);
		const created = await handlers.create("user-1", validCreateInput);
		const updated = await handlers.update("user-1", {
			id: created.id,
			name: "Updated Alarm",
			enabled: false,
		});
		expect(updated.name).toBe("Updated Alarm");
		expect(updated.enabled).toBe(false);
	});

	it("deletes an alarm", async () => {
		const store = createInMemoryStore();
		const handlers = createAlarmHandlers(store);
		const created = await handlers.create("user-1", validCreateInput);
		await handlers.delete("user-1", created.id);
		const list = await handlers.list("user-1", { organizationId: "org-1" });
		expect(list).toHaveLength(0);
	});

	it("lists and gets alarms for the correct user", async () => {
		const store = createInMemoryStore();
		const handlers = createAlarmHandlers(store);
		const created = await handlers.create("user-1", validCreateInput);
		await handlers.create("user-2", {
			...validCreateInput,
			organizationId: "org-2",
			name: "Other",
		});

		const list = await handlers.list("user-1", { organizationId: "org-1" });
		expect(list).toHaveLength(1);
		const fetched = await handlers.get("user-1", created.id);
		expect(fetched.id).toBe(created.id);
	});

	it("prevents cross-user access", async () => {
		const store = createInMemoryStore();
		const handlers = createAlarmHandlers(store);
		const created = await handlers.create("user-1", validCreateInput);

		await expect(handlers.get("user-2", created.id)).rejects.toThrow(ORPCError);
		await expect(
			handlers.update("user-2", { id: created.id, name: "Nope" })
		).rejects.toThrow("Alarm not found");
		await expect(handlers.delete("user-2", created.id)).rejects.toThrow(
			"Alarm not found"
		);
	});
});

describe("alarm validation", () => {
	it("rejects missing webhook url when webhook channel selected", () => {
		const result = createAlarmInputSchema.safeParse({
			...validCreateInput,
			notificationChannels: ["webhook"],
			webhookUrl: null,
		});
		expect(result.success).toBe(false);
	});

	it("rejects invalid webhook url", () => {
		const result = createAlarmInputSchema.safeParse({
			...validCreateInput,
			notificationChannels: ["webhook"],
			webhookUrl: "not-a-url",
		});
		expect(result.success).toBe(false);
	});

	it("rejects empty name", () => {
		const result = createAlarmInputSchema.safeParse({
			...validCreateInput,
			name: "",
		});
		expect(result.success).toBe(false);
	});
});

describe("alarms.test notification", () => {
	it("triggers notifications for configured channels", async () => {
		const alarm: AlarmRecord = {
			id: "alarm-test",
			userId: "user-1",
			organizationId: "org-1",
			websiteId: "site-1",
			name: "Test Alarm",
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

		const payloads: NotificationPayload[] = [];
		const senders = {
			slack: async (_url: string, payload: NotificationPayload) => {
				payloads.push(payload);
				const result: NotificationResult = { success: true, channel: "slack" };
				return result;
			},
			discord: async (_url: string, payload: NotificationPayload) => {
				payloads.push(payload);
				const result: NotificationResult = {
					success: true,
					channel: "discord",
				};
				return result;
			},
			email: async (payload: NotificationPayload & { to: string | string[] }) => {
				payloads.push(payload);
				const result: NotificationResult = { success: true, channel: "email" };
				return result;
			},
			webhook: async (
				_url: string,
				payload: NotificationPayload,
				_headers: Record<string, string>
			) => {
				payloads.push(payload);
				const result: NotificationResult = { success: true, channel: "webhook" };
				return result;
			},
		};

		const results = await sendAlarmTestNotification(alarm, senders);
		expect(results).toHaveLength(4);
		expect(payloads[0]?.title).toContain("Test alert");
	});
});
