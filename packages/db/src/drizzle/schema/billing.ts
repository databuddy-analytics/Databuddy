import {
	boolean,
	foreignKey,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { websites } from "./websites";

export const usageAlertLog = pgTable(
	"usage_alert_log",
	{
		id: text().primaryKey(),
		userId: text("user_id").notNull(),
		featureId: text("feature_id").notNull(),
		alertType: text("alert_type").notNull(),
		emailSentTo: text("email_sent_to").notNull(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("usage_alert_log_user_feature_idx").on(table.userId, table.featureId),
		index("usage_alert_log_created_at_idx").on(table.createdAt),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "usage_alert_log_user_id_fkey",
		}).onDelete("cascade"),
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

export type UptimeTriggerConditions = { monitorIds: string[] };
export type TrafficSpikeTriggerConditions = Record<string, unknown>;
export type ErrorRateTriggerConditions = Record<string, unknown>;

export type AlarmTriggerConditions =
	| UptimeTriggerConditions
	| TrafficSpikeTriggerConditions
	| ErrorRateTriggerConditions;
