import { ANTHROPIC_CACHE_1H, models } from "@databuddy/ai/config/models";
import { getAILogger } from "@databuddy/ai/lib/ai-logger";
import { and, db, desc, eq, gte, isNull, sql } from "@databuddy/db";
import {
	analyticsInsights,
	insightRollups,
	type InsightRollupRange,
	websites,
} from "@databuddy/db/schema";
import {
	invalidateInsightsCachesForOrganization,
	type InsightsRollupJobData,
} from "@databuddy/redis";
import { generateText } from "ai";
import { randomUUIDv7 } from "bun";
import dayjs from "dayjs";
import { captureInsightsError, emitInsightsEvent } from "./lib/evlog-insights";

const ROLLUP_RANGES = ["7d", "30d", "90d"] as const;
const RANGE_TO_DAYS: Record<InsightRollupRange, number> = {
	"7d": 7,
	"30d": 30,
	"90d": 90,
};
const RANGE_TO_LABEL: Record<InsightRollupRange, string> = {
	"7d": "week",
	"30d": "month",
	"90d": "quarter",
};
const ROLLUP_INSIGHT_LIMIT = 12;
const MAX_NARRATIVE_LENGTH = 700;

export interface RollupInsightSummary {
	changePercent: number | null;
	description: string;
	priority: number;
	sentiment: string;
	severity: string;
	suggestion: string;
	title: string;
	websiteDomain: string;
	websiteName: string | null;
}

function sanitizeNarrative(value: string): string {
	const text = value.replace(/\s+/g, " ").trim();
	if (text.length <= MAX_NARRATIVE_LENGTH) {
		return text;
	}
	return `${text.slice(0, MAX_NARRATIVE_LENGTH - 3).trimEnd()}...`;
}

export function buildDeterministicRollupNarrative(
	range: InsightRollupRange,
	insights: RollupInsightSummary[]
): string {
	const label = RANGE_TO_LABEL[range];
	const headline = insights[0];
	if (!headline) {
		return `All systems healthy this ${label}. No actionable signals detected.`;
	}

	const siteName = headline.websiteName ?? headline.websiteDomain;
	const change =
		headline.changePercent == null
			? ""
			: ` (${headline.changePercent > 0 ? "+" : ""}${headline.changePercent.toFixed(0)}%)`;
	const opener = `This ${label}: ${headline.title}${change} on ${siteName}.`;
	if (insights.length === 1) {
		return opener;
	}

	const extra = insights.length - 1;
	const second = insights[1];
	const secondSite = second.websiteName ?? second.websiteDomain;
	if (extra === 1) {
		return `${opener} Also review ${second.title} on ${secondSite}.`;
	}
	const remaining = extra - 1;
	return `${opener} Also review ${second.title} on ${secondSite}, plus ${remaining} more signal${remaining === 1 ? "" : "s"}.`;
}

async function fetchRollupInsights(
	organizationId: string,
	range: InsightRollupRange
): Promise<RollupInsightSummary[]> {
	const cutoff = dayjs()
		.subtract(RANGE_TO_DAYS[range], "day")
		.format("YYYY-MM-DD");
	return await db
		.select({
			title: analyticsInsights.title,
			description: analyticsInsights.description,
			suggestion: analyticsInsights.suggestion,
			severity: analyticsInsights.severity,
			sentiment: analyticsInsights.sentiment,
			priority: analyticsInsights.priority,
			changePercent: analyticsInsights.changePercent,
			websiteName: websites.name,
			websiteDomain: websites.domain,
		})
		.from(analyticsInsights)
		.innerJoin(websites, eq(analyticsInsights.websiteId, websites.id))
		.where(
			and(
				eq(analyticsInsights.organizationId, organizationId),
				gte(analyticsInsights.currentPeriodTo, cutoff),
				isNull(websites.deletedAt)
			)
		)
		.orderBy(
			desc(analyticsInsights.priority),
			desc(analyticsInsights.createdAt)
		)
		.limit(ROLLUP_INSIGHT_LIMIT);
}

async function generateRollupNarrative(
	range: InsightRollupRange,
	organizationId: string,
	insights: RollupInsightSummary[]
): Promise<string> {
	const fallback = buildDeterministicRollupNarrative(range, insights);
	if (insights.length === 0) {
		emitInsightsEvent("info", "rollup.narrative_deterministic_empty", {
			organization_id: organizationId,
			range,
		});
		return fallback;
	}

	try {
		const startedAt = performance.now();
		const ai = getAILogger();
		const result = await generateText({
			model: ai.wrap(models.balanced),
			messages: [
				{
					role: "system",
					content:
						"Write one compact Databuddy executive analytics brief from stored insight cards. Use only the supplied cards. Be specific, operational, and plain English. Mention the most important website names. Do not invent causes, revenue, user counts, or metrics. Return one paragraph under 90 words.",
					providerOptions: ANTHROPIC_CACHE_1H,
				},
				{
					role: "user",
					content: JSON.stringify(
						{
							range,
							insights,
						},
						null,
						2
					),
				},
			],
			temperature: 0.2,
			maxOutputTokens: 512,
			abortSignal: AbortSignal.timeout(30_000),
			experimental_telemetry: {
				isEnabled: true,
				functionId: "databuddy.insights.worker.rollup",
				metadata: {
					source: "insights_worker",
					feature: "smart_insights",
					organizationId,
					range,
				},
			},
		});

		const text = sanitizeNarrative(result.text);
		emitInsightsEvent("info", "rollup.narrative_generation_completed", {
			organization_id: organizationId,
			range,
			duration_ms: Math.round(performance.now() - startedAt),
			insight_count: insights.length,
			used_fallback: text.length === 0,
		});
		return text || fallback;
	} catch (error) {
		captureInsightsError(error, "rollup.narrative_generation_failed", {
			organization_id: organizationId,
			range,
		});
		return fallback;
	}
}

async function persistRollup(input: {
	generatedAt: Date;
	narrative: string;
	organizationId: string;
	range: InsightRollupRange;
	runId: string | null;
}): Promise<void> {
	await db
		.insert(insightRollups)
		.values({
			id: randomUUIDv7(),
			organizationId: input.organizationId,
			runId: input.runId,
			range: input.range,
			narrative: input.narrative,
			generatedAt: input.generatedAt,
			updatedAt: input.generatedAt,
		})
		.onConflictDoUpdate({
			target: [insightRollups.organizationId, insightRollups.range],
			set: {
				runId: input.runId,
				narrative: sql.raw("excluded.narrative"),
				generatedAt: input.generatedAt,
				updatedAt: input.generatedAt,
			},
		});
}

async function generateRangeRollup(
	data: InsightsRollupJobData,
	range: InsightRollupRange,
	generatedAt: Date
): Promise<void> {
	const startedAt = performance.now();
	const insights = await fetchRollupInsights(data.organizationId, range);
	const narrative = await generateRollupNarrative(
		range,
		data.organizationId,
		insights
	);

	await persistRollup({
		generatedAt,
		narrative,
		organizationId: data.organizationId,
		range,
		runId: data.runId,
	});
	emitInsightsEvent("info", "rollup.range_completed", {
		organization_id: data.organizationId,
		run_id: data.runId,
		range,
		duration_ms: Math.round(performance.now() - startedAt),
		insight_count: insights.length,
	});
}

export async function processRollupJob(
	data: InsightsRollupJobData
): Promise<{ ranges: number; status: "succeeded" }> {
	const startedAt = performance.now();
	const generatedAt = new Date();
	await Promise.all(
		ROLLUP_RANGES.map((range) => generateRangeRollup(data, range, generatedAt))
	);
	await invalidateInsightsCachesForOrganization(data.organizationId);

	emitInsightsEvent("info", "rollup.job_completed", {
		organization_id: data.organizationId,
		run_id: data.runId,
		reason: data.reason,
		duration_ms: Math.round(performance.now() - startedAt),
		ranges: ROLLUP_RANGES.length,
	});

	return { status: "succeeded", ranges: ROLLUP_RANGES.length };
}
