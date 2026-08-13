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
	loadRouteVitalContinuation,
	remeasureRouteHealthSignal,
	routeVitalContinuationEvidence,
	type RouteHealthDetectionDeps,
} from "./route-health-detection";
import {
	type InvestigationAnnotation,
	prepareInvestigation,
	isInvestigationCandidate,
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
import {
	InsightAgentExecutionError,
	InsightAgentGenerationError,
	type InsightAgentInput,
	type InsightAgentResult,
	runInsightAgent,
} from "./agent";
import {
	errorCustomerImpactEvidence,
	errorIdentitySetupRecommendation,
	loadErrorCustomerImpact,
} from "./error-customer-impact";
import {
	freezeInsightRunCandidatePlan,
	loadInsightRunCandidatePlan,
	type PlannedInvestigationCandidate,
} from "./run-candidate-plan";
import { planCoveragePortfolio } from "./coverage-planner";
import {
	portfolioFamilyForDetectedSignal,
	resolveInsightSpecialist,
	type InsightPortfolioFamily,
} from "./specialists";
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
	evidence: string[];
	outcome: InvestigationOutcome | null;
	signal: InvestigationSignal | null;
	status: "completed" | "deferred" | "no_signals";
}

type InvestigationCoverageCounts = Record<InsightPortfolioFamily, number>;

export interface InvestigationCoverage {
	completed: InvestigationCoverageCounts;
	detected: InvestigationCoverageCounts;
	eligible: InvestigationCoverageCounts;
	noSignalReason:
		| "due_recheck_unmeasurable"
		| "no_detected_signals"
		| "no_eligible_candidates"
		| "no_selected_candidates"
		| null;
	published: InvestigationCoverageCounts;
	selected: InvestigationCoverageCounts;
}

const COVERAGE_FAMILIES: readonly InsightPortfolioFamily[] = [
	"funnel",
	"goal",
	"reliability",
	"general",
];

const COVERAGE_COUNT_STAGES = [
	"detected",
	"eligible",
	"selected",
	"completed",
	"published",
] as const satisfies ReadonlyArray<
	keyof Omit<InvestigationCoverage, "noSignalReason">
>;

type InvestigationCoverageCountStage = (typeof COVERAGE_COUNT_STAGES)[number];

function emptyCoverageCounts(): InvestigationCoverageCounts {
	return Object.fromEntries(
		COVERAGE_FAMILIES.map((family) => [family, 0])
	) as InvestigationCoverageCounts;
}

export function emptyInvestigationCoverage(
	noSignalReason: InvestigationCoverage["noSignalReason"] = null
): InvestigationCoverage {
	return {
		completed: emptyCoverageCounts(),
		detected: emptyCoverageCounts(),
		eligible: emptyCoverageCounts(),
		noSignalReason,
		published: emptyCoverageCounts(),
		selected: emptyCoverageCounts(),
	};
}

function coverageForDetectedSignals(
	signals: readonly DetectedSignal[]
): InvestigationCoverageCounts {
	const counts = emptyCoverageCounts();
	for (const signal of signals) {
		counts[portfolioFamilyForDetectedSignal(signal)] += 1;
	}
	return counts;
}

function coverageForInvestigationSignals(
	signals: readonly InvestigationSignal[]
): InvestigationCoverageCounts {
	const counts = emptyCoverageCounts();
	for (const signal of signals) {
		counts[resolveInsightSpecialist(signal).portfolioFamily] += 1;
	}
	return counts;
}

function coverageForArtifacts(
	artifacts: readonly WebsiteInvestigationArtifact[],
	predicate: (artifact: WebsiteInvestigationArtifact) => boolean
): InvestigationCoverageCounts {
	return coverageForInvestigationSignals(
		artifacts.flatMap((artifact) =>
			artifact.signal && predicate(artifact) ? [artifact.signal] : []
		)
	);
}

function portfolioExecutionCoverage(
	candidates: readonly PlannedInvestigationCandidate[],
	completedSignalKeys: ReadonlySet<string>,
	publishedSignalKeys: ReadonlySet<string>
): InvestigationCoverage {
	const selectedSignals = candidates.map((candidate) => candidate.signal);
	const completedSignals = selectedSignals.filter((signal) =>
		completedSignalKeys.has(signal.signalKey)
	);
	return {
		...emptyInvestigationCoverage(),
		completed: coverageForInvestigationSignals(completedSignals),
		published: coverageForInvestigationSignals(
			completedSignals.filter((signal) =>
				publishedSignalKeys.has(signal.signalKey)
			)
		),
		selected: coverageForInvestigationSignals(selectedSignals),
	};
}

function coverageLogFields(
	coverage: InvestigationCoverage,
	stages: readonly InvestigationCoverageCountStage[]
): Record<string, number | string> {
	const fields: Record<string, number | string> = {
		coverage_no_signal_reason: coverage.noSignalReason ?? "none",
	};
	for (const stage of stages) {
		for (const family of COVERAGE_FAMILIES) {
			fields[`coverage_${stage}_${family}`] = coverage[stage][family];
		}
	}
	return fields;
}

function emitInvestigationCoverage(params: {
	coverage: InvestigationCoverage;
	organizationId: string;
	phase: "discovery" | "execution" | "partial_failure" | "selection";
	runId: string;
	stages: readonly InvestigationCoverageCountStage[];
	websiteId: string;
}): void {
	emitInsightsEvent("info", "generation.investigation.coverage", {
		organization_id: params.organizationId,
		website_id: params.websiteId,
		run_id: params.runId,
		coverage_phase: params.phase,
		...coverageLogFields(params.coverage, params.stages),
	});
}

const SOURCE_DETECTION_TIMEOUT_MS = 45_000;
const DISCOVERY_DETECTION_TIMEOUT_MS = 180_000;
const INSIGHT_LOOKBACK_DAYS = 7;

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
	loadErrorCustomerImpact: typeof loadErrorCustomerImpact;
	loadHistory: typeof loadInvestigationHistory;
	loadObservations: (params: {
		asOf: Date;
		organizationId: string;
		signalKeys: string[];
		websiteId: string;
	}) => Promise<Map<string, LatestInsightObservation>>;
	loadOtherOpenWork: typeof loadOtherOpenWork;
	loadRouteVitalContinuation: typeof loadRouteVitalContinuation;
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
	loadErrorCustomerImpact,
	loadRouteVitalContinuation,
	loadHistory: loadInvestigationHistory,
	loadOtherOpenWork,
	loadObservations: loadLatestSignalObservations,
	remeasureSignal: remeasureStoredSignal,
};

interface WebsiteSignalDiscovery {
	asOf: dayjs.Dayjs;
	automaticEligibleSignals: DetectedSignal[];
	coverage: InvestigationCoverage;
	detectedSignals: DetectedSignal[];
	dueSignalKey: string | null;
	eligibleSignals: DetectedSignal[];
}

type WebsiteDiscoveryResult =
	| {
			artifact: WebsiteInvestigationArtifact;
			coverage: InvestigationCoverage;
			kind: "empty";
	  }
	| { kind: "signals"; value: WebsiteSignalDiscovery };

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
		...(investigation.setupRecommendationCandidate
			? {
					setupRecommendationCandidate:
						investigation.setupRecommendationCandidate,
				}
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
	runtime: InvestigationRuntime,
	options: { allowCoolingFallback?: boolean } = {}
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
		const coverage = emptyInvestigationCoverage(
			due ? "due_recheck_unmeasurable" : "no_detected_signals"
		);
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
				coverage,
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
			coverage,
			kind: "empty",
		};
	}

	const observations = await runtime.sources.loadObservations({
		asOf: asOf.toDate(),
		organizationId: input.organizationId,
		signalKeys: detectedSignals.map(signalKeyForDetectedSignal),
		websiteId: input.websiteId,
	});
	const automaticEligibleSignals = eligibleSignalsForInvestigation(
		detectedSignals,
		observations,
		asOf.toDate()
	);
	const dueSignalKey = remeasuredDue
		? signalKeyForDetectedSignal(remeasuredDue)
		: null;
	const candidateAutomaticEligibleSignals = automaticEligibleSignals.filter(
		(signal) =>
			isInvestigationCandidate(signal) ||
			signalKeyForDetectedSignal(signal) === dueSignalKey
	);
	const eligibleSignals = options.allowCoolingFallback
		? detectedSignals.filter(
				(signal) =>
					isInvestigationCandidate(signal) ||
					signalKeyForDetectedSignal(signal) === dueSignalKey
			)
		: candidateAutomaticEligibleSignals;
	const hasDetectedCandidate = detectedSignals.some(isInvestigationCandidate);
	const hasPlannableCandidate = eligibleSignals.length > 0;
	const hasUnmeasuredDue = due !== null && remeasuredDue === null;
	if (
		(hasUnmeasuredDue && !hasPlannableCandidate) ||
		(eligibleSignals.length === 0 && !options.allowCoolingFallback)
	) {
		const coverage = emptyInvestigationCoverage(
			hasUnmeasuredDue ? "due_recheck_unmeasurable" : "no_eligible_candidates"
		);
		coverage.detected = coverageForDetectedSignals(detectedSignals);
		coverage.eligible = coverageForDetectedSignals(
			candidateAutomaticEligibleSignals
		);
		const status =
			hasUnmeasuredDue || hasDetectedCandidate ? "deferred" : "no_signals";
		if (runtime.mode === "production") {
			emitInsightsEvent(
				"info",
				status === "deferred"
					? "generation.investigation.deferred_recheck"
					: "generation.investigation.skipped_no_actionable_signals",
				{
					organization_id: input.organizationId,
					website_id: input.websiteId,
					detected_signal_count: detectedSignals.length,
					duration_ms: Math.round(performance.now() - startedAt),
				}
			);
		}
		return {
			artifact: emptyInvestigationArtifact({ asOf, status }),
			coverage,
			kind: "empty",
		};
	}
	return {
		kind: "signals",
		value: {
			automaticEligibleSignals,
			asOf,
			coverage: {
				...emptyInvestigationCoverage(),
				detected: coverageForDetectedSignals(detectedSignals),
				eligible: coverageForDetectedSignals(eligibleSignals),
			},
			detectedSignals,
			dueSignalKey,
			eligibleSignals,
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
	const [annotationRows, customerImpact, routeVitalContinuation] =
		await Promise.all([
			runtime.sources.fetchAnnotations(
				input.websiteId,
				candidate.signal,
				asOf.toDate(),
				input.timezone
			),
			runtime.sources
				.loadErrorCustomerImpact({
					abortSignal: AbortSignal.timeout(SOURCE_DETECTION_TIMEOUT_MS),
					signal: candidate.signal,
					timezone: input.timezone,
					websiteId: input.websiteId,
				})
				.catch((error) => {
					if (runtime.mode === "production") {
						captureInsightsError(error, "generation.customer_impact.failed", {
							organization_id: input.organizationId,
							signal_key: candidate.signal.signalKey,
							website_id: input.websiteId,
						});
					}
					return null;
				}),
			runtime.sources
				.loadRouteVitalContinuation({
					abortSignal: AbortSignal.timeout(SOURCE_DETECTION_TIMEOUT_MS),
					signal: candidate.signal,
					websiteId: input.websiteId,
				})
				.catch((error) => {
					if (runtime.mode === "production") {
						captureInsightsError(
							error,
							"generation.route_vital_continuation.failed",
							{
								organization_id: input.organizationId,
								signal_key: candidate.signal.signalKey,
								website_id: input.websiteId,
							}
						);
					}
					return null;
				}),
		]);
	if (customerImpact) {
		evidence.push(errorCustomerImpactEvidence(customerImpact));
	}
	if (routeVitalContinuation) {
		evidence.push(routeVitalContinuationEvidence(routeVitalContinuation));
	}
	const setupRecommendationCandidate =
		errorIdentitySetupRecommendation(customerImpact ?? null) ??
		candidate.setupRecommendationCandidate ??
		null;
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
			customerImpact,
			evidence,
			githubRepository: input.githubRepository ?? null,
			...(routeVitalContinuation
				? { hasQualifiedRouteVitalContinuation: true as const }
				: {}),
			history,
			measurementCandidate: candidate.measurementCandidate,
			otherOpenWork,
			relatedSignals,
			setupRecommendationCandidate,
			signal: candidate.signal,
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
		evidence,
		outcome: investigationResult.outcome,
		signal: candidate.signal,
		status: "completed",
	};
}

function plannedPortfolio(
	discovery: WebsiteSignalDiscovery,
	reason: InsightGenerationReason
): PlannedInvestigationCandidate[] {
	const manual = reason === "manual";
	const eligibleSignalKeys = new Set(
		discovery.automaticEligibleSignals.map(signalKeyForDetectedSignal)
	);
	return planCoveragePortfolio(
		discovery.eligibleSignals.filter(
			(signal) =>
				isInvestigationCandidate(signal) ||
				signalKeyForDetectedSignal(signal) === discovery.dueSignalKey
		),
		{
			dueSignalKey: discovery.dueSignalKey,
			preferredSignalKeys: manual ? eligibleSignalKeys : undefined,
			reason,
		}
	).map(toPlannedCandidate);
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
 * Read-only harness for proving a full run selects distinct signals before it
 * reaches durable production persistence. Each artifact remains one exact
 * signal and one agent turn.
 */
export async function investigateWebsitePortfolioWithSources(
	input: InvestigateWebsiteInput,
	sources: InvestigationSources,
	reason: InsightGenerationReason,
	canRunAgent?: () => Promise<boolean>,
	onCoverage?: (coverage: InvestigationCoverage) => void
): Promise<WebsiteInvestigationArtifact[]> {
	const runtime: InvestigationRuntime = {
		canRunAgent,
		mode: "shadow",
		sources,
	};
	const discovered = await discoverWebsiteSignals(input, runtime, {
		allowCoolingFallback: reason === "manual",
	});
	if (discovered.kind === "empty") {
		onCoverage?.(discovered.coverage);
		return [discovered.artifact];
	}
	const candidates = plannedPortfolio(discovered.value, reason);
	if (candidates.length === 0) {
		onCoverage?.({
			...discovered.value.coverage,
			noSignalReason: "no_selected_candidates",
		});
		return [
			emptyInvestigationArtifact({
				asOf: discovered.value.asOf,
				status: "no_signals",
			}),
		];
	}
	const artifacts: WebsiteInvestigationArtifact[] = [];
	try {
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
	} finally {
		onCoverage?.({
			...discovered.value.coverage,
			completed: coverageForArtifacts(
				artifacts,
				(artifact) => artifact.status === "completed"
			),
			published: coverageForArtifacts(
				artifacts,
				(artifact) =>
					artifact.status === "completed" && artifact.outcome?.publish === true
			),
			selected: coverageForInvestigationSignals(
				candidates.map((candidate) => candidate.signal)
			),
		});
	}
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
	let plan = await loadInsightRunCandidatePlan(runIdentity, input.reason);
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
	let discoveredCoverage: InvestigationCoverage | null = null;
	if (!plan) {
		const discovered = await discoverWebsiteSignals(
			investigationInput,
			{
				mode: "production",
				sources: productionInvestigationSources,
			},
			{ allowCoolingFallback: input.reason === "manual" }
		);
		if (discovered.kind === "empty") {
			discoveredCoverage = discovered.coverage;
			emitInvestigationCoverage({
				coverage: discovered.coverage,
				organizationId: input.organizationId,
				phase: "discovery",
				runId: input.runId,
				stages: ["detected", "eligible"],
				websiteId: site.id,
			});
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
			discoveredCoverage = discovered.value.coverage;
			emitInvestigationCoverage({
				coverage: discovered.value.coverage,
				organizationId: input.organizationId,
				phase: "discovery",
				runId: input.runId,
				stages: ["detected", "eligible"],
				websiteId: site.id,
			});
			const selectedCandidates = plannedPortfolio(
				discovered.value,
				input.reason
			);
			plan = await freezeInsightRunCandidatePlan(runIdentity, input.reason, {
				asOf: discovered.value.asOf.toISOString(),
				candidates: selectedCandidates,
				...(selectedCandidates.length === 0
					? { emptyStatus: "no_signals" as const }
					: {}),
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
	if (plan && discoveredCoverage) {
		emitInvestigationCoverage({
			coverage: {
				...discoveredCoverage,
				selected: coverageForInvestigationSignals(
					plan.candidates.map((candidate) => candidate.signal)
				),
			},
			organizationId: input.organizationId,
			phase: "selection",
			runId: input.runId,
			stages: ["selected"],
			websiteId: site.id,
		});
	}
	const emptyStatus = plan?.emptyStatus ?? null;
	let billingCheckError: unknown;
	let billingCustomerId: string | null = null;
	let noCredits = false;
	const completedSignalKeys = new Set(
		existingObservations.map((observation) => observation.signal.signalKey)
	);
	const publishedSignalKeys = new Set(
		existingObservations
			.filter((observation) => observation.outcome.publish)
			.map((observation) => observation.signal.signalKey)
	);
	const outcomes = existingObservations.map(
		(observation) => observation.outcome
	);
	const interruptingInvestigations: WebsiteInvestigation[] =
		existingObservations.flatMap((observation) =>
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
								sources: productionInvestigationSources,
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
						if (candidate.outcome.publish) {
							publishedSignalKeys.add(candidate.signal.signalKey);
						}
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
		emitInvestigationCoverage({
			coverage: portfolioExecutionCoverage(
				plan?.candidates ?? [],
				completedSignalKeys,
				publishedSignalKeys
			),
			organizationId: input.organizationId,
			phase: "partial_failure",
			runId: input.runId,
			stages: ["selected", "completed", "published"],
			websiteId: site.id,
		});
		await drainPendingEffectsAfterFailure();
		throw error;
	}

	if (billingCheckError) {
		emitInvestigationCoverage({
			coverage: portfolioExecutionCoverage(
				plan?.candidates ?? [],
				completedSignalKeys,
				publishedSignalKeys
			),
			organizationId: input.organizationId,
			phase: "partial_failure",
			runId: input.runId,
			stages: ["selected", "completed", "published"],
			websiteId: site.id,
		});
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
	emitInvestigationCoverage({
		coverage: portfolioExecutionCoverage(
			plan?.candidates ?? [],
			completedSignalKeys,
			publishedSignalKeys
		),
		organizationId: input.organizationId,
		phase: "execution",
		runId: input.runId,
		stages: ["selected", "completed", "published"],
		websiteId: site.id,
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
