import {
	foreignKey,
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

export const linkFolders = pgTable(
	"link_folders",
	{
		id: text().primaryKey(),
		organizationId: text("organization_id").notNull(),
		createdBy: text("created_by").notNull(),
		name: text().notNull(),
		slug: text().notNull(),
		deletedAt: timestamp("deleted_at", { precision: 3, withTimezone: true }),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("link_folders_created_by_idx").on(table.createdBy),
		uniqueIndex("link_folders_org_slug_unique").on(
			table.organizationId,
			table.slug
		),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "link_folders_organization_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: "link_folders_created_by_fkey",
		}).onDelete("cascade"),
	]
);

export const links = pgTable(
	"links",
	{
		id: text().primaryKey(),
		organizationId: text("organization_id").notNull(),
		createdBy: text("created_by").notNull(),
		folderId: text("folder_id"),
		slug: text().notNull(),
		name: text().notNull(),
		targetUrl: text("target_url").notNull(),
		targetDomain: text("target_domain"),
		sourceType: text("source_type"),
		sourceId: text("source_id"),
		sourceOwnerId: text("source_owner_id"),
		expiresAt: timestamp("expires_at", { precision: 3, withTimezone: true }),
		expiredRedirectUrl: text("expired_redirect_url"),
		ogTitle: text("og_title"),
		ogDescription: text("og_description"),
		ogImageUrl: text("og_image_url"),
		ogVideoUrl: text("og_video_url"),
		iosUrl: text("ios_url"),
		androidUrl: text("android_url"),
		externalId: text("external_id"),
		deepLinkApp: text("deep_link_app"),
		deletedAt: timestamp("deleted_at", { precision: 3, withTimezone: true }),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("links_folder_id_idx").on(table.folderId),
		index("links_org_folder_idx").on(table.organizationId, table.folderId),
		index("links_created_by_idx").on(table.createdBy),
		index("links_external_id_idx").on(table.externalId),
		index("links_org_source_type_idx").on(
			table.organizationId,
			table.sourceType
		),
		index("links_org_source_id_idx").on(table.organizationId, table.sourceId),
		index("links_org_source_owner_id_idx").on(
			table.organizationId,
			table.sourceOwnerId
		),
		index("links_org_target_domain_idx").on(
			table.organizationId,
			table.targetDomain
		),
		uniqueIndex("links_slug_unique").on(table.slug),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "links_organization_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: "links_created_by_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.folderId],
			foreignColumns: [linkFolders.id],
			name: "links_folder_id_fkey",
		}).onDelete("set null"),
	]
);

export type Link = typeof links.$inferSelect;
export type LinkInsert = typeof links.$inferInsert;
export type LinkFolder = typeof linkFolders.$inferSelect;
export type LinkFolderInsert = typeof linkFolders.$inferInsert;
