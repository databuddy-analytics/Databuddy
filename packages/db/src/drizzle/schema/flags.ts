import { isNotNull } from "drizzle-orm";
import {
	boolean,
	foreignKey,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { websites } from "./websites";

export const flagType = pgEnum("flag_type", [
	"boolean",
	"rollout",
	"multivariant",
]);

export const flagStatus = pgEnum("flag_status", [
	"active",
	"inactive",
	"archived",
]);

export const flagChangeType = pgEnum("flag_change_type", [
	"created",
	"updated",
	"restored",
	"archived",
	"dependency_cascade",
]);

export interface FlagUserRule {
	batch: boolean;
	batchValues?: string[];
	enabled: boolean;
	field?: string;
	operator:
		| "equals"
		| "contains"
		| "starts_with"
		| "ends_with"
		| "in"
		| "not_in"
		| "exists"
		| "not_exists";
	type: "user_id" | "email" | "property";
	value?: string;
	values?: string[];
}

export interface FlagVariant {
	description?: string;
	key: string;
	type: "string" | "number" | "json";
	value: unknown;
	weight?: number;
}

export interface FlagChangeSnapshot {
	defaultValue: boolean;
	dependencies?: string[] | null;
	description?: string | null;
	environment?: string | null;
	key: string;
	name?: string | null;
	persistAcrossAuth: boolean;
	rolloutBy?: string | null;
	rolloutPercentage?: number | null;
	status: "active" | "inactive" | "archived";
	type: "boolean" | "rollout" | "multivariant";
	variants?: FlagVariant[] | null;
}

export const flags = pgTable(
	"flags",
	{
		id: text().primaryKey(),
		key: text().notNull(),
		name: text(),
		description: text(),
		type: flagType().default("boolean").notNull(),
		status: flagStatus().default("active").notNull(),
		defaultValue: jsonb("default_value")
			.$type<boolean>()
			.default(false)
			.notNull(),
		payload: jsonb().$type<Record<string, unknown>>(),
		rules: jsonb().$type<FlagUserRule[]>().default([]),
		persistAcrossAuth: boolean("persist_across_auth").default(false).notNull(),
		rolloutPercentage: integer("rollout_percentage").default(0),
		rolloutBy: text("rollout_by"),
		websiteId: text("website_id"),
		organizationId: text("organization_id"),
		userId: text("user_id"),
		createdBy: text("created_by").notNull(),
		variants: jsonb().$type<FlagVariant[]>().default([]),
		dependencies: text().array(),
		targetGroupIds: text("target_group_ids").array(),
		environment: text(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
		deletedAt: timestamp("deleted_at", { precision: 3, withTimezone: true }),
	},
	(table) => [
		uniqueIndex("flags_key_website_unique")
			.on(table.key, table.websiteId)
			.where(isNotNull(table.websiteId)),
		uniqueIndex("flags_key_org_unique")
			.on(table.key, table.organizationId)
			.where(isNotNull(table.organizationId)),
		uniqueIndex("flags_key_user_unique")
			.on(table.key, table.userId)
			.where(isNotNull(table.userId)),
		index("flags_created_by_idx").on(table.createdBy),
		index("flags_website_active_idx").on(table.websiteId, table.status),
		index("flags_org_active_idx").on(table.organizationId, table.status),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "flags_website_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "flags_organization_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "flags_user_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: "flags_created_by_fkey",
		}).onDelete("restrict"),
	]
);

export const flagChangeEvents = pgTable(
	"flag_change_events",
	{
		id: text().primaryKey(),
		flagId: text("flag_id").notNull(),
		websiteId: text("website_id"),
		organizationId: text("organization_id"),
		changeType: flagChangeType("change_type").notNull(),
		before: jsonb().$type<FlagChangeSnapshot>(),
		after: jsonb().$type<FlagChangeSnapshot>(),
		changedBy: text("changed_by").notNull(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("flag_change_events_flag_id_created_at_idx").on(
			table.flagId,
			table.createdAt.desc()
		),
		index("flag_change_events_website_created_at_idx").on(
			table.websiteId,
			table.createdAt.desc()
		),
		index("flag_change_events_org_created_at_idx").on(
			table.organizationId,
			table.createdAt.desc()
		),
		foreignKey({
			columns: [table.flagId],
			foreignColumns: [flags.id],
			name: "flag_change_events_flag_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "flag_change_events_website_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "flag_change_events_organization_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.changedBy],
			foreignColumns: [user.id],
			name: "flag_change_events_changed_by_fkey",
		}).onDelete("restrict"),
	]
);

export const targetGroups = pgTable(
	"target_groups",
	{
		id: text().primaryKey(),
		name: text().notNull(),
		description: text(),
		color: text().default("#6366f1").notNull(),
		rules: jsonb().$type<FlagUserRule[]>().default([]).notNull(),
		websiteId: text("website_id").notNull(),
		createdBy: text("created_by").notNull(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
		deletedAt: timestamp("deleted_at", { precision: 3, withTimezone: true }),
	},
	(table) => [
		index("target_groups_website_id_idx").on(table.websiteId),
		index("target_groups_created_by_idx").on(table.createdBy),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "target_groups_website_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: "target_groups_created_by_fkey",
		}).onDelete("restrict"),
	]
);

export const flagsToTargetGroups = pgTable(
	"flags_to_target_groups",
	{
		flagId: text("flag_id")
			.notNull()
			.references(() => flags.id, { onDelete: "cascade" }),
		targetGroupId: text("target_group_id")
			.notNull()
			.references(() => targetGroups.id, { onDelete: "cascade" }),
	},
	(table) => [
		primaryKey({ columns: [table.flagId, table.targetGroupId] }),
		index("flags_to_target_groups_target_group_id_idx").on(table.targetGroupId),
	]
);

export type Flags = typeof flags.$inferSelect;
export type FlagsInsert = typeof flags.$inferInsert;
export type FlagChangeEvents = typeof flagChangeEvents.$inferSelect;
export type FlagChangeEventsInsert = typeof flagChangeEvents.$inferInsert;
export type TargetGroups = typeof targetGroups.$inferSelect;
export type TargetGroupsInsert = typeof targetGroups.$inferInsert;
