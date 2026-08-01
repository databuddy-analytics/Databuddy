import { executeQuery, type Filter } from "@databuddy/ai/query";
import type { InvestigationSignal } from "@databuddy/shared/insights";

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
	if (impact.sessionsWithLaterTelemetry > 0) {
		facts.push(
			`${countLabel(impact.sessionsWithLaterTelemetry, "affected session")} had later telemetry; that does not prove recovery.`
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
