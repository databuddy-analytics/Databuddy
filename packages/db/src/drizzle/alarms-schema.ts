import {
	boolean,
	foreignKey,
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { organization, user, websites, uptimeSchedules } from "./schema";

// Enum for alarm types
export const alarmType = pgEnum("alarm_type", [
	"uptime", // Website uptime monitoring
	"analytics", // Analytics events (traffic spikes, goal completions)
	"error_rate", // Error rate monitoring
	"performance", // Performance metrics
	"custom", // Custom events
]);

// Enum for notification channels
export const notificationChannel = pgEnum("notification_channel", [
	"slack",
	"discord",
	"email",
	"webhook",
	"teams",
	"telegram",
]);

// Alarms table
export const alarms = pgTable(
	"alarms",
	{
		id: text().primaryKey().notNull(),
		
		// Ownership
		organizationId: text("organization_id").notNull(),
		createdBy: text("created_by").notNull(),
		
		// Basic info
		name: text().notNull(),
		description: text(),
		type: alarmType().notNull(),
		enabled: boolean().default(true).notNull(),
		
		// Notification channels - array of enabled channels
		notificationChannels: notificationChannel("notification_channels")
			.array()
			.notNull()
			.default([]),
		
		// Slack configuration
		slackWebhookUrl: text("slack_webhook_url"),
		slackChannel: text("slack_channel"), // Optional channel override
		
		// Discord configuration
		discordWebhookUrl: text("discord_webhook_url"),
		
		// Email configuration
		emailAddresses: text("email_addresses").array(), // Array of email addresses
		
		// Microsoft Teams configuration
		teamsWebhookUrl: text("teams_webhook_url"),
		
		// Telegram configuration
		telegramBotToken: text("telegram_bot_token"),
		telegramChatId: text("telegram_chat_id"),
		
		// Custom webhook configuration
		webhookUrl: text("webhook_url"),
		webhookHeaders: jsonb("webhook_headers"), // JSON object for custom headers
		webhookMethod: text("webhook_method").default("POST"), // HTTP method
		
		// Alarm conditions/triggers (flexible JSON structure)
		// Examples:
		// - Uptime: { uptimeScheduleId: "...", triggerOn: ["down", "up"], consecutiveFailures: 3 }
		// - Analytics: { websiteId: "...", metric: "pageviews", threshold: 1000, operator: ">" }
		// - Error rate: { websiteId: "...", errorRate: 5, timeWindow: "5m" }
		conditions: jsonb().notNull(),
		
		// Optional: Link to specific resources
		websiteId: text("website_id"), // For website-specific alarms
		uptimeScheduleId: text("uptime_schedule_id"), // For uptime monitoring alarms
		
		// Metadata
		lastTriggeredAt: timestamp("last_triggered_at", { precision: 3 }),
		triggerCount: text("trigger_count").default("0"), // Total number of times triggered
		
		// Timestamps
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { precision: 3 }).defaultNow().notNull(),
		deletedAt: timestamp("deleted_at", { precision: 3 }),
	},
	(table) => [
		// Indexes
		index("alarms_organization_id_idx").using(
			"btree",
			table.organizationId.asc().nullsLast().op("text_ops")
		),
		index("alarms_created_by_idx").using(
			"btree",
			table.createdBy.asc().nullsLast().op("text_ops")
		),
		index("alarms_website_id_idx").using(
			"btree",
			table.websiteId.asc().nullsLast().op("text_ops")
		),
		index("alarms_uptime_schedule_id_idx").using(
			"btree",
			table.uptimeScheduleId.asc().nullsLast().op("text_ops")
		),
		index("alarms_type_idx").using(
			"btree",
			table.type.asc().nullsLast()
		),
		index("alarms_enabled_idx").using(
			"btree",
			table.enabled.asc().nullsLast()
		),
		
		// Foreign keys
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "alarms_organization_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: "alarms_created_by_fkey",
		})
			.onUpdate("cascade")
			.onDelete("restrict"),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "alarms_website_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.uptimeScheduleId],
			foreignColumns: [uptimeSchedules.id],
			name: "alarms_uptime_schedule_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
	]
);

// Alarm history/logs table - tracks when alarms are triggered
export const alarmLogs = pgTable(
	"alarm_logs",
	{
		id: text().primaryKey().notNull(),
		alarmId: text("alarm_id").notNull(),
		
		// Trigger details
		triggeredAt: timestamp("triggered_at", { precision: 3 }).defaultNow().notNull(),
		triggerReason: text("trigger_reason").notNull(), // Human-readable reason
		triggerData: jsonb("trigger_data"), // Additional context data
		
		// Notification status
		notificationsSent: notificationChannel("notifications_sent").array(), // Which channels were notified
		notificationErrors: jsonb("notification_errors"), // Any errors that occurred
		
		// Resolution
		resolvedAt: timestamp("resolved_at", { precision: 3 }),
		resolvedBy: text("resolved_by"), // User who resolved (if manual)
		autoResolved: boolean("auto_resolved").default(false), // If automatically resolved
	},
	(table) => [
		// Indexes
		index("alarm_logs_alarm_id_idx").using(
			"btree",
			table.alarmId.asc().nullsLast().op("text_ops")
		),
		index("alarm_logs_triggered_at_idx").using(
			"btree",
			table.triggeredAt.asc().nullsLast()
		),
		
		// Foreign keys
		foreignKey({
			columns: [table.alarmId],
			foreignColumns: [alarms.id],
			name: "alarm_logs_alarm_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.resolvedBy],
			foreignColumns: [user.id],
			name: "alarm_logs_resolved_by_fkey",
		})
			.onUpdate("cascade")
			.onDelete("set null"),
	]
);
