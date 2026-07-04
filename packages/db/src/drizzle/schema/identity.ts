import {
	foreignKey,
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
		// displayName and email hold AES-GCM payloads (v1:...) when
		// DATABUDDY_ENCRYPTION_KEY is configured, plaintext otherwise.
		// emailHash is the deterministic lookup key for either mode.
		displayName: text("display_name"),
		email: text(),
		emailHash: text("email_hash"),
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
		index("profiles_website_email_hash_idx").on(
			table.websiteId,
			table.emailHash
		),
		index("profiles_traits_gin_idx").using("gin", table.traits),
	]
);

export const profileTraitChanges = pgTable(
	"profile_trait_changes",
	{
		id: text().primaryKey(),
		websiteId: text("website_id").notNull(),
		profileId: text("profile_id").notNull(),
		// Full merged non-PII traits after this change — state at time T is the
		// latest row with createdAt <= T, no diff folding needed.
		traits: jsonb().$type<Record<string, unknown>>().default({}).notNull(),
		changes: jsonb()
			.$type<
				Record<
					string,
					{
						old: string | number | boolean | null;
						new: string | number | boolean | null;
					}
				>
			>()
			.default({})
			.notNull(),
		source: text().default("identify").notNull(),
		createdAt: timestamp({ precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("profile_trait_changes_profile_idx").on(
			table.websiteId,
			table.profileId,
			table.createdAt
		),
		index("profile_trait_changes_changes_gin_idx").using("gin", table.changes),
		foreignKey({
			columns: [table.websiteId, table.profileId],
			foreignColumns: [profiles.websiteId, profiles.profileId],
			name: "profile_trait_changes_profile_fkey",
		}).onDelete("cascade"),
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
