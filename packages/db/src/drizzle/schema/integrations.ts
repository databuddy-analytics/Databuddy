import {
	foreignKey,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

export const slackIntegrationStatus = pgEnum("slack_integration_status", [
	"active",
	"disabled",
]);

export const slackIntegrations = pgTable(
	"slack_integrations",
	{
		id: text().primaryKey(),
		organizationId: text("organization_id").notNull(),
		teamId: text("team_id").notNull(),
		teamName: text("team_name"),
		enterpriseId: text("enterprise_id"),
		appId: text("app_id"),
		botId: text("bot_id"),
		botUserId: text("bot_user_id"),
		botTokenCiphertext: text("bot_token_ciphertext").notNull(),
		status: slackIntegrationStatus().default("active").notNull(),
		installedByUserId: text("installed_by_user_id"),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("slack_integrations_team_id_unique").on(table.teamId),
		index("slack_integrations_organization_id_idx").on(table.organizationId),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "slack_integrations_organization_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.installedByUserId],
			foreignColumns: [user.id],
			name: "slack_integrations_installed_by_user_id_fkey",
		}).onDelete("set null"),
	]
);

export const slackChannelBindings = pgTable(
	"slack_channel_bindings",
	{
		id: text().primaryKey(),
		integrationId: text("integration_id").notNull(),
		slackChannelId: text("slack_channel_id").notNull(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("slack_channel_bindings_integration_channel_unique").on(
			table.integrationId,
			table.slackChannelId
		),
		foreignKey({
			columns: [table.integrationId],
			foreignColumns: [slackIntegrations.id],
			name: "slack_channel_bindings_integration_id_fkey",
		}).onDelete("cascade"),
	]
);

export type SlackIntegration = typeof slackIntegrations.$inferSelect;
export type SlackIntegrationInsert = typeof slackIntegrations.$inferInsert;
export type SlackChannelBinding = typeof slackChannelBindings.$inferSelect;
export type SlackChannelBindingInsert =
	typeof slackChannelBindings.$inferInsert;
