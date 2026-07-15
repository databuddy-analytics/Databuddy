import type {
	InvestigationDecision,
	InvestigationEvidence,
	InvestigationSignal,
} from "@databuddy/shared/insights";

export function terminalDecisionFromEvidence(
	signal: InvestigationSignal,
	evidence: InvestigationEvidence[] = []
): InvestigationDecision {
	if (
		evidence.some(
			(item) =>
				item.queryType === "annotations:planned_signal" && item.status === "ok"
		)
	) {
		return { disposition: "not_a_problem" };
	}
	const remediationEvidence = evidence.find(
		(item) =>
			item.status === "ok" &&
			item.entity?.type === signal.entity.type &&
			item.entity.id === signal.entity.id &&
			item.remediation
	);
	if (signal.kind === "missing_expected_data" && signal.expectation) {
		const confirmation = signal.expectation.confirmation;
		if (
			!(remediationEvidence?.remediation && confirmation) ||
			confirmation.definitionId !== signal.entity.id ||
			confirmation.definitionType !== signal.entity.type ||
			(confirmation.source !== "revenue_transactions" &&
				confirmation.source !== "server_completions")
		) {
			return { disposition: "needs_context", gap: "expected_behavior" };
		}
		return {
			disposition: "action_ready",
			remediation: {
				evidenceId: remediationEvidence.evidenceId,
				instruction: remediationEvidence.remediation.instruction,
				kind: remediationEvidence.remediation.kind,
			},
		};
	}
	if (
		signal.severity !== "info" &&
		signal.sentiment === "negative" &&
		(signal.metric.key === "revenue" ||
			signal.metric.key === "payment_failure_rate" ||
			(signal.severity === "critical" &&
				["pageviews", "sessions", "visitors"].includes(signal.metric.key)))
	) {
		return { disposition: "needs_context", gap: "expected_behavior" };
	}
	return { disposition: "monitor" };
}
