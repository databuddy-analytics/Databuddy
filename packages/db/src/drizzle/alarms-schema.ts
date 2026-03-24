import {
	boolean,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export const triggerType = pgEnum("TriggerType", [
	"uptime",
	"traffic_spike",
	"error_rate",
	"response_time",
	"custom",
]);

export const notificationChannel = pgEnum("NotificationChannel", [
	"slack",
	"discord",
	"email",
	"webhook",
	"teams",
	"telegram",
	"google_chat",
]);

export const alarmLogStatus = pgEnum("AlarmLogStatus", [
	"sent",
	"failed",
	"pending",
]);

export const alarms = pgTable("alarms", {
	id: text().primaryKey(),
	userId: text("user_id").notNull(),
	organizationId: text("organization_id"),
	websiteId: text("website_id"),
	name: text().notNull(),
	description: text(),
	enabled: boolean().notNull().default(true),
	notificationChannels: jsonb().notNull().$type<string[]>(),
	slackWebhookUrl: text("slack_webhook_url"),
	discordWebhookUrl: text("discord_webhook_url"),
	teamsWebhookUrl: text("teams_webhook_url"),
	telegramBotToken: text("telegram_bot_token"),
	telegramChatId: text("telegram_chat_id"),
	googleChatWebhookUrl: text("google_chat_webhook_url"),
	emailAddresses: jsonb().$type<string[]>().notNull().default([]),
	webhookUrl: text("webhook_url"),
	webhookHeaders: jsonb().$type<Record<string, string>>(),
	triggerType: triggerType("trigger_type").notNull(),
	triggerConditions: jsonb().notNull().$type<Record<string, unknown>>(),
	checkInterval: integer("check_interval").notNull().default(300),
	cooldownPeriod: integer("cooldown_period").notNull().default(3600),
	lastTriggeredAt: timestamp("last_triggered_at"),
	lastError: text("last_error"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const alarmLogs = pgTable("alarm_logs", {
	id: text().primaryKey(),
	alarmId: text("alarm_id").notNull(),
	triggeredAt: timestamp("triggered_at").notNull().defaultNow(),
	triggerValue: jsonb("trigger_value").$type<Record<string, unknown>>(),
	notificationChannelsSent: jsonb("notification_channels_sent").$type<string[]>().notNull(),
	status: alarmLogStatus("status").notNull(),
	errorMessage: text("error_message"),
	responseData: jsonb("response_data").$type<Record<string, unknown>>(),
});
