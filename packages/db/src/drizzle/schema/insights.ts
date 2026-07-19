import { inArray } from "drizzle-orm";
import type {
	InvestigationEvidence,
	InvestigationOutcome,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import {
	boolean,
	foreignKey,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { analyticsInsights } from "./analytics";
import { organization, user } from "./auth";
import { websites } from "./websites";

export type InsightGenerationFrequency = "daily" | "weekly";
export type InsightGenerationReason =
	| "manual"
	| "scheduled"
	| "cooldown_refresh";
export type InsightRunStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "partially_succeeded"
	| "failed"
	| "skipped";
export const INSIGHT_RUN_ACTIVE_STATUSES = ["queued", "running"] as const;
export const INSIGHT_RUN_ACTIVE_UNIQUE_INDEX = "insight_runs_org_active_uidx";
type InsightRunItemStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "failed"
	| "skipped";
export type InsightRunPreparedStatus = "skipped" | "succeeded";
type InsightRunEffectStatus = "failed" | "pending" | "succeeded";
type InsightReplyStatus = "queued" | "running" | "succeeded" | "failed";

export interface InsightDelivery {
	channelId: string;
	type: "slack";
}

export const insightGenerationConfigs = pgTable(
	"insight_generation_configs",
	{
		id: text().primaryKey(),
		organizationId: text("organization_id").notNull(),
		enabled: boolean().default(false).notNull(),
		frequency: text()
			.$type<InsightGenerationFrequency>()
			.default("weekly")
			.notNull(),
		timezone: text().default("UTC").notNull(),
		deliveries: jsonb("deliveries")
			.$type<InsightDelivery[]>()
			.default([])
			.notNull(),
		nextRunAt: timestamp("next_run_at", {
			precision: 3,
			withTimezone: true,
		}),
		lastRunAt: timestamp("last_run_at", {
			precision: 3,
			withTimezone: true,
		}),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("insight_generation_configs_org_uidx").on(table.organizationId),
		index("insight_generation_configs_next_run_idx").on(table.nextRunAt),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "insight_generation_configs_organization_id_fkey",
		}).onDelete("cascade"),
	]
);

export const insightRuns = pgTable(
	"insight_runs",
	{
		id: text().primaryKey(),
		organizationId: text("organization_id").notNull(),
		requestedByUserId: text("requested_by_user_id"),
		reason: text().$type<InsightGenerationReason>().default("manual").notNull(),
		status: text().$type<InsightRunStatus>().default("queued").notNull(),
		timezone: text().default("UTC").notNull(),
		totalItems: integer("total_items").default(0).notNull(),
		completedItems: integer("completed_items").default(0).notNull(),
		failedItems: integer("failed_items").default(0).notNull(),
		skippedItems: integer("skipped_items").default(0).notNull(),
		errorMessage: text("error_message"),
		startedAt: timestamp("started_at", {
			precision: 3,
			withTimezone: true,
		}),
		finishedAt: timestamp("finished_at", {
			precision: 3,
			withTimezone: true,
		}),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("insight_runs_org_created_idx").on(
			table.organizationId,
			table.createdAt.desc()
		),
		uniqueIndex(INSIGHT_RUN_ACTIVE_UNIQUE_INDEX)
			.on(table.organizationId)
			.where(inArray(table.status, INSIGHT_RUN_ACTIVE_STATUSES)),
		index("insight_runs_status_idx").on(table.status),
		index("insight_runs_status_updated_idx").on(table.status, table.updatedAt),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "insight_runs_organization_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.requestedByUserId],
			foreignColumns: [user.id],
			name: "insight_runs_requested_by_user_id_fkey",
		}).onDelete("set null"),
	]
);

export const insightRunItems = pgTable(
	"insight_run_items",
	{
		id: text().primaryKey(),
		runId: text("run_id").notNull(),
		organizationId: text("organization_id").notNull(),
		websiteId: text("website_id").notNull(),
		queueJobId: text("queue_job_id"),
		status: text().$type<InsightRunItemStatus>().default("queued").notNull(),
		attempts: integer().default(0).notNull(),
		resultCount: integer("result_count").default(0).notNull(),
		preparedAt: timestamp("prepared_at", {
			precision: 3,
			withTimezone: true,
		}),
		preparedStatus: text("prepared_status").$type<InsightRunPreparedStatus>(),
		preparedMessage: text("prepared_message"),
		errorMessage: text("error_message"),
		startedAt: timestamp("started_at", {
			precision: 3,
			withTimezone: true,
		}),
		finishedAt: timestamp("finished_at", {
			precision: 3,
			withTimezone: true,
		}),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("insight_run_items_run_website_uidx").on(
			table.runId,
			table.websiteId
		),
		index("insight_run_items_run_status_idx").on(table.runId, table.status),
		index("insight_run_items_status_updated_idx").on(
			table.status,
			table.updatedAt
		),
		index("insight_run_items_org_website_idx").on(
			table.organizationId,
			table.websiteId
		),
		foreignKey({
			columns: [table.runId],
			foreignColumns: [insightRuns.id],
			name: "insight_run_items_run_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "insight_run_items_organization_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId, table.websiteId],
			foreignColumns: [websites.organizationId, websites.id],
			name: "insight_run_items_org_website_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "insight_run_items_website_id_fkey",
		}).onDelete("cascade"),
	]
);

export const insightRunEffects = pgTable(
	"insight_run_effects",
	{
		id: text().primaryKey(),
		runItemId: text("run_item_id").notNull(),
		effectKey: text("effect_key").notNull(),
		payload: jsonb().$type<unknown>().notNull(),
		status: text().$type<InsightRunEffectStatus>().default("pending").notNull(),
		attempts: integer().default(0).notNull(),
		externalId: text("external_id"),
		errorMessage: text("error_message"),
		completedAt: timestamp("completed_at", {
			precision: 3,
			withTimezone: true,
		}),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("insight_run_effects_item_key_uidx").on(
			table.runItemId,
			table.effectKey
		),
		index("insight_run_effects_status_updated_idx").on(
			table.status,
			table.updatedAt
		),
		foreignKey({
			columns: [table.runItemId],
			foreignColumns: [insightRunItems.id],
			name: "insight_run_effects_run_item_id_fkey",
		}).onDelete("cascade"),
	]
);

export const insightObservations = pgTable(
	"insight_observations",
	{
		id: text().primaryKey(),
		runId: text("run_id"),
		organizationId: text("organization_id").notNull(),
		websiteId: text("website_id").notNull(),
		insightId: text("insight_id"),
		signalKey: text("signal_key").notNull(),
		asOf: timestamp("as_of", { precision: 3, withTimezone: true }).notNull(),
		signal: jsonb().$type<InvestigationSignal>().notNull(),
		evidence: jsonb().$type<InvestigationEvidence[]>().default([]).notNull(),
		outcome: jsonb("decision").$type<InvestigationOutcome>().notNull(),
		recheckAt: timestamp("recheck_at", {
			precision: 3,
			withTimezone: true,
		}).notNull(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("insight_observations_run_website_uidx").on(
			table.runId,
			table.websiteId
		),
		index("insight_observations_site_signal_asof_idx").on(
			table.organizationId,
			table.websiteId,
			table.signalKey,
			table.asOf.desc(),
			table.createdAt.desc()
		),
		foreignKey({
			columns: [table.runId],
			foreignColumns: [insightRuns.id],
			name: "insight_observations_run_id_fkey",
		}).onDelete("set null"),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "insight_observations_organization_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId, table.websiteId],
			foreignColumns: [websites.organizationId, websites.id],
			name: "insight_observations_org_website_fkey",
		}).onDelete("cascade"),
	]
);

// Keep the populated legacy table through the additive replies rollout.
// No application code reads or writes it.
export const legacyInsightRollups = pgTable(
	"insight_rollups",
	{
		id: text().primaryKey(),
		organizationId: text("organization_id").notNull(),
		runId: text("run_id"),
		range: text().notNull(),
		narrative: text().notNull(),
		generatedAt: timestamp("generated_at", {
			precision: 3,
			withTimezone: true,
		})
			.defaultNow()
			.notNull(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("insight_rollups_org_range_uidx").on(
			table.organizationId,
			table.range
		),
		index("insight_rollups_org_generated_idx").on(
			table.organizationId,
			table.generatedAt.desc()
		),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "insight_rollups_organization_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.runId],
			foreignColumns: [insightRuns.id],
			name: "insight_rollups_run_id_fkey",
		}).onDelete("set null"),
	]
);

export const insightReplies = pgTable(
	"insight_replies",
	{
		id: text().primaryKey(),
		insightId: text("insight_id").notNull(),
		authorId: text("author_id"),
		authorName: text("author_name").notNull(),
		body: text().notNull(),
		status: text().$type<InsightReplyStatus>().default("queued").notNull(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("insight_replies_insight_created_idx").on(
			table.insightId,
			table.createdAt,
			table.id
		),
		foreignKey({
			columns: [table.insightId],
			foreignColumns: [analyticsInsights.id],
			name: "insight_replies_insight_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.authorId],
			foreignColumns: [user.id],
			name: "insight_replies_author_id_fkey",
		}).onDelete("set null"),
	]
);

export type InsightGenerationConfig =
	typeof insightGenerationConfigs.$inferSelect;
export type InsightRunItem = typeof insightRunItems.$inferSelect;
