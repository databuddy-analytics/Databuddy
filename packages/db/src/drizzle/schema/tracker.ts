import {
	boolean,
	index,
	integer,
	pgTable,
	serial,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export const trackerVersions = pgTable(
	"tracker_versions",
	{
		id: serial().primaryKey(),
		version: integer().notNull(),
		filename: text().notNull(),
		sriHash: text("sri_hash").notNull(),
		sizeBytes: integer("size_bytes").notNull(),
		isCurrent: boolean("is_current").default(false).notNull(),
		deployedAt: timestamp("deployed_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("tracker_versions_filename_idx").on(table.filename),
		index("tracker_versions_is_current_idx").on(table.isCurrent),
	]
);

export type TrackerVersion = typeof trackerVersions.$inferSelect;
export type TrackerVersionInsert = typeof trackerVersions.$inferInsert;
