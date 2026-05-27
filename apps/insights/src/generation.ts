import type { AppContext } from "@databuddy/ai/config/context";
import {
	ANTHROPIC_CACHE_1H,
	createModelFromId,
} from "@databuddy/ai/config/models";
import { insightDedupeKey } from "@databuddy/ai/insights/dedupe";
import { hasWebInsightData } from "@databuddy/ai/insights/fetch-context";
import type {
	InsightMetricRow,
	WeekOverWeekPeriod,
} from "@databuddy/ai/insights/types";
import { validateInsights } from "@databuddy/ai/insights/validate";
import { getAILogger } from "@databuddy/ai/lib/ai-logger";
import { storeAnalyticsSummary } from "@databuddy/ai/lib/supermemory";
import type { ParsedInsight } from "@databuddy/ai/schemas/smart-insights-output";
import { insightSchema } from "@databuddy/ai/schemas/smart-insights-output";
import { createToolkit } from "@databuddy/ai/tools/toolkit";
import { createInsightsAgentTools } from "@databuddy/ai/tools/insights-agent-tools";
import {
	and,
	db,
	desc,
	eq,
	gte,
	inArray,
	isNotNull,
	isNull,
	sql,
} from "@databuddy/db";
import {
	analyticsInsights,
	type InsightGenerationConfigSnapshot,
	type InsightGenerationTool,
	websites,
} from "@databuddy/db/schema";
import {
	invalidateAgentContextSnapshotsForWebsite,
	invalidateInsightsCachesForOrganization,
} from "@databuddy/redis";
import { getCachedSiteContext } from "@databuddy/ai/tools/scrape-page";
import { getOAuthToken } from "@databuddy/ai/tools/utils/oauth-token";
import { stepCountIs, tool, ToolLoopAgent } from "ai";
import { randomUUIDv7 } from "bun";
import dayjs from "dayjs";
import { detectSignals } from "./detection";
import { enrichSignals, type EnrichedSignal } from "./enrichment";
import {
	buildInvestigationPrompt,
	buildSystemPrompt,
	fetchDismissedPatterns,
	fetchRecentAnnotations,
	fetchRecentInsightsForPrompt,
	formatOrgWebsitesContext,
	type OrgWebsiteRow,
} from "./prompts";
import {
	captureInsightsError,
	emitInsightsEvent,
	setInsightsLog,
} from "./lib/evlog-insights";

const DEFAULT_MAX_INSIGHTS = 2;
const TOOL_NAMES = [
	"web_metrics",
	"product_metrics",
	"ops_context",
	"business_context",
] as const satisfies readonly InsightGenerationTool[];

const ALWAYS_ON_TOOLS = new Set([
	"execute_sql",
	"scrape_page",
	"search_console",
	"create_annotation",
	"update_goal",
	"create_funnel",
	"create_goal",
]);

interface GeneratedWebsiteInsight extends ParsedInsight {
	id: string;
	websiteDomain: string;
	websiteId: string;
	websiteName: string | null;
}

export interface GenerateWebsiteInsightsInput {
	config: InsightGenerationConfigSnapshot;
	organizationId: string;
	reason: string;
	requestedByUserId: string | null;
	runId: string;
	websiteId: string;
}

export interface GenerateWebsiteInsightsResult {
	insightIds: string[];
	message?: string;
	resultCount: number;
	status: "skipped" | "succeeded";
}

function maxInsights(config: InsightGenerationConfigSnapshot): number {
	return Math.max(
		1,
		Math.min(10, config.maxInsightsPerWebsite || DEFAULT_MAX_INSIGHTS)
	);
}

function getComparisonPeriod(lookbackDays: number): WeekOverWeekPeriod {
	const days = Math.max(1, Math.min(90, lookbackDays));
	const now = dayjs();
	return {
		current: {
			from: now.subtract(days, "day").format("YYYY-MM-DD"),
			to: now.format("YYYY-MM-DD"),
		},
		previous: {
			from: now.subtract(days * 2, "day").format("YYYY-MM-DD"),
			to: now.subtract(days, "day").format("YYYY-MM-DD"),
		},
	};
}

const INSIGHTS_MODELS = {
	quick: createModelFromId("openai/gpt-5.4-mini"),
	balanced: createModelFromId("anthropic/claude-sonnet-4.6"),
	deep: createModelFromId("anthropic/claude-opus-4.7"),
};

function modelForTier(
	tier: InsightGenerationConfigSnapshot["modelTier"],
	hasCriticalSignals?: boolean
) {
	if (tier === "fast") {
		return INSIGHTS_MODELS.quick;
	}
	if (tier === "deep") {
		return INSIGHTS_MODELS.deep;
	}
	if (tier === "balanced" && hasCriticalSignals) {
		return INSIGHTS_MODELS.deep;
	}
	return INSIGHTS_MODELS.balanced;
}

function normalizeAllowedTools(
	tools: InsightGenerationConfigSnapshot["allowedTools"]
): InsightGenerationTool[] {
	const allowed = new Set<InsightGenerationTool>(
		tools.filter((t): t is InsightGenerationTool =>
			(TOOL_NAMES as readonly string[]).includes(t)
		)
	);
	allowed.add("web_metrics");
	return TOOL_NAMES.filter((t) => allowed.has(t));
}

function dedupeKeyFor(insight: GeneratedWebsiteInsight): string {
	return insightDedupeKey({
		...insight,
		changePercent: insight.changePercent ?? null,
	});
}

async function fetchInsightDedupeKeyToIdMap(
	organizationId: string,
	cooldownHours: number
): Promise<Map<string, string>> {
	const cutoff = dayjs().subtract(Math.max(1, cooldownHours), "hour").toDate();
	const rows = await db
		.select({
			id: analyticsInsights.id,
			websiteId: analyticsInsights.websiteId,
			type: analyticsInsights.type,
			sentiment: analyticsInsights.sentiment,
			changePercent: analyticsInsights.changePercent,
			dedupeKey: analyticsInsights.dedupeKey,
			subjectKey: analyticsInsights.subjectKey,
			title: analyticsInsights.title,
		})
		.from(analyticsInsights)
		.where(
			and(
				eq(analyticsInsights.organizationId, organizationId),
				gte(analyticsInsights.createdAt, cutoff)
			)
		)
		.orderBy(desc(analyticsInsights.createdAt));

	const map = new Map<string, string>();
	for (const row of rows) {
		const key =
			row.dedupeKey ??
			insightDedupeKey({
				websiteId: row.websiteId,
				type: row.type as ParsedInsight["type"],
				sentiment: row.sentiment as ParsedInsight["sentiment"],
				changePercent: row.changePercent,
				subjectKey: row.subjectKey,
				title: row.title,
			});
		if (!map.has(key)) {
			map.set(key, row.id);
		}
	}
	return map;
}

function validateCollectedInsights(
	insights: ParsedInsight[],
	context: {
		config: InsightGenerationConfigSnapshot;
		organizationId: string;
		websiteId: string;
	}
): ParsedInsight[] {
	const validated = validateInsights(insights);
	if (validated.warnings.length > 0) {
		emitInsightsEvent("warn", "generation.validation_warnings", {
			organization_id: context.organizationId,
			website_id: context.websiteId,
			input_count: insights.length,
			output_count: validated.insights.length,
			warning_count: validated.warnings.length,
			warnings: validated.warnings,
		});
	}
	return validated.insights.slice(0, maxInsights(context.config));
}

async function analyzeWebsite(params: {
	config: InsightGenerationConfigSnapshot;
	domain: string;
	githubRepo?: { owner: string; repo: string };
	organizationId: string;
	orgSites: OrgWebsiteRow[];
	period: WeekOverWeekPeriod;
	userId?: string;
	websiteId: string;
}): Promise<ParsedInsight[]> {
	const startedAt = performance.now();
	const currentRange = params.period.current;
	const previousRange = params.period.previous;
	const [hasCurrentData, hasPreviousData] = await Promise.all([
		hasWebInsightData(
			params.websiteId,
			params.domain,
			currentRange.from,
			currentRange.to,
			params.config.timezone
		),
		hasWebInsightData(
			params.websiteId,
			params.domain,
			previousRange.from,
			previousRange.to,
			params.config.timezone
		),
	]);
	if (!(hasCurrentData || hasPreviousData)) {
		emitInsightsEvent("info", "generation.agent.skipped_no_data", {
			organization_id: params.organizationId,
			website_id: params.websiteId,
			duration_ms: Math.round(performance.now() - startedAt),
		});
		return [];
	}

	let enrichedSignals: EnrichedSignal[] = [];
	try {
		const signals = await detectSignals({
			websiteId: params.websiteId,
			lookbackDays: params.config.lookbackDays,
			timezone: params.config.timezone,
		});
		if (signals.length > 0) {
			const githubToken = params.githubRepo
				? await getOAuthToken("github", params.organizationId, params.userId)
				: null;

			enrichedSignals = await enrichSignals(signals, {
				websiteId: params.websiteId,
				timezone: params.config.timezone,
				lookbackDays: params.config.lookbackDays,
				githubRepo: params.githubRepo,
				githubToken,
			});
		}
	} catch (err) {
		emitInsightsEvent("warn", "generation.detection_failed", {
			error: String(err),
		});
	}

	const investigationMode = enrichedSignals.length > 0;

	const [annotationContext, recentInsightsBlock, siteContext, dismissedBlock] =
		await Promise.all([
			fetchRecentAnnotations(params.websiteId, params.config),
			fetchRecentInsightsForPrompt(
				params.organizationId,
				params.websiteId,
				params.config
			),
			getCachedSiteContext(params.domain),
			fetchDismissedPatterns(params.organizationId, params.websiteId),
		]);

	const allowedTools = normalizeAllowedTools(params.config.allowedTools);
	const orgContext = formatOrgWebsitesContext(
		params.orgSites,
		params.websiteId
	);
	const siteBlock = siteContext
		? `\n\nProduct context (cached from homepage):\n${siteContext}`
		: '\nScrape "/" first to understand the product.';
	const userPrompt = investigationMode
		? buildInvestigationPrompt(enrichedSignals, {
				domain: params.domain,
				githubRepo: params.githubRepo,
				period: params.period,
				timezone: params.config.timezone,
				recentInsightsBlock,
				annotationContext,
				dismissedBlock,
				orgContext,
				siteContext: siteBlock,
			})
		: `Analyze ${params.domain} (${currentRange.from} to ${currentRange.to} vs ${previousRange.from} to ${previousRange.to}, ${params.config.timezone}). Use web_metrics with period="both" to compare periods efficiently.${siteBlock}
${orgContext}${annotationContext}${recentInsightsBlock}${dismissedBlock}`;

	const { tools: analyticsTools } = createInsightsAgentTools({
		websiteId: params.websiteId,
		domain: params.domain,
		timezone: params.config.timezone,
		periodBounds: { current: currentRange, previous: previousRange },
	});
	const investigationTools = createToolkit({
		capabilities: ["investigation", "mutations"],
		domain: params.domain,
		organizationId: params.organizationId,
		userId: params.userId,
	});
	const allTools = { ...analyticsTools, ...investigationTools };
	const isEnabled = (name: string) =>
		allowedTools.includes(name as InsightGenerationTool) ||
		name.startsWith("github_") ||
		ALWAYS_ON_TOOLS.has(name);
	const availableTools = Object.fromEntries(
		Object.entries(allTools).filter(([name]) => isEnabled(name))
	) as typeof allTools;

	try {
		const appContext: AppContext = {
			userId: params.userId ?? "system",
			organizationId: params.organizationId,
			websiteId: params.websiteId,
			websiteDomain: params.domain,
			timezone: params.config.timezone,
			currentDateTime: new Date().toISOString(),
			chatId: `insights:${params.organizationId}:${params.websiteId}`,
			serviceAuth: {
				organizationId: params.organizationId,
				scopes: ["read:data"],
			},
		};

		const collected: ParsedInsight[] = [];
		const emitInsightTool = tool({
			description:
				"Call this when you have a finding worth reporting. Each call produces one insight. Call multiple times for multiple findings.",
			inputSchema: insightSchema,
			execute: (insight: ParsedInsight) => {
				collected.push(insight);
				return `Insight recorded: "${insight.title}"`;
			},
		});

		let toolCallCount = 0;
		const ai = getAILogger();
		const allToolsWithEmit = {
			...availableTools,
			emit_insight: emitInsightTool,
		};
		const agent = new ToolLoopAgent({
			model: ai.wrap(
				modelForTier(
					params.config.modelTier,
					enrichedSignals.some((s) => s.severity === "critical")
				)
			),
			instructions: {
				role: "system",
				content: buildSystemPrompt(params.config, { investigationMode }),
				providerOptions: ANTHROPIC_CACHE_1H,
			},
			tools: allToolsWithEmit,
			stopWhen: (event) => {
				if (stepCountIs(params.config.maxSteps)(event)) {
					return true;
				}
				if (
					collected.length >= maxInsights(params.config) &&
					event.steps
						.at(-1)
						?.toolCalls.some((tc) => tc?.toolName === "emit_insight")
				) {
					return true;
				}
				return false;
			},
			onStepFinish: ({ usage, finishReason, toolCalls }) => {
				toolCallCount += toolCalls.length;
				emitInsightsEvent("info", "generation.agent.step_finished", {
					organization_id: params.organizationId,
					website_id: params.websiteId,
					finish_reason: finishReason,
					tool_calls: toolCalls.flatMap((toolCall) =>
						toolCall ? [toolCall.toolName] : []
					),
					total_tokens: usage?.totalTokens,
					tool_call_count: toolCallCount,
				});
			},
			temperature: 0.2,
			experimental_context: appContext,
			experimental_telemetry: {
				isEnabled: true,
				functionId: "databuddy.insights.worker.analyze_website",
				metadata: {
					source: "insights_worker",
					feature: "smart_insights",
					organizationId: params.organizationId,
					userId: params.userId ?? "system",
					websiteId: params.websiteId,
					websiteDomain: params.domain,
					timezone: params.config.timezone,
					depth: params.config.depth,
					modelTier: params.config.modelTier,
				},
			},
		});

		await agent.generate({
			messages: [{ role: "user", content: userPrompt }],
		});

		if (collected.length > 0) {
			const validated = validateCollectedInsights(collected, {
				config: params.config,
				organizationId: params.organizationId,
				websiteId: params.websiteId,
			});
			emitInsightsEvent("info", "generation.agent.completed", {
				organization_id: params.organizationId,
				website_id: params.websiteId,
				duration_ms: Math.round(performance.now() - startedAt),
				raw_output_count: collected.length,
				output_count: validated.length,
				tool_call_count: toolCallCount,
			});
			setInsightsLog({
				generation_mode: "agent",
				tool_call_count: toolCallCount,
				generated_candidate_count: validated.length,
			});
			return validated;
		}

		emitInsightsEvent("warn", "generation.agent.missing_output", {
			organization_id: params.organizationId,
			website_id: params.websiteId,
			duration_ms: Math.round(performance.now() - startedAt),
			tool_call_count: toolCallCount,
		});
		return [];
	} catch (error) {
		captureInsightsError(error, "generation.agent.failed", {
			organization_id: params.organizationId,
			website_id: params.websiteId,
			duration_ms: Math.round(performance.now() - startedAt),
			error_type: (error as Error).constructor?.name,
		});
		return [];
	}
}

async function persistWebsiteInsights(params: {
	config: InsightGenerationConfigSnapshot;
	insights: GeneratedWebsiteInsight[];
	organizationId: string;
	period: WeekOverWeekPeriod;
	runId: string;
}): Promise<GeneratedWebsiteInsight[]> {
	const startedAt = performance.now();
	const dedupeKeyToId = await fetchInsightDedupeKeyToIdMap(
		params.organizationId,
		params.config.cooldownHours
	);
	const seenInBatch = new Set<string>();
	const finalInsights: GeneratedWebsiteInsight[] = [];
	let duplicateCandidates = 0;

	for (const insight of [...params.insights].sort(
		(a, b) => b.priority - a.priority
	)) {
		const key = dedupeKeyFor(insight);
		if (seenInBatch.has(key)) {
			duplicateCandidates += 1;
			continue;
		}
		seenInBatch.add(key);
		const existingId = dedupeKeyToId.get(key);
		finalInsights.push(existingId ? { ...insight, id: existingId } : insight);
		if (finalInsights.length >= maxInsights(params.config)) {
			break;
		}
	}

	if (finalInsights.length === 0) {
		emitInsightsEvent("info", "generation.persistence.skipped_empty", {
			organization_id: params.organizationId,
			run_id: params.runId,
			candidate_count: params.insights.length,
			duplicate_candidate_count: duplicateCandidates,
			dedupe_window_count: dedupeKeyToId.size,
		});
		return [];
	}

	function insightRow(insight: GeneratedWebsiteInsight, key: string) {
		return {
			id: insight.id,
			organizationId: params.organizationId,
			websiteId: insight.websiteId,
			runId: params.runId,
			title: insight.title,
			description: insight.description,
			suggestion: insight.suggestion,
			severity: insight.severity,
			sentiment: insight.sentiment,
			type: insight.type,
			priority: insight.priority,
			changePercent: insight.changePercent ?? null,
			dedupeKey: key,
			subjectKey: insight.subjectKey,
			sources: insight.sources,
			confidence: insight.confidence,
			impactSummary: insight.impactSummary ?? null,
			rootCause: insight.rootCause ?? null,
			evidence: insight.evidence ?? null,
			investigationDepth: insight.investigationDepth ?? null,
			actions: insight.actions ?? null,
			metrics:
				insight.metrics.length > 0
					? (insight.metrics as InsightMetricRow[])
					: null,
			timezone: params.config.timezone,
			currentPeriodFrom: params.period.current.from,
			currentPeriodTo: params.period.current.to,
			previousPeriodFrom: params.period.previous.from,
			previousPeriodTo: params.period.previous.to,
		};
	}

	const insightsWithKeys = finalInsights.map((insight) => {
		const key = dedupeKeyFor(insight);
		const existingId = dedupeKeyToId.get(key);
		const isRefresh = existingId !== undefined && insight.id === existingId;
		return { insight, key, isRefresh };
	});

	const toInsert = insightsWithKeys
		.filter((i) => !i.isRefresh)
		.map(({ insight, key }) => insightRow(insight, key));

	const toRefresh = insightsWithKeys
		.filter((i) => i.isRefresh)
		.map(({ insight, key }) => ({
			id: insight.id,
			row: insightRow(insight, key),
		}));

	if (toInsert.length > 0) {
		await db
			.insert(analyticsInsights)
			.values(toInsert)
			.onConflictDoUpdate({
				target: [analyticsInsights.organizationId, analyticsInsights.dedupeKey],
				targetWhere: isNotNull(analyticsInsights.dedupeKey),
				set: {
					runId: params.runId,
					timezone: params.config.timezone,
					currentPeriodFrom: params.period.current.from,
					currentPeriodTo: params.period.current.to,
					previousPeriodFrom: params.period.previous.from,
					previousPeriodTo: params.period.previous.to,
					createdAt: new Date(),
					title: sql.raw("excluded.title"),
					description: sql.raw("excluded.description"),
					suggestion: sql.raw("excluded.suggestion"),
					severity: sql.raw("excluded.severity"),
					sentiment: sql.raw("excluded.sentiment"),
					type: sql.raw("excluded.type"),
					priority: sql.raw("excluded.priority"),
					changePercent: sql.raw("excluded.change_percent"),
					subjectKey: sql.raw("excluded.subject_key"),
					sources: sql.raw("excluded.sources"),
					confidence: sql.raw("excluded.confidence"),
					impactSummary: sql.raw("excluded.impact_summary"),
					rootCause: sql.raw("excluded.root_cause"),
					evidence: sql.raw("excluded.evidence"),
					investigationDepth: sql.raw("excluded.investigation_depth"),
					actions: sql.raw("excluded.actions"),
					metrics: sql.raw("excluded.metrics"),
				},
			});
	}
	await Promise.all(
		toRefresh.map(({ id, row }) =>
			db.update(analyticsInsights).set(row).where(eq(analyticsInsights.id, id))
		)
	);

	const persistedRows = await db
		.select({
			dedupeKey: analyticsInsights.dedupeKey,
			id: analyticsInsights.id,
		})
		.from(analyticsInsights)
		.where(
			and(
				eq(analyticsInsights.organizationId, params.organizationId),
				inArray(
					analyticsInsights.dedupeKey,
					finalInsights.map((insight) => dedupeKeyFor(insight))
				)
			)
		);
	const persistedIdByDedupeKey = new Map(
		persistedRows.flatMap((row) =>
			row.dedupeKey ? [[row.dedupeKey, row.id] as const] : []
		)
	);
	const persistedInsights = finalInsights.map((insight) => {
		const persistedId = persistedIdByDedupeKey.get(dedupeKeyFor(insight));
		return persistedId ? { ...insight, id: persistedId } : insight;
	});

	const websiteInvalidations = [
		...new Set(persistedInsights.map((insight) => insight.websiteId)),
	].map((websiteId) => invalidateAgentContextSnapshotsForWebsite(websiteId));

	await Promise.all([
		invalidateInsightsCachesForOrganization(params.organizationId),
		...websiteInvalidations,
	]);

	emitInsightsEvent("info", "generation.persistence.completed", {
		organization_id: params.organizationId,
		run_id: params.runId,
		duration_ms: Math.round(performance.now() - startedAt),
		result_count: persistedInsights.length,
		insert_count: toInsert.length,
		refresh_count: toRefresh.length,
		invalidated_website_count: websiteInvalidations.length,
	});

	return persistedInsights;
}

function storeWebsiteSummary(
	site: OrgWebsiteRow,
	insights: GeneratedWebsiteInsight[]
): void {
	if (insights.length === 0) {
		return;
	}
	const summary = insights
		.map(
			(insight) =>
				`[${insight.severity}] ${insight.title}: ${insight.description} Suggestion: ${insight.suggestion}`
		)
		.join("\n");

	storeAnalyticsSummary(
		`Insights for ${site.domain} (${dayjs().format("YYYY-MM-DD")}):\n${summary}`,
		site.id,
		{ period: "configured" }
	)
		.then(() => {
			emitInsightsEvent("info", "generation.summary_stored", {
				website_id: site.id,
				insight_count: insights.length,
			});
		})
		.catch((error: unknown) => {
			captureInsightsError(error, "generation.summary_store_failed", {
				website_id: site.id,
			});
		});
}

export async function generateWebsiteInsights(
	input: GenerateWebsiteInsightsInput
): Promise<GenerateWebsiteInsightsResult> {
	const startedAt = performance.now();
	const [site] = await db
		.select({
			id: websites.id,
			name: websites.name,
			domain: websites.domain,
			integrations: websites.integrations,
		})
		.from(websites)
		.where(
			and(
				eq(websites.id, input.websiteId),
				eq(websites.organizationId, input.organizationId),
				isNull(websites.deletedAt)
			)
		)
		.limit(1);

	if (!site) {
		emitInsightsEvent("warn", "generation.website.skipped_missing_site", {
			organization_id: input.organizationId,
			website_id: input.websiteId,
			run_id: input.runId,
			duration_ms: Math.round(performance.now() - startedAt),
		});
		return {
			status: "skipped",
			resultCount: 0,
			insightIds: [],
			message: "Website not found or deleted",
		};
	}

	const orgSites = await db
		.select({ id: websites.id, name: websites.name, domain: websites.domain })
		.from(websites)
		.where(
			and(
				eq(websites.organizationId, input.organizationId),
				isNull(websites.deletedAt)
			)
		)
		.orderBy(websites.domain)
		.limit(100);
	setInsightsLog({
		organization_site_count: orgSites.length,
	});

	const period = getComparisonPeriod(input.config.lookbackDays);
	const userId = input.requestedByUserId ?? undefined;
	const ghIntegration = site.integrations?.github as
		| { owner: string; repo: string }
		| undefined;

	const insights = await analyzeWebsite({
		config: input.config,
		domain: site.domain,
		githubRepo: ghIntegration,
		organizationId: input.organizationId,
		orgSites,
		period,
		userId,
		websiteId: site.id,
	});

	const candidates = insights.map(
		(insight): GeneratedWebsiteInsight => ({
			...insight,
			id: randomUUIDv7(),
			websiteId: site.id,
			websiteName: site.name,
			websiteDomain: site.domain,
		})
	);

	const saved = await persistWebsiteInsights({
		config: input.config,
		insights: candidates,
		organizationId: input.organizationId,
		period,
		runId: input.runId,
	});

	storeWebsiteSummary(site, saved);

	emitInsightsEvent("info", "generation.website.completed", {
		organization_id: input.organizationId,
		website_id: input.websiteId,
		run_id: input.runId,
		duration_ms: Math.round(performance.now() - startedAt),
		result_count: saved.length,
		reason: input.reason,
		depth: input.config.depth,
		model_tier: input.config.modelTier,
		allowed_tools: input.config.allowedTools,
	});
	setInsightsLog({
		generation_result_count: saved.length,
		generation_status: saved.length > 0 ? "succeeded" : "skipped",
	});

	return saved.length > 0
		? {
				status: "succeeded",
				resultCount: saved.length,
				insightIds: saved.map((insight) => insight.id),
			}
		: {
				status: "skipped",
				resultCount: 0,
				insightIds: [],
				message: "No data-backed insights generated",
			};
}
