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
import { detectMeasurementRecommendationSignals } from "./measurement-recommendation-detection";
import {
	detectRouteHealthSignals,
	remeasureRouteHealthSignal,
	type RouteHealthDetectionDeps,
} from "./route-health-detection";
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
	findRunObservations,
	type DueOpenInvestigation,
	type LatestInsightObservation,
	loadDueOpenInvestigation,
	loadInvestigationHistory,
	loadLatestSignalObservations,
	loadOtherOpenWork,
	nextRecheckAt,
} from "./observations";
import {
	drainInsightRunEffects,
	enqueueInsightRunEffects,
	loadPreparedInsightRun,
	prepareInsightRun,
} from "./effects";
import type { InsightAgentInput, InsightAgentResult } from "./agent";
import { runInsightAgent } from "./agent";
import {
	freezeInsightRunCandidatePlan,
	loadInsightRunCandidatePlan,
	type PlannedInvestigationCandidate,
} from "./run-candidate-plan";
import { planCoveragePortfolio } from "./coverage-planner";
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
	/** A deliberate user request may revisit a detected signal before its scheduled recheck. */
	forceRecheck?: boolean;
	githubRepository?: { owner: string; repo: string } | null;
	name?: string | null;
	organizationId: string;
	/** Pins a worker to a preplanned eligible signal without hiding its sibling context. */
	selectedSignalKey?: string;
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
	detectMeasurementRecommendationSignals: typeof detectMeasurementRecommendationSignals;
	detectMetricSignals: typeof detectSignals;
	detectRouteHealthSignals: typeof detectRouteHealthSignals;
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
	loadOtherOpenWork: typeof loadOtherOpenWork;
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
		routeHealth?: RouteHealthDetectionDeps;
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
		: prior.signalKey.startsWith("route:")
			? remeasureRouteHealthSignal(
					params,
					prior,
					today,
					dependencies.routeHealth,
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
	detectMeasurementRecommendationSignals,
	detectMetricSignals: detectSignals,
	detectRouteHealthSignals,
	fetchAnnotations: fetchSignalAnnotations,
	investigateSignal: runInsightAgent,
	loadDueInvestigation: loadDueOpenInvestigation,
	loadHistory: loadInvestigationHistory,
	loadOtherOpenWork,
	loadObservations: loadLatestSignalObservations,
	remeasureSignal: remeasureStoredSignal,
};

interface WebsiteSignalDiscovery {
	asOf: dayjs.Dayjs;
	detectedSignals: DetectedSignal[];
	dueSignalKey: string | null;
	eligibleSignals: DetectedSignal[];
	prioritySignal: DetectedSignal | null;
}

type WebsiteDiscoveryResult =
	| { artifact: WebsiteInvestigationArtifact; kind: "empty" }
	| { kind: "signals"; value: WebsiteSignalDiscovery };

/**
 * Only a model investigation is safe to defer to the rest of a frozen
 * portfolio. Context, persistence, and billing failures still stop the run:
 * continuing after one of those could make its durable state inconsistent.
 */
class CandidateInvestigationError extends Error {
	constructor(error: unknown) {
		super(error instanceof Error ? error.message : String(error));
		this.name = "CandidateInvestigationError";
	}
}

function toPlannedCandidate(
	detectedSignal: DetectedSignal
): PlannedInvestigationCandidate {
	const investigation = prepareInvestigation(
		detectedSignal,
		INSIGHT_LOOKBACK_DAYS
	);
	return {
		evidence: investigation.evidence,
		...(investigation.measurementCandidate
			? { measurementCandidate: investigation.measurementCandidate }
			: {}),
		signal: investigation.signal,
	};
}

function annotationEvidence(rows: InvestigationAnnotation[]): string | null {
	if (rows.length === 0) {
		return null;
	}
	const value = `Annotation: ${rows
		.map((annotation) => `${annotation.date}: ${annotation.title}`)
		.join("; ")}`;
	return value.length <= 500 ? value : `${value.slice(0, 499).trimEnd()}…`;
}

async function discoverWebsiteSignals(
	input: InvestigateWebsiteInput,
	runtime: InvestigationRuntime
): Promise<WebsiteDiscoveryResult> {
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
	const metricDiagnostics: DetectionDiagnostics = { failedFamilies: 0 };
	const definitionDiagnostics: FunnelGoalDetectionDiagnostics = {
		failedDefinitions: 0,
	};
	async function detectSource<T>(
		family: string,
		work: () => Promise<T>
	): Promise<T> {
		try {
			return await work();
		} catch (error) {
			if (runtime.mode === "production") {
				captureInsightsError(error, "generation.detection.source_failed", {
					family,
					organization_id: input.organizationId,
					website_id: input.websiteId,
				});
			}
			throw error;
		}
	}
	const [
		remeasuredDue,
		metricSignals,
		funnelGoalSignals,
		measurementRecommendationSignals,
		routeHealthSignals,
	] = await Promise.all([
		due
			? detectSource("recheck", () =>
					runtime.sources.remeasureSignal(
						detectParams,
						due.signal,
						asOf,
						detectionAbortSignal
					)
				)
			: Promise.resolve(null),
		detectSource("metrics", () =>
			runtime.sources.detectMetricSignals(
				detectParams,
				undefined,
				asOf,
				detectionAbortSignal,
				metricDiagnostics
			)
		),
		detectSource("definitions", () =>
			runtime.sources.detectDefinitionSignals(detectParams, asOf, undefined, {
				diagnostics: definitionDiagnostics,
			})
		),
		detectSource("measurement_recommendations", () =>
			runtime.sources.detectMeasurementRecommendationSignals(
				detectParams,
				asOf,
				undefined,
				detectionAbortSignal
			)
		),
		detectSource("route_health", () =>
			runtime.sources.detectRouteHealthSignals(
				detectParams,
				asOf,
				undefined,
				detectionAbortSignal
			)
		),
	]);
	if (
		due &&
		remeasuredDue &&
		signalKeyForDetectedSignal(remeasuredDue) !== due.signal.signalKey
	) {
		throw new Error("Remeasurement changed the investigation subject");
	}
	if (
		metricDiagnostics.failedFamilies > 0 ||
		definitionDiagnostics.failedDefinitions > 0
	) {
		throw new Error(
			`Insight detection was incomplete (${metricDiagnostics.failedFamilies} metric families and ${definitionDiagnostics.failedDefinitions} conversion definitions failed)`
		);
	}
	const signalsByKey = new Map<string, DetectedSignal>();
	for (const signal of [
		...(remeasuredDue ? [remeasuredDue] : []),
		...metricSignals,
		...funnelGoalSignals,
		...measurementRecommendationSignals,
		...routeHealthSignals,
	]) {
		const key = signalKeyForDetectedSignal(signal);
		if (!signalsByKey.has(key)) {
			signalsByKey.set(key, signal);
		}
	}
	const detectedSignals = rankSignals([...signalsByKey.values()]);
	if (detectedSignals.length === 0) {
		if (due) {
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
			return {
				artifact: emptyInvestigationArtifact({ asOf, status: "deferred" }),
				kind: "empty",
			};
		}
		if (runtime.mode === "production") {
			emitInsightsEvent("info", "generation.investigation.skipped_no_signals", {
				organization_id: input.organizationId,
				website_id: input.websiteId,
				duration_ms: Math.round(performance.now() - startedAt),
			});
		}
		return {
			artifact: emptyInvestigationArtifact({ asOf, status: "no_signals" }),
			kind: "empty",
		};
	}

	const observations = await runtime.sources.loadObservations({
		asOf: asOf.toDate(),
		organizationId: input.organizationId,
		signalKeys: detectedSignals.map(signalKeyForDetectedSignal),
		websiteId: input.websiteId,
	});
	const eligibleSignals = input.forceRecheck
		? detectedSignals
		: eligibleSignalsForInvestigation(
				detectedSignals,
				observations,
				asOf.toDate()
			);
	const dueSignalKey = remeasuredDue
		? signalKeyForDetectedSignal(remeasuredDue)
		: null;
	const prioritySignal =
		eligibleSignals.find(
			(signal) =>
				signalKeyForDetectedSignal(signal) === dueSignalKey ||
				(isRegression(signal) &&
					(signal.severity !== "info" || isDirectSignal(signal)))
		) ?? null;
	const selectedSignal = input.selectedSignalKey
		? eligibleSignals.find(
				(signal) =>
					signalKeyForDetectedSignal(signal) === input.selectedSignalKey
			)
		: null;
	if (eligibleSignals.length === 0) {
		if (runtime.mode === "production") {
			emitInsightsEvent("info", "generation.investigation.deferred_recheck", {
				organization_id: input.organizationId,
				website_id: input.websiteId,
				detected_signal_count: detectedSignals.length,
				duration_ms: Math.round(performance.now() - startedAt),
			});
		}
		return {
			artifact: emptyInvestigationArtifact({ asOf, status: "deferred" }),
			kind: "empty",
		};
	}
	if (input.selectedSignalKey && !selectedSignal) {
		throw new Error("Selected investigation signal is no longer eligible");
	}
	return {
		kind: "signals",
		value: {
			asOf,
			detectedSignals,
			dueSignalKey,
			eligibleSignals,
			prioritySignal,
		},
	};
}

async function investigatePlannedCandidate(
	input: InvestigateWebsiteInput,
	candidate: PlannedInvestigationCandidate,
	relatedSignals: InvestigationSignal[],
	runtime: InvestigationRuntime
): Promise<WebsiteInvestigationArtifact> {
	const startedAt = performance.now();
	const asOf = normalizeAsOf(input.asOf, input.timezone);
	if (runtime.canRunAgent && !(await runtime.canRunAgent())) {
		if (runtime.mode === "production") {
			emitInsightsEvent(
				"info",
				"generation.investigation.deferred_agent_access",
				{
					organization_id: input.organizationId,
					website_id: input.websiteId,
					detected_signal_count: relatedSignals.length + 1,
					duration_ms: Math.round(performance.now() - startedAt),
				}
			);
		}
		return emptyInvestigationArtifact({ asOf, status: "deferred" });
	}
	let evidence = [...candidate.evidence];
	const annotationRows = await runtime.sources.fetchAnnotations(
		input.websiteId,
		candidate.signal,
		asOf.toDate(),
		input.timezone
	);
	const annotation = annotationEvidence(annotationRows);
	if (annotation) {
		evidence = [...evidence, annotation];
	}
	const appContext: AppContext = {
		userId: input.userId ?? "system",
		organizationId: input.organizationId,
		websiteId: input.websiteId,
		defaultWebsiteId: input.websiteId,
		websiteDomain: input.domain,
		timezone: input.timezone,
		currentDateTime: asOf.toISOString(),
		chatId: `insights:${input.organizationId}:${input.websiteId}:${candidate.signal.signalKey}`,
		mutationMode: "dry-run",
		serviceAuth: createServiceAuth(input.organizationId, ["read:data"]),
		websiteName: input.name ?? null,
	};
	const [history, otherOpenWork] = await Promise.all([
		runtime.sources.loadHistory({
			organizationId: input.organizationId,
			signalKey: candidate.signal.signalKey,
			through: asOf.toDate(),
			websiteId: input.websiteId,
		}),
		runtime.sources.loadOtherOpenWork({
			organizationId: input.organizationId,
			signalKey: candidate.signal.signalKey,
			through: asOf.toDate(),
			websiteId: input.websiteId,
		}),
	]);
	let investigationResult: InsightAgentResult;
	try {
		investigationResult = await runtime.sources.investigateSignal({
			appContext,
			evidence,
			githubRepository: input.githubRepository ?? null,
			history,
			measurementCandidate: candidate.measurementCandidate,
			otherOpenWork,
			relatedSignals,
			signal: candidate.signal,
		});
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
		throw new CandidateInvestigationError(error);
	}
	if (investigationResult.modelId && investigationResult.usage) {
		await runtime.onUsage?.({
			modelId: investigationResult.modelId,
			usage: investigationResult.usage,
		});
	}
	if (runtime.mode === "production") {
		emitInsightsEvent("info", "generation.agent.completed", {
			organization_id: input.organizationId,
			website_id: input.websiteId,
			duration_ms: Math.round(performance.now() - startedAt),
			next: investigationResult.outcome.next.type,
			output_count: 1,
			evidence_count: evidence.length,
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
		evidence,
		outcome: investigationResult.outcome,
		signal: candidate.signal,
		status: "completed",
	};
}

async function investigateWebsiteCore(
	input: InvestigateWebsiteInput,
	runtime: InvestigationRuntime
): Promise<WebsiteInvestigationArtifact> {
	const discovered = await discoverWebsiteSignals(input, runtime);
	if (discovered.kind === "empty") {
		return discovered.artifact;
	}
	const value = discovered.value;
	const { detectedSignals, prioritySignal } = value;
	const selectedSignal = input.selectedSignalKey
		? value.eligibleSignals.find(
				(signal) =>
					signalKeyForDetectedSignal(signal) === input.selectedSignalKey
			)
		: null;
	const detectedSignal =
		selectedSignal ?? prioritySignal ?? value.eligibleSignals[0];
	if (!detectedSignal) {
		throw new Error("No eligible investigation signal was selected");
	}
	const candidate = toPlannedCandidate(detectedSignal);
	const relatedSignals = detectedSignals
		.filter(
			(signal) =>
				signalKeyForDetectedSignal(signal) !== candidate.signal.signalKey
		)
		.slice(0, RELATED_SIGNAL_LIMIT)
		.map(
			(signal) => prepareInvestigation(signal, INSIGHT_LOOKBACK_DAYS).signal
		);
	return investigatePlannedCandidate(input, candidate, relatedSignals, runtime);
}

function plannedPortfolio(
	discovery: WebsiteSignalDiscovery,
	reason: InsightGenerationReason
): PlannedInvestigationCandidate[] {
	return planCoveragePortfolio(discovery.eligibleSignals, {
		dueSignalKey: discovery.dueSignalKey,
		reason,
	}).map(toPlannedCandidate);
}

/**
 * A frozen portfolio is retryable per signal because successful candidates
 * persist observations independently. A malformed or unavailable model result
 * therefore should not suppress unrelated candidates in the same run. Other
 * failures remain fail-fast because they can indicate a broken durable seam.
 */
async function runPlannedCandidatePortfolio(params: {
	candidates: PlannedInvestigationCandidate[];
	completedSignalKeys: ReadonlySet<string>;
	runCandidate: (
		candidate: PlannedInvestigationCandidate,
		relatedSignals: InvestigationSignal[]
	) => Promise<void>;
}): Promise<void> {
	let firstCandidateFailure: CandidateInvestigationError | null = null;
	for (const candidate of params.candidates) {
		if (params.completedSignalKeys.has(candidate.signal.signalKey)) {
			continue;
		}
		try {
			await params.runCandidate(
				candidate,
				params.candidates
					.filter(
						(sibling) => sibling.signal.signalKey !== candidate.signal.signalKey
					)
					.map((sibling) => sibling.signal)
			);
		} catch (error) {
			if (!(error instanceof CandidateInvestigationError)) {
				throw error;
			}
			firstCandidateFailure ??= error;
		}
	}
	if (firstCandidateFailure) {
		throw firstCandidateFailure;
	}
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

/**
 * Read-only harness for proving a full run selects distinct signals before it
 * reaches durable production persistence. Each artifact remains one exact
 * signal and one agent turn.
 */
export async function investigateWebsitePortfolioWithSources(
	input: InvestigateWebsiteInput,
	sources: InvestigationSources,
	reason: InsightGenerationReason,
	canRunAgent?: () => Promise<boolean>
): Promise<WebsiteInvestigationArtifact[]> {
	const runtime: InvestigationRuntime = {
		canRunAgent,
		mode: "shadow",
		sources,
	};
	const discovered = await discoverWebsiteSignals(input, runtime);
	if (discovered.kind === "empty") {
		return [discovered.artifact];
	}
	const candidates = plannedPortfolio(discovered.value, reason);
	const artifacts: WebsiteInvestigationArtifact[] = [];
	await runPlannedCandidatePortfolio({
		candidates,
		completedSignalKeys: new Set(),
		runCandidate: async (candidate, relatedSignals) => {
			artifacts.push(
				await investigatePlannedCandidate(
					input,
					candidate,
					relatedSignals,
					runtime
				)
			);
		},
	});
	return artifacts;
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

	const existingObservations = await findRunObservations({
		organizationId: input.organizationId,
		runId: input.runId,
		websiteId: site.id,
	});
	const investigationInput: InvestigateWebsiteInput = {
		asOf: new Date(),
		domain: site.domain,
		forceRecheck: input.reason === "manual",
		githubRepository: site.integrations?.github ?? null,
		name: site.name,
		organizationId: input.organizationId,
		timezone: input.timezone,
		userId: input.requestedByUserId ?? undefined,
		websiteId: site.id,
	};
	let plan = await loadInsightRunCandidatePlan(runIdentity, input.reason);
	let emptyStatus: "deferred" | "no_signals" | null = null;
	if (!plan && existingObservations.length > 0) {
		// A run created before candidate portfolios existed can contain at most
		// one observation. Freeze that completed legacy work explicitly rather
		// than silently treating a missing plan as a completed new portfolio.
		plan = await freezeInsightRunCandidatePlan(runIdentity, input.reason, {
			asOf: new Date().toISOString(),
			candidates: existingObservations.map((observation) => ({
				evidence: [],
				signal: observation.signal,
			})),
			reason: input.reason,
		});
		emitInsightsEvent(
			"info",
			"generation.candidate_portfolio.legacy_reconciled",
			{
				organization_id: input.organizationId,
				website_id: site.id,
				run_id: input.runId,
				candidate_count: plan.candidates.length,
			}
		);
	}
	if (!plan) {
		const discovered = await discoverWebsiteSignals(investigationInput, {
			mode: "production",
			sources: productionInvestigationSources,
		});
		if (discovered.kind === "empty") {
			if (
				discovered.artifact.status !== "deferred" &&
				discovered.artifact.status !== "no_signals"
			) {
				throw new Error(
					"An empty investigation discovery had an invalid status"
				);
			}
			emptyStatus = discovered.artifact.status;
		} else {
			const selectedCandidates = plannedPortfolio(
				discovered.value,
				input.reason
			);
			plan = await freezeInsightRunCandidatePlan(runIdentity, input.reason, {
				asOf: discovered.value.asOf.toISOString(),
				candidates: selectedCandidates,
				reason: input.reason,
			});
			emitInsightsEvent("info", "generation.candidate_portfolio.frozen", {
				organization_id: input.organizationId,
				website_id: site.id,
				run_id: input.runId,
				candidate_count: plan.candidates.length,
				detected_signal_count: discovered.value.detectedSignals.length,
			});
		}
	}
	let billingCheckError: unknown;
	let billingCustomerId: string | null = null;
	let noCredits = false;
	const completedSignalKeys = new Set(
		existingObservations.map((observation) => observation.signal.signalKey)
	);
	const outcomes = existingObservations.map(
		(observation) => observation.outcome
	);
	const visibleInvestigations: WebsiteInvestigation[] =
		existingObservations.flatMap((observation) =>
			observation.insightId && isVisibleInvestigation(observation)
				? [
						{
							id: observation.insightId,
							outcome: observation.outcome,
							signal: observation.signal,
							websiteDomain: site.domain,
							websiteId: site.id,
							websiteName: site.name,
						},
					]
				: []
		);
	const enqueueVisibleEffects = async (
		investigations: WebsiteInvestigation[]
	): Promise<void> => {
		const effects = (
			await Promise.all(
				investigations.map((insight) =>
					prepareInsightSlackEffects({
						insight,
						organizationId: input.organizationId,
					})
				)
			)
		).flat();
		await enqueueInsightRunEffects({ ...runIdentity, effects });
	};
	const drainPendingEffectsAfterFailure = async (): Promise<void> => {
		try {
			await drainInsightRunEffects(runIdentity, input.finalAttempt);
		} catch (error) {
			captureInsightsError(error, "generation.partial_effects.failed", {
				organization_id: input.organizationId,
				website_id: site.id,
				run_id: input.runId,
			});
		}
	};

	await enqueueVisibleEffects(visibleInvestigations);
	try {
		if (plan) {
			const frozenInput = { ...investigationInput, asOf: plan.asOf };
			await runPlannedCandidatePortfolio({
				candidates: plan.candidates,
				completedSignalKeys,
				runCandidate: async (plannedCandidate, relatedSignals) => {
					const agentUsage: {
						value: Required<
							Pick<InsightAgentResult, "modelId" | "usage">
						> | null;
					} = { value: null };
					const analysis = await investigatePlannedCandidate(
						frozenInput,
						plannedCandidate,
						relatedSignals,
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
									noCredits =
										!(await ensureAgentCreditsAvailable(billingCustomerId));
									return !noCredits;
								} catch (error) {
									billingCheckError = error;
									captureInsightsError(
										error,
										"generation.billing_check.failed",
										{
											organization_id: input.organizationId,
											website_id: site.id,
											run_id: input.runId,
										}
									);
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
					if (!(analysis.outcome && analysis.signal)) {
						throw (
							billingCheckError ??
							new Error(
								noCredits
									? "AI usage allowance is empty"
									: "Insight agent access is unavailable before the candidate portfolio is complete"
							)
						);
					}
					const candidate: WebsiteInvestigation = {
						id: randomUUIDv7(),
						outcome: analysis.outcome,
						signal: analysis.signal,
						websiteDomain: site.domain,
						websiteId: site.id,
						websiteName: site.name,
					};
					const asOf = new Date(analysis.asOf);
					const saved = await persistInvestigation({
						evidence: analysis.evidence,
						investigation: candidate,
						notNewerThan: asOf,
						organizationId: input.organizationId,
						recheckAt: nextRecheckAt(asOf, candidate.outcome.next),
						runId: input.runId,
						timezone: input.timezone,
					});
					completedSignalKeys.add(candidate.signal.signalKey);
					outcomes.push(candidate.outcome);
					if (saved) {
						visibleInvestigations.push(saved);
						await enqueueVisibleEffects([saved]);
					}
					const billableUsage = agentUsage.value;
					if (billableUsage) {
						try {
							await trackAgentUsageAndBill({
								billingCustomerId,
								chatId: `insights:${input.organizationId}:${site.id}:${candidate.signal.signalKey}`,
								idempotencyKey: `insights:${input.runId}:${site.id}:${candidate.signal.signalKey}`,
								modelId: billableUsage.modelId,
								organizationId: input.organizationId,
								source: "insights",
								usage: billableUsage.usage,
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
				},
			});
		}
	} catch (error) {
		await drainPendingEffectsAfterFailure();
		throw error;
	}

	if (billingCheckError) {
		throw billingCheckError;
	}
	const succeeded = outcomes.length > 0;
	const published = outcomes.filter(
		(outcome) => outcome.publish === true
	).length;

	const result: GenerateWebsiteInsightsResult = succeeded
		? {
				status: "succeeded",
				resultCount: published,
			}
		: {
				status: "skipped",
				resultCount: 0,
				message: noCredits
					? "AI usage allowance is empty"
					: emptyStatus === "deferred"
						? "Detected signals are waiting for recheck"
						: "No noteworthy change was found",
			};
	const preparedResult = await prepareInsightRun({
		...runIdentity,
		effects: [],
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
		result_count: published,
		reason: input.reason,
	});
	setInsightsLog({
		generation_result_count: published,
		generation_status: succeeded ? "succeeded" : "skipped",
	});
	return preparedResult;
}
