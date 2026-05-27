import { isNotNull } from "drizzle-orm";
import {
	boolean,
	doublePrecision,
	foreignKey,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { websites } from "./websites";

export const funnelStepType = pgEnum("FunnelStepType", [
	"PAGE_VIEW",
	"EVENT",
	"CUSTOM",
]);

export const annotationType = pgEnum("annotation_type", [
	"point",
	"line",
	"range",
]);

export const chartType = pgEnum("chart_type", ["metrics"]);

export interface DataFilter {
	field: string;
	operator: "equals" | "contains" | "not_equals" | "in" | "not_in";
	value: string | string[];
}

export interface FunnelStep {
	conditions?: Record<string, unknown>;
	name: string;
	target: string;
	type: "PAGE_VIEW" | "EVENT" | "CUSTOM";
}

export interface AnnotationChartContext {
	dateRange: {
		start_date: string;
		end_date: string;
		granularity: "hourly" | "daily" | "weekly" | "monthly";
	};
	filters?: Array<{
		field: string;
		operator: "eq" | "ne" | "gt" | "lt" | "contains";
		value: string;
	}>;
	metrics?: string[];
	tabId?: string;
}

export interface AnalyticsInsightMetric {
	current: number;
	format: "number" | "percent" | "duration_ms" | "duration_s";
	label: string;
	previous?: number;
}

export interface AnalyticsInsightEvidence {
	description: string;
	type: "segment" | "error" | "annotation" | "temporal" | "metric";
}

export type AnalyticsInsightSource = "web" | "product" | "ops" | "business";

export interface AnalyticsInsightAction {
	label: string;
	params: Record<string, string>;
	type:
		| "fix_goal"
		| "create_funnel"
		| "add_custom_event"
		| "create_annotation"
		| "update_config"
		| "add_tracking"
		| "investigate_further"
		| "code_fix";
}

export const funnelDefinitions = pgTable(
	"funnel_definitions",
	{
		id: text().primaryKey(),
		websiteId: text("website_id").notNull(),
		name: text().notNull(),
		description: text(),
		steps: jsonb().$type<FunnelStep[]>().notNull(),
		filters: jsonb().$type<DataFilter[]>(),
		ignoreHistoricData: boolean("ignore_historic_data")
			.default(false)
			.notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		createdBy: text("created_by").notNull(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
		deletedAt: timestamp("deleted_at", { precision: 3, withTimezone: true }),
	},
	(table) => [
		index("funnel_definitions_website_id_idx").on(table.websiteId),
		index("funnel_definitions_created_by_idx").on(table.createdBy),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "funnel_definitions_website_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: "funnel_definitions_created_by_fkey",
		}).onDelete("restrict"),
	]
);

export const goals = pgTable(
	"goals",
	{
		id: text().primaryKey(),
		websiteId: text("website_id").notNull(),
		type: text().$type<"PAGE_VIEW" | "EVENT" | "CUSTOM">().notNull(),
		target: text().notNull(),
		name: text().notNull(),
		description: text(),
		filters: jsonb().$type<DataFilter[]>(),
		ignoreHistoricData: boolean("ignore_historic_data")
			.default(false)
			.notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		createdBy: text("created_by").notNull(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
		deletedAt: timestamp("deleted_at", { precision: 3, withTimezone: true }),
	},
	(table) => [
		index("goals_website_id_idx").on(table.websiteId),
		index("goals_created_by_idx").on(table.createdBy),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "goals_website_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: "goals_created_by_fkey",
		}).onDelete("restrict"),
	]
);

export const annotations = pgTable(
	"annotations",
	{
		id: text().primaryKey(),
		websiteId: text("website_id").notNull(),
		chartType: chartType("chart_type").notNull(),
		chartContext: jsonb("chart_context")
			.$type<AnnotationChartContext>()
			.notNull(),
		annotationType: annotationType("annotation_type").notNull(),
		xValue: timestamp("x_value", {
			precision: 3,
			withTimezone: true,
		}).notNull(),
		xEndValue: timestamp("x_end_value", { precision: 3, withTimezone: true }),
		yValue: integer("y_value"),
		text: text().notNull(),
		tags: text().array(),
		color: text().default("#3B82F6").notNull(),
		isPublic: boolean("is_public").default(false).notNull(),
		createdBy: text("created_by").notNull(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
		deletedAt: timestamp("deleted_at", { precision: 3, withTimezone: true }),
	},
	(table) => [
		index("annotations_website_id_idx").on(table.websiteId),
		index("annotations_created_by_idx").on(table.createdBy),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "annotations_website_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: "annotations_created_by_fkey",
		}).onDelete("restrict"),
	]
);

export const analyticsInsights = pgTable(
	"analytics_insights",
	{
		id: text().primaryKey(),
		organizationId: text("organization_id").notNull(),
		websiteId: text("website_id").notNull(),
		runId: text("run_id").notNull(),
		title: text().notNull(),
		description: text().notNull(),
		suggestion: text().notNull(),
		severity: text().notNull(),
		sentiment: text().notNull(),
		type: text().notNull(),
		priority: integer().notNull(),
		changePercent: doublePrecision("change_percent"),
		dedupeKey: text("dedupe_key"),
		subjectKey: text("subject_key").notNull().default(""),
		sources: jsonb().$type<AnalyticsInsightSource[]>().notNull().default([]),
		confidence: doublePrecision().notNull().default(0),
		impactSummary: text("impact_summary"),
		metrics: jsonb().$type<AnalyticsInsightMetric[]>(),
		rootCause: text("root_cause"),
		evidence: jsonb("evidence").$type<AnalyticsInsightEvidence[]>(),
		investigationDepth: text("investigation_depth").$type<
			"surface" | "investigated" | "deep"
		>(),
		actions: jsonb().$type<AnalyticsInsightAction[]>(),
		timezone: text().notNull().default("UTC"),
		currentPeriodFrom: text("current_period_from").notNull(),
		currentPeriodTo: text("current_period_to").notNull(),
		previousPeriodFrom: text("previous_period_from").notNull(),
		previousPeriodTo: text("previous_period_to").notNull(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("analytics_insights_org_created_idx").on(
			table.organizationId,
			table.createdAt.desc()
		),
		index("analytics_insights_website_created_idx").on(
			table.websiteId,
			table.createdAt.desc()
		),
		index("analytics_insights_run_idx").on(table.runId),
		index("analytics_insights_subject_key_idx").on(
			table.websiteId,
			table.subjectKey,
			table.createdAt.desc()
		),
		uniqueIndex("analytics_insights_org_dedupe_key_uidx")
			.on(table.organizationId, table.dedupeKey)
			.where(isNotNull(table.dedupeKey)),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "analytics_insights_organization_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId, table.websiteId],
			foreignColumns: [websites.organizationId, websites.id],
			name: "analytics_insights_org_website_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "analytics_insights_website_id_fkey",
		}).onDelete("cascade"),
	]
);

export const revenueConfig = pgTable(
	"revenue_config",
	{
		id: text().primaryKey(),
		ownerId: text("owner_id").notNull(),
		websiteId: text("website_id"),
		webhookHash: text("webhook_hash").notNull(),
		stripeWebhookSecret: text("stripe_webhook_secret"),
		paddleWebhookSecret: text("paddle_webhook_secret"),
		currency: text().default("USD").notNull(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("revenue_config_webhook_hash_unique").on(table.webhookHash),
		uniqueIndex("revenue_config_owner_website_unique").on(
			table.ownerId,
			table.websiteId
		),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "revenue_config_website_id_fkey",
		}).onDelete("cascade"),
	]
);

export type Annotations = typeof annotations.$inferSelect;
export type AnnotationsInsert = typeof annotations.$inferInsert;
export type AnalyticsInsight = typeof analyticsInsights.$inferSelect;
export type AnalyticsInsightInsert = typeof analyticsInsights.$inferInsert;
export type RevenueConfig = typeof revenueConfig.$inferSelect;
export type RevenueConfigInsert = typeof revenueConfig.$inferInsert;
