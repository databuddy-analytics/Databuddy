import { z } from "zod";

export const notificationChannelSchema = z.enum([
	"slack",
	"discord",
	"email",
	"webhook",
]);

export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const triggerTypeSchema = z.enum([
	"uptime",
	"traffic_spike",
	"error_rate",
	"goal",
	"custom",
]);

export type TriggerType = z.infer<typeof triggerTypeSchema>;

export const alarmFormSchema = z.object({
	name: z.string().min(1, "Name is required").max(100, "Name too long"),
	description: z.string().max(500).optional(),
	enabled: z.boolean().default(true),
	notificationChannels: z.array(notificationChannelSchema).default([]),
	slackWebhookUrl: z
		.string()
		.url("Invalid Slack webhook URL")
		.optional()
		.or(z.literal("")),
	discordWebhookUrl: z
		.string()
		.url("Invalid Discord webhook URL")
		.optional()
		.or(z.literal("")),
	emailAddresses: z
		.array(z.string().email("Invalid email address"))
		.default([]),
	webhookUrl: z
		.string()
		.url("Invalid webhook URL")
		.optional()
		.or(z.literal("")),
	webhookHeaders: z.record(z.string(), z.string()).default({}),
	triggerType: triggerTypeSchema,
	triggerConditions: z.record(z.string(), z.unknown()).default({}),
	websiteId: z.string().optional(),
});

export type AlarmForm = z.infer<typeof alarmFormSchema>;

export const createAlarmSchema = z
	.object({
		websiteId: z.string().optional(),
		organizationId: z.string().optional(),
		...alarmFormSchema.shape,
	})
	.refine((data) => data.websiteId || data.organizationId, {
		message: "Either websiteId or organizationId must be provided",
		path: ["websiteId"],
	});

export const updateAlarmSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100).optional(),
	description: z.string().max(500).optional().nullable(),
	enabled: z.boolean().optional(),
	notificationChannels: z.array(notificationChannelSchema).optional(),
	slackWebhookUrl: z.string().url().optional().or(z.literal("")).nullable(),
	discordWebhookUrl: z.string().url().optional().or(z.literal("")).nullable(),
	emailAddresses: z.array(z.string().email()).optional(),
	webhookUrl: z.string().url().optional().or(z.literal("")).nullable(),
	webhookHeaders: z.record(z.string(), z.string()).optional(),
	triggerType: triggerTypeSchema.optional(),
	triggerConditions: z.record(z.string(), z.unknown()).optional(),
});

export const listAlarmsSchema = z
	.object({
		websiteId: z.string().optional(),
		organizationId: z.string().optional(),
	})
	.refine((data) => data.websiteId || data.organizationId, {
		message: "Either websiteId or organizationId must be provided",
		path: ["websiteId"],
	});

export const getAlarmSchema = z.object({
	id: z.string(),
});

export const deleteAlarmSchema = z.object({
	id: z.string(),
});

export const testAlarmSchema = z.object({
	id: z.string(),
});
