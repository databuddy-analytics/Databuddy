import type { AppContext } from "@databuddy/ai/config/context";
import {
	ensureAgentCreditsAvailable,
	isAgentBillingConfigured,
	resolveAgentBillingCustomerId,
	trackAgentUsageAndBill,
} from "@databuddy/ai/agents/execution";
import { and, between, db, eq, gt, isNull, lte, or } from "@databuddy/db";
import { annotations, websites } from "@databuddy/db/schema";
import type { InsightGenerationReason } from "@databuddy/redis";
import { createServiceAuth } from "@databuddy/rpc";
import type {
	InvestigationOutcome,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import { randomUUIDv7 } from "bun";
import dayjs from "dayjs";
import { prepareInsightSlackEffects } from "./delivery";
import {
	type DetectedSignal,
	type DetectionDiagnostics,
	type DetectSignalsParams,
	detectSignals,
	remeasureMetricSignal,
} from "./detection";
import {
	detectFunnelGoalSignals,
	type FunnelGoalDeps,
	type FunnelGoalDetectionDiagnostics,
	remeasureFunnelGoalSignal,
} from "./funnel-detection";
import {
	type InvestigationAnnotation,
	isDirectSignal,
	isRegression,
	prepareInvestigation,
	rankSignals,
	signalAnnotationWindow,
	signalKeyForDetectedSignal,
} from "./investigation";
import {
	eligibleSignalsForInvestigation,
	findRunObservation,
	type DueOpenInvestigation,
	type LatestInsightObservation,
	loadDueOpenInvestigation,
	loadInvestigationHistory,
	loadLatestSignalObservations,
	nextRecheckAt,
} from "./observations";
import {
	drainInsightRunEffects,
	loadPreparedInsightRun,
	prepareInsightRun,
} from "./effects";
import type { InsightAgentInput, InsightAgentResult } from "./agent";
import { runInsightAgent } from "./agent";
import type { WebsiteInvestigation } from "./persistence";
import { isVisibleInvestigation, persistInvestigation } from "./persistence";
import {
	captureInsightsError,
	emitInsightsEvent,
	setInsightsLog,
} from "./lib/evlog-insights";

interface GenerateWebsiteInsightsInput {
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
	message?: string;
	resultCount: number;
	status: "skipped" | "succeeded";
}

interface InvestigateWebsiteInput {
	asOf: Date | string;
	domain: string;
	githubRepository?: { owner: string; repo: string } | null;
	name?: string | null;
	organizationId: string;
	timezone: string;
	userId?: string;
	websiteId: string;
}

export interface WebsiteInvestigationArtifact {
	asOf: string;
	evidence: string[];
	outcome: InvestigationOutcome | null;
	signal: InvestigationSignal | null;
	status: "completed" | "deferred" | "no_signals";
}

const DETECTION_TIMEOUT_MS = 45_000;
const INSIGHT_LOOKBACK_DAYS = 7;
const RELATED_SIGNAL_LIMIT = 5;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface InvestigationRuntime {
	canRunAgent?: () => Promise<boolean>;
	mode: "production" | "shadow";
	onUsage?: (
		result: Required<Pick<InsightAgentResult, "modelId" | "usage">>
	) => Promise<void> | void;
	sources: InvestigationSources;
}

export interface InvestigationSources {
	detectDefinitionSignals: typeof detectFunnelGoalSignals;
	detectMetricSignals: typeof detectSignals;
	fetchAnnotations: (
		websiteId: string,
		signal: InvestigationSignal,
		asOf: Date,
		timezone: string
	) => Promise<InvestigationAnnotation[]>;
	investigateSignal: (input: InsightAgentInput) => Promise<InsightAgentResult>;
	loadDueInvestigation: (params: {
		asOf: Date;
		organizationId: string;
		websiteId: string;
	}) => Promise<DueOpenInvestigation | null>;
	loadHistory: typeof loadInvestigationHistory;
	loadObservations: (params: {
		asOf: Date;
		organizationId: string;
		signalKeys: string[];
		websiteId: string;
	}) => Promise<Map<string, LatestInsightObservation>>;
	remeasureSignal: (
		params: DetectSignalsParams,
		prior: InvestigationSignal,
		today: dayjs.Dayjs,
		abortSignal?: AbortSignal
	) => Promise<DetectedSignal | null>;
}

export function remeasureStoredSignal(
	params: DetectSignalsParams,
	prior: InvestigationSignal,
	today: dayjs.Dayjs,
	abortSignal?: AbortSignal,
	dependencies: {
		funnelGoal?: FunnelGoalDeps;
		query?: Parameters<typeof remeasureMetricSignal>[2];
	} = {}
): Promise<DetectedSignal | null> {
	return prior.signalKey.startsWith("goal:") ||
		prior.signalKey.startsWith("funnel:")
		? remeasureFunnelGoalSignal(
				params,
				prior,
				today,
				dependencies.funnelGoal,
				abortSignal
			)
		: remeasureMetricSignal(
				params,
				prior,
				dependencies.query,
				today,
				abortSignal
			);
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
	status: "deferred" | "no_signals";
}): WebsiteInvestigationArtifact {
	return {
		asOf: params.asOf.toISOString(),
		evidence: [],
		outcome: null,
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
		title: row.title,
	}));
}

export async function refreshInvestigationSignal(params: {
	asOf: Date;
	signal: InvestigationSignal;
	timezone: string;
	websiteId: string;
}): Promise<{ evidence: string[]; signal: InvestigationSignal } | null> {
	const today = dayjs(params.asOf).tz(params.timezone);
	const detected = await remeasureStoredSignal(
		{
			lookbackDays: INSIGHT_LOOKBACK_DAYS,
			timezone: params.timezone,
			websiteId: params.websiteId,
		},
		params.signal,
		today,
		AbortSignal.timeout(DETECTION_TIMEOUT_MS)
	);
	if (!detected) {
		return null;
	}
	const base = prepareInvestigation(detected, INSIGHT_LOOKBACK_DAYS);
	if (base.signal.signalKey !== params.signal.signalKey) {
		throw new Error("Remeasurement changed the investigation subject");
	}
	const annotationRows = await fetchSignalAnnotations(
		params.websiteId,
		base.signal,
		params.asOf,
		params.timezone
	);
	return annotationRows.length === 0
		? base
		: prepareInvestigation(detected, INSIGHT_LOOKBACK_DAYS, annotationRows);
}

const productionInvestigationSources: InvestigationSources = {
	detectDefinitionSignals: detectFunnelGoalSignals,
	detectMetricSignals: detectSignals,
	fetchAnnotations: fetchSignalAnnotations,
	investigateSignal: runInsightAgent,
	loadDueInvestigation: loadDueOpenInvestigation,
	loadHistory: loadInvestigationHistory,
	loadObservations: loadLatestSignalObservations,
	remeasureSignal: remeasureStoredSignal,
};

async function investigateWebsiteCore(
	input: InvestigateWebsiteInput,
	runtime: InvestigationRuntime
): Promise<WebsiteInvestigationArtifact> {
	const startedAt = performance.now();
	const asOf = normalizeAsOf(input.asOf, input.timezone);
	const detectParams = {
		websiteId: input.websiteId,
		lookbackDays: INSIGHT_LOOKBACK_DAYS,
		timezone: input.timezone,
	};
	const detectionAbortSignal = AbortSignal.timeout(DETECTION_TIMEOUT_MS);
	const due = await runtime.sources.loadDueInvestigation({
		asOf: asOf.toDate(),
		organizationId: input.organizationId,
		websiteId: input.websiteId,
	});
	let detectedSignals: DetectedSignal[] = [];
	let detectedSignal: DetectedSignal | undefined;
	if (due) {
		detectedSignal =
			(await runtime.sources.remeasureSignal(
				detectParams,
				due.signal,
				asOf,
				detectionAbortSignal
			)) ?? undefined;
		if (detectedSignal) {
			if (signalKeyForDetectedSignal(detectedSignal) !== due.signal.signalKey) {
				throw new Error("Remeasurement changed the investigation subject");
			}
			detectedSignals = [detectedSignal];
		}
	}
	if (!detectedSignal) {
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
		detectedSignals = rankSignals([...metricSignals, ...funnelGoalSignals]);

		if (detectedSignals.length === 0) {
			if (!detectionComplete || due) {
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
				return emptyInvestigationArtifact({ asOf, status: "deferred" });
			}
			if (runtime.mode === "production") {
				emitInsightsEvent(
					"info",
					"generation.investigation.skipped_no_signals",
					{
						organization_id: input.organizationId,
						website_id: input.websiteId,
						duration_ms: Math.round(performance.now() - startedAt),
					}
				);
			}
			return emptyInvestigationArtifact({ asOf, status: "no_signals" });
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
			return emptyInvestigationArtifact({ asOf, status: "deferred" });
		}

		detectedSignal = eligibleSignals.find(
			(signal) =>
				isRegression(signal) &&
				(signal.severity !== "info" || isDirectSignal(signal))
		);
		if (!detectedSignal) {
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
			return emptyInvestigationArtifact({ asOf, status: "no_signals" });
		}
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
			status: "deferred",
		});
	}

	const base = prepareInvestigation(detectedSignal, INSIGHT_LOOKBACK_DAYS);
	const relatedSignals = detectedSignals
		.filter(
			(signal) => signalKeyForDetectedSignal(signal) !== base.signal.signalKey
		)
		.slice(0, RELATED_SIGNAL_LIMIT)
		.map(
			(signal) => prepareInvestigation(signal, INSIGHT_LOOKBACK_DAYS).signal
		);
	const annotationRows = await runtime.sources.fetchAnnotations(
		input.websiteId,
		base.signal,
		asOf.toDate(),
		input.timezone
	);
	const investigation =
		annotationRows.length === 0
			? base
			: prepareInvestigation(
					detectedSignal,
					INSIGHT_LOOKBACK_DAYS,
					annotationRows
				);
	const appContext: AppContext = {
		userId: input.userId ?? "system",
		organizationId: input.organizationId,
		websiteId: input.websiteId,
		defaultWebsiteId: input.websiteId,
		websiteDomain: input.domain,
		timezone: input.timezone,
		currentDateTime: asOf.toISOString(),
		chatId: `insights:${input.organizationId}:${input.websiteId}:${investigation.signal.signalKey}`,
		mutationMode: "dry-run",
		serviceAuth: createServiceAuth(input.organizationId, ["read:data"]),
		websiteName: input.name ?? null,
	};
	let investigationResult: InsightAgentResult;
	try {
		const history = await runtime.sources.loadHistory({
			organizationId: input.organizationId,
			signalKey: investigation.signal.signalKey,
			through: asOf.toDate(),
			websiteId: input.websiteId,
		});
		investigationResult = await runtime.sources.investigateSignal({
			appContext,
			evidence: investigation.evidence,
			githubRepository: input.githubRepository ?? null,
			history,
			relatedSignals,
			signal: investigation.signal,
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
			next: investigationResult.outcome.next.type,
			output_count: 1,
			evidence_count: investigation.evidence.length,
			tool_call_count: investigationResult.toolCallCount,
		});
		setInsightsLog({
			generation_mode: "agent",
			generated_candidate_count: 1,
			tool_call_count: investigationResult.toolCallCount,
		});
	}

	return {
		asOf: asOf.toISOString(),
		evidence: investigation.evidence,
		outcome: investigationResult.outcome,
		signal: investigation.signal,
		status: "completed",
	};
}

/**
 * Runs the production investigation path against explicit read-only sources.
 * Every source is required so fixtures and shadows cannot fall through to live data.
 */
export function investigateWebsiteWithSources(
	input: InvestigateWebsiteInput,
	sources: InvestigationSources,
	canRunAgent?: () => Promise<boolean>
): Promise<WebsiteInvestigationArtifact> {
	return investigateWebsiteCore(input, {
		canRunAgent,
		mode: "shadow",
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
		return prepareInsightRun({
			...runIdentity,
			effects: [],
			result: {
				status: "skipped",
				resultCount: 0,
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
			next: replay.outcome.next.type,
		});
		const replayed: WebsiteInvestigation | null =
			replay.insightId && isVisibleInvestigation(replay)
				? {
						id: replay.insightId,
						outcome: replay.outcome,
						signal: replay.signal,
						websiteDomain: site.domain,
						websiteId: site.id,
						websiteName: site.name,
					}
				: null;
		const effects = await prepareInsightSlackEffects({
			insight: replayed,
			organizationId: input.organizationId,
		});
		const replayedResult = await prepareInsightRun({
			...runIdentity,
			effects,
			result: {
				status: "succeeded",
				resultCount: replayed ? 1 : 0,
			},
		});
		await drainInsightRunEffects(runIdentity, input.finalAttempt);
		return replayedResult;
	}
	let billingCheckError: unknown;
	let billingCustomerId: string | null = null;
	const agentUsage: {
		value: Required<Pick<InsightAgentResult, "modelId" | "usage">> | null;
	} = { value: null };
	let noCredits = false;
	const userId = input.requestedByUserId ?? undefined;
	const analysis = await investigateWebsiteCore(
		{
			asOf: new Date(),
			domain: site.domain,
			githubRepository: site.integrations?.github ?? null,
			name: site.name,
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
			onUsage: (usage) => {
				agentUsage.value = usage;
			},
		}
	);
	const candidate: WebsiteInvestigation | null =
		analysis.outcome && analysis.signal
			? {
					id: randomUUIDv7(),
					outcome: analysis.outcome,
					signal: analysis.signal,
					websiteId: site.id,
					websiteName: site.name,
					websiteDomain: site.domain,
				}
			: null;

	const asOf = new Date(analysis.asOf);
	const saved = candidate
		? await persistInvestigation({
				evidence: analysis.evidence,
				investigation: candidate,
				notNewerThan: asOf,
				organizationId: input.organizationId,
				recheckAt: nextRecheckAt(asOf, candidate.outcome.next.type),
				runId: input.runId,
				timezone: input.timezone,
			})
		: null;

	if (billingCheckError) {
		throw billingCheckError;
	}
	if (candidate && agentUsage.value) {
		try {
			await trackAgentUsageAndBill({
				billingCustomerId,
				chatId: `insights:${input.organizationId}:${site.id}`,
				idempotencyKey: `insights:${input.runId}:${site.id}`,
				modelId: agentUsage.value.modelId,
				organizationId: input.organizationId,
				source: "insights",
				usage: agentUsage.value.usage,
				userId: input.requestedByUserId,
				websiteId: site.id,
			});
		} catch (error) {
			captureInsightsError(error, "generation.billing.failed", {
				organization_id: input.organizationId,
				run_id: input.runId,
				website_id: site.id,
			});
		}
	}

	const effects = await prepareInsightSlackEffects({
		insight: saved,
		organizationId: input.organizationId,
	});

	const succeeded = saved !== null || analysis.status === "completed";

	const result: GenerateWebsiteInsightsResult = succeeded
		? {
				status: "succeeded",
				resultCount: saved ? 1 : 0,
			}
		: {
				status: "skipped",
				resultCount: 0,
				message: noCredits
					? "AI usage allowance is empty"
					: analysis.status === "deferred"
						? "Detected signals are waiting for recheck"
						: "No investigation was warranted by the available evidence",
			};
	const preparedResult = await prepareInsightRun({
		...runIdentity,
		effects,
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
		result_count: saved ? 1 : 0,
		reason: input.reason,
	});
	setInsightsLog({
		generation_result_count: saved ? 1 : 0,
		generation_status: succeeded ? "succeeded" : "skipped",
	});
	return preparedResult;
}
