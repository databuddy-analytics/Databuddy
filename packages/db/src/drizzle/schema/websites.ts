import {
	boolean,
	foreignKey,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";

export const websiteStatus = pgEnum("WebsiteStatus", [
	"ACTIVE",
	"HEALTHY",
	"UNHEALTHY",
	"INACTIVE",
	"PENDING",
]);

export interface WebsiteSettings {
	allowedIps?: string[];
	allowedOrigins?: string[];
	ignoredTrackingOrigins?: string[];
	trackingIssueWarningsDisabled?: boolean;
}

export interface GitHubIntegration {
	owner: string;
	repo: string;
}

export interface WebsiteIntegrations {
	github?: GitHubIntegration;
	[key: string]: unknown;
}

export const websites = pgTable(
	"websites",
	{
		id: text().primaryKey(),
		domain: text().notNull(),
		name: text(),
		status: websiteStatus().default("ACTIVE").notNull(),
		isPublic: boolean().default(false).notNull(),
		createdAt: timestamp({ precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp({ precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
		deletedAt: timestamp({ precision: 3, withTimezone: true }),
		organizationId: text("organization_id").notNull(),
		integrations: jsonb().$type<WebsiteIntegrations>(),
		settings: jsonb().$type<WebsiteSettings>(),
	},
	(table) => [
		uniqueIndex("websites_org_domain_unique").on(
			table.organizationId,
			table.domain
		),
		uniqueIndex("websites_org_id_unique").on(table.organizationId, table.id),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "websites_organization_id_organization_id_fk",
		}).onDelete("cascade"),
	]
);

export type Website = typeof websites.$inferSelect;
export type WebsiteInsert = typeof websites.$inferInsert;
