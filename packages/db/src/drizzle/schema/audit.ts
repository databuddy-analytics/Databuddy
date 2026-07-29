import type { AuditChanges, AuditMetadata } from "@databuddy/shared/audit";
import {
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export interface AuditOutboxPayload {
	action: string;
	actorDisplayName?: string;
	actorId: string;
	actorType: "agent" | "api" | "system" | "user";
	changes: AuditChanges;
	id: string;
	ip?: string;
	metadata: AuditMetadata;
	operation?: string;
	organizationId: string;
	outcome: "denied" | "failure" | "success";
	reason?: string;
	requestId?: string;
	source: "better_auth" | "orpc" | "public_api" | "worker";
	targetDisplayName?: string;
	targetId: string;
	targetType: string;
	userAgent?: string;
}

export const auditActorType = pgEnum("audit_actor_type", [
	"user",
	"api",
	"system",
	"agent",
]);

export const auditOutcome = pgEnum("audit_outcome", [
	"success",
	"failure",
	"denied",
]);

export const auditSource = pgEnum("audit_source", [
	"orpc",
	"better_auth",
	"public_api",
	"worker",
]);

/**
 * A tenant-scoped, append-only product ledger. It deliberately has no foreign
 * keys: audit history must survive deletion of the actor or target resource.
 */
export const auditEvents = pgTable(
	"audit_events",
	{
		id: text().primaryKey(),
		organizationId: text("organization_id").notNull(),
		action: text().notNull(),
		outcome: auditOutcome().notNull().default("success"),
		source: auditSource().notNull(),
		operation: text(),
		actorType: auditActorType("actor_type").notNull(),
		actorId: text("actor_id").notNull(),
		actorDisplayName: text("actor_display_name"),
		targetType: text("target_type").notNull(),
		targetId: text("target_id").notNull(),
		targetDisplayName: text("target_display_name"),
		changes: jsonb().$type<AuditChanges>().notNull().default({}),
		metadata: jsonb().$type<AuditMetadata>().notNull().default({}),
		reason: text(),
		requestId: text("request_id"),
		ip: text(),
		userAgent: text("user_agent"),
		createdAt: timestamp("created_at", {
			precision: 3,
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("audit_events_organization_created_at_idx").on(
			table.organizationId,
			table.createdAt.desc(),
			table.id.desc()
		),
		index("audit_events_organization_action_created_at_idx").on(
			table.organizationId,
			table.action,
			table.createdAt
		),
		index("audit_events_organization_target_created_at_idx").on(
			table.organizationId,
			table.targetType,
			table.targetId,
			table.createdAt
		),
	]
);

/**
 * Durable retry queue for audit writes that fail after their primary mutation
 * has committed. API workers replay these rows until the ledger accepts them.
 */
export const auditOutboxEvents = pgTable(
	"audit_outbox_events",
	{
		id: text().primaryKey(),
		payload: jsonb().$type<AuditOutboxPayload>().notNull(),
		createdAt: timestamp("created_at", {
			precision: 3,
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
	},
	(table) => [index("audit_outbox_events_created_at_idx").on(table.createdAt)]
);
