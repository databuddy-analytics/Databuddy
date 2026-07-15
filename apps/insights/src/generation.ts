import type { AppContext } from "@databuddy/ai/config/context";
import {
	ensureAgentCreditsAvailable,
	isAgentBillingConfigured,
	resolveAgentBillingCustomerId,
	trackAgentUsageAndBill,
} from "@databuddy/ai/agents/execution";
import { hasTrackedInsightData } from "@databuddy/ai/insights/fetch-context";
import type {
	CreateInsightEvidenceReaderParams,
	InsightEvidenceReader,
} from "@databuddy/ai/insights/evidence-reader";
import { and, between, db, eq, gt, isNull, lte, or } from "@databuddy/db";
import { annotations, websites } from "@databuddy/db/schema";
import type { InsightGenerationReason } from "@databuddy/redis";
import type {
	GeneratedInsight,
	InvestigationDecision,
	InvestigationEvidence,
	InvestigationSignal,
	WeekOverWeekPeriod,
} from "@databuddy/shared/insights";
import { randomUUIDv7 } from "bun";
import dayjs from "dayjs";
import { prepareInsightSlackEffects } from "./delivery";
import {
	type DetectedSignal,
	type DetectionDiagnostics,
	detectSignals,
	wowWindow,
} from "./detection";
import {
	detectFunnelGoalSignals,
	type FunnelGoalDetectionDiagnostics,
} from "./funnel-detection";
import {
	annotationMatchesSignal,
	type InvestigationAnnotation,
	prepareInvestigation,
	rankSignals,
	signalAnnotationWindow,
	signalKeyForDetectedSignal,
} from "./investigation";
import {
	eligibleSignalsForInvestigation,
	findRunObservation,
	type LatestInsightObservation,
	loadLatestSignalObservations,
	nextRecheckAt,
} from "./observations";
import {
	drainInsightRunEffects,
	loadPreparedInsightRun,
	prepareInsightRun,
	type InsightRunEffectInput,
} from "./effects";
import {
	MAX_AGENT_CANDIDATES,
	type InsightAgentInput,
	type InsightAgentResult,
	runInsightAgent,
} from "./agent";
import type { GeneratedWebsiteInsight } from "./persistence";
import { persistWebsiteInsights } from "./persistence";
import { INSIGHT_LOOKBACK_DAYS } from "./policy";
import {
	resolveInsightsForWebsite,
	retiredSignalKeyForOutcome,
} from "./resolution";
import {
	captureInsightsError,
	emitInsightsEvent,
	setInsightsLog,
} from "./lib/evlog-insights";

export interface GenerateWebsiteInsightsInput {
	finalAttempt: boolean;
	itemId: string;
	organizationId: string;
	queueJobId: string;
	reason: InsightGenerationReason;
	requestedByUserId: string | null;
	runId: string;
	timezone: string;
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
	domain: string;
	organizationId: string;
	timezone: string;
	userId?: string;
	websiteId: string;
}

export interface WebsiteInvestigationArtifact {
	asOf: string;
	decision: InvestigationDecision | null;
	detectedSignals: DetectedSignal[];
	detectionComplete: boolean;
	evidence: InvestigationEvidence[];
	insight: GeneratedInsight | null;
	signal: InvestigationSignal | null;
	status: "completed" | "deferred" | "no_data" | "no_signals";
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

const DATA_CHECK_TIMEOUT_MS = 30_000;
const DETECTION_TIMEOUT_MS = 45_000;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface InvestigationRuntime {
	canRunAgent?: () => Promise<boolean>;
	mode: "evaluation" | "production";
	onUsage?: (
		result: Required<Pick<InsightAgentResult, "modelId" | "usage">>
	) => Promise<void>;
	sources: InvestigationSources;
}

export interface InvestigationSources {
	createEvidenceReader: (
		params: CreateInsightEvidenceReaderParams
	) => Promise<InsightEvidenceReader>;
	createServiceAuth: (
		organizationId: string
	) => Promise<AppContext["serviceAuth"]>;
	detectDefinitionSignals: typeof detectFunnelGoalSignals;
	detectMetricSignals: typeof detectSignals;
	fetchAnnotations: (
		websiteId: string,
		signal: InvestigationSignal,
		asOf: Date,
		timezone: string
	) => Promise<InvestigationAnnotation[]>;
	hasTrackedData: typeof hasTrackedInsightData;
	investigateSignal: (input: InsightAgentInput) => Promise<InsightAgentResult>;
	loadObservations: (params: {
		asOf: Date;
		organizationId: string;
		signalKeys: string[];
		websiteId: string;
	}) => Promise<Map<string, LatestInsightObservation>>;
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

export function resolveInvestigationAsOf(
	asOf: Date | string,
	timezone: string
): Date {
	return normalizeAsOf(asOf, timezone).toDate();
}

function emptyInvestigationArtifact(params: {
	asOf: dayjs.Dayjs;
	detectionComplete: boolean;
	detectedSignals: DetectedSignal[];
	status: "deferred" | "no_data" | "no_signals";
}): WebsiteInvestigationArtifact {
	return {
		asOf: params.asOf.toISOString(),
		decision: null,
		detectionComplete: params.detectionComplete,
		detectedSignals: params.detectedSignals,
		evidence: [],
		insight: null,
		signal: null,
		status: params.status,
	};
}

async function fetchSignalAnnotations(
	websiteId: string,
	signal: InvestigationSignal,
	asOf: Date,
	timezone: string
) {
	const window = signalAnnotationWindow(signal, timezone);
	const rows = await db
		.select({ date: annotations.xValue, title: annotations.text })
		.from(annotations)
		.where(
			and(
				eq(annotations.websiteId, websiteId),
				between(annotations.xValue, window.from, window.to),
				lte(annotations.createdAt, asOf),
				lte(annotations.updatedAt, asOf),
				or(isNull(annotations.deletedAt), gt(annotations.deletedAt, asOf))
			)
		)
		.orderBy(annotations.xValue)
		.limit(10);

	return rows.map((row) => ({
		date: dayjs(row.date).tz(timezone).format("YYYY-MM-DD"),
		signalScoped: annotationMatchesSignal(row.title, signal),
		title: row.title,
	}));
}

const productionInvestigationSources: InvestigationSources = {
	createEvidenceReader: async (params) => {
		const { createInsightEvidenceReader } = await import(
			"@databuddy/ai/insights/evidence-reader"
		);
		return createInsightEvidenceReader(params);
	},
	createServiceAuth: async (organizationId) => {
		const { createInsightsServiceAuth } = await import("./service-auth");
		return createInsightsServiceAuth(organizationId);
	},
	detectDefinitionSignals: detectFunnelGoalSignals,
	detectMetricSignals: detectSignals,
	fetchAnnotations: fetchSignalAnnotations,
	hasTrackedData: hasTrackedInsightData,
	investigateSignal: runInsightAgent,
	loadObservations: loadLatestSignalObservations,
};

async function investigateWebsiteCore(
	input: InvestigateWebsiteInput,
	runtime: InvestigationRuntime
): Promise<WebsiteInvestigationArtifact> {
	const startedAt = performance.now();
	const asOf = normalizeAsOf(input.asOf, input.timezone);
	const period = getComparisonPeriod(
		INSIGHT_LOOKBACK_DAYS,
		input.timezone,
		asOf
	);
	const currentRange = period.current;
	const previousRange = period.previous;
	const hasData = await runtime.sources.hasTrackedData(
		input.websiteId,
		input.domain,
		previousRange.from,
		currentRange.to,
		input.timezone,
		AbortSignal.timeout(DATA_CHECK_TIMEOUT_MS)
	);
	if (!hasData) {
		if (runtime.mode === "production") {
			emitInsightsEvent("info", "generation.investigation.skipped_no_data", {
				organization_id: input.organizationId,
				website_id: input.websiteId,
				duration_ms: Math.round(performance.now() - startedAt),
			});
		}
		return emptyInvestigationArtifact({
			asOf,
			detectionComplete: false,
			detectedSignals: [],
			status: "no_data",
		});
	}

	const detectParams = {
		websiteId: input.websiteId,
		lookbackDays: INSIGHT_LOOKBACK_DAYS,
		timezone: input.timezone,
	};
	const detectionAbortSignal = AbortSignal.timeout(DETECTION_TIMEOUT_MS);
	const metricDiagnostics: DetectionDiagnostics = { failedFamilies: 0 };
	const definitionDiagnostics: FunnelGoalDetectionDiagnostics = {
		failedDefinitions: 0,
	};
	const [metricSignals, funnelGoalSignals] = await Promise.all([
		runtime.sources.detectMetricSignals(
			detectParams,
			undefined,
			asOf,
			detectionAbortSignal,
			metricDiagnostics
		),
		runtime.sources.detectDefinitionSignals(detectParams, asOf, undefined, {
			diagnostics: definitionDiagnostics,
		}),
	]);
	const detectionComplete =
		metricDiagnostics.failedFamilies === 0 &&
		definitionDiagnostics.failedDefinitions === 0;
	const detectedSignals = rankSignals([...metricSignals, ...funnelGoalSignals]);

	if (detectedSignals.length === 0) {
		if (!detectionComplete) {
			if (runtime.mode === "production") {
				emitInsightsEvent(
					"info",
					"generation.investigation.deferred_incomplete_detection",
					{
						organization_id: input.organizationId,
						website_id: input.websiteId,
						duration_ms: Math.round(performance.now() - startedAt),
					}
				);
			}
			return emptyInvestigationArtifact({
				asOf,
				detectionComplete,
				detectedSignals,
				status: "deferred",
			});
		}
		if (runtime.mode === "production") {
			emitInsightsEvent("info", "generation.investigation.skipped_no_signals", {
				organization_id: input.organizationId,
				website_id: input.websiteId,
				duration_ms: Math.round(performance.now() - startedAt),
			});
		}
		return emptyInvestigationArtifact({
			asOf,
			detectionComplete,
			detectedSignals,
			status: "no_signals",
		});
	}

	const observations = await runtime.sources.loadObservations({
		asOf: asOf.toDate(),
		organizationId: input.organizationId,
		signalKeys: detectedSignals.map(signalKeyForDetectedSignal),
		websiteId: input.websiteId,
	});
	const eligibleSignals = eligibleSignalsForInvestigation(
		detectedSignals,
		observations,
		asOf.toDate()
	);
	if (eligibleSignals.length === 0) {
		if (runtime.mode === "production") {
			emitInsightsEvent("info", "generation.investigation.deferred_recheck", {
				organization_id: input.organizationId,
				website_id: input.websiteId,
				detected_signal_count: detectedSignals.length,
				duration_ms: Math.round(performance.now() - startedAt),
			});
		}
		return emptyInvestigationArtifact({
			asOf,
			detectionComplete,
			detectedSignals,
			status: "deferred",
		});
	}

	const preparedCandidates = eligibleSignals.map((detectedSignal) => ({
		detectedSignal,
		investigation: prepareInvestigation(detectedSignal, {
			websiteId: input.websiteId,
			lookbackDays: INSIGHT_LOOKBACK_DAYS,
		}),
	}));
	const shortlist = preparedCandidates
		.filter(
			({ investigation }) => investigation.signal.sentiment === "negative"
		)
		.slice(0, MAX_AGENT_CANDIDATES);
	if (shortlist.length === 0) {
		if (runtime.mode === "production") {
			emitInsightsEvent(
				"info",
				"generation.investigation.skipped_no_regressions",
				{
					organization_id: input.organizationId,
					website_id: input.websiteId,
				}
			);
		}
		return emptyInvestigationArtifact({
			asOf,
			detectionComplete,
			detectedSignals,
			status: "no_signals",
		});
	}
	if (runtime.canRunAgent && !(await runtime.canRunAgent())) {
		if (runtime.mode === "production") {
			emitInsightsEvent(
				"info",
				"generation.investigation.deferred_agent_access",
				{
					organization_id: input.organizationId,
					website_id: input.websiteId,
					detected_signal_count: detectedSignals.length,
					duration_ms: Math.round(performance.now() - startedAt),
				}
			);
		}
		return emptyInvestigationArtifact({
			asOf,
			detectionComplete,
			detectedSignals,
			status: "deferred",
		});
	}

	const [serviceAuth, candidates] = await Promise.all([
		runtime.sources.createServiceAuth(input.organizationId),
		Promise.all(
			shortlist.map(async ({ detectedSignal, investigation }) => {
				const annotationRows = await runtime.sources.fetchAnnotations(
					input.websiteId,
					investigation.signal,
					asOf.toDate(),
					input.timezone
				);
				const prepared =
					annotationRows.length === 0
						? investigation
						: prepareInvestigation(
								detectedSignal,
								{
									websiteId: input.websiteId,
									lookbackDays: INSIGHT_LOOKBACK_DAYS,
								},
								annotationRows
							);
				const observation = observations.get(prepared.signal.signalKey);
				return {
					evidence: prepared.evidence,
					previous: observation
						? {
								asOf: observation.asOf,
								decision: observation.decision,
								finding: observation.finding,
								signal: observation.signal,
							}
						: undefined,
					signal: prepared.signal,
				};
			})
		),
	]);
	const appContext: AppContext = {
		userId: input.userId ?? "system",
		organizationId: input.organizationId,
		websiteId: input.websiteId,
		defaultWebsiteId: input.websiteId,
		websiteDomain: input.domain,
		timezone: input.timezone,
		currentDateTime: asOf.toISOString(),
		chatId: `insights:${input.organizationId}:${input.websiteId}`,
		mutationMode: "dry-run",
		...(serviceAuth ? { serviceAuth } : {}),
	};
	let investigationResult: InsightAgentResult;
	try {
		investigationResult = await runtime.sources.investigateSignal({
			appContext,
			candidates,
			readEvidence: async (signal, request, context, abortSignal) => {
				const reader = await runtime.sources.createEvidenceReader({
					websiteId: input.websiteId,
					domain: input.domain,
					timezone: input.timezone,
					signal,
				});
				return reader(request, context, abortSignal);
			},
		});
		if (investigationResult.modelId && investigationResult.usage) {
			await runtime.onUsage?.({
				modelId: investigationResult.modelId,
				usage: investigationResult.usage,
			});
		}
	} catch (error) {
		if (runtime.mode === "production") {
			captureInsightsError(error, "generation.agent.failed", {
				organization_id: input.organizationId,
				website_id: input.websiteId,
				duration_ms: Math.round(performance.now() - startedAt),
				error_type:
					error instanceof Error ? error.constructor.name : typeof error,
			});
		}
		throw error;
	}
	if (runtime.mode === "production") {
		emitInsightsEvent("info", "generation.agent.completed", {
			organization_id: input.organizationId,
			website_id: input.websiteId,
			duration_ms: Math.round(performance.now() - startedAt),
			disposition: investigationResult.decision.disposition,
			output_count: investigationResult.insight ? 1 : 0,
			evidence_count: investigationResult.evidence.length,
			tool_call_count: investigationResult.toolCallCount,
		});
		setInsightsLog({
			generation_mode: "agent",
			generated_candidate_count: investigationResult.insight ? 1 : 0,
			tool_call_count: investigationResult.toolCallCount,
		});
	}

	return {
		asOf: asOf.toISOString(),
		decision: investigationResult.decision,
		detectionComplete,
		detectedSignals,
		evidence: investigationResult.evidence,
		insight: investigationResult.insight,
		signal: investigationResult.signal,
		status: "completed",
	};
}

/**
 * Runs the production investigation path against explicit read-only sources.
 * Every source is required so fixture evaluations cannot fall through to live data.
 */
export function investigateWebsiteWithSources(
	input: InvestigateWebsiteInput,
	sources: InvestigationSources,
	canRunAgent?: () => Promise<boolean>
): Promise<WebsiteInvestigationArtifact> {
	return investigateWebsiteCore(input, {
		canRunAgent,
		mode: "evaluation",
		sources,
	});
}

export async function generateWebsiteInsights(
	input: GenerateWebsiteInsightsInput
): Promise<GenerateWebsiteInsightsResult> {
	const startedAt = performance.now();
	const runIdentity = {
		itemId: input.itemId,
		organizationId: input.organizationId,
		queueJobId: input.queueJobId,
		runId: input.runId,
		websiteId: input.websiteId,
	};
	const prepared = await loadPreparedInsightRun(runIdentity);
	if (prepared) {
		await drainInsightRunEffects(runIdentity, input.finalAttempt);
		return prepared;
	}
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
		return prepareInsightRun({
			...runIdentity,
			effects: [],
			result: {
				status: "skipped",
				resultCount: 0,
				insightIds: [],
				message: "Website not found or deleted",
			},
		});
	}

	const replay = await findRunObservation({
		organizationId: input.organizationId,
		runId: input.runId,
		websiteId: site.id,
	});
	if (replay) {
		emitInsightsEvent("info", "generation.website.replayed_observation", {
			organization_id: input.organizationId,
			website_id: site.id,
			run_id: input.runId,
			disposition: replay.disposition,
		});
		const legacyResult = await prepareInsightRun({
			...runIdentity,
			effects: [],
			result: {
				status: "succeeded",
				resultCount: replay.insightId ? 1 : 0,
				insightIds: replay.insightId ? [replay.insightId] : [],
			},
		});
		await drainInsightRunEffects(runIdentity, input.finalAttempt);
		return legacyResult;
	}
	let billingCheckError: unknown;
	let billingCustomerId: string | null = null;
	let noCredits = false;
	const userId = input.requestedByUserId ?? undefined;
	const analysis = await investigateWebsiteCore(
		{
			asOf: new Date(),
			domain: site.domain,
			organizationId: input.organizationId,
			timezone: input.timezone,
			userId,
			websiteId: site.id,
		},
		{
			canRunAgent: async () => {
				if (!isAgentBillingConfigured()) {
					return true;
				}
				try {
					billingCustomerId = await resolveAgentBillingCustomerId({
						organizationId: input.organizationId,
						userId: input.requestedByUserId,
					});
					noCredits = !(await ensureAgentCreditsAvailable(billingCustomerId));
					return !noCredits;
				} catch (error) {
					billingCheckError = error;
					captureInsightsError(error, "generation.billing_check.failed", {
						organization_id: input.organizationId,
						website_id: site.id,
						run_id: input.runId,
					});
					return false;
				}
			},
			mode: "production",
			sources: productionInvestigationSources,
			onUsage: async ({ modelId, usage }) => {
				await trackAgentUsageAndBill({
					billingCustomerId,
					chatId: `insights:${input.organizationId}:${site.id}`,
					idempotencyKey: `insights:${input.runId}:${site.id}`,
					modelId,
					organizationId: input.organizationId,
					source: "insights",
					usage,
					userId: input.requestedByUserId,
					websiteId: site.id,
				});
			},
		}
	);
	const candidates: GeneratedWebsiteInsight[] =
		analysis.insight && analysis.signal
			? [
					{
						...analysis.insight,
						id: randomUUIDv7(),
						period: analysis.signal.period,
						websiteId: site.id,
						websiteName: site.name,
						websiteDomain: site.domain,
					},
				]
			: [];

	const saved =
		candidates.length === 0
			? []
			: await persistWebsiteInsights({
					insights: candidates,
					organizationId: input.organizationId,
					runId: input.runId,
					timezone: input.timezone,
				});

	try {
		await resolveInsightsForWebsite({
			organizationId: input.organizationId,
			websiteId: site.id,
			runId: input.runId,
			detectedSignals: analysis.detectedSignals,
			canRecover: analysis.status !== "no_data" && analysis.detectionComplete,
			retiredSignalKey: retiredSignalKeyForOutcome({
				disposition: analysis.decision?.disposition,
				hasInsight: analysis.insight !== null,
				signalKey: analysis.signal?.signalKey,
			}),
		});
	} catch (error) {
		captureInsightsError(error, "generation.resolution.failed", {
			organization_id: input.organizationId,
			website_id: site.id,
			run_id: input.runId,
		});
		throw error;
	}
	if (billingCheckError) {
		throw billingCheckError;
	}

	const freshInsights = saved.filter(
		(insight) => insight.isNew || insight.isRetry
	);
	const escalations = saved.filter(
		(insight) => !insight.isRetry && insight.isEscalation
	);
	const persistent = saved.filter(
		(insight) => !insight.isRetry && insight.isPersistent
	);
	const slackEffects = await prepareInsightSlackEffects({
		organizationId: input.organizationId,
		websiteId: site.id,
		websiteDomain: site.domain,
		websiteName: site.name,
		insights: freshInsights,
		escalations,
		persistent,
	});
	const effects: InsightRunEffectInput[] = slackEffects.map((payload) => ({
		effectKey: payload.channelId,
		payload,
	}));

	const succeeded = saved.length > 0 || analysis.status === "completed";

	const result: GenerateWebsiteInsightsResult = succeeded
		? {
				status: "succeeded",
				resultCount: saved.length,
				insightIds: saved.map((insight) => insight.id),
			}
		: {
				status: "skipped",
				resultCount: 0,
				insightIds: [],
				message: noCredits
					? "AI usage allowance is empty"
					: analysis.status === "deferred"
						? "Detected signals are waiting for recheck"
						: "No data-backed findings generated",
			};
	const signal = analysis.signal;
	const asOf = new Date(analysis.asOf);
	const suppressedAction =
		analysis.decision?.disposition === "action_ready" &&
		candidates.length > 0 &&
		saved.length === 0;
	const preparedResult = await prepareInsightRun({
		...runIdentity,
		effects,
		...(analysis.decision && signal
			? {
					observation: {
						asOf,
						decision: analysis.decision,
						evidence: analysis.evidence.filter(
							(evidence) => evidence.signalKey === signal.signalKey
						),
						insightId: saved[0]?.id ?? null,
						recheckAt: nextRecheckAt(
							asOf,
							suppressedAction
								? "not_a_problem"
								: analysis.decision.disposition,
							signal
						),
						signal,
					},
				}
			: {}),
		result,
	});
	try {
		await drainInsightRunEffects(runIdentity, input.finalAttempt);
	} catch (error) {
		captureInsightsError(error, "generation.effects.failed", {
			organization_id: input.organizationId,
			website_id: site.id,
			run_id: input.runId,
		});
		throw error;
	}
	emitInsightsEvent("info", "generation.website.completed", {
		organization_id: input.organizationId,
		website_id: input.websiteId,
		run_id: input.runId,
		duration_ms: Math.round(performance.now() - startedAt),
		result_count: saved.length,
		reason: input.reason,
	});
	setInsightsLog({
		generation_result_count: saved.length,
		generation_status: succeeded ? "succeeded" : "skipped",
	});
	return preparedResult;
}
