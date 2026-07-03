import {
	index,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { websites } from "./websites";

export const profiles = pgTable(
	"profiles",
	{
		websiteId: text("website_id")
			.notNull()
			.references(() => websites.id, { onDelete: "cascade" }),
		profileId: text("profile_id").notNull(),
		displayName: text("display_name"),
		email: text(),
		traits: jsonb().$type<Record<string, unknown>>().default({}).notNull(),
		firstSeenAt: timestamp({ precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp({ precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		primaryKey({ columns: [table.websiteId, table.profileId] }),
		index("profiles_website_email_idx").on(table.websiteId, table.email),
		index("profiles_traits_gin_idx").using("gin", table.traits),
	]
);

export const profileAliases = pgTable(
	"profile_aliases",
	{
		websiteId: text("website_id")
			.notNull()
			.references(() => websites.id, { onDelete: "cascade" }),
		// Raw client anonymous id (anon_*), never the daily-salted hash stored
		// in ClickHouse — past salts are unrecoverable, so this column is the
		// identity graph, not a ClickHouse join key.
		anonymousId: text("anonymous_id").notNull(),
		profileId: text("profile_id").notNull(),
		createdAt: timestamp({ precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.websiteId, table.anonymousId] }),
		index("profile_aliases_profile_idx").on(table.websiteId, table.profileId),
	]
);
