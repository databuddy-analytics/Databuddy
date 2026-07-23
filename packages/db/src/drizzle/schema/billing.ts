import {
	boolean,
	foreignKey,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { websites } from "./websites";

export const autumnWebhookStatusValues = [
	"pending",
	"processing",
	"deferred",
	"completed",
	"dead_letter",
] as const;
export type AutumnWebhookStatus = (typeof autumnWebhookStatusValues)[number];

/**
 * Durable inbox for Autumn usage webhooks that cannot be routed yet.
 * Payloads are normalized before insert and contain billing identifiers only.
 */
export const autumnWebhookEvents = pgTable(
	"autumn_webhook_events",
	{
		id: text().primaryKey(),
		type: text().notNull(),
		payload: jsonb().$type<Record<string, unknown>>().notNull(),
		status: text().$type<AutumnWebhookStatus>().default("pending").notNull(),
		attempts: integer().default(0).notNull(),
		errorMessage: text("error_message"),
		leaseToken: text("lease_token"),
		leaseExpiresAt: timestamp("lease_expires_at", {
			precision: 3,
			withTimezone: true,
		}),
		nextAttemptAt: timestamp("next_attempt_at", {
			precision: 3,
			withTimezone: true,
		}),
		completedAt: timestamp("completed_at", {
			precision: 3,
			withTimezone: true,
		}),
		deadLetteredAt: timestamp("dead_lettered_at", {
			precision: 3,
			withTimezone: true,
		}),
		alertedAt: timestamp("alerted_at", {
			precision: 3,
			withTimezone: true,
		}),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("autumn_webhook_events_status_updated_idx").on(
			table.status,
			table.updatedAt
		),
		index("autumn_webhook_events_status_completed_idx").on(
			table.status,
			table.completedAt
		),
		index("autumn_webhook_events_status_next_attempt_idx").on(
			table.status,
			table.nextAttemptAt
		),
		index("autumn_webhook_events_status_lease_idx").on(
			table.status,
			table.leaseExpiresAt
		),
		index("autumn_webhook_events_status_dead_letter_idx").on(
			table.status,
			table.deadLetteredAt
		),
	]
);

export const usageAlertLog = pgTable(
	"usage_alert_log",
	{
		id: text().primaryKey(),
		userId: text("user_id").notNull(),
		organizationId: text("organization_id"),
		featureId: text("feature_id").notNull(),
		alertType: text("alert_type").notNull(),
		emailSentTo: text("email_sent_to").notNull(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("usage_alert_log_user_feature_idx").on(table.userId, table.featureId),
		index("usage_alert_log_org_user_feature_idx").on(
			table.organizationId,
			table.userId,
			table.featureId
		),
		index("usage_alert_log_created_at_idx").on(table.createdAt),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "usage_alert_log_user_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "usage_alert_log_organization_id_fkey",
		}).onDelete("set null"),
	]
);

export const alarms = pgTable(
	"alarms",
	{
		id: text().primaryKey(),
		organizationId: text("organization_id").notNull(),
		websiteId: text("website_id"),
		name: text().notNull(),
		description: text(),
		enabled: boolean().notNull().default(true),
		triggerType: text("trigger_type").notNull(),
		triggerConditions: jsonb("trigger_conditions")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("alarms_website_id_idx").on(table.websiteId),
		index("alarms_org_enabled_idx").on(table.organizationId, table.enabled),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "alarms_organization_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "alarms_website_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("set null"),
	]
);

export const alarmDestinations = pgTable(
	"alarm_destinations",
	{
		id: text().primaryKey(),
		alarmId: text("alarm_id").notNull(),
		type: text().notNull(),
		identifier: text().notNull().default(""),
		config: jsonb().$type<Record<string, unknown>>().notNull().default({}),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("alarm_destinations_type_idx").on(table.type),
		uniqueIndex("alarm_destinations_alarm_type_identifier_unique").on(
			table.alarmId,
			table.type,
			table.identifier
		),
		foreignKey({
			columns: [table.alarmId],
			foreignColumns: [alarms.id],
			name: "alarm_destinations_alarm_id_fkey",
		}).onDelete("cascade"),
	]
);

export type Alarm = typeof alarms.$inferSelect;
export type AlarmInsert = typeof alarms.$inferInsert;
export type AlarmDestination = typeof alarmDestinations.$inferSelect;
export type AlarmDestinationInsert = typeof alarmDestinations.$inferInsert;

export const alarmTriggerTypeValues = [
	"uptime",
	"traffic_spike",
	"error_rate",
] as const;
export type AlarmTriggerTypeValue = (typeof alarmTriggerTypeValues)[number];

export const alarmDestinationTypeValues = [
	"slack",
	"email",
	"webhook",
] as const;
export type AlarmDestinationTypeValue =
	(typeof alarmDestinationTypeValues)[number];

export interface UptimeTriggerConditions {
	monitorIds: string[];
}
export type TrafficSpikeTriggerConditions = Record<string, unknown>;
export type ErrorRateTriggerConditions = Record<string, unknown>;

export type AlarmTriggerConditions =
	| UptimeTriggerConditions
	| TrafficSpikeTriggerConditions
	| ErrorRateTriggerConditions;
