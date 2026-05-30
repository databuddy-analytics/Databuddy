import type { AppContext } from "@databuddy/ai/config/context";
import {
	ANTHROPIC_CACHE_1H,
	createModelFromId,
} from "@databuddy/ai/config/models";
import { trackAgentUsageAndBill } from "@databuddy/ai/agents/execution";
import { hasWebInsightData } from "@databuddy/ai/insights/fetch-context";
import type { WeekOverWeekPeriod } from "@databuddy/ai/insights/types";
import { validateInsights } from "@databuddy/ai/insights/validate";
import { getAILogger } from "@databuddy/ai/lib/ai-logger";
import { storeAnalyticsSummary } from "@databuddy/ai/lib/supermemory";
import type { ParsedInsight } from "@databuddy/ai/schemas/smart-insights-output";
import { insightSchema } from "@databuddy/ai/schemas/smart-insights-output";
import { createToolkit } from "@databuddy/ai/tools/toolkit";
import { createInsightsAgentTools } from "@databuddy/ai/tools/insights-agent-tools";
import { and, db, eq, isNull } from "@databuddy/db";
import {
	type InsightGenerationConfigSnapshot,
	type InsightGenerationTool,
	websites,
} from "@databuddy/db/schema";
import { getCachedSiteContext } from "@databuddy/ai/tools/scrape-page";
import { getOAuthToken } from "@databuddy/ai/tools/utils/oauth-token";
import { stepCountIs, tool, ToolLoopAgent } from "ai";
import { randomUUIDv7 } from "bun";
import dayjs from "dayjs";
import { resolveInsightsBilling } from "./billing";
import { detectSignals, wowWindow } from "./detection";
import { detectFunnelGoalSignals } from "./funnel-detection";
import { enrichSignals, type EnrichedSignal } from "./enrichment";
import {
	type GeneratedWebsiteInsight,
	maxInsights,
	persistWebsiteInsights,
} from "./persistence";
import {
	buildInvestigationPrompt,
	buildSystemPrompt,
	fetchDismissedPatterns,
	fetchInsightHistory,
	fetchRecentAnnotations,
	fetchSiteCapabilities,
	formatOrgWebsitesContext,
	type OrgWebsiteRow,
} from "./prompts";
import {
	captureInsightsError,
	emitInsightsEvent,
	setInsightsLog,
} from "./lib/evlog-insights";

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

function getComparisonPeriod(lookbackDays: number): WeekOverWeekPeriod {
	const window = wowWindow(dayjs(), lookbackDays);
	return {
		current: { from: window.currentFrom, to: window.currentTo },
		previous: { from: window.previousFrom, to: window.previousTo },
	};
}

const INSIGHTS_MODEL_IDS = {
	fast: "openai/gpt-5.4-mini",
	balanced: "anthropic/claude-sonnet-4.6",
	deep: "anthropic/claude-opus-4.7",
} as const;

const INSIGHTS_MODELS = {
	fast: createModelFromId(INSIGHTS_MODEL_IDS.fast),
	balanced: createModelFromId(INSIGHTS_MODEL_IDS.balanced),
	deep: createModelFromId(INSIGHTS_MODEL_IDS.deep),
};

type InsightsModelKey = keyof typeof INSIGHTS_MODELS;

function modelKeyForTier(
	tier: InsightGenerationConfigSnapshot["modelTier"],
	hasCriticalSignals?: boolean
): InsightsModelKey {
	if (tier === "fast") {
		return "fast";
	}
	if (tier === "deep") {
		return "deep";
	}
	if (tier === "balanced" && hasCriticalSignals) {
		return "deep";
	}
	return "balanced";
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
	billingCustomerId: string | null;
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
		const detectParams = {
			websiteId: params.websiteId,
			lookbackDays: params.config.lookbackDays,
			timezone: params.config.timezone,
		};
		const [metricSignals, funnelGoalSignals] = await Promise.all([
			detectSignals(detectParams),
			detectFunnelGoalSignals(detectParams),
		]);
		const signals = [...metricSignals, ...funnelGoalSignals].sort(
			(a, b) => Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent)
		);
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

	const [
		annotationContext,
		historyBlock,
		siteContext,
		dismissedBlock,
		capabilitiesBlock,
	] = await Promise.all([
		fetchRecentAnnotations(params.websiteId, params.config),
		fetchInsightHistory(params.organizationId, params.websiteId, params.config),
		getCachedSiteContext(params.domain),
		fetchDismissedPatterns(params.organizationId, params.websiteId),
		fetchSiteCapabilities(
			params.websiteId,
			params.config.timezone,
			currentRange.from,
			currentRange.to
		),
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
				historyBlock,
				annotationContext,
				dismissedBlock,
				capabilitiesBlock,
				orgContext,
				siteContext: siteBlock,
			})
		: `Analyze ${params.domain} (${currentRange.from} to ${currentRange.to} vs ${previousRange.from} to ${previousRange.to}, ${params.config.timezone}). Use web_metrics with period="both" to compare periods efficiently.${siteBlock}${capabilitiesBlock}
${orgContext}${annotationContext}${historyBlock}${dismissedBlock}`;

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
		const modelKey = modelKeyForTier(
			params.config.modelTier,
			enrichedSignals.some((s) => s.severity === "critical")
		);
		const agent = new ToolLoopAgent({
			model: ai.wrap(INSIGHTS_MODELS[modelKey]),
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

		const result = await agent.generate({
			messages: [{ role: "user", content: userPrompt }],
		});

		await trackAgentUsageAndBill({
			usage: result.totalUsage,
			modelId: INSIGHTS_MODEL_IDS[modelKey],
			source: "insights",
			organizationId: params.organizationId,
			userId: params.userId ?? null,
			chatId: appContext.chatId,
			billingCustomerId: params.billingCustomerId,
			websiteId: params.websiteId,
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

	const { allowed, billingCustomerId } = await resolveInsightsBilling({
		organizationId: input.organizationId,
		userId: input.requestedByUserId,
	});
	if (!allowed) {
		emitInsightsEvent("info", "generation.website.skipped_no_credits", {
			organization_id: input.organizationId,
			website_id: input.websiteId,
			run_id: input.runId,
			billing_customer_id: billingCustomerId,
			duration_ms: Math.round(performance.now() - startedAt),
		});
		return {
			status: "skipped",
			resultCount: 0,
			insightIds: [],
			message: "Insufficient agent credits",
		};
	}

	const period = getComparisonPeriod(input.config.lookbackDays);
	const userId = input.requestedByUserId ?? undefined;
	const ghIntegration = site.integrations?.github as
		| { owner: string; repo: string }
		| undefined;

	const insights = await analyzeWebsite({
		billingCustomerId,
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
