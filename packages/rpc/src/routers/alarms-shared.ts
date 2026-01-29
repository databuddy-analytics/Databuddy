import {
	sendDiscordWebhook,
	sendEmail,
	sendSlackWebhook,
	sendWebhook,
	type NotificationPayload,
	type NotificationResult,
} from "@databuddy/notifications";
import { ORPCError } from "@orpc/server";
import { Resend } from "resend";
import { z } from "zod";

export const alarmChannelEnum = z.enum(["slack", "discord", "email", "webhook"]);
export const triggerTypeEnum = z.enum([
	"uptime",
	"traffic_spike",
	"error_rate",
	"goal",
	"custom",
]);

export const triggerConditionsSchema = z
	.object({
		failureThreshold: z.number().int().min(1).max(20).optional(),
		responseTimeMs: z.number().int().min(100).max(120_000).optional(),
	})
	.default({});

const webhookHeadersSchema = z.record(z.string(), z.string()).default({});

const baseAlarmSchema = z.object({
	organizationId: z.string(),
	websiteId: z.string().optional().nullable(),
	name: z.string().min(1, "Name is required").max(200),
	description: z.string().max(500).optional().nullable(),
	enabled: z.boolean().optional(),
	notificationChannels: z
		.array(alarmChannelEnum)
		.min(1, "Select at least one notification channel"),
	slackWebhookUrl: z.string().url().optional().nullable(),
	discordWebhookUrl: z.string().url().optional().nullable(),
	emailAddresses: z.array(z.string().email()).default([]),
	webhookUrl: z.string().url().optional().nullable(),
	webhookHeaders: webhookHeadersSchema,
	triggerType: triggerTypeEnum,
	triggerConditions: triggerConditionsSchema,
});

export const createAlarmInputSchema = baseAlarmSchema.superRefine((data, ctx) => {
	validateChannelConfiguration(data, ctx);
});

export const updateAlarmInputSchema = baseAlarmSchema
	.partial()
	.extend({ id: z.string() })
	.superRefine((data, ctx) => {
		if (data.notificationChannels) {
			validateChannelConfiguration(
				{
					...data,
					notificationChannels: data.notificationChannels,
					emailAddresses: data.emailAddresses ?? [],
					webhookHeaders: data.webhookHeaders ?? {},
					triggerConditions: data.triggerConditions ?? {},
					triggerType: data.triggerType ?? "uptime",
					name: data.name ?? "",
					organizationId: data.organizationId ?? "",
				},
				ctx
			);
		}
	});

export const listAlarmsInputSchema = z
	.object({
		organizationId: z.string().optional(),
		websiteId: z.string().optional(),
	})
	.default({});

export const alarmIdSchema = z.object({ id: z.string() });

export type AlarmTriggerConditions = z.infer<typeof triggerConditionsSchema>;
export type AlarmWebhookHeaders = z.infer<typeof webhookHeadersSchema>;

export type AlarmRecordShape = {
	id: string;
	userId: string;
	organizationId: string;
	websiteId: string | null;
	name: string;
	description: string | null;
	enabled: boolean;
	notificationChannels: Array<z.infer<typeof alarmChannelEnum>>;
	slackWebhookUrl: string | null;
	discordWebhookUrl: string | null;
	emailAddresses: string[];
	webhookUrl: string | null;
	webhookHeaders: AlarmWebhookHeaders | null;
	triggerType: z.infer<typeof triggerTypeEnum>;
	triggerConditions: AlarmTriggerConditions;
	createdAt: Date;
	updatedAt: Date;
};

export type CreateAlarmInput = z.infer<typeof createAlarmInputSchema>;
export type UpdateAlarmInput = z.infer<typeof updateAlarmInputSchema>;
export type ListAlarmInput = z.infer<typeof listAlarmsInputSchema>;

export type AlarmStore<TAlarm extends AlarmRecordShape = AlarmRecordShape> = {
	list: (userId: string, filters: ListAlarmInput) => Promise<TAlarm[]>;
	get: (userId: string, id: string) => Promise<TAlarm | null>;
	create: (userId: string, input: CreateAlarmInput) => Promise<TAlarm>;
	update: (userId: string, input: UpdateAlarmInput) => Promise<TAlarm | null>;
	delete: (userId: string, id: string) => Promise<TAlarm | null>;
};

type ChannelValidationInput = {
	notificationChannels: Array<z.infer<typeof alarmChannelEnum>>;
	slackWebhookUrl?: string | null;
	discordWebhookUrl?: string | null;
	emailAddresses: string[];
	webhookUrl?: string | null;
};

function validateChannelConfiguration(
	data: ChannelValidationInput,
	ctx: z.RefinementCtx
) {
	if (data.notificationChannels.includes("slack") && !data.slackWebhookUrl) {
		ctx.addIssue({
			code: "custom",
			message: "Slack webhook URL is required when Slack is selected",
			path: ["slackWebhookUrl"],
		});
	}
	if (
		data.notificationChannels.includes("discord") &&
		!data.discordWebhookUrl
	) {
		ctx.addIssue({
			code: "custom",
			message: "Discord webhook URL is required when Discord is selected",
			path: ["discordWebhookUrl"],
		});
	}
	if (
		data.notificationChannels.includes("email") &&
		data.emailAddresses.length === 0
	) {
		ctx.addIssue({
			code: "custom",
			message: "At least one email address is required",
			path: ["emailAddresses"],
		});
	}
	if (data.notificationChannels.includes("webhook") && !data.webhookUrl) {
		ctx.addIssue({
			code: "custom",
			message: "Webhook URL is required when webhook is selected",
			path: ["webhookUrl"],
		});
	}
}

function normalizeHeaders(headers: AlarmWebhookHeaders): AlarmWebhookHeaders {
	const trimmedEntries = Object.entries(headers)
		.map(([key, value]) => [key.trim(), value.trim()])
		.filter(([key, value]) => key.length > 0 && value.length > 0);
	return Object.fromEntries(trimmedEntries);
}

const defaultFromEmail =
	process.env.NOTIFICATIONS_FROM_EMAIL ?? "Databuddy <noreply@databuddy.cc>";

const resendClient = process.env.RESEND_API_KEY
	? new Resend(process.env.RESEND_API_KEY)
	: null;

type AlarmNotificationSenders = {
	slack: (
		url: string,
		payload: NotificationPayload
	) => Promise<NotificationResult>;
	discord: (
		url: string,
		payload: NotificationPayload
	) => Promise<NotificationResult>;
	email: (
		payload: NotificationPayload & { to: string | string[] }
	) => Promise<NotificationResult>;
	webhook: (
		url: string,
		payload: NotificationPayload,
		headers: AlarmWebhookHeaders
	) => Promise<NotificationResult>;
};

function createAlarmNotificationSenders(): AlarmNotificationSenders {
	return {
		slack: (url, payload) => sendSlackWebhook(url, payload),
		discord: (url, payload) => sendDiscordWebhook(url, payload),
		email: (payload) =>
			sendEmail(
				async (emailPayload) => {
					if (!resendClient) {
						throw new Error("Email provider is not configured");
					}
					await resendClient.emails.send({
						from: defaultFromEmail,
						...emailPayload,
					});
				},
				payload,
				{ from: defaultFromEmail }
			),
		webhook: (url, payload, headers) =>
			sendWebhook(url, payload, { headers }),
	};
}

export async function sendAlarmTestNotification(
	alarm: AlarmRecordShape,
	senders: AlarmNotificationSenders = createAlarmNotificationSenders()
): Promise<NotificationResult[]> {
	const payload: NotificationPayload = {
		title: `Test alert: ${alarm.name}`,
		message:
			"This is a test notification from Databuddy to verify your alarm channels.",
		priority: "normal",
		metadata: {
			Alarm: alarm.name,
			Trigger: alarm.triggerType,
			"Sent at": new Date().toISOString(),
		},
	};

	const results: NotificationResult[] = [];
	const channels = alarm.notificationChannels;
	const headers = normalizeHeaders(alarm.webhookHeaders ?? {});

	if (channels.includes("slack") && alarm.slackWebhookUrl) {
		results.push(await senders.slack(alarm.slackWebhookUrl, payload));
	}
	if (channels.includes("discord") && alarm.discordWebhookUrl) {
		results.push(await senders.discord(alarm.discordWebhookUrl, payload));
	}
	if (channels.includes("email") && alarm.emailAddresses.length > 0) {
		results.push(
			await senders.email({
				...payload,
				to: alarm.emailAddresses,
				metadata: { ...payload.metadata, to: alarm.emailAddresses },
			})
		);
	}
	if (channels.includes("webhook") && alarm.webhookUrl) {
		results.push(await senders.webhook(alarm.webhookUrl, payload, headers));
	}

	return results;
}

export function createAlarmHandlers<TAlarm extends AlarmRecordShape>(
	store: AlarmStore<TAlarm>
) {
	return {
		list: async (userId: string, input: ListAlarmInput) =>
			store.list(userId, input),
		get: async (userId: string, id: string) => {
			const alarm = await store.get(userId, id);
			if (!alarm) {
				throw new ORPCError("NOT_FOUND", { message: "Alarm not found" });
			}
			return alarm;
		},
		create: async (userId: string, input: CreateAlarmInput) =>
			store.create(userId, input),
		update: async (userId: string, input: UpdateAlarmInput) => {
			const updated = await store.update(userId, input);
			if (!updated) {
				throw new ORPCError("NOT_FOUND", { message: "Alarm not found" });
			}
			return updated;
		},
		delete: async (userId: string, id: string) => {
			const deleted = await store.delete(userId, id);
			if (!deleted) {
				throw new ORPCError("NOT_FOUND", { message: "Alarm not found" });
			}
			return deleted;
		},
		test: async (userId: string, id: string) => {
			const alarm = await store.get(userId, id);
			if (!alarm) {
				throw new ORPCError("NOT_FOUND", { message: "Alarm not found" });
			}
			const results = await sendAlarmTestNotification(alarm);
			return { results };
		},
	};
}

export const alarmSchemas = {
	createAlarmInputSchema,
	updateAlarmInputSchema,
	listAlarmsInputSchema,
	alarmIdSchema,
	alarmChannelEnum,
	triggerTypeEnum,
	triggerConditionsSchema,
};
