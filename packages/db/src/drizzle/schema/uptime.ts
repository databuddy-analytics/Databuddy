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
import { organization } from "./auth";
import { websites } from "./websites";

export interface UptimeJsonParsingConfig {
	enabled: boolean;
}

export const uptimeSchedules = pgTable(
	"uptime_schedules",
	{
		id: text().primaryKey(),
		websiteId: text("website_id"),
		organizationId: text("organization_id").notNull(),
		url: text().notNull(),
		name: text(),
		granularity: text().notNull(),
		cron: text().notNull(),
		isPaused: boolean("is_paused").default(false).notNull(),
		isPublic: boolean("is_public").default(false).notNull(),
		timeout: integer(),
		cacheBust: boolean("cache_bust").default(false).notNull(),
		jsonParsingConfig: jsonb(
			"json_parsing_config"
		).$type<UptimeJsonParsingConfig>(),
		lastNotifiedStatus: integer("last_notified_status"),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("uptime_schedules_website_id_idx").on(table.websiteId),
		index("uptime_schedules_organization_id_idx").on(table.organizationId),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "uptime_schedules_website_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "uptime_schedules_organization_id_organization_id_fk",
		}).onDelete("cascade"),
	]
);

export const statusPages = pgTable(
	"status_pages",
	{
		id: text().primaryKey(),
		organizationId: text("organization_id").notNull(),
		slug: text().notNull(),
		name: text().notNull(),
		description: text(),
		logoUrl: text("logo_url"),
		faviconUrl: text("favicon_url"),
		websiteUrl: text("website_url"),
		supportUrl: text("support_url"),
		theme: text().$type<"system" | "light" | "dark">().default("system"),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("status_pages_organization_id_idx").on(table.organizationId),
		uniqueIndex("status_pages_slug_unique").on(table.slug),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "status_pages_organization_id_fkey",
		}).onDelete("cascade"),
	]
);

export const statusPageMonitors = pgTable(
	"status_page_monitors",
	{
		id: text().primaryKey(),
		statusPageId: text("status_page_id").notNull(),
		uptimeScheduleId: text("uptime_schedule_id").notNull(),
		displayName: text("display_name"),
		order: integer().default(0).notNull(),
		hideUrl: boolean("hide_url").default(false).notNull(),
		hideUptimePercentage: boolean("hide_uptime_percentage")
			.default(false)
			.notNull(),
		hideLatency: boolean("hide_latency").default(false).notNull(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("status_page_monitors_status_page_id_idx").on(table.statusPageId),
		index("status_page_monitors_uptime_schedule_id_idx").on(
			table.uptimeScheduleId
		),
		foreignKey({
			columns: [table.statusPageId],
			foreignColumns: [statusPages.id],
			name: "status_page_monitors_status_page_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.uptimeScheduleId],
			foreignColumns: [uptimeSchedules.id],
			name: "status_page_monitors_uptime_schedule_id_fkey",
		}).onDelete("cascade"),
	]
);

export const incidents = pgTable(
	"incidents",
	{
		id: text().primaryKey(),
		statusPageId: text("status_page_id").notNull(),
		title: text().notNull(),
		status: text()
			.$type<"investigating" | "identified" | "monitoring" | "resolved">()
			.notNull()
			.default("investigating"),
		severity: text()
			.$type<"minor" | "major" | "critical">()
			.notNull()
			.default("minor"),
		resolvedAt: timestamp("resolved_at", {
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
		index("incidents_status_page_id_idx").on(table.statusPageId),
		index("incidents_created_at_idx").on(table.createdAt),
		foreignKey({
			columns: [table.statusPageId],
			foreignColumns: [statusPages.id],
			name: "incidents_status_page_id_fkey",
		}).onDelete("cascade"),
	]
);

export const incidentUpdates = pgTable(
	"incident_updates",
	{
		id: text().primaryKey(),
		incidentId: text("incident_id").notNull(),
		status: text()
			.$type<"investigating" | "identified" | "monitoring" | "resolved">()
			.notNull(),
		message: text().notNull(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("incident_updates_incident_id_idx").on(table.incidentId),
		foreignKey({
			columns: [table.incidentId],
			foreignColumns: [incidents.id],
			name: "incident_updates_incident_id_fkey",
		}).onDelete("cascade"),
	]
);

export const incidentAffectedMonitors = pgTable(
	"incident_affected_monitors",
	{
		id: text().primaryKey(),
		incidentId: text("incident_id").notNull(),
		statusPageMonitorId: text("status_page_monitor_id").notNull(),
		impact: text().$type<"degraded" | "down">().notNull().default("degraded"),
	},
	(table) => [
		index("incident_affected_monitors_incident_id_idx").on(table.incidentId),
		index("incident_affected_monitors_monitor_id_idx").on(
			table.statusPageMonitorId
		),
		foreignKey({
			columns: [table.incidentId],
			foreignColumns: [incidents.id],
			name: "incident_affected_monitors_incident_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.statusPageMonitorId],
			foreignColumns: [statusPageMonitors.id],
			name: "incident_affected_monitors_monitor_id_fkey",
		}).onDelete("cascade"),
	]
);

export type UptimeSchedules = typeof uptimeSchedules.$inferSelect;
export type UptimeSchedulesInsert = typeof uptimeSchedules.$inferInsert;
export type StatusPages = typeof statusPages.$inferSelect;
export type StatusPagesInsert = typeof statusPages.$inferInsert;
export type StatusPageMonitors = typeof statusPageMonitors.$inferSelect;
export type StatusPageMonitorsInsert = typeof statusPageMonitors.$inferInsert;
export type Incidents = typeof incidents.$inferSelect;
export type IncidentsInsert = typeof incidents.$inferInsert;
export type IncidentUpdates = typeof incidentUpdates.$inferSelect;
export type IncidentUpdatesInsert = typeof incidentUpdates.$inferInsert;
export type IncidentAffectedMonitors =
	typeof incidentAffectedMonitors.$inferSelect;
export type IncidentAffectedMonitorsInsert =
	typeof incidentAffectedMonitors.$inferInsert;
