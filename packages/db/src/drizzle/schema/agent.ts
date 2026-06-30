import {
	foreignKey,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { websites } from "./websites";

export const agentInstallStatus = pgEnum("agent_install_status", [
	"success",
	"partial",
	"failed",
]);

export interface AgentInstallStep {
	durationMs?: number;
	name: string;
	status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
}

export interface AgentInstallIssue {
	code: string;
	message: string;
	severity?: "info" | "warning" | "error";
}

export const agentInstallTelemetry = pgTable(
	"agent_install_telemetry",
	{
		id: text().primaryKey(),
		websiteId: text("website_id").notNull(),
		agent: text().notNull(),
		status: agentInstallStatus().notNull(),
		framework: text(),
		installMethod: text("install_method"),
		durationMs: integer("duration_ms"),
		stepsCompleted: jsonb("steps_completed").$type<AgentInstallStep[]>(),
		issues: jsonb().$type<AgentInstallIssue[]>(),
		errorMessage: text("error_message"),
		metadata: jsonb().$type<Record<string, unknown>>(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("agent_install_telemetry_website_id_idx").on(table.websiteId),
		index("agent_install_telemetry_status_idx").on(table.status),
		index("agent_install_telemetry_created_at_idx").on(table.createdAt),
	]
);

export const agentChats = pgTable(
	"agent_chats",
	{
		id: text().primaryKey(),
		websiteId: text("website_id"),
		userId: text("user_id").notNull(),
		organizationId: text("organization_id"),
		title: text().notNull().default(""),
		messages: jsonb().notNull().default([]).$type<unknown[]>(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("agent_chats_org_user_updated_idx").on(
			table.organizationId,
			table.userId,
			table.updatedAt.desc()
		),
		index("agent_chats_user_updated_idx").on(
			table.userId,
			table.updatedAt.desc()
		),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "agent_chats_website_id_fkey",
		}).onDelete("set null"),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "agent_chats_user_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "agent_chats_organization_id_fkey",
		}).onDelete("set null"),
	]
);
