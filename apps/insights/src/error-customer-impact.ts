import { executeQuery, type Filter } from "@databuddy/ai/query";
import type {
	InsightDatabuddySetupRecommendation,
	InvestigationSignal,
} from "@databuddy/shared/insights";

const MIN_IDENTITY_SETUP_COHORT = 10;

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
	scope: "fingerprint" | "route";
	sessionsWithLaterTelemetry: number;
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

export function parseErrorCustomerImpact(
	row: Record<string, unknown> | undefined,
	scope: ErrorCustomerImpact["scope"] = "fingerprint"
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
		sessionsWithLaterTelemetry: numberField(
			row,
			"sessions_with_later_telemetry"
		),
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
		result.sessionsWithLaterTelemetry > result.affectedSessions ||
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
	return parseErrorCustomerImpact(rows[0], selector.scope);
}

export function errorIdentitySetupRecommendation(
	impact: ErrorCustomerImpact
): InsightDatabuddySetupRecommendation | null {
	if (
		impact.affectedVisitorIdentifiers < MIN_IDENTITY_SETUP_COHORT ||
		impact.linkedVisitorIdentifiers !== 0
	) {
		return null;
	}
	return {
		action:
			"Verify or add Databuddy identify() after authentication so future errors can be tied to signed-in users.",
		feature: "user_identification",
		kind: "databuddy_setup",
	};
}

function hasQualifiedPriorCompletedPayment(
	impact: ErrorCustomerImpact
): boolean {
	return (
		impact.identifiedProfilesWithPriorAttributedCompletedPayment > 0 &&
		impact.identifiedProfilesWithPriorAttributedCompletedPayment <=
			impact.identifiedProfiles &&
		impact.qualifyingProfilePaymentHistoryObserved &&
		impact.paymentMatchIsLowerBound
	);
}

export function errorCustomerImpactEvidence(
	impact: ErrorCustomerImpact
): string {
	if (hasQualifiedPriorCompletedPayment(impact)) {
		return `At least ${impact.identifiedProfilesWithPriorAttributedCompletedPayment.toLocaleString("en-US")} affected profiles had an attributed completed payment before the error; other payment status is unknown.`;
	}
	if (impact.linkedVisitorIdentifiers === 0) {
		return "No affected identifiers linked to profiles, so customer and payment status are unknown.";
	}
	return `${impact.linkedVisitorIdentifiers.toLocaleString("en-US")} of ${impact.affectedVisitorIdentifiers.toLocaleString("en-US")} affected identifiers linked to profiles; payment status remains unknown.`;
}

/**
 * A short, customer-facing lower bound suitable for a broad error brief.
 * It deliberately says nothing about current subscription or payment status.
 */
export function priorCompletedPaymentSummary(
	impact: ErrorCustomerImpact
): string | null {
	if (!hasQualifiedPriorCompletedPayment(impact)) {
		return null;
	}
	return `At least ${impact.identifiedProfilesWithPriorAttributedCompletedPayment.toLocaleString("en-US")} affected profiles had a prior attributed completed payment.`;
}
