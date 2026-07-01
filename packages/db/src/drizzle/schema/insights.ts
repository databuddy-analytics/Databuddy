import { isNotNull, isNull } from "drizzle-orm";
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
import { organization, user } from "./auth";
import { websites } from "./websites";

export const INSIGHT_GENERATION_DEFAULT_TOOLS = [
	"web_metrics",
	"product_metrics",
	"ops_context",
] as const;

export type InsightGenerationTool =
	| "web_metrics"
	| "product_metrics"
	| "ops_context"
	| "business_context";
export type InsightGenerationDepth = "light" | "standard" | "deep";
export type InsightGenerationFrequency =
	| "hourly"
	| "daily"
	| "weekly"
	| "custom";
export type InsightGenerationModelTier = "fast" | "balanced" | "deep";
export type InsightGenerationReason =
	| "manual"
	| "scheduled"
	| "cooldown_refresh";
export type InsightRollupRange = "7d" | "30d" | "90d";
export type InsightRunStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "partially_succeeded"
	| "failed"
	| "skipped";
export type InsightRunItemStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "failed"
	| "skipped";

export interface InsightDelivery {
	channelId: string;
	type: "slack";
}

export interface InsightGenerationConfigSnapshot {
	allowedTools: InsightGenerationTool[];
	cooldownHours: number;
	depth: InsightGenerationDepth;
	lookbackDays: number;
	maxInsightsPerWebsite: number;
	maxSteps: number;
	maxToolCalls: number;
	modelTier: InsightGenerationModelTier;
	timezone: string;
}

export const insightGenerationConfigs = pgTable(
	"insight_generation_configs",
	{
		id: text().primaryKey(),
		organizationId: text("organization_id").notNull(),
		websiteId: text("website_id"),
		enabled: boolean().default(true).notNull(),
		frequency: text()
			.$type<InsightGenerationFrequency>()
			.default("weekly")
			.notNull(),
		cron: text(),
		depth: text().$type<InsightGenerationDepth>().default("standard").notNull(),
		maxSteps: integer("max_steps").default(50).notNull(),
		maxToolCalls: integer("max_tool_calls").default(50).notNull(),
		maxInsightsPerWebsite: integer("max_insights_per_website")
			.default(2)
			.notNull(),
		cooldownHours: integer("cooldown_hours").default(6).notNull(),
		lookbackDays: integer("lookback_days").default(7).notNull(),
		timezone: text().default("UTC").notNull(),
		modelTier: text("model_tier")
			.$type<InsightGenerationModelTier>()
			.default("balanced")
			.notNull(),
		allowedTools: jsonb("allowed_tools")
			.$type<InsightGenerationTool[]>()
			.default([...INSIGHT_GENERATION_DEFAULT_TOOLS])
			.notNull(),
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
		uniqueIndex("insight_generation_configs_org_default_uidx")
			.on(table.organizationId)
			.where(isNull(table.websiteId)),
		uniqueIndex("insight_generation_configs_org_website_uidx")
			.on(table.organizationId, table.websiteId)
			.where(isNotNull(table.websiteId)),
		index("insight_generation_configs_org_next_run_idx").on(
			table.organizationId,
			table.nextRunAt
		),
		index("insight_generation_configs_website_idx").on(table.websiteId),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "insight_generation_configs_organization_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId, table.websiteId],
			foreignColumns: [websites.organizationId, websites.id],
			name: "insight_generation_configs_org_website_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "insight_generation_configs_website_id_fkey",
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
		configSnapshot: jsonb("config_snapshot")
			.$type<InsightGenerationConfigSnapshot>()
			.notNull(),
		resultCount: integer("result_count").default(0).notNull(),
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

export const insightRollups = pgTable(
	"insight_rollups",
	{
		id: text().primaryKey(),
		organizationId: text("organization_id").notNull(),
		runId: text("run_id"),
		range: text().$type<InsightRollupRange>().notNull(),
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

export type InsightGenerationConfig =
	typeof insightGenerationConfigs.$inferSelect;
export type InsightGenerationConfigInsert =
	typeof insightGenerationConfigs.$inferInsert;
export type InsightRun = typeof insightRuns.$inferSelect;
export type InsightRunInsert = typeof insightRuns.$inferInsert;
export type InsightRunItem = typeof insightRunItems.$inferSelect;
export type InsightRunItemInsert = typeof insightRunItems.$inferInsert;
export type InsightRollup = typeof insightRollups.$inferSelect;
export type InsightRollupInsert = typeof insightRollups.$inferInsert;
