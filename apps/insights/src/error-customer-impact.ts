import { executeQuery, type Filter } from "@databuddy/ai/query";
import type { InvestigationSignal } from "@databuddy/shared/insights";

const MIN_ERROR_ROUTE_CONTINUATION_COHORT = 30;
const MIN_ERROR_ROUTE_CONTINUATION_DROP_PERCENTAGE_POINTS = 15;
const MIN_ERROR_ROUTE_CONTINUATION_EXPOSED_MATCH_RATE = 0.5;

export interface RouteContinuationComparison {
	controlContinuationPercent: number;
	controlSessions: number;
	exposedContinuationPercent: number;
	exposedSessions: number;
	percentagePointDifference: number;
	unmatchedControlSessions: number;
	unmatchedExposedSessions: number;
}

export interface RouteContinuationPolicy {
	minimumCohort: number;
	minimumExposedMatchRate: number;
}

type RouteContinuationEvidence = Pick<
	RouteContinuationComparison,
	| "controlContinuationPercent"
	| "controlSessions"
	| "exposedContinuationPercent"
	| "exposedSessions"
	| "percentagePointDifference"
>;

const errorRouteContinuationPolicy: RouteContinuationPolicy = {
	minimumCohort: MIN_ERROR_ROUTE_CONTINUATION_COHORT,
	minimumExposedMatchRate: MIN_ERROR_ROUTE_CONTINUATION_EXPOSED_MATCH_RATE,
};

export function hasMaterialRouteContinuation(
	comparison: RouteContinuationComparison,
	minimumDropPercentagePoints = MIN_ERROR_ROUTE_CONTINUATION_DROP_PERCENTAGE_POINTS
): boolean {
	return comparison.percentagePointDifference <= -minimumDropPercentagePoints;
}

export function matchedErrorContinuationMeasurement(
	comparison: RouteContinuationComparison
) {
	return {
		type: "matched_error_continuation" as const,
		controlContinuationPercent: comparison.controlContinuationPercent,
		exposedContinuationPercent: comparison.exposedContinuationPercent,
		matchedSessions: comparison.exposedSessions,
	};
}

export interface ErrorCustomerImpact {
	affectedSessions: number;
	affectedVisitorIdentifiers: number;
	ambiguousProfileSessions: number;
	errorOccurrences: number;
	identifiedProfiles: number;
	identifiedProfilesWithPriorAttributedCompletedPayment: number;
	identityCoveragePercent: number;
	linkedVisitorIdentifiers: number;
	paymentMatchIsLowerBound: true;
	qualifyingProfilePaymentHistoryObserved: boolean;
	routeContinuation?: RouteContinuationEvidence | null;
	scope: "fingerprint" | "route";
	unlinkedVisitorIdentifiers: number;
}

type ImpactQuery = typeof executeQuery;

function numberField(
	row: Record<string, unknown>,
	field: string,
	options: { integer?: boolean } = { integer: true }
): number {
	const value = Number(row[field]);
	if (
		!Number.isFinite(value) ||
		value < 0 ||
		(options.integer !== false && !Number.isInteger(value))
	) {
		throw new Error(`Invalid ${field} in error customer impact result`);
	}
	return value;
}

function booleanField(row: Record<string, unknown>, field: string): boolean {
	const value = row[field];
	if (value === true || value === 1 || value === "1") {
		return true;
	}
	if (value === false || value === 0 || value === "0") {
		return false;
	}
	throw new Error(`Invalid ${field} in error customer impact result`);
}

function percentageField(row: Record<string, unknown>, field: string): number {
	const value = numberField(row, field, { integer: false });
	if (value > 100) {
		throw new Error(`Invalid ${field} in route continuation result`);
	}
	return value;
}

function expectedPercent(numerator: number, denominator: number): number {
	return denominator === 0
		? 0
		: Math.round((numerator / denominator) * 1000) / 10;
}

export function parseRouteContinuationComparison(
	row: Record<string, unknown> | undefined,
	policy: RouteContinuationPolicy = errorRouteContinuationPolicy
): RouteContinuationComparison | null {
	if (!row) {
		return null;
	}
	const candidateExposedSessions = numberField(
		row,
		"candidate_exposed_sessions"
	);
	const candidateControlSessions = numberField(
		row,
		"candidate_control_sessions"
	);
	const exposedSessions = numberField(row, "matched_exposed_sessions");
	const controlSessions = numberField(row, "matched_control_sessions");
	const unmatchedExposedSessions = numberField(
		row,
		"unmatched_exposed_sessions"
	);
	const unmatchedControlSessions = numberField(
		row,
		"unmatched_control_sessions"
	);
	const exposedContinuedSessions = numberField(
		row,
		"exposed_continued_sessions"
	);
	const controlContinuedSessions = numberField(
		row,
		"control_continued_sessions"
	);
	const exposedContinuationPercent = percentageField(
		row,
		"exposed_continuation_percent"
	);
	const controlContinuationPercent = percentageField(
		row,
		"control_continuation_percent"
	);
	if (
		candidateExposedSessions < exposedSessions ||
		candidateControlSessions < controlSessions ||
		unmatchedExposedSessions !== candidateExposedSessions - exposedSessions ||
		unmatchedControlSessions !== candidateControlSessions - controlSessions ||
		exposedSessions !== controlSessions ||
		exposedContinuedSessions > exposedSessions ||
		controlContinuedSessions > controlSessions ||
		Math.abs(
			exposedContinuationPercent -
				expectedPercent(exposedContinuedSessions, exposedSessions)
		) > 0.05 ||
		Math.abs(
			controlContinuationPercent -
				expectedPercent(controlContinuedSessions, controlSessions)
		) > 0.05
	) {
		throw new Error("Inconsistent route continuation result");
	}
	if (
		exposedSessions < policy.minimumCohort ||
		controlSessions < policy.minimumCohort ||
		exposedSessions / candidateExposedSessions < policy.minimumExposedMatchRate
	) {
		return null;
	}
	return {
		controlContinuationPercent,
		controlSessions,
		exposedContinuationPercent,
		exposedSessions,
		percentagePointDifference:
			Math.round(
				(exposedContinuationPercent - controlContinuationPercent) * 10
			) / 10,
		unmatchedControlSessions,
		unmatchedExposedSessions,
	};
}

export function parseErrorCustomerImpact(
	row: Record<string, unknown> | undefined,
	scope: ErrorCustomerImpact["scope"] = "fingerprint",
	routeContinuation: RouteContinuationEvidence | null = null
): ErrorCustomerImpact | null {
	if (!row) {
		return null;
	}
	const result: ErrorCustomerImpact = {
		affectedSessions: numberField(row, "affected_sessions"),
		affectedVisitorIdentifiers: numberField(
			row,
			"affected_visitor_identifiers"
		),
		ambiguousProfileSessions: numberField(row, "ambiguous_profile_sessions"),
		errorOccurrences: numberField(row, "error_occurrences"),
		identifiedProfiles: numberField(row, "identified_profiles"),
		identifiedProfilesWithPriorAttributedCompletedPayment: numberField(
			row,
			"identified_profiles_with_prior_attributed_completed_payment"
		),
		identityCoveragePercent: numberField(row, "identity_coverage_percent", {
			integer: false,
		}),
		linkedVisitorIdentifiers: numberField(row, "linked_visitor_identifiers"),
		paymentMatchIsLowerBound: true,
		qualifyingProfilePaymentHistoryObserved: booleanField(
			row,
			"qualifying_profile_payment_history_observed"
		),
		routeContinuation,
		scope,
		unlinkedVisitorIdentifiers: numberField(
			row,
			"unlinked_visitor_identifiers"
		),
	};
	if (!booleanField(row, "payment_match_is_lower_bound")) {
		throw new Error(
			"Error customer impact payment matches must be a lower bound"
		);
	}
	if (result.errorOccurrences === 0) {
		return null;
	}
	if (
		result.affectedSessions > result.errorOccurrences ||
		result.affectedVisitorIdentifiers > result.errorOccurrences ||
		result.linkedVisitorIdentifiers > result.affectedVisitorIdentifiers ||
		result.unlinkedVisitorIdentifiers !==
			result.affectedVisitorIdentifiers - result.linkedVisitorIdentifiers ||
		result.identifiedProfilesWithPriorAttributedCompletedPayment >
			result.identifiedProfiles ||
		(result.identifiedProfilesWithPriorAttributedCompletedPayment > 0 &&
			!result.qualifyingProfilePaymentHistoryObserved) ||
		result.ambiguousProfileSessions > result.affectedSessions ||
		result.identityCoveragePercent > 100
	) {
		throw new Error("Inconsistent error customer impact result");
	}
	const expectedCoverage =
		result.affectedVisitorIdentifiers === 0
			? 0
			: Math.round(
					(result.linkedVisitorIdentifiers /
						result.affectedVisitorIdentifiers) *
						1000
				) / 10;
	if (Math.abs(result.identityCoveragePercent - expectedCoverage) > 0.05) {
		throw new Error("Inconsistent error customer impact identity coverage");
	}
	return result;
}

function continuationEvidenceFromSignal(
	signal: InvestigationSignal
): RouteContinuationEvidence | null {
	const measurement = signal.cohortMeasurement;
	if (!measurement) {
		return null;
	}
	return {
		controlContinuationPercent: measurement.controlContinuationPercent,
		controlSessions: measurement.matchedSessions,
		exposedContinuationPercent: measurement.exposedContinuationPercent,
		exposedSessions: measurement.matchedSessions,
		percentagePointDifference:
			Math.round(
				(measurement.exposedContinuationPercent -
					measurement.controlContinuationPercent) *
					10
			) / 10,
	};
}

function exactSelector(
	signal: InvestigationSignal
): { filter: Filter; scope: ErrorCustomerImpact["scope"] } | null {
	if (signal.signalKey.startsWith("error:") && signal.entity.type === "error") {
		return {
			filter: { field: "message", op: "eq", value: signal.entity.id },
			scope: "fingerprint",
		};
	}
	if (
		signal.signalKey.startsWith("route:error:") &&
		signal.entity.type === "page"
	) {
		return {
			filter: { field: "path", op: "eq", value: signal.entity.id },
			scope: "route",
		};
	}
	return null;
}

export async function loadErrorCustomerImpact(
	params: {
		abortSignal?: AbortSignal;
		signal: InvestigationSignal;
		timezone: string;
		websiteId: string;
	},
	query: ImpactQuery = executeQuery
): Promise<ErrorCustomerImpact | null> {
	const selector = exactSelector(params.signal);
	if (!selector || params.signal.metric.current === 0) {
		return null;
	}
	const rows = await query(
		{
			filters: [selector.filter],
			from: params.signal.period.current.from,
			projectId: params.websiteId,
			to: params.signal.period.current.to,
			type: "error_customer_impact",
			timezone: params.timezone,
		},
		undefined,
		params.timezone,
		params.abortSignal
	);
	const suppliedContinuation = continuationEvidenceFromSignal(params.signal);
	const impact = parseErrorCustomerImpact(
		rows[0],
		selector.scope,
		suppliedContinuation
	);
	if (
		!impact ||
		impact.affectedSessions < MIN_ERROR_ROUTE_CONTINUATION_COHORT ||
		suppliedContinuation
	) {
		return impact;
	}
	const continuationRows = await query(
		{
			filters: [selector.filter],
			from: params.signal.period.current.from,
			projectId: params.websiteId,
			to: params.signal.period.current.to,
			type: "error_route_continuation_comparison",
			timezone: params.timezone,
		},
		undefined,
		params.timezone,
		params.abortSignal
	).catch(() => []);
	return {
		...impact,
		routeContinuation: (() => {
			const comparison = parseRouteContinuationComparison(continuationRows[0]);
			return comparison && hasMaterialRouteContinuation(comparison)
				? comparison
				: null;
		})(),
	};
}

function countLabel(value: number, singular: string): string {
	return `${value.toLocaleString("en-US")} ${singular}${value === 1 ? "" : "s"}`;
}

export function errorCustomerImpactEvidence(
	impact: ErrorCustomerImpact
): string {
	const facts = [
		impact.scope === "fingerprint"
			? `This exact error produced ${countLabel(impact.errorOccurrences, "occurrence")} across ${countLabel(impact.affectedVisitorIdentifiers, "visitor identifier")} and ${countLabel(impact.affectedSessions, "session")}.`
			: `Errors on this route produced ${countLabel(impact.errorOccurrences, "occurrence")} across ${countLabel(impact.affectedVisitorIdentifiers, "visitor identifier")} and ${countLabel(impact.affectedSessions, "session")}.`,
		`${countLabel(impact.identifiedProfiles, "profile")} resolved from same-window session or visitor context. ${impact.linkedVisitorIdentifiers.toLocaleString("en-US")} of ${impact.affectedVisitorIdentifiers.toLocaleString("en-US")} non-empty visitor identifiers had an unambiguous same-window profile link; ${impact.unlinkedVisitorIdentifiers.toLocaleString("en-US")} did not.`,
	];
	if (impact.routeContinuation) {
		facts.splice(
			1,
			0,
			`Among ${countLabel(impact.routeContinuation.exposedSessions, "error-exposed session")} and ${countLabel(impact.routeContinuation.controlSessions, "matched control session")} on the same route, day, device, and browser, ${impact.routeContinuation.exposedContinuationPercent.toLocaleString("en-US", { maximumFractionDigits: 1 })}% of exposed sessions later viewed a different page within 10 minutes, versus ${impact.routeContinuation.controlContinuationPercent.toLocaleString("en-US", { maximumFractionDigits: 1 })}% of controls (${impact.routeContinuation.percentagePointDifference.toLocaleString("en-US", { maximumFractionDigits: 1 })} percentage points). This is an association, not proof that the error caused the difference.`
		);
	}
	if (impact.identifiedProfilesWithPriorAttributedCompletedPayment > 0) {
		facts.push(
			`At least ${countLabel(impact.identifiedProfilesWithPriorAttributedCompletedPayment, "identified profile")} had an attributed completed payment before their first error in this period; unmatched payment status remains unknown.`
		);
	} else if (impact.qualifyingProfilePaymentHistoryObserved) {
		facts.push(
			"No prior payment match was found for the identified affected profiles despite other qualifying profile-attributed payment history; this does not establish that none paid."
		);
	} else {
		facts.push(
			"No qualifying profile-attributed completed-payment history was observed, so affected payment status remains unknown."
		);
	}
	if (impact.ambiguousProfileSessions > 0) {
		facts.push(
			`${countLabel(impact.ambiguousProfileSessions, "session")} had ambiguous profile identity.`
		);
	}
	const included: string[] = [];
	for (const fact of facts) {
		if ([...included, fact].join(" ").length > 500) {
			break;
		}
		included.push(fact);
	}
	return included.join(" ");
}
