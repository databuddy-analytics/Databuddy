import type { AppContext } from "@databuddy/ai/config/context";
import {
	ANTHROPIC_CACHE_1H,
	createModelFromId,
} from "@databuddy/ai/config/models";
import { trackAgentUsageAndBill } from "@databuddy/ai/agents/execution";
import { hasTrackedInsightData } from "@databuddy/ai/insights/fetch-context";
import { validateInvestigationSubmission } from "@databuddy/ai/insights/validate";
import { getAILogger } from "@databuddy/ai/lib/ai-logger";
import {
	summarizeAgentUsage,
	type UsageTelemetry,
} from "@databuddy/ai/lib/usage-telemetry";
import { createInsightsAgentTools } from "@databuddy/ai/tools/insights-agent-tools";
import { getCachedSiteContext } from "@databuddy/ai/tools/scrape-page";
import { and, db, eq, isNull } from "@databuddy/db";
import { websites } from "@databuddy/db/schema";
import {
	INSIGHTS_JOB_TIMEOUT_MS,
	type InsightGenerationConfigSnapshot,
	type InsightGenerationReason,
} from "@databuddy/redis";
import {
	type GeneratedInsight,
	type InvestigationEvidence,
	type InvestigationSignal,
	type InvestigationSubmission,
	investigationSubmissionSchema,
	type WeekOverWeekPeriod,
} from "@databuddy/shared/insights";
import {
	type LanguageModelUsage,
	stepCountIs,
	tool,
	ToolLoopAgent,
	type ToolSet,
} from "ai";
import { randomUUIDv7 } from "bun";
import dayjs from "dayjs";
import { resolveInsightsBilling } from "./billing";
import { deliverInsightDigests } from "./delivery";
import { type DetectedSignal, detectSignals, wowWindow } from "./detection";
import { detectFunnelGoalSignals } from "./funnel-detection";
import { enrichSignals } from "./enrichment";
import { prepareInvestigation } from "./investigation";
import type { GeneratedWebsiteInsight } from "./persistence";
import { persistWebsiteInsights } from "./persistence";
import {
	INSIGHT_LOOKBACK_DAYS,
	INSIGHT_MAX_STEPS,
	type InsightDepth,
	insightDepth,
	MAX_INSIGHTS_PER_WEBSITE,
} from "./policy";
import { resolveInsightsForWebsite } from "./resolution";
import { createInsightsServiceAuth } from "./service-auth";
import {
	buildInvestigationPrompt,
	buildSystemPrompt,
	fetchInsightHistory,
} from "./prompts";
import {
	captureInsightsError,
	emitInsightsEvent,
	setInsightsLog,
} from "./lib/evlog-insights";

export interface GenerateWebsiteInsightsInput {
	config: InsightGenerationConfigSnapshot;
	organizationId: string;
	reason: InsightGenerationReason;
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

export interface InvestigateWebsiteInput {
	asOf: Date | string;
	config: InsightGenerationConfigSnapshot;
	domain: string;
	includeHistory?: boolean;
	includeSiteContext?: boolean;
	organizationId: string;
	userId?: string;
	websiteId: string;
}

export interface InvestigationValidationAttempt {
	accepted: boolean;
	alreadyAccepted: boolean;
	attempt: number;
	errors: string[];
}

export interface InvestigationToolTrace {
	finishReason: string;
	index: number;
	name: string;
	signalKey?: string;
	step: number;
}

export interface InvestigationTimings {
	contextMs: number;
	dataCheckMs: number;
	detectionMs: number;
	enrichmentMs: number;
	modelMs: number;
	preparationMs: number;
	totalMs: number;
}

export interface WebsiteInvestigationArtifact {
	asOf: string;
	detectedSignals: DetectedSignal[];
	evidence: InvestigationEvidence[];
	insights: GeneratedInsight[];
	modelId: string;
	signals: InvestigationSignal[];
	status: "completed" | "invalid_output" | "no_data" | "no_signals";
	submission: InvestigationSubmission | null;
	timings: InvestigationTimings;
	toolNames: string[];
	toolTrace: InvestigationToolTrace[];
	usage: UsageTelemetry | null;
	validationAttempts: InvestigationValidationAttempt[];
}

function getComparisonPeriod(
	lookbackDays: number,
	timezone: string,
	asOf: dayjs.Dayjs
): WeekOverWeekPeriod {
	const window = wowWindow(asOf.tz(timezone), lookbackDays);
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

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const INSIGHTS_MODELS = {
	fast: createModelFromId(INSIGHTS_MODEL_IDS.fast),
	balanced: createModelFromId(INSIGHTS_MODEL_IDS.balanced),
	deep: createModelFromId(INSIGHTS_MODEL_IDS.deep),
};

interface InvestigationRuntime {
	mode: "evaluation" | "production";
	onUsage?: (input: {
		chatId: string;
		modelId: string;
		usage: LanguageModelUsage;
	}) => Promise<void>;
}

interface AgentInvestigationResult {
	insights: GeneratedInsight[];
	submission: InvestigationSubmission | null;
	toolTrace: InvestigationToolTrace[];
	usage: UsageTelemetry;
	validationAttempts: InvestigationValidationAttempt[];
}

function normalizeAsOf(asOf: Date | string, timezone: string): dayjs.Dayjs {
	const value =
		typeof asOf === "string" && DATE_ONLY_PATTERN.test(asOf)
			? dayjs.tz(asOf, timezone)
			: dayjs(asOf).tz(timezone);
	if (!value.isValid()) {
		throw new Error(`Invalid investigation asOf value: ${String(asOf)}`);
	}
	return value;
}

function initialTimings(): InvestigationTimings {
	return {
		contextMs: 0,
		dataCheckMs: 0,
		detectionMs: 0,
		enrichmentMs: 0,
		modelMs: 0,
		preparationMs: 0,
		totalMs: 0,
	};
}

function emptyInvestigationArtifact(params: {
	asOf: dayjs.Dayjs;
	detectedSignals: DetectedSignal[];
	modelId: string;
	startedAt: number;
	status: "no_data" | "no_signals";
	timings: InvestigationTimings;
}): WebsiteInvestigationArtifact {
	params.timings.totalMs = Math.round(performance.now() - params.startedAt);
	return {
		asOf: params.asOf.toISOString(),
		detectedSignals: params.detectedSignals,
		evidence: [],
		insights: [],
		modelId: params.modelId,
		signals: [],
		status: params.status,
		submission: null,
		timings: params.timings,
		toolNames: [],
		toolTrace: [],
		usage: null,
		validationAttempts: [],
	};
}

async function investigateWebsiteCore(
	input: InvestigateWebsiteInput,
	runtime: InvestigationRuntime
): Promise<WebsiteInvestigationArtifact> {
	const startedAt = performance.now();
	const timings = initialTimings();
	const asOf = normalizeAsOf(input.asOf, input.config.timezone);
	const modelId = INSIGHTS_MODEL_IDS[input.config.modelTier];
	const period = getComparisonPeriod(
		INSIGHT_LOOKBACK_DAYS,
		input.config.timezone,
		asOf
	);
	const currentRange = period.current;
	const previousRange = period.previous;
	const dataCheckStartedAt = performance.now();
	const hasData = await hasTrackedInsightData(
		input.websiteId,
		input.domain,
		previousRange.from,
		currentRange.to,
		input.config.timezone
	);
	timings.dataCheckMs = Math.round(performance.now() - dataCheckStartedAt);
	if (!hasData) {
		if (runtime.mode === "production") {
			emitInsightsEvent("info", "generation.agent.skipped_no_data", {
				organization_id: input.organizationId,
				website_id: input.websiteId,
				duration_ms: Math.round(performance.now() - startedAt),
			});
		}
		return emptyInvestigationArtifact({
			asOf,
			detectedSignals: [],
			modelId,
			startedAt,
			status: "no_data",
			timings,
		});
	}

	const detectParams = {
		websiteId: input.websiteId,
		lookbackDays: INSIGHT_LOOKBACK_DAYS,
		timezone: input.config.timezone,
	};
	const detectionStartedAt = performance.now();
	const [metricSignals, funnelGoalSignals] = await Promise.all([
		detectSignals(detectParams, undefined, asOf),
		detectFunnelGoalSignals(detectParams, asOf),
	]);
	timings.detectionMs = Math.round(performance.now() - detectionStartedAt);
	const detectedSignals = [...metricSignals, ...funnelGoalSignals].sort(
		(a, b) => Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent)
	);

	if (detectedSignals.length === 0) {
		if (runtime.mode === "production") {
			emitInsightsEvent("info", "generation.agent.skipped_no_signals", {
				organization_id: input.organizationId,
				website_id: input.websiteId,
				duration_ms: Math.round(performance.now() - startedAt),
			});
		}
		return emptyInvestigationArtifact({
			asOf,
			detectedSignals,
			modelId,
			startedAt,
			status: "no_signals",
			timings,
		});
	}

	const enrichmentStartedAt = performance.now();
	const enrichedSignals = await enrichSignals(
		detectedSignals.slice(0, MAX_INSIGHTS_PER_WEBSITE),
		{
			websiteId: input.websiteId,
			timezone: input.config.timezone,
			lookbackDays: INSIGHT_LOOKBACK_DAYS,
		}
	);
	timings.enrichmentMs = Math.round(performance.now() - enrichmentStartedAt);
	const preparationStartedAt = performance.now();
	const investigation = prepareInvestigation(enrichedSignals, {
		websiteId: input.websiteId,
		lookbackDays: INSIGHT_LOOKBACK_DAYS,
	});
	const evidenceById = new Map(
		investigation.evidence.map((evidence) => [evidence.evidenceId, evidence])
	);
	timings.preparationMs = Math.round(performance.now() - preparationStartedAt);

	const contextStartedAt = performance.now();
	const [historyBlock, siteContext] = await Promise.all([
		input.includeHistory === false
			? Promise.resolve("")
			: fetchInsightHistory(
					input.organizationId,
					input.websiteId,
					INSIGHT_LOOKBACK_DAYS,
					asOf.toDate()
				),
		input.includeSiteContext === false
			? Promise.resolve(null)
			: getCachedSiteContext(input.domain),
	]);
	timings.contextMs = Math.round(performance.now() - contextStartedAt);

	const userPrompt = buildInvestigationPrompt(investigation, {
		domain: input.domain,
		timezone: input.config.timezone,
		historyBlock,
		siteContext: siteContext ?? "",
	});

	const { tools: availableTools } = createInsightsAgentTools({
		websiteId: input.websiteId,
		domain: input.domain,
		timezone: input.config.timezone,
		signals: investigation.signals,
		onEvidence: (evidence) => evidenceById.set(evidence.evidenceId, evidence),
	});

	const modelStartedAt = performance.now();
	const agentResult = await runInsightsAgent({
		asOf,
		availableTools,
		config: input.config,
		domain: input.domain,
		organizationId: input.organizationId,
		evidenceById,
		investigationDepth: insightDepth(input.config.modelTier),
		onUsage: runtime.onUsage,
		runtimeMode: runtime.mode,
		signals: investigation.signals,
		startedAt,
		userId: input.userId,
		userPrompt,
		websiteId: input.websiteId,
	});
	timings.modelMs = Math.round(performance.now() - modelStartedAt);
	timings.totalMs = Math.round(performance.now() - startedAt);

	return {
		asOf: asOf.toISOString(),
		detectedSignals,
		evidence: [...evidenceById.values()],
		insights: agentResult.insights,
		modelId,
		signals: investigation.signals,
		status: agentResult.submission ? "completed" : "invalid_output",
		submission: agentResult.submission,
		timings,
		toolNames: [...new Set(agentResult.toolTrace.map((item) => item.name))],
		toolTrace: agentResult.toolTrace,
		usage: agentResult.usage,
		validationAttempts: agentResult.validationAttempts,
	};
}

/**
 * Runs the production investigation path without billing, persistence,
 * resolution, or delivery. Use this entry point for shadow evaluations.
 */
export function investigateWebsite(
	input: InvestigateWebsiteInput
): Promise<WebsiteInvestigationArtifact> {
	return investigateWebsiteCore(
		{
			...input,
			includeHistory: input.includeHistory ?? false,
			includeSiteContext: input.includeSiteContext ?? false,
		},
		{ mode: "evaluation" }
	);
}

async function runInsightsAgent(params: {
	asOf: dayjs.Dayjs;
	availableTools: ToolSet;
	config: InsightGenerationConfigSnapshot;
	domain: string;
	evidenceById: Map<string, InvestigationEvidence>;
	investigationDepth: InsightDepth;
	onUsage?: InvestigationRuntime["onUsage"];
	organizationId: string;
	runtimeMode: InvestigationRuntime["mode"];
	signals: InvestigationSignal[];
	startedAt: number;
	userId?: string;
	userPrompt: string;
	websiteId: string;
}): Promise<AgentInvestigationResult> {
	try {
		const appContext: AppContext = {
			userId: params.userId ?? "system",
			organizationId: params.organizationId,
			websiteId: params.websiteId,
			websiteDomain: params.domain,
			timezone: params.config.timezone,
			currentDateTime: params.asOf.toISOString(),
			chatId: `insights:${params.organizationId}:${params.websiteId}`,
			mutationMode: "dry-run",
			serviceAuth: createInsightsServiceAuth(params.organizationId),
		};

		const accepted: {
			insights: GeneratedInsight[];
			submission: InvestigationSubmission | null;
		} = { insights: [], submission: null };
		const validationAttempts: InvestigationValidationAttempt[] = [];
		const submitInvestigationTool = tool({
			description:
				"Submit exactly one terminal disposition for every investigation signal. Invalid submissions return errors you must correct.",
			inputSchema: investigationSubmissionSchema,
			execute: (submission: InvestigationSubmission) => {
				if (accepted.submission) {
					validationAttempts.push({
						accepted: true,
						alreadyAccepted: true,
						attempt: validationAttempts.length + 1,
						errors: [],
					});
					return {
						accepted: true,
						alreadyAccepted: true,
						findingCount: accepted.insights.length,
						resultCount: accepted.submission.results.length,
					};
				}
				const validation = validateInvestigationSubmission({
					submission,
					signals: params.signals,
					evidence: [...params.evidenceById.values()],
				});
				if (!validation.submission) {
					validationAttempts.push({
						accepted: false,
						alreadyAccepted: false,
						attempt: validationAttempts.length + 1,
						errors: validation.errors,
					});
					return { accepted: false, errors: validation.errors };
				}
				accepted.submission = validation.submission;
				accepted.insights = validation.insights;
				validationAttempts.push({
					accepted: true,
					alreadyAccepted: false,
					attempt: validationAttempts.length + 1,
					errors: [],
				});
				return {
					accepted: true,
					findingCount: validation.insights.length,
					resultCount: validation.submission.results.length,
				};
			},
		});

		let toolCallCount = 0;
		let step = 0;
		const toolTrace: InvestigationToolTrace[] = [];
		const investigationTools = {
			...params.availableTools,
			submit_investigation: submitInvestigationTool,
		};
		const configuredModel = INSIGHTS_MODELS[params.config.modelTier];
		const model =
			params.runtimeMode === "production"
				? getAILogger().wrap(configuredModel)
				: configuredModel;
		const agent = new ToolLoopAgent({
			model,
			instructions: {
				role: "system",
				content: buildSystemPrompt(params.investigationDepth),
				providerOptions: ANTHROPIC_CACHE_1H,
			},
			tools: investigationTools,
			stopWhen: [
				() => accepted.submission !== null,
				stepCountIs(INSIGHT_MAX_STEPS),
			],
			onStepFinish: ({ usage, finishReason, toolCalls }) => {
				step += 1;
				toolCallCount += toolCalls.length;
				for (const toolCall of toolCalls) {
					const input = toolCall.input;
					const signalKey =
						input &&
						typeof input === "object" &&
						typeof (input as { signalKey?: unknown }).signalKey === "string"
							? (input as { signalKey: string }).signalKey
							: undefined;
					toolTrace.push({
						finishReason: String(finishReason),
						index: toolTrace.length,
						name: toolCall.toolName,
						...(signalKey ? { signalKey } : {}),
						step,
					});
				}
				if (params.runtimeMode === "production") {
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
				}
			},
			temperature: 0.2,
			experimental_context: appContext,
			experimental_telemetry: {
				isEnabled: params.runtimeMode === "production",
				functionId: "databuddy.insights.worker.analyze_website",
				metadata: {
					source: "insights_worker",
					feature: "smart_insights",
					organizationId: params.organizationId,
					userId: params.userId ?? "system",
					websiteId: params.websiteId,
					websiteDomain: params.domain,
					timezone: params.config.timezone,
					investigationDepth: params.investigationDepth,
					modelTier: params.config.modelTier,
				},
			},
		});

		const result = await agent.generate({
			messages: [{ role: "user", content: params.userPrompt }],
			timeout: INSIGHTS_JOB_TIMEOUT_MS,
		});

		const modelId = INSIGHTS_MODEL_IDS[params.config.modelTier];
		const usage = summarizeAgentUsage(modelId, result.totalUsage);
		await params.onUsage?.({
			chatId: appContext.chatId,
			modelId,
			usage: result.totalUsage,
		});

		const submission = accepted.submission;
		if (!submission) {
			if (params.runtimeMode === "production") {
				emitInsightsEvent("warn", "generation.agent.missing_output", {
					organization_id: params.organizationId,
					website_id: params.websiteId,
					duration_ms: Math.round(performance.now() - params.startedAt),
					tool_call_count: toolCallCount,
					evidence_count: params.evidenceById.size,
				});
			}
			if (params.runtimeMode === "production") {
				throw new Error(
					"Insights agent stopped without a valid submit_investigation result"
				);
			}
			return {
				insights: [],
				submission: null,
				toolTrace,
				usage,
				validationAttempts,
			};
		}

		const selected = accepted.insights
			.sort((a, b) => b.priority - a.priority)
			.slice(0, MAX_INSIGHTS_PER_WEBSITE);
		const actionReadyCount = submission.results.filter(
			(result) => result.disposition === "action_ready"
		).length;
		const needsContextCount = submission.results.filter(
			(result) => result.disposition === "needs_context"
		).length;
		const monitorCount = submission.results.filter(
			(result) => result.disposition === "monitor"
		).length;
		const notAProblemCount = submission.results.filter(
			(result) => result.disposition === "not_a_problem"
		).length;
		if (params.runtimeMode === "production") {
			if (selected.length === 0) {
				emitInsightsEvent("info", "generation.agent.intentional_silence", {
					organization_id: params.organizationId,
					website_id: params.websiteId,
					monitor_count: monitorCount,
					not_a_problem_count: notAProblemCount,
					evidence_count: params.evidenceById.size,
				});
			}
			emitInsightsEvent("info", "generation.agent.completed", {
				organization_id: params.organizationId,
				website_id: params.websiteId,
				duration_ms: Math.round(performance.now() - params.startedAt),
				terminal_result_count: submission.results.length,
				output_count: selected.length,
				action_ready_count: actionReadyCount,
				needs_context_count: needsContextCount,
				monitor_count: monitorCount,
				not_a_problem_count: notAProblemCount,
				evidence_count: params.evidenceById.size,
				tool_call_count: toolCallCount,
			});
			setInsightsLog({
				generation_mode: "agent",
				tool_call_count: toolCallCount,
				generated_candidate_count: selected.length,
			});
		}
		return {
			insights: selected,
			submission,
			toolTrace,
			usage,
			validationAttempts,
		};
	} catch (error) {
		if (params.runtimeMode === "production") {
			captureInsightsError(error, "generation.agent.failed", {
				organization_id: params.organizationId,
				website_id: params.websiteId,
				duration_ms: Math.round(performance.now() - params.startedAt),
				error_type:
					error instanceof Error ? error.constructor.name : typeof error,
			});
		}
		throw error;
	}
}

export async function generateWebsiteInsights(
	input: GenerateWebsiteInsightsInput
): Promise<GenerateWebsiteInsightsResult> {
	const startedAt = performance.now();
	const investigationDepth = insightDepth(input.config.modelTier);
	const [site] = await db
		.select({
			id: websites.id,
			name: websites.name,
			domain: websites.domain,
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
			message: "The Databunny usage allowance is empty",
		};
	}

	const userId = input.requestedByUserId ?? undefined;

	const analysis = await investigateWebsiteCore(
		{
			asOf: new Date(),
			config: input.config,
			domain: site.domain,
			organizationId: input.organizationId,
			userId,
			websiteId: site.id,
		},
		{
			mode: "production",
			onUsage: async ({ chatId, modelId, usage }) => {
				await trackAgentUsageAndBill({
					usage,
					modelId,
					source: "insights",
					organizationId: input.organizationId,
					userId: input.requestedByUserId,
					chatId,
					billingCustomerId,
					websiteId: site.id,
				});
			},
		}
	);
	const signalByKey = new Map(
		analysis.signals.map((signal) => [signal.signalKey, signal])
	);

	const candidates = analysis.insights.map(
		(insight): GeneratedWebsiteInsight => {
			const signal = signalByKey.get(insight.subjectKey);
			if (!signal) {
				throw new Error(
					`Missing period for investigation ${insight.subjectKey}`
				);
			}
			return {
				...insight,
				id: randomUUIDv7(),
				period: signal.period,
				websiteId: site.id,
				websiteName: site.name,
				websiteDomain: site.domain,
			};
		}
	);

	const saved = await persistWebsiteInsights({
		insights: candidates,
		investigationDepth,
		organizationId: input.organizationId,
		runId: input.runId,
		timezone: input.config.timezone,
	});

	try {
		await resolveInsightsForWebsite({
			organizationId: input.organizationId,
			websiteId: site.id,
			runId: input.runId,
			detectedSignals: analysis.detectedSignals,
			canRecover: analysis.status !== "no_data",
		});
	} catch (error) {
		captureInsightsError(error, "generation.resolution.failed", {
			organization_id: input.organizationId,
			website_id: site.id,
			run_id: input.runId,
		});
	}

	const freshInsights = saved.filter((insight) => insight.isNew);
	const escalations = saved.filter((insight) => insight.isEscalation);
	const persistent = saved.filter((insight) => insight.isPersistent);
	if (
		freshInsights.length > 0 ||
		escalations.length > 0 ||
		persistent.length > 0
	) {
		try {
			await deliverInsightDigests({
				organizationId: input.organizationId,
				websiteId: site.id,
				websiteDomain: site.domain,
				websiteName: site.name,
				insights: freshInsights,
				escalations,
				persistent,
			});
		} catch (error) {
			captureInsightsError(error, "generation.delivery.failed", {
				organization_id: input.organizationId,
				website_id: site.id,
				run_id: input.runId,
			});
		}
	}

	emitInsightsEvent("info", "generation.website.completed", {
		organization_id: input.organizationId,
		website_id: input.websiteId,
		run_id: input.runId,
		duration_ms: Math.round(performance.now() - startedAt),
		result_count: saved.length,
		reason: input.reason,
		investigation_depth: investigationDepth,
		model_tier: input.config.modelTier,
	});
	const succeeded = saved.length > 0 || analysis.status === "completed";
	setInsightsLog({
		generation_result_count: saved.length,
		generation_status: succeeded ? "succeeded" : "skipped",
	});

	return succeeded
		? {
				status: "succeeded",
				resultCount: saved.length,
				insightIds: saved.map((insight) => insight.id),
			}
		: {
				status: "skipped",
				resultCount: 0,
				insightIds: [],
				message: "No data-backed findings generated",
			};
}
