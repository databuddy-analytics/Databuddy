import {
	boolean,
	foreignKey,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

export const apiKeyType = pgEnum("api_key_type", ["user", "sdk", "automation"]);

export const apiResourceType = pgEnum("api_resource_type", [
	"global",
	"website",
	"ab_experiment",
	"feature_flag",
	"analytics_data",
	"error_data",
	"web_vitals",
	"custom_events",
	"export_data",
]);

export const dbPermissionLevel = pgEnum("db_permission_level", [
	"readonly",
	"admin",
]);

export interface ApiKeyMetadata {
	description?: string;
	resources?: Record<string, string[]>;
	tags?: string[];
}

export const apikey = pgTable(
	"apikey",
	{
		id: text().primaryKey(),
		name: text().notNull(),
		prefix: text().notNull(),
		start: text().notNull(),
		keyHash: text("key_hash").notNull(),
		userId: text("user_id"),
		organizationId: text("organization_id"),
		type: apiKeyType().notNull().default("user"),
		scopes: text().array().notNull().default([]),
		enabled: boolean().notNull().default(true),
		revokedAt: timestamp("revoked_at", { precision: 3, withTimezone: true }),
		rateLimitEnabled: boolean("rate_limit_enabled").notNull().default(true),
		rateLimitTimeWindow: integer("rate_limit_time_window"),
		rateLimitMax: integer("rate_limit_max"),
		expiresAt: timestamp("expires_at", { precision: 3, withTimezone: true }),
		lastUsedAt: timestamp("last_used_at", { precision: 3, withTimezone: true }),
		metadata: jsonb().$type<ApiKeyMetadata>().default({}),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("apikey_user_id_idx").on(table.userId),
		index("apikey_organization_id_idx").on(table.organizationId),
		index("apikey_expires_at_idx").on(table.expiresAt),
		index("apikey_revoked_at_idx").on(table.revokedAt),
		index("apikey_last_used_at_idx").on(table.lastUsedAt),
		uniqueIndex("apikey_key_hash_unique").on(table.keyHash),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "apikey_user_id_user_id_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "apikey_organization_id_organization_id_fk",
		}).onDelete("cascade"),
	]
);
