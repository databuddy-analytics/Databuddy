import { type DetectedSignal, INSIGHT_VITALS } from "./detection";
import { observedPostErrorContinuation } from "./error-cohort-behavior";
import type { loadErrorCohortBehavior } from "./error-cohort-behavior";
import type {
	ErrorCustomerImpact,
	loadErrorCustomerImpact,
} from "./error-customer-impact";
import { observedPostErrorGoalCompletion } from "./error-cohort-goal-completion";
import type { loadErrorCohortGoalCompletion } from "./error-cohort-goal-completion";
import {
	prepareInvestigation,
	signalKeyForDetectedSignal,
} from "./investigation";
import { canonicalStaticRoute } from "./route-health-detection";
import {
	observedPostSlowVitalContinuation,
	type loadVitalCohortBehavior,
	type VitalCohortBehavior,
} from "./vital-cohort-behavior";

const MATERIAL_ERROR_VISITOR_IDENTIFIERS = 30;
const QUALIFICATION_CONCURRENCY = 4;

export type CandidateQualificationReason =
	| "configured_completion"
	| "direct_business_outcome"
	| "material_error_reach"
	| "measurement_gap"
	| "observed_session_behavior"
	| "observed_vital_session_behavior"
	| "unhealthy_vital";

export type CandidateScreeningReason =
	| "error_outside_qualification_budget"
	| "generic_metric_without_impact"
	| "low_reach_error_without_harm"
	| "unknown_event_outcome"
	| "warning_vital_behavior_unavailable"
	| "warning_vital_outside_qualification_budget"
	| "warning_vital_without_behavior";

export type CandidateQualification =
	| {
			reason: CandidateQualificationReason;
			signal: DetectedSignal;
			status: "qualified";
	  }
	| {
			reason: CandidateScreeningReason;
			signal: DetectedSignal;
			status: "screened";
	  };

export interface CandidateQualificationSources {
	loadErrorCohortBehavior: typeof loadErrorCohortBehavior;
	loadErrorCohortGoalCompletion: typeof loadErrorCohortGoalCompletion;
	loadErrorCustomerImpact: typeof loadErrorCustomerImpact;
	loadVitalCohortBehavior: typeof loadVitalCohortBehavior;
}

export interface QualifyCandidateSignalsInput {
	abortSignal?: AbortSignal;
	/**
	 * Exact errors need aggregate enrichment before they can consume an agent
	 * turn. Bound that work independently of the detector's unbounded error
	 * inventory so a noisy site cannot exhaust the discovery deadline.
	 */
	errorQualificationLimit: number;
	lookbackDays: number;
	/** A due recheck must be measured even when it ranks below fresh errors. */
	prioritizedSignalKeys?: ReadonlySet<string>;
	signals: readonly DetectedSignal[];
	sources: CandidateQualificationSources;
	timezone: string;
	/**
	 * Warning route vitals use the same bounded, aggregate-only admission
	 * check as exact errors. Critical and due vital rechecks bypass this cap.
	 */
	vitalQualificationLimit: number;
	websiteId: string;
}

function qualified(
	signal: DetectedSignal,
	reason: CandidateQualificationReason
): CandidateQualification {
	return { reason, signal, status: "qualified" };
}

function screened(
	signal: DetectedSignal,
	reason: CandidateScreeningReason
): CandidateQualification {
	return { reason, signal, status: "screened" };
}

function directQualification(
	signal: DetectedSignal
): CandidateQualificationReason | null {
	if (
		signal.metric === "revenue" ||
		signal.metric.startsWith("goal:") ||
		signal.metric.startsWith("funnel:")
	) {
		return "direct_business_outcome";
	}
	if (signal.metric === "measurement_coverage") {
		return "measurement_gap";
	}
	if (isUnhealthyVital(signal) && !isWarningRouteVital(signal)) {
		return "unhealthy_vital";
	}
	return null;
}

function isUnhealthyVital(signal: DetectedSignal): boolean {
	return (
		(signal.metric === "lcp" &&
			signal.direction === "up" &&
			signal.current > INSIGHT_VITALS.LCP.badThreshold) ||
		(signal.metric === "inp" &&
			signal.direction === "up" &&
			signal.current > INSIGHT_VITALS.INP.badThreshold)
	);
}

/**
 * Only the exact static route-vital shape is eligible for a private behavior
 * comparison. Keep every other existing vital admission rule unchanged.
 */
function isWarningRouteVital(signal: DetectedSignal): boolean {
	if (
		signal.severity !== "warning" ||
		!isUnhealthyVital(signal) ||
		(signal.metric !== "lcp" && signal.metric !== "inp")
	) {
		return false;
	}
	const route = canonicalStaticRoute(signal.entityId ?? "");
	return (
		route !== null &&
		signal.entityId === route &&
		signal.subjectKey === `route:${signal.metric}:${route}`
	);
}

function behaviorMatchesVitalMetric(
	behavior: VitalCohortBehavior,
	signal: DetectedSignal
): boolean {
	return (
		(signal.metric === "lcp" && behavior.metric === "LCP") ||
		(signal.metric === "inp" && behavior.metric === "INP")
	);
}

function screeningReason(signal: DetectedSignal): CandidateScreeningReason {
	return signal.metric === "custom_event_count"
		? "unknown_event_outcome"
		: "generic_metric_without_impact";
}

function abortIfRequested(abortSignal?: AbortSignal): void {
	if (abortSignal?.aborted) {
		throw abortSignal.reason ?? new Error("Candidate qualification aborted");
	}
}

async function errorQualification(
	signal: DetectedSignal,
	params: Omit<
		QualifyCandidateSignalsInput,
		| "errorQualificationLimit"
		| "prioritizedSignalKeys"
		| "signals"
		| "vitalQualificationLimit"
	>
): Promise<CandidateQualification> {
	const investigation = prepareInvestigation(signal, params.lookbackDays);
	const enrichmentParams = {
		abortSignal: params.abortSignal,
		signal: investigation.signal,
		timezone: params.timezone,
		websiteId: params.websiteId,
	};
	const [customerImpactResult, cohortBehaviorResult, goalCompletionResult] =
		await Promise.allSettled([
			params.sources.loadErrorCustomerImpact(enrichmentParams),
			params.sources.loadErrorCohortBehavior(enrichmentParams),
			params.sources.loadErrorCohortGoalCompletion(enrichmentParams),
		] as const);
	abortIfRequested(params.abortSignal);

	const customerImpact: ErrorCustomerImpact | null =
		customerImpactResult.status === "fulfilled"
			? customerImpactResult.value
			: null;
	const behavior =
		cohortBehaviorResult.status === "fulfilled"
			? cohortBehaviorResult.value
			: null;
	const goalCompletion =
		goalCompletionResult.status === "fulfilled"
			? goalCompletionResult.value
			: null;

	if (goalCompletion && observedPostErrorGoalCompletion(goalCompletion)) {
		return qualified(signal, "configured_completion");
	}
	if (behavior && observedPostErrorContinuation(behavior)) {
		return qualified(signal, "observed_session_behavior");
	}
	if (
		customerImpact &&
		customerImpact.affectedVisitorIdentifiers >=
			MATERIAL_ERROR_VISITOR_IDENTIFIERS
	) {
		return qualified(signal, "material_error_reach");
	}
	return screened(signal, "low_reach_error_without_harm");
}

/**
 * Warning route vitals enter the portfolio only after the private aggregate
 * comparison establishes a material post-exposure continuation gap. Missing,
 * sparse, weak, or non-dropping cohorts remain detector inventory rather than
 * consuming a model turn. A source failure is also conservative here.
 */
async function vitalQualification(
	signal: DetectedSignal,
	params: Omit<
		QualifyCandidateSignalsInput,
		| "errorQualificationLimit"
		| "prioritizedSignalKeys"
		| "signals"
		| "vitalQualificationLimit"
	>
): Promise<CandidateQualification> {
	const investigation = prepareInvestigation(signal, params.lookbackDays);
	try {
		const behavior = await params.sources.loadVitalCohortBehavior({
			abortSignal: params.abortSignal,
			signal: investigation.signal,
			timezone: params.timezone,
			websiteId: params.websiteId,
		});
		abortIfRequested(params.abortSignal);
		return behavior &&
			behaviorMatchesVitalMetric(behavior, signal) &&
			observedPostSlowVitalContinuation(behavior)
			? qualified(signal, "observed_vital_session_behavior")
			: screened(signal, "warning_vital_without_behavior");
	} catch {
		abortIfRequested(params.abortSignal);
		return screened(signal, "warning_vital_behavior_unavailable");
	}
}

function qualifyCandidate(
	signal: DetectedSignal,
	params: Omit<
		QualifyCandidateSignalsInput,
		| "errorQualificationLimit"
		| "prioritizedSignalKeys"
		| "signals"
		| "vitalQualificationLimit"
	>,
	qualifyError: boolean,
	qualifyVital: boolean,
	prioritized: boolean
): Promise<CandidateQualification> {
	if (isWarningRouteVital(signal)) {
		if (prioritized) {
			return Promise.resolve(qualified(signal, "unhealthy_vital"));
		}
		if (!qualifyVital) {
			return Promise.resolve(
				screened(signal, "warning_vital_outside_qualification_budget")
			);
		}
		return vitalQualification(signal, params);
	}
	const direct = directQualification(signal);
	if (direct) {
		return Promise.resolve(qualified(signal, direct));
	}
	if (signal.metric === "error_count") {
		if (!qualifyError) {
			return Promise.resolve(
				screened(signal, "error_outside_qualification_budget")
			);
		}
		return errorQualification(signal, params);
	}
	return Promise.resolve(screened(signal, screeningReason(signal)));
}

function errorQualificationKeys(
	signals: readonly DetectedSignal[],
	limit: number,
	prioritizedSignalKeys?: ReadonlySet<string>
): Set<string> {
	if (!Number.isSafeInteger(limit) || limit < 0) {
		throw new Error("Error qualification limit must be a non-negative integer");
	}
	const errors = signals.filter((signal) => signal.metric === "error_count");
	const prioritized = errors.filter((signal) =>
		prioritizedSignalKeys?.has(signalKeyForDetectedSignal(signal))
	);
	const remaining = errors.filter(
		(signal) => !prioritizedSignalKeys?.has(signalKeyForDetectedSignal(signal))
	);
	return new Set(
		[...prioritized, ...remaining]
			.slice(0, limit)
			.map(signalKeyForDetectedSignal)
	);
}

function vitalQualificationKeys(
	signals: readonly DetectedSignal[],
	limit: number,
	prioritizedSignalKeys?: ReadonlySet<string>
): Set<string> {
	if (!Number.isSafeInteger(limit) || limit < 0) {
		throw new Error("Vital qualification limit must be a non-negative integer");
	}
	const vitals = signals.filter(isWarningRouteVital);
	const prioritized = vitals.filter((signal) =>
		prioritizedSignalKeys?.has(signalKeyForDetectedSignal(signal))
	);
	const remaining = vitals.filter(
		(signal) => !prioritizedSignalKeys?.has(signalKeyForDetectedSignal(signal))
	);
	// A due recheck is a lifecycle obligation, not a fresh-candidate budget
	// consumer. Preserve it even when every warning-vital slot is full.
	return new Set(
		[...prioritized, ...remaining.slice(0, limit)].map(
			signalKeyForDetectedSignal
		)
	);
}

async function mapWithConcurrency<T, R>(
	items: readonly T[],
	concurrency: number,
	work: (item: T) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let nextIndex = 0;
	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, async () => {
			while (nextIndex < items.length) {
				const index = nextIndex;
				nextIndex += 1;
				const item = items[index];
				if (item === undefined) {
					continue;
				}
				results[index] = await work(item);
			}
		})
	);
	return results;
}

/**
 * Screens detector output before it can consume an agent turn. The result is
 * non-persistent and aggregate-only: it changes portfolio admission, not the
 * detector universe or the public insight contract.
 */
export function qualifyCandidateSignals(
	params: QualifyCandidateSignalsInput
): Promise<CandidateQualification[]> {
	abortIfRequested(params.abortSignal);
	const {
		errorQualificationLimit,
		prioritizedSignalKeys,
		signals,
		vitalQualificationLimit,
		...candidateParams
	} = params;
	const qualifiedErrorKeys = errorQualificationKeys(
		signals,
		errorQualificationLimit,
		prioritizedSignalKeys
	);
	const qualifiedVitalKeys = vitalQualificationKeys(
		signals,
		vitalQualificationLimit,
		prioritizedSignalKeys
	);
	return mapWithConcurrency(signals, QUALIFICATION_CONCURRENCY, (signal) =>
		qualifyCandidate(
			signal,
			candidateParams,
			qualifiedErrorKeys.has(signalKeyForDetectedSignal(signal)),
			qualifiedVitalKeys.has(signalKeyForDetectedSignal(signal)),
			prioritizedSignalKeys?.has(signalKeyForDetectedSignal(signal)) ?? false
		)
	);
}

export function unqualifiedSignalKeys(
	qualifications: readonly CandidateQualification[]
): Set<string> {
	return new Set(
		qualifications
			.filter((qualification) => qualification.status === "screened")
			.map((qualification) => signalKeyForDetectedSignal(qualification.signal))
	);
}
