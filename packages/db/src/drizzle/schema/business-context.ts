import type { BusinessProfile } from "@databuddy/shared/business-context";
import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { websites } from "./websites";

export const websiteBusinessContexts = pgTable(
	"website_business_contexts",
	{
		websiteId: text("website_id")
			.primaryKey()
			.references(() => websites.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		domain: text().notNull(),
		startedAt: text("started_at").notNull(),
		revision: integer().notNull(),
		profile: jsonb().$type<BusinessProfile>().notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		refreshAfter: timestamp("refresh_after", {
			precision: 3,
			withTimezone: true,
		}).notNull(),
		indexedRevision: integer("indexed_revision"),
	},
	(table) => [
		index("website_business_contexts_organization_id_idx").on(
			table.organizationId
		),
		check(
			"website_business_contexts_revision_check",
			sql`${table.revision} >= 1`
		),
	]
);

export type BusinessProfileRecord = typeof websiteBusinessContexts.$inferSelect;
