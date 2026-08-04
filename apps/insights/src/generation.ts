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
	type CandidateQualification,
	qualifyCandidateSignals,
	unqualifiedSignalKeys,
} from "./candidate-qualification";
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
	formatAnnotationContext,
	type InvestigationAnnotation,
	prepareInvestigation,
	rankSignals,
	type SignalRankingStrategy,
	signalAnnotationWindow,
	signalKeyForDetectedSignal,
} from "./investigation";
import {
	eligibleSignalsForInvestigation,
	findRunObservations,
	isTrustedRunObservation,
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
import {
	InsightAgentExecutionError,
	InsightAgentGenerationError,
	type InsightAgentInput,
	type InsightAgentResult,
	runInsightAgent,
} from "./agent";
import {
	clusterErrorCandidateRoutes,
	type ErrorCandidateClusteringTrace,
	type ErrorCandidateRedundantRouteReceipt,
	isFingerprintErrorCandidate,
	loadErrorCandidateOverlap,
	type ErrorCandidateClustering,
	type ErrorCandidateOverlap,
} from "./error-candidate-overlap";
import { loadErrorCohortBehavior } from "./error-cohort-behavior";
import { loadErrorCustomerImpact } from "./error-customer-impact";
import { loadErrorCohortGoalCompletion } from "./error-cohort-goal-completion";
import { loadDatabuddySetupContext } from "./databuddy-setup-context";
import { buildInvestigationContext } from "./investigation-context";
import { loadVitalCohortBehavior } from "./vital-cohort-behavior";
import {
	freezeInsightRunCandidatePlan,
	loadInsightRunCandidatePlan,
	MAX_COVERED_ROUTE_CONTEXT_SIGNALS,
	type PlannedInvestigationCandidate,
} from "./run-candidate-plan";
import {
	coveragePortfolioLimit,
	errorQualificationFrontierLimit,
	planCoveragePortfolioWithTrace,
	type CoveragePortfolioPlan,
} from "./coverage-planner";
import type { WebsiteInvestigation } from "./persistence";
import {
	isInterruptingInvestigation,
	persistInvestigation,
} from "./persistence";
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
	brief?: InsightAgentResult["brief"];
	evidence: string[];
	outcome: InvestigationOutcome | null;
	signal: InvestigationSignal | null;
	status: "completed" | "deferred" | "no_signals";
}

const SOURCE_DETECTION_TIMEOUT_MS = 45_000;
const DISCOVERY_DETECTION_TIMEOUT_MS = 180_000;
export const INSIGHT_LOOKBACK_DAYS = 7;

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
	loadDatabuddySetup: typeof loadDatabuddySetupContext;
	loadDueInvestigation: (params: {
		asOf: Date;
		organizationId: string;
		websiteId: string;
	}) => Promise<DueOpenInvestigation | null>;
	loadErrorCandidateOverlap: typeof loadErrorCandidateOverlap;
	loadErrorCohortBehavior: typeof loadErrorCohortBehavior;
	loadErrorCohortGoalCompletion: typeof loadErrorCohortGoalCompletion;
	loadErrorCustomerImpact: typeof loadErrorCustomerImpact;
	loadHistory: typeof loadInvestigationHistory;
	loadObservations: (params: {
		asOf: Date;
		organizationId: string;
		signalKeys: string[];
		websiteId: string;
	}) => Promise<Map<string, LatestInsightObservation>>;
	loadOtherOpenWork: typeof loadOtherOpenWork;
	loadVitalCohortBehavior: typeof loadVitalCohortBehavior;
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
}): Promise<{
	annotationContext?: string;
	definitionContext?: string;
	evidence: string[];
	signal: InvestigationSignal;
} | null> {
	const today = dayjs(params.asOf).tz(params.timezone);
	const detected = await remeasureStoredSignal(
		{
			lookbackDays: INSIGHT_LOOKBACK_DAYS,
			timezone: params.timezone,
			websiteId: params.websiteId,
		},
		params.signal,
		today,
		AbortSignal.timeout(SOURCE_DETECTION_TIMEOUT_MS)
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
	loadErrorCandidateOverlap,
	loadErrorCohortBehavior,
	loadErrorCustomerImpact,
	loadErrorCohortGoalCompletion,
	loadVitalCohortBehavior,
	loadDatabuddySetup: loadDatabuddySetupContext,
	loadHistory: loadInvestigationHistory,
	loadOtherOpenWork,
	loadObservations: loadLatestSignalObservations,
	remeasureSignal: remeasureStoredSignal,
};

function setupContextCacheKey(
	params: Parameters<InvestigationSources["loadDatabuddySetup"]>[0]
) {
	return [
		params.organizationId,
		params.websiteId,
		params.timezone,
		params.signal.period.current.from,
		params.signal.period.current.to,
	].join(":");
}

type SignalEnrichmentParams = Parameters<
	InvestigationSources["loadErrorCustomerImpact"]
>[0];

function signalEnrichmentCacheKey(params: SignalEnrichmentParams): string {
	return [
		params.websiteId,
		params.timezone,
		params.signal.signalKey,
		params.signal.period.current.from,
		params.signal.period.current.to,
	].join(":");
}

function memoizeSignalEnrichmentSource<T>(
	load: (params: SignalEnrichmentParams) => Promise<T>
): (params: SignalEnrichmentParams) => Promise<T> {
	const cache = new Map<string, Promise<T>>();
	return (params) => {
		const key = signalEnrichmentCacheKey(params);
		const cached = cache.get(key);
		if (cached) {
			return cached;
		}
		const result = load(params);
		let cachedResult: Promise<T>;
		cachedResult = result.catch((error) => {
			if (cache.get(key) === cachedResult) {
				cache.delete(key);
			}
			throw error;
		});
		cache.set(key, cachedResult);
		return cachedResult;
	};
}

/**
 * Each portfolio sees one fixed aggregate snapshot per exact signal and
 * observation window. Failed enrichments are not cached, so the next
 * candidate can retry without turning a transient read error into a run-wide
 * blind spot.
 */
export function memoizeDatabuddySetupSource(
	loadDatabuddySetup: InvestigationSources["loadDatabuddySetup"]
): InvestigationSources["loadDatabuddySetup"] {
	const cache = new Map<
		string,
		ReturnType<InvestigationSources["loadDatabuddySetup"]>
	>();
	return (params) => {
		const key = setupContextCacheKey(params);
		const cached = cache.get(key);
		if (cached) {
			return cached;
		}
		const result = loadDatabuddySetup(params);
		let cachedResult: ReturnType<InvestigationSources["loadDatabuddySetup"]>;
		cachedResult = result.catch((error) => {
			if (cache.get(key) === cachedResult) {
				cache.delete(key);
			}
			throw error;
		});
		cache.set(key, cachedResult);
		return cachedResult;
	};
}

function memoizedInvestigationSources(
	sources: InvestigationSources
): InvestigationSources {
	return {
		...sources,
		loadErrorCohortBehavior: memoizeSignalEnrichmentSource(
			sources.loadErrorCohortBehavior
		),
		loadErrorCohortGoalCompletion: memoizeSignalEnrichmentSource(
			sources.loadErrorCohortGoalCompletion
		),
		loadErrorCustomerImpact: memoizeSignalEnrichmentSource(
			sources.loadErrorCustomerImpact
		),
		loadVitalCohortBehavior: memoizeSignalEnrichmentSource(
			sources.loadVitalCohortBehavior
		),
		loadDatabuddySetup: memoizeDatabuddySetupSource(sources.loadDatabuddySetup),
	};
}

interface WebsiteSignalDiscovery {
	asOf: dayjs.Dayjs;
	detectedSignals: DetectedSignal[];
	dueSignalKey: string | null;
	eligibleSignals: DetectedSignal[];
	qualifications: CandidateQualification[];
}

export type WebsitePortfolioInspection =
	| {
			asOf: string;
			detectedSignals: DetectedSignal[];
			dueSignalKey: string | null;
			eligibleSignals: DetectedSignal[];
			qualifications: CandidateQualification[];
			overlapClustering?: ErrorCohortClustering;
			plan: CoveragePortfolioPlan;
			reachPlan: CoveragePortfolioPlan;
			status: "signals";
	  }
	| {
			asOf: string;
			detectedSignals: [];
			dueSignalKey: null;
			eligibleSignals: [];
			qualifications: [];
			plan: null;
			reachPlan: null;
			status: "deferred" | "no_signals";
	  };

type WebsiteDiscoveryResult =
	| { artifact: WebsiteInvestigationArtifact; kind: "empty" }
	| { kind: "signals"; value: WebsiteSignalDiscovery };

function toPlannedCandidate(
	detectedSignal: DetectedSignal,
	coveredRouteSignals: InvestigationSignal[] = []
): PlannedInvestigationCandidate {
	const investigation = prepareInvestigation(
		detectedSignal,
		INSIGHT_LOOKBACK_DAYS
	);
	return {
		...(coveredRouteSignals.length > 0 ? { coveredRouteSignals } : {}),
		...(investigation.definitionContext
			? { definitionContext: investigation.definitionContext }
			: {}),
		evidence: investigation.evidence,
		...(investigation.measurementCandidate
			? { measurementCandidate: investigation.measurementCandidate }
			: {}),
		...(investigation.measurementGapRecommendationCandidate
			? {
					measurementGapRecommendationCandidate:
						investigation.measurementGapRecommendationCandidate,
				}
			: {}),
		signal: investigation.signal,
	};
}

async function discoverWebsiteSignals(
	input: InvestigateWebsiteInput,
	runtime: InvestigationRuntime,
	options: {
		allowCoolingFallback?: boolean;
		reason: InsightGenerationReason;
	}
): Promise<WebsiteDiscoveryResult> {
	const startedAt = performance.now();
	const asOf = normalizeAsOf(input.asOf, input.timezone);
	const detectParams = {
		websiteId: input.websiteId,
		lookbackDays: INSIGHT_LOOKBACK_DAYS,
		timezone: input.timezone,
	};
	const discoveryController = new AbortController();
	const discoveryAbortSignal = AbortSignal.any([
		discoveryController.signal,
		AbortSignal.timeout(DISCOVERY_DETECTION_TIMEOUT_MS),
	]);
	const sourceAbortSignal = AbortSignal.any([
		discoveryAbortSignal,
		AbortSignal.timeout(SOURCE_DETECTION_TIMEOUT_MS),
	]);
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
			discoveryController.abort(error);
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
	const detectionTasks = [
		due
			? detectSource("recheck", () =>
					runtime.sources.remeasureSignal(
						detectParams,
						due.signal,
						asOf,
						sourceAbortSignal
					)
				)
			: Promise.resolve(null),
		detectSource("metrics", () =>
			runtime.sources.detectMetricSignals(
				detectParams,
				undefined,
				asOf,
				sourceAbortSignal,
				metricDiagnostics
			)
		),
		detectSource("definitions", () =>
			runtime.sources.detectDefinitionSignals(detectParams, asOf, undefined, {
				abortSignal: discoveryAbortSignal,
				diagnostics: definitionDiagnostics,
			})
		),
		detectSource("measurement_recommendations", () =>
			runtime.sources.detectMeasurementRecommendationSignals(
				detectParams,
				asOf,
				undefined,
				sourceAbortSignal
			)
		),
		detectSource("route_health", () =>
			runtime.sources.detectRouteHealthSignals(
				detectParams,
				asOf,
				undefined,
				sourceAbortSignal
			)
		),
	] as const;
	const settledDetections = await Promise.allSettled(detectionTasks);
	const failedDetection = settledDetections.find(
		(result) => result.status === "rejected"
	);
	if (failedDetection?.status === "rejected") {
		throw discoveryController.signal.reason ?? failedDetection.reason;
	}
	const [
		remeasuredDue,
		metricSignals,
		funnelGoalSignals,
		measurementRecommendationSignals,
		routeHealthSignals,
	] = await Promise.all(detectionTasks);
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
	const eligibleSignals = eligibleSignalsForInvestigation(
		detectedSignals,
		observations,
		asOf.toDate()
	);
	const dueSignalKey = remeasuredDue
		? signalKeyForDetectedSignal(remeasuredDue)
		: null;
	if (eligibleSignals.length === 0 && !options.allowCoolingFallback) {
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
	const qualifications = await qualifyCandidateSignals({
		abortSignal: sourceAbortSignal,
		errorQualificationLimit: errorQualificationFrontierLimit(options.reason),
		lookbackDays: INSIGHT_LOOKBACK_DAYS,
		...(dueSignalKey ? { prioritizedSignalKeys: new Set([dueSignalKey]) } : {}),
		signals: detectedSignals,
		sources: runtime.sources,
		timezone: input.timezone,
		vitalQualificationLimit: coveragePortfolioLimit(options.reason),
		websiteId: input.websiteId,
	});
	return {
		kind: "signals",
		value: {
			asOf,
			detectedSignals,
			dueSignalKey,
			eligibleSignals,
			qualifications,
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
	const [annotationRows, context] = await Promise.all([
		runtime.sources.fetchAnnotations(
			input.websiteId,
			candidate.signal,
			asOf.toDate(),
			input.timezone
		),
		buildInvestigationContext(
			{
				abortSignal: AbortSignal.timeout(SOURCE_DETECTION_TIMEOUT_MS),
				evidence: candidate.evidence,
				organizationId: input.organizationId,
				signal: candidate.signal,
				timezone: input.timezone,
				websiteId: input.websiteId,
			},
			{
				loadCohortBehavior: runtime.sources.loadErrorCohortBehavior,
				loadCustomerImpact: runtime.sources.loadErrorCustomerImpact,
				loadDatabuddySetup: runtime.sources.loadDatabuddySetup,
				loadGoalCompletion: runtime.sources.loadErrorCohortGoalCompletion,
				loadVitalCohortBehavior: runtime.sources.loadVitalCohortBehavior,
				reportCohortBehaviorError: (error) => {
					if (runtime.mode === "production") {
						captureInsightsError(error, "generation.cohort_behavior.failed", {
							organization_id: input.organizationId,
							signal_key: candidate.signal.signalKey,
							website_id: input.websiteId,
						});
					}
				},
				reportCustomerImpactError: (error) => {
					if (runtime.mode === "production") {
						captureInsightsError(error, "generation.customer_impact.failed", {
							organization_id: input.organizationId,
							signal_key: candidate.signal.signalKey,
							website_id: input.websiteId,
						});
					}
				},
				reportDatabuddySetupError: (error) => {
					if (runtime.mode === "production") {
						captureInsightsError(error, "generation.databuddy_setup.failed", {
							organization_id: input.organizationId,
							signal_key: candidate.signal.signalKey,
							website_id: input.websiteId,
						});
					}
				},
				reportGoalCompletionError: (error) => {
					if (runtime.mode === "production") {
						captureInsightsError(error, "generation.goal_completion.failed", {
							organization_id: input.organizationId,
							signal_key: candidate.signal.signalKey,
							website_id: input.websiteId,
						});
					}
				},
				reportVitalCohortBehaviorError: (error) => {
					if (runtime.mode === "production") {
						captureInsightsError(
							error,
							"generation.vital_cohort_behavior.failed",
							{
								organization_id: input.organizationId,
								signal_key: candidate.signal.signalKey,
								website_id: input.websiteId,
							}
						);
					}
				},
			}
		),
	]);
	const annotationContext = formatAnnotationContext(annotationRows);
	const evidence = context.evidence;
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
			...(annotationContext ? { annotationContext } : {}),
			appContext,
			coveredRouteContext: candidate.coveredRouteSignals,
			customerImpact: context.customerImpact,
			databuddySetup: context.databuddySetup,
			...(candidate.definitionContext
				? { definitionContext: candidate.definitionContext }
				: {}),
			errorBehavior: context.errorBehavior,
			errorBehaviorEvidenceIndex: context.errorBehaviorEvidenceIndex,
			errorGoalCompletion: context.errorGoalCompletion,
			errorGoalCompletionEvidenceIndex:
				context.errorGoalCompletionEvidenceIndex,
			evidence,
			githubRepository: input.githubRepository ?? null,
			history,
			measurementCandidate: candidate.measurementCandidate,
			measurementGapRecommendationCandidate:
				candidate.measurementGapRecommendationCandidate,
			otherOpenWork,
			relatedSignals,
			setupRecommendationCandidate: context.setupRecommendationCandidate,
			signal: candidate.signal,
			vitalBehavior: context.vitalBehavior,
			vitalBehaviorEvidenceIndex: context.vitalBehaviorEvidenceIndex,
		});
	} catch (error) {
		if (error instanceof InsightAgentExecutionError) {
			await runtime.onUsage?.({
				modelId: error.modelId,
				usage: error.usage,
			});
		}
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
		brief: investigationResult.brief,
		evidence,
		outcome: investigationResult.outcome,
		signal: candidate.signal,
		status: "completed",
	};
}

export interface ErrorCohortClustering extends ErrorCandidateClustering {
	/** Number of cached replan passes needed to settle selected candidates. */
	passes: number;
	/**
	 * Every currently selected non-due broad-error/route pair is classified as
	 * independent or unavailable; this does not claim every detected route was
	 * queried.
	 */
	selectedCandidatesSettled: boolean;
}

interface CoveragePortfolioSelection {
	clustering: ErrorCohortClustering;
	plan: CoveragePortfolioPlan;
	redundantRouteReceipts: ErrorCandidateRedundantRouteReceipt[];
}

function mergeErrorCohortClustering(
	traces: ErrorCandidateClusteringTrace[],
	selectedCandidatesSettled: boolean
): ErrorCohortClustering {
	const candidatePairs = new Set<string>();
	const measuredPairs = new Set<string>();
	const unavailablePairs = new Set<string>();
	const redundantRoutes = new Set<string>();
	const independentRoutes = new Set<string>();
	for (const trace of traces) {
		for (const key of trace.candidatePairKeys) {
			candidatePairs.add(key);
		}
		for (const key of trace.measuredPairKeys) {
			measuredPairs.add(key);
		}
		for (const key of trace.unavailablePairKeys) {
			unavailablePairs.add(key);
		}
		for (const key of trace.redundantRouteSignalKeys) {
			redundantRoutes.add(key);
		}
		for (const key of trace.independentRouteSignalKeys) {
			independentRoutes.add(key);
		}
	}
	return {
		candidatePairCount: candidatePairs.size,
		independentRouteSignalKeys: [...independentRoutes]
			.filter((key) => !redundantRoutes.has(key))
			.sort(),
		measuredPairCount: measuredPairs.size,
		passes: traces.length,
		redundantRouteSignalKeys: [...redundantRoutes].sort(),
		selectedCandidatesSettled,
		unavailablePairCount: unavailablePairs.size,
	};
}

function mergeRedundantRouteReceipts(
	traces: readonly ErrorCandidateClusteringTrace[]
): ErrorCandidateRedundantRouteReceipt[] {
	const receipts = new Map<string, ErrorCandidateRedundantRouteReceipt>();
	for (const trace of traces) {
		for (const receipt of trace.redundantRouteReceipts) {
			receipts.set(
				`${receipt.fingerprintSignalKey}\u0000${receipt.routeSignalKey}`,
				receipt
			);
		}
	}
	return [...receipts.values()].sort(
		(left, right) =>
			left.routeSignalKey.localeCompare(right.routeSignalKey) ||
			left.fingerprintSignalKey.localeCompare(right.fingerprintSignalKey)
	);
}

function portfolioSignalsForReason(
	discovery: WebsiteSignalDiscovery,
	reason: InsightGenerationReason
): DetectedSignal[] {
	return reason === "manual"
		? discovery.detectedSignals
		: discovery.eligibleSignals;
}

/**
 * Keeps an overlap-covered route as private investigation context for the one
 * selected broad error that measured it. Selection stays unchanged: this only
 * enriches the frozen input after the final plan has settled.
 */
function coveredRouteSignalsForFinalPortfolio(
	plan: CoveragePortfolioPlan,
	receipts: readonly ErrorCandidateRedundantRouteReceipt[]
): Map<string, InvestigationSignal[]> {
	const selectedSignalKeys = new Set(
		plan.selected.map(signalKeyForDetectedSignal)
	);
	const selectedOwnerRanks = new Map<string, number>();
	for (const entry of plan.entries) {
		if (
			entry.selectedAt === null ||
			!isFingerprintErrorCandidate(entry.signal)
		) {
			continue;
		}
		selectedOwnerRanks.set(
			signalKeyForDetectedSignal(entry.signal),
			entry.selectedAt
		);
	}
	const ownerByRoute = new Map<
		string,
		{ ownerRank: number; ownerSignalKey: string; route: InvestigationSignal }
	>();
	for (const receipt of receipts) {
		const ownerRank = selectedOwnerRanks.get(receipt.fingerprintSignalKey);
		if (
			ownerRank === undefined ||
			receipt.route.signalKey !== receipt.routeSignalKey ||
			selectedSignalKeys.has(receipt.routeSignalKey)
		) {
			continue;
		}
		const existing = ownerByRoute.get(receipt.routeSignalKey);
		if (
			!existing ||
			ownerRank < existing.ownerRank ||
			(ownerRank === existing.ownerRank &&
				receipt.fingerprintSignalKey.localeCompare(existing.ownerSignalKey) < 0)
		) {
			ownerByRoute.set(receipt.routeSignalKey, {
				ownerRank,
				ownerSignalKey: receipt.fingerprintSignalKey,
				route: receipt.route,
			});
		}
	}
	const routesByOwner = new Map<string, InvestigationSignal[]>();
	for (const owner of ownerByRoute.values()) {
		const coveredRoutes = routesByOwner.get(owner.ownerSignalKey) ?? [];
		coveredRoutes.push(owner.route);
		routesByOwner.set(owner.ownerSignalKey, coveredRoutes);
	}
	return new Map(
		[...routesByOwner.entries()]
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([ownerSignalKey, routes]) => [
				ownerSignalKey,
				routes
					.sort((left, right) => left.signalKey.localeCompare(right.signalKey))
					.slice(0, MAX_COVERED_ROUTE_CONTEXT_SIGNALS),
			])
	);
}

function toPlannedPortfolioCandidates(
	portfolio: CoveragePortfolioSelection
): PlannedInvestigationCandidate[] {
	const coveredRoutesByOwner = coveredRouteSignalsForFinalPortfolio(
		portfolio.plan,
		portfolio.redundantRouteReceipts
	);
	return portfolio.plan.selected.map((signal) =>
		toPlannedCandidate(
			signal,
			coveredRoutesByOwner.get(signalKeyForDetectedSignal(signal))
		)
	);
}

async function coveragePortfolio(
	input: InvestigateWebsiteInput,
	discovery: WebsiteSignalDiscovery,
	reason: InsightGenerationReason,
	sources: Pick<InvestigationSources, "loadErrorCandidateOverlap">,
	evaluation: {
		overlapCache?: Map<string, Promise<ErrorCandidateOverlap | null>>;
		rankingStrategy?: SignalRankingStrategy;
	} = {}
): Promise<CoveragePortfolioSelection> {
	const manual = reason === "manual";
	const signals = portfolioSignalsForReason(discovery, reason);
	const options = {
		dueSignalKey: discovery.dueSignalKey,
		preferredSignalKeys: manual
			? new Set(discovery.eligibleSignals.map(signalKeyForDetectedSignal))
			: undefined,
		rankingStrategy: evaluation.rankingStrategy,
		reason,
		unqualifiedSignalKeys: unqualifiedSignalKeys(discovery.qualifications),
	} as const;
	const overlapCache =
		evaluation.overlapCache ??
		new Map<string, Promise<ErrorCandidateOverlap | null>>();
	const overlapAbortSignal = AbortSignal.timeout(SOURCE_DETECTION_TIMEOUT_MS);
	const traces: ErrorCandidateClusteringTrace[] = [];
	const excludedSignalKeys = new Set<string>();
	let plan = planCoveragePortfolioWithTrace(signals, options);
	while (traces.length < signals.length) {
		const trace = await clusterErrorCandidateRoutes({
			abortSignal: overlapAbortSignal,
			candidates: plan.selected,
			dueSignalKey: discovery.dueSignalKey,
			loadOverlap: sources.loadErrorCandidateOverlap,
			lookbackDays: INSIGHT_LOOKBACK_DAYS,
			overlapCache,
			timezone: input.timezone,
			websiteId: input.websiteId,
		});
		traces.push(trace);
		const newExclusions = trace.redundantRouteSignalKeys.filter(
			(key) => !excludedSignalKeys.has(key)
		);
		if (newExclusions.length === 0) {
			return {
				clustering: mergeErrorCohortClustering(traces, true),
				plan,
				redundantRouteReceipts: mergeRedundantRouteReceipts(traces),
			};
		}
		for (const key of newExclusions) {
			excludedSignalKeys.add(key);
		}
		plan = planCoveragePortfolioWithTrace(signals, {
			...options,
			excludedSignalKeys,
		});
	}
	return {
		clustering: mergeErrorCohortClustering(traces, false),
		plan,
		// A fail-open portfolio is not a verified final owner for private route
		// context, so keep its selection unchanged and attach nothing.
		redundantRouteReceipts: [],
	};
}

async function plannedPortfolio(
	input: InvestigateWebsiteInput,
	discovery: WebsiteSignalDiscovery,
	reason: InsightGenerationReason,
	sources: Pick<InvestigationSources, "loadErrorCandidateOverlap">
): Promise<PlannedInvestigationCandidate[]> {
	const portfolio = await coveragePortfolio(input, discovery, reason, sources);
	return toPlannedPortfolioCandidates(portfolio);
}

/**
 * A frozen portfolio is retryable per signal because successful candidates
 * persist observations independently. An invalid structured model result
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
	let firstCandidateFailure: InsightAgentGenerationError | null = null;
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
			if (!(error instanceof InsightAgentGenerationError)) {
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
 * Read-only candidate inventory for evaluating detector and portfolio choices
 * without calling the investigation agent or creating durable work.
 */
export async function inspectWebsitePortfolioWithSources(
	input: InvestigateWebsiteInput,
	sources: InvestigationSources,
	reason: InsightGenerationReason
): Promise<WebsitePortfolioInspection> {
	const runtime: InvestigationRuntime = {
		mode: "shadow",
		sources,
	};
	const discovered = await discoverWebsiteSignals(input, runtime, {
		allowCoolingFallback: reason === "manual",
		reason,
	});
	if (discovered.kind === "empty") {
		if (
			discovered.artifact.status !== "deferred" &&
			discovered.artifact.status !== "no_signals"
		) {
			throw new Error("Candidate inventory received a completed artifact");
		}
		return {
			asOf: discovered.artifact.asOf,
			detectedSignals: [],
			dueSignalKey: null,
			eligibleSignals: [],
			qualifications: [],
			plan: null,
			reachPlan: null,
			status: discovered.artifact.status,
		};
	}
	// Keep the overlap measurements and clustering policy fixed while changing
	// only the ranking strategy. Otherwise the reach comparison can mistake
	// route de-duplication for a ranking improvement.
	const overlapCache = new Map<string, Promise<ErrorCandidateOverlap | null>>();
	const portfolio = await coveragePortfolio(
		input,
		discovered.value,
		reason,
		sources,
		{ overlapCache }
	);
	const reachPortfolio = await coveragePortfolio(
		input,
		discovered.value,
		reason,
		sources,
		{ overlapCache, rankingStrategy: "reach" }
	);
	return {
		asOf: discovered.value.asOf.toISOString(),
		detectedSignals: discovered.value.detectedSignals,
		dueSignalKey: discovered.value.dueSignalKey,
		eligibleSignals: discovered.value.eligibleSignals,
		qualifications: discovered.value.qualifications,
		overlapClustering: portfolio.clustering,
		plan: portfolio.plan,
		reachPlan: reachPortfolio.plan,
		status: "signals",
	};
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
		sources: memoizedInvestigationSources(sources),
	};
	const discovered = await discoverWebsiteSignals(input, runtime, {
		allowCoolingFallback: reason === "manual",
		reason,
	});
	if (discovered.kind === "empty") {
		return [discovered.artifact];
	}
	const candidates = await plannedPortfolio(
		input,
		discovered.value,
		reason,
		sources
	);
	if (candidates.length === 0) {
		return [
			emptyInvestigationArtifact({
				asOf: discovered.value.asOf,
				status: "no_signals",
			}),
		];
	}
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
		githubRepository: site.integrations?.github ?? null,
		name: site.name,
		organizationId: input.organizationId,
		timezone: input.timezone,
		userId: input.requestedByUserId ?? undefined,
		websiteId: site.id,
	};
	// Keep aggregate error evidence stable between admission and the selected
	// agent turn in this worker. A retry has no in-memory cache and remeasures
	// once from its frozen candidate plan instead.
	const runSources = memoizedInvestigationSources(
		productionInvestigationSources
	);
	let plan = await loadInsightRunCandidatePlan(runIdentity, input.reason);
	if (!plan && existingObservations.length > 0) {
		// A run created before candidate portfolios existed can contain at most
		// one observation. Freeze that completed legacy work explicitly rather
		// than silently treating a missing plan as a completed new portfolio.
		plan = await freezeInsightRunCandidatePlan(runIdentity, input.reason, {
			asOf: new Date().toISOString(),
			candidates: existingObservations
				.filter(isTrustedRunObservation)
				.map((observation) => ({
					evidence: [],
					signal: observation.signal,
				})),
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
		const discovered = await discoverWebsiteSignals(
			investigationInput,
			{
				mode: "production",
				sources: runSources,
			},
			{
				allowCoolingFallback: input.reason === "manual",
				reason: input.reason,
			}
		);
		if (discovered.kind === "empty") {
			if (
				discovered.artifact.status !== "deferred" &&
				discovered.artifact.status !== "no_signals"
			) {
				throw new Error(
					"An empty investigation discovery had an invalid status"
				);
			}
			plan = await freezeInsightRunCandidatePlan(runIdentity, input.reason, {
				asOf: discovered.artifact.asOf,
				candidates: [],
				emptyStatus: discovered.artifact.status,
			});
		} else {
			const portfolio = await coveragePortfolio(
				investigationInput,
				discovered.value,
				input.reason,
				runSources
			);
			const selectedCandidates = toPlannedPortfolioCandidates(portfolio);
			plan = await freezeInsightRunCandidatePlan(runIdentity, input.reason, {
				asOf: discovered.value.asOf.toISOString(),
				candidates: selectedCandidates,
				...(selectedCandidates.length === 0
					? { emptyStatus: "no_signals" }
					: {}),
			});
			emitInsightsEvent("info", "generation.candidate_portfolio.frozen", {
				organization_id: input.organizationId,
				website_id: site.id,
				run_id: input.runId,
				candidate_count: plan.candidates.length,
				detected_signal_count: discovered.value.detectedSignals.length,
				qualified_signal_count: discovered.value.qualifications.filter(
					(qualification) => qualification.status === "qualified"
				).length,
				screened_signal_count: discovered.value.qualifications.filter(
					(qualification) => qualification.status === "screened"
				).length,
				error_cohort_candidate_pair_count:
					portfolio.clustering.candidatePairCount,
				error_cohort_measured_pair_count:
					portfolio.clustering.measuredPairCount,
				error_cohort_pass_count: portfolio.clustering.passes,
				error_cohort_selected_candidates_settled:
					portfolio.clustering.selectedCandidatesSettled,
				error_cohort_suppressed_route_count:
					portfolio.clustering.redundantRouteSignalKeys.length,
				error_cohort_unavailable_pair_count:
					portfolio.clustering.unavailablePairCount,
			});
		}
	}
	const emptyStatus = plan?.emptyStatus ?? null;
	let billingCheckError: unknown;
	let billingCustomerId: string | null = null;
	let noCredits = false;
	const completedSignalKeys = new Set(
		existingObservations.map((observation) => observation.signalKey)
	);
	const trustedExistingObservations = existingObservations.filter(
		isTrustedRunObservation
	);
	const outcomes = trustedExistingObservations.map(
		(observation) => observation.outcome
	);
	const interruptingInvestigations: WebsiteInvestigation[] =
		trustedExistingObservations.flatMap((observation) =>
			observation.insightId && isInterruptingInvestigation(observation)
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
	const enqueueInterruptingEffects = async (
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

	await enqueueInterruptingEffects(interruptingInvestigations);
	try {
		if (plan) {
			const frozenInput = { ...investigationInput, asOf: plan.asOf };
			await runPlannedCandidatePortfolio({
				candidates: plan.candidates,
				completedSignalKeys,
				runCandidate: async (plannedCandidate, relatedSignals) => {
					if (noCredits) {
						return;
					}
					const usageIdempotencyKey = `insights:${input.runId}:${site.id}:${randomUUIDv7()}`;
					const agentUsage: {
						value: Required<
							Pick<InsightAgentResult, "modelId" | "usage">
						> | null;
					} = { value: null };
					try {
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
										noCredits = false;
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
								sources: runSources,
								onUsage: (usage) => {
									agentUsage.value = usage;
								},
							}
						);
						if (!(analysis.outcome && analysis.signal)) {
							if (noCredits) {
								return;
							}
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
							interruptingInvestigations.push(saved);
							await enqueueInterruptingEffects([saved]);
						}
					} finally {
						const billableUsage = agentUsage.value;
						if (billableUsage) {
							try {
								await trackAgentUsageAndBill({
									billingCustomerId,
									chatId: `insights:${input.organizationId}:${site.id}:${plannedCandidate.signal.signalKey}`,
									idempotencyKey: usageIdempotencyKey,
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
					}
				},
			});
			if (
				noCredits &&
				completedSignalKeys.size > 0 &&
				plan.candidates.some(
					(candidate) => !completedSignalKeys.has(candidate.signal.signalKey)
				)
			) {
				throw new Error(
					"AI usage allowance ran out before the candidate portfolio completed"
				);
			}
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
