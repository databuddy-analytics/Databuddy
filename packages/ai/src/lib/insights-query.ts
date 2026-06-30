import {
	and,
	db,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	lte,
	type SQL,
} from "@databuddy/db";
import { analyticsInsights, websites } from "@databuddy/db/schema";

export type InsightSeverity = "critical" | "warning" | "info";
export type InsightSentiment = "positive" | "neutral" | "negative";

export interface InsightMetricRow {
	current: number;
	format: "number" | "percent" | "duration_ms" | "duration_s";
	label: string;
	previous?: number;
}

export interface InsightRow {
	changePercent: number | null;
	confidence: number;
	createdAt: Date;
	currentPeriodFrom: string;
	currentPeriodTo: string;
	description: string;
	id: string;
	impactSummary: string | null;
	metrics: InsightMetricRow[] | null;
	previousPeriodFrom: string;
	previousPeriodTo: string;
	priority: number;
	sentiment: string;
	severity: string;
	sources: Array<"web" | "product" | "ops" | "business">;
	subjectKey: string;
	suggestion: string;
	timezone: string;
	title: string;
	type: string;
	websiteDomain: string;
	websiteId: string;
	websiteName: string | null;
}

export interface FetchInsightsOptions {
	createdAfter?: Date;
	createdBefore?: Date;
	ids?: string[];
	limit: number;
	organizationIds: string[];
	sentiments?: string[];
	severities?: string[];
	types?: string[];
	websiteId?: string;
}

export async function fetchInsightsForOrgs(
	opts: FetchInsightsOptions
): Promise<InsightRow[]> {
	if (opts.organizationIds.length === 0) {
		return [];
	}

	const conditions: (SQL | undefined)[] = [
		inArray(analyticsInsights.organizationId, opts.organizationIds),
		isNull(websites.deletedAt),
	];

	if (opts.websiteId) {
		conditions.push(eq(analyticsInsights.websiteId, opts.websiteId));
	}
	if (opts.ids && opts.ids.length > 0) {
		conditions.push(inArray(analyticsInsights.id, opts.ids));
	}
	if (opts.types && opts.types.length > 0) {
		conditions.push(inArray(analyticsInsights.type, opts.types));
	}
	if (opts.severities && opts.severities.length > 0) {
		conditions.push(inArray(analyticsInsights.severity, opts.severities));
	}
	if (opts.sentiments && opts.sentiments.length > 0) {
		conditions.push(inArray(analyticsInsights.sentiment, opts.sentiments));
	}
	if (opts.createdAfter) {
		conditions.push(gte(analyticsInsights.createdAt, opts.createdAfter));
	}
	if (opts.createdBefore) {
		conditions.push(lte(analyticsInsights.createdAt, opts.createdBefore));
	}

	const rows = await db
		.select({
			id: analyticsInsights.id,
			websiteId: analyticsInsights.websiteId,
			websiteName: websites.name,
			websiteDomain: websites.domain,
			type: analyticsInsights.type,
			severity: analyticsInsights.severity,
			sentiment: analyticsInsights.sentiment,
			priority: analyticsInsights.priority,
			title: analyticsInsights.title,
			description: analyticsInsights.description,
			suggestion: analyticsInsights.suggestion,
			changePercent: analyticsInsights.changePercent,
			subjectKey: analyticsInsights.subjectKey,
			sources: analyticsInsights.sources,
			confidence: analyticsInsights.confidence,
			impactSummary: analyticsInsights.impactSummary,
			metrics: analyticsInsights.metrics,
			currentPeriodFrom: analyticsInsights.currentPeriodFrom,
			currentPeriodTo: analyticsInsights.currentPeriodTo,
			previousPeriodFrom: analyticsInsights.previousPeriodFrom,
			previousPeriodTo: analyticsInsights.previousPeriodTo,
			timezone: analyticsInsights.timezone,
			createdAt: analyticsInsights.createdAt,
		})
		.from(analyticsInsights)
		.innerJoin(websites, eq(analyticsInsights.websiteId, websites.id))
		.where(and(...conditions))
		.orderBy(
			desc(analyticsInsights.priority),
			desc(analyticsInsights.createdAt)
		)
		.limit(opts.limit);

	return rows.map((r) => ({
		...r,
		metrics: (r.metrics as InsightMetricRow[] | null) ?? null,
		sources:
			(r.sources as Array<"web" | "product" | "ops" | "business"> | null) ?? [],
	}));
}
