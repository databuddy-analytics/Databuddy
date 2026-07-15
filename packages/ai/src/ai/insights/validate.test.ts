import { describe, expect, it } from "bun:test";
import type {
	InvestigationEvidence,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import { canRecommendAction, validateInvestigationDecision } from "./validate";

const signal: InvestigationSignal = {
	signalKey: "signal:visitors",
	websiteId: "site-1",
	kind: "change",
	insightType: "traffic_drop",
	entity: { type: "website", id: "website", label: "Visitors" },
	metric: {
		key: "visitors",
		label: "Visitors",
		current: 600,
		previous: 1000,
		format: "number",
	},
	changePercent: -40,
	direction: "down",
	severity: "warning",
	sentiment: "negative",
	priority: 7,
	period: {
		current: { from: "2026-07-04", to: "2026-07-10" },
		previous: { from: "2026-06-27", to: "2026-07-03" },
	},
	detectedAt: "2026-07-10",
	detection: {
		method: "period_comparison",
		reason: "Visitors changed -40% from the previous period.",
	},
};

const evidence: InvestigationEvidence = {
	evidenceId: "evidence:visitors",
	signalKey: signal.signalKey,
	kind: "breakdown",
	source: "web",
	queryType: "top_referrers",
	period: "current",
	range: signal.period.current,
	status: "ok",
	rowCount: 1,
	summary: "Paid acquisition accounted for the change.",
	metrics: [signal.metric],
};

const contextEvidence: InvestigationEvidence = {
	...evidence,
	evidenceId: "evidence:campaign-ended",
	kind: "related_change",
	source: "business",
	entity: signal.entity,
	queryType: "annotations:planned_signal",
	period: "custom",
	comparison: signal.period,
	range: null,
	summary: "The acquisition campaign ended as planned.",
};

const actionReady = {
	disposition: "action_ready" as const,
	remediation: {
		kind: "campaign" as const,
		evidenceId: "evidence:campaign",
		instruction: "Restore the acquisition campaign or replace the lost channel.",
	},
};

const goalExpectation = {
	confirmation: {
		count: 12,
		definitionId: "signup",
		definitionType: "goal" as const,
		source: "revenue_transactions" as const,
	},
	definitionUpdatedAt: "2026-06-01T00:00:00.000Z",
	eventName: "sign_up",
	instruction: 'Restore the "sign_up" event when Signup completes.',
	kind: "tracking" as const,
	previousCompletions: 20,
	currentEntrants: 100,
	currentCompletions: 0 as const,
};

const missingGoalSignal: InvestigationSignal = {
	...signal,
	signalKey: "goal:signup",
	kind: "missing_expected_data",
	insightType: "conversion_leak",
	entity: { type: "goal", id: "signup", label: "Signup" },
	metric: {
		key: "goal:signup",
		label: "Signup completion rate",
		current: 0,
		previous: 20,
		format: "percent",
	},
	changePercent: -100,
	expectation: goalExpectation,
};

const missingGoalEvidence: InvestigationEvidence = {
	...evidence,
	evidenceId: "evidence:goal",
	signalKey: missingGoalSignal.signalKey,
	kind: "definition",
	source: "product",
	queryType: "goals_summary",
	entity: missingGoalSignal.entity,
	remediation: goalExpectation,
	metrics: [
		{ label: "Entrants", current: 100, format: "number" },
		{ label: "Completions", current: 0, format: "number" },
	],
};

const missingGoalAction = {
	disposition: "action_ready" as const,
	remediation: {
		kind: "tracking" as const,
		evidenceId: missingGoalEvidence.evidenceId,
		instruction: goalExpectation.instruction,
	},
};

function failedEvidence(): InvestigationEvidence {
	return {
		evidenceId: "evidence:failed",
		signalKey: signal.signalKey,
		kind: "breakdown",
		source: "web",
		queryType: "top_referrers",
		period: "current",
		range: signal.period.current,
		status: "failed",
		rowCount: 0,
		error: "The analytics query timed out.",
	};
}

describe("validateInvestigationDecision", () => {
	it("maps one backend-owned tracking repair onto exact facts", () => {
		const result = validateInvestigationDecision({
			signal: missingGoalSignal,
			evidence: [missingGoalEvidence],
			decision: missingGoalAction,
		});

		expect(result.errors).toEqual([]);
		expect(result.decision).toEqual(missingGoalAction);
		expect(result.insight).toMatchObject({
			title: "Fix tracking for Signup",
			description: "Signup completion rate fell from 20% to 0%.",
			suggestion: missingGoalAction.remediation.instruction,
			severity: missingGoalSignal.severity,
			sentiment: missingGoalSignal.sentiment,
			priority: missingGoalSignal.priority,
			changePercent: missingGoalSignal.changePercent,
			type: missingGoalSignal.insightType,
			subjectKey: missingGoalSignal.signalKey,
			remediationKind: "tracking",
		});
		expect(result.insight?.metrics[0]).toEqual({
			label: missingGoalSignal.metric.label,
			current: missingGoalSignal.metric.current,
			previous: missingGoalSignal.metric.previous,
			format: missingGoalSignal.metric.format,
		});
		expect(result.insight).not.toHaveProperty("actions");
		expect(result.insight?.evidence?.at(-1)?.description).toContain(
			"Verify after 7 complete days"
		);
	});

	it("rejects model-authored changes to the backend remediation", () => {
		const result = validateInvestigationDecision({
			signal: missingGoalSignal,
			evidence: [missingGoalEvidence],
			decision: {
				...missingGoalAction,
				remediation: {
					...missingGoalAction.remediation,
					instruction: "Restore a different signup event.",
				},
			},
		});

		expect(result.errors).toContain(
			"action_ready must use the backend-owned remediation instruction exactly."
		);
		expect(result.insight).toBeNull();
	});

	it("rejects repairs that do not match the signal entity", () => {
		const result = validateInvestigationDecision({
			signal,
			evidence: [evidence],
			decision: actionReady,
		});

		expect(result.errors).toContain(
			"action_ready is not allowed for this signal. Submit monitor unless external context or explanatory evidence supports another outcome."
		);
		expect(result.insight).toBeNull();
	});

	it("only permits actions for exact negative entities", () => {
		expect(canRecommendAction(signal)).toBe(false);
		expect(
			canRecommendAction(missingGoalSignal)
		).toBe(true);
		expect(
			canRecommendAction({
				...missingGoalSignal,
				expectation: {
					...goalExpectation,
					confirmation: {
						...goalExpectation.confirmation,
						definitionId: "another-goal",
					},
				},
			})
		).toBe(false);
		expect(
			canRecommendAction({
				...signal,
				entity: { type: "campaign", id: "launch", label: "Launch" },
			})
		).toBe(false);
		expect(
			canRecommendAction({
				...signal,
				entity: { type: "error", id: "error_count", label: "Errors" },
			})
		).toBe(false);
		expect(
			canRecommendAction({
				...signal,
				sentiment: "positive",
				entity: { type: "error", id: "error_count", label: "Errors" },
			})
		).toBe(false);
	});

	it("uses qualified vital evidence for an unresolved target, not a repair", () => {
		const vitalSignal: InvestigationSignal = {
			...signal,
			signalKey: "lcp",
			entity: { type: "vital", id: "lcp", label: "Page load time" },
			metric: {
				...signal.metric,
				key: "lcp",
				label: "Page load time",
				format: "duration_ms",
			},
		};
		const errorEvidence: InvestigationEvidence = {
			...evidence,
			evidenceId: "evidence:errors",
			signalKey: vitalSignal.signalKey,
			kind: "data_health",
			source: "ops",
			queryType: "errors_summary",
		};
		const vitalEvidence: InvestigationEvidence = {
			...errorEvidence,
			evidenceId: "evidence:vitals",
			queryType: "web_vitals_by_page:qualified",
			entity: { type: "page", id: "page:checkout", label: "/checkout" },
		};
		const decision = {
			disposition: "action_ready" as const,
			remediation: {
				kind: "operations" as const,
				evidenceId: vitalEvidence.evidenceId,
				instruction: "Reduce LCP on /checkout below 2.5 seconds.",
			},
		};

		const repair = validateInvestigationDecision({
			signal: vitalSignal,
			evidence: [vitalEvidence],
			decision,
		});
		expect(repair.errors).toContain(
			"action_ready is not allowed for this signal. Submit monitor unless external context or explanatory evidence supports another outcome."
		);
		const unresolved = validateInvestigationDecision({
			signal: vitalSignal,
			evidence: [vitalEvidence],
			decision: { disposition: "monitor" },
		});
		expect(unresolved.insight).toMatchObject({
			title: "Investigate /checkout",
		});
	});

	it("keeps exact error evidence visible without pretending it proves a patch", () => {
		const errorSignal: InvestigationSignal = {
			...signal,
			signalKey: "error_count",
			entity: { type: "error", id: "error_count", label: "Errors" },
			metric: { ...signal.metric, key: "error_count", label: "Errors" },
		};
		const context = Array.from({ length: 4 }, (_, index) => ({
			...contextEvidence,
			evidenceId: `evidence:context:${index}`,
			signalKey: errorSignal.signalKey,
			entity: errorSignal.entity,
		}));
		const exactEvidence: InvestigationEvidence = {
			...evidence,
			evidenceId: "evidence:exact-errors",
			signalKey: errorSignal.signalKey,
			kind: "data_health",
			source: "ops",
			queryType: "error_fingerprints",
			entity: {
				type: "error",
				id: "fingerprint:example",
				label: "TypeError: example failure",
			},
			summary: "Exact errors increased across 42 affected sessions.",
		};

		const repair = validateInvestigationDecision({
			signal: errorSignal,
			evidence: [...context, exactEvidence],
			decision: {
				disposition: "action_ready",
				remediation: {
					kind: "code",
					evidenceId: exactEvidence.evidenceId,
					instruction: "Fix the TypeError shared by the affected sessions.",
				},
			},
		});

		expect(repair.errors).toContain(
			"action_ready is not allowed for this signal. Submit monitor unless external context or explanatory evidence supports another outcome."
		);
		const unresolved = validateInvestigationDecision({
			signal: { ...errorSignal, severity: "critical" },
			evidence: [...context, exactEvidence],
			decision: { disposition: "monitor" },
		});
		expect(
			unresolved.insight?.evidence?.some((item) =>
				item.description.includes("Exact errors increased")
			)
		).toBe(true);
	});

	it("does not label an investigation step as an action-ready repair", () => {
		const errorSignal: InvestigationSignal = {
			...signal,
			signalKey: "error_count",
			entity: { type: "error", id: "error_count", label: "Errors" },
		};
		const fingerprint: InvestigationEvidence = {
			...evidence,
			evidenceId: "evidence:fingerprint:investigate",
			signalKey: errorSignal.signalKey,
			kind: "data_health",
			source: "ops",
			queryType: "error_fingerprints",
			entity: {
				type: "error",
				id: "fingerprint:example",
				label: "TypeError: example failure",
			},
		};

		const result = validateInvestigationDecision({
			signal: errorSignal,
			evidence: [fingerprint],
			decision: {
				disposition: "action_ready",
				remediation: {
					kind: "code",
					evidenceId: fingerprint.evidenceId,
					instruction: "Investigate the TypeError and find the cause.",
				},
			},
		});

		expect(result.errors).toContain(
			"action_ready requires an actual repair instruction, not an investigation step."
		);
	});

	it("rejects a remediation citation that points at unrelated evidence", () => {
		const summary: InvestigationEvidence = {
			...missingGoalEvidence,
			evidenceId: "evidence:summary",
			queryType: "revenue_overview",
			entity: undefined,
			remediation: undefined,
		};

		const result = validateInvestigationDecision({
			signal: missingGoalSignal,
			evidence: [missingGoalEvidence, summary],
			decision: {
				disposition: "action_ready",
				remediation: {
					kind: "tracking",
					evidenceId: summary.evidenceId,
					instruction: goalExpectation.instruction,
				},
			},
		});

		expect(result.errors).toContain(
			"goal:signup cites evidence that does not support tracking remediation"
		);
	});

	it("does not diagnose broken goal tracking when nobody entered the flow", () => {
		const definition: InvestigationEvidence = {
			...missingGoalEvidence,
			remediation: undefined,
			metrics: [
				{ label: "Entrants", current: 0, format: "number" },
				{ label: "Completions", current: 0, format: "number" },
			],
		};

		const result = validateInvestigationDecision({
			signal: missingGoalSignal,
			evidence: [definition],
			decision: {
				disposition: "action_ready",
				remediation: {
					kind: "tracking",
					evidenceId: definition.evidenceId,
					instruction: goalExpectation.instruction,
				},
			},
		});

		expect(result.errors).toContain(
			"goal:signup cites evidence that does not support tracking remediation"
		);
	});

	it("accepts monitor and evidence-backed dismissal as intentional silence", () => {
		const monitor = validateInvestigationDecision({
			signal,
			evidence: [evidence],
			decision: { disposition: "monitor" },
		});
		const dismissed = validateInvestigationDecision({
			signal,
			evidence: [evidence, contextEvidence],
			decision: { disposition: "not_a_problem" },
		});

		expect(monitor).toMatchObject({ errors: [], insight: null });
		expect(dismissed).toMatchObject({ errors: [], insight: null });
	});

	it("does not silently hide a critical traffic collapse", () => {
		const criticalSignal = { ...signal, severity: "critical" as const };
		const result = validateInvestigationDecision({
			signal: criticalSignal,
			evidence: [evidence],
			decision: { disposition: "monitor" },
		});

		expect(result.errors).toContain(
			"A critical traffic regression cannot be silently monitored. Ask whether acquisition, tracking, or a deployment intentionally changed."
		);

		const needsContext = validateInvestigationDecision({
			signal: criticalSignal,
			evidence: [evidence],
			decision: {
				disposition: "needs_context",
				gap: "planned_external_change",
			},
		});
		expect(needsContext.errors).toEqual([]);
		expect(needsContext.insight).toMatchObject({
			title: "Visitors fell 40%",
			severity: "critical",
		});
	});

	it("surfaces a critical exact error as unresolved when the repair is unknown", () => {
		const errorSignal: InvestigationSignal = {
			...signal,
			signalKey: "error_count",
			severity: "critical",
			entity: { type: "error", id: "error_count", label: "Errors" },
			metric: {
				...signal.metric,
				key: "error_count",
				label: "Errors",
				current: 80,
				previous: 1,
			},
		};
		const fingerprint: InvestigationEvidence = {
			...evidence,
			evidenceId: "evidence:fingerprint:unresolved",
			signalKey: errorSignal.signalKey,
			kind: "data_health",
			source: "ops",
			queryType: "error_fingerprints",
			entity: {
				type: "error",
				id: "fingerprint:example",
				label: "TypeError: example failure",
			},
			summary: "TypeError affected 5 users across 4 sessions.",
			metrics: [
				{ label: "Affected users", current: 5, format: "number" },
				{ label: "Affected sessions", current: 4, format: "number" },
			],
		};

		const result = validateInvestigationDecision({
			signal: errorSignal,
			evidence: [fingerprint],
			decision: { disposition: "monitor" },
		});

		expect(result.errors).toEqual([]);
		expect(result.insight).toMatchObject({
			title: "Investigate TypeError: example failure",
			description: "Errors rose from 1 to 80.",
			suggestion:
				"No patch target is established yet. Reproduce TypeError: example failure and trace its first application frame.",
			priority: 5,
		});
	});

	it("keeps error titles and suggestions compact without changing raw evidence", () => {
		const errorSignal: InvestigationSignal = {
			...signal,
			signalKey: "error_count",
			severity: "critical",
			entity: { type: "error", id: "error_count", label: "Errors" },
			metric: { ...signal.metric, key: "error_count", label: "Errors" },
		};
		const rawLabel =
			"TypeError: Checkout payment confirmation failed after the final retry; see documentation at https://x.test/e";
		const fingerprint: InvestigationEvidence = {
			...evidence,
			evidenceId: "evidence:fingerprint:noisy",
			signalKey: errorSignal.signalKey,
			kind: "data_health",
			source: "ops",
			queryType: "error_fingerprints",
			entity: {
				type: "error",
				id: "fingerprint:noisy",
				label: rawLabel,
			},
			summary: rawLabel,
			metrics: [
				{ label: "Affected users", current: 20, format: "number" },
			],
		};

		const result = validateInvestigationDecision({
			signal: errorSignal,
			evidence: [fingerprint],
			decision: { disposition: "monitor" },
		});

		expect(result.errors).toEqual([]);
		expect(result.insight).toMatchObject({
			title:
				"Investigate TypeError: Checkout payment confirmation failed after the…",
			suggestion:
				"No patch target is established yet. Reproduce TypeError: Checkout payment confirmation failed after the… and trace its first application frame.",
		});
		expect(result.insight?.title).not.toContain("https://");
		expect(result.insight?.suggestion).not.toContain("documentation");
		expect(result.insight?.evidence?.[0]?.description).toBe(rawLabel);
	});

	it("does not surface a critical error without a usable fingerprint", () => {
		const errorSignal: InvestigationSignal = {
			...signal,
			signalKey: "error_count",
			severity: "critical",
			entity: { type: "error", id: "error_count", label: "Errors" },
			metric: { ...signal.metric, key: "error_count", label: "Errors" },
		};
		const emptyErrors: InvestigationEvidence = {
			evidenceId: "evidence:errors:empty",
			signalKey: errorSignal.signalKey,
			kind: "data_health",
			source: "ops",
			queryType: "error_fingerprints",
			period: "current",
			range: errorSignal.period.current,
			status: "empty",
			rowCount: 0,
			summary: "No error fingerprints were returned.",
		};

		const result = validateInvestigationDecision({
			signal: errorSignal,
			evidence: [emptyErrors],
			decision: { disposition: "monitor" },
		});

		expect(result.errors).toEqual([]);
		expect(result.insight).toBeNull();
	});

	it("surfaces a warning goal regression when the exact definition is known", () => {
		const goalSignal: InvestigationSignal = {
			...signal,
			signalKey: "goal:signup",
			entity: { type: "goal", id: "signup", label: "Signup goal" },
			metric: {
				...signal.metric,
				key: "goal:signup",
				label: "Signup conversion",
			},
		};
		const goalEvidence: InvestigationEvidence = {
			...evidence,
			evidenceId: "evidence:goal:signup",
			signalKey: goalSignal.signalKey,
			kind: "definition",
			source: "product",
			queryType: "goals_summary",
			entity: goalSignal.entity,
			summary: "The signup goal remains configured.",
		};

		const result = validateInvestigationDecision({
			signal: goalSignal,
			evidence: [goalEvidence],
			decision: { disposition: "monitor" },
		});

		expect(result.errors).toEqual([]);
		expect(result.insight).toMatchObject({
			title: "Investigate Signup goal",
			suggestion:
				"The failing step is not established yet. Replay Signup goal in Databuddy DevTools and verify its entry and completion events.",
		});
	});

	it("requires a relevant internal query before any negative decision", () => {
		const detectorEvidence: InvestigationEvidence = {
			...evidence,
			evidenceId: "evidence:detector",
			queryType: "detector:visitors",
		};
		const repeatedSummary: InvestigationEvidence = {
			...detectorEvidence,
			evidenceId: "evidence:summary",
			kind: "trend",
			queryType: "summary_metrics",
		};

		for (const queryEvidence of [detectorEvidence, repeatedSummary]) {
			for (const decision of [
				{ disposition: "monitor" as const },
				{
					disposition: "needs_context" as const,
					gap: "planned_external_change" as const,
				},
			]) {
				expect(
					validateInvestigationDecision({
						signal,
						evidence: [queryEvidence],
						decision,
					}).errors
				).toContain(
					"Investigate at least one relevant Databuddy query before submitting a terminal decision."
				);
			}
		}
	});

	it("requires diagnostic evidence before recommending action", () => {
		const trendEvidence: InvestigationEvidence = {
			...evidence,
			evidenceId: "evidence:trend",
			kind: "trend",
			queryType: "summary_metrics",
		};
		const emptyEvidence: InvestigationEvidence = {
			evidenceId: "evidence:empty",
			signalKey: signal.signalKey,
			kind: "breakdown",
			source: "web",
			queryType: "top_pages",
			period: "current",
			range: signal.period.current,
			status: "empty",
			rowCount: 0,
			summary: "No rows matched.",
		};

		for (const item of [trendEvidence, emptyEvidence, failedEvidence()]) {
			const result = validateInvestigationDecision({
				signal,
				evidence: [item],
				decision: actionReady,
			});
			expect(result.errors).toContain(
				`${signal.signalKey} recommends action without usable diagnostic evidence`
			);
		}
	});

	it("rejects empty definitions as repair evidence", () => {
		const missingSignal: InvestigationSignal = {
			...missingGoalSignal,
		};
		const emptyDefinition: InvestigationEvidence = {
			evidenceId: "evidence:goal-empty",
			signalKey: missingSignal.signalKey,
			kind: "definition",
			source: "product",
			queryType: "goals_summary",
			entity: missingSignal.entity,
			period: "current",
			range: missingSignal.period.current,
			status: "empty",
			rowCount: 0,
			summary: "The expected goal definition was absent.",
		};

		const result = validateInvestigationDecision({
			signal: missingSignal,
			evidence: [emptyDefinition],
			decision: {
				disposition: "action_ready",
				remediation: {
					kind: "configuration",
					evidenceId: emptyDefinition.evidenceId,
					instruction: "Restore the signup goal definition.",
				},
			},
		});

		expect(result.errors).toContain(
			`${missingSignal.signalKey} recommends action without usable diagnostic evidence`
		);
		expect(result.insight).toBeNull();
	});

	it("turns only external gaps into backend-written questions", () => {
		const result = validateInvestigationDecision({
			signal,
			evidence: [evidence],
			decision: {
				disposition: "needs_context",
				gap: "planned_external_change",
			},
		});

		expect(result.errors).toEqual([]);
		expect(result.insight).toMatchObject({
			title: "Visitors fell 40%",
			description: "Visitors fell from 1,000 to 600.",
			suggestion:
				"Was this traffic drop expected? If not, check source traffic against recorded events on the first affected day.",
			priority: 6,
			sources: ["web"],
		});
	});

	it("surfaces unexplained critical revenue loss without asking its priority", () => {
		const revenueSignal: InvestigationSignal = {
			...signal,
			signalKey: "revenue",
			severity: "critical",
			metric: { ...signal.metric, key: "revenue", label: "Revenue" },
		};
		const revenueEvidence: InvestigationEvidence = {
			...evidence,
			evidenceId: "evidence:revenue",
			signalKey: revenueSignal.signalKey,
			kind: "impact",
			source: "business",
			queryType: "revenue_overview",
			summary: "Tracked revenue was 600 from 12 transactions across 8 customers.",
			metrics: [
				{ label: "Queried revenue", current: 600, format: "number" },
			],
		};
		const previousRevenueEvidence: InvestigationEvidence = {
			...revenueEvidence,
			evidenceId: "evidence:revenue:previous",
			period: "previous",
			range: revenueSignal.period.previous,
			summary: "Tracked revenue was 1,000 from 20 transactions across 13 customers.",
			metrics: [
				{ label: "Queried revenue", current: 1000, format: "number" },
			],
		};
		const revenueEvidenceSet = [revenueEvidence, previousRevenueEvidence];

		expect(
			validateInvestigationDecision({
				signal: revenueSignal,
				evidence: revenueEvidenceSet,
				decision: { disposition: "monitor" },
			}).errors
		).toContain(
			"A critical revenue regression cannot be silently monitored. Ask whether the change was expected or planned."
		);
		expect(
			validateInvestigationDecision({
				signal: revenueSignal,
				evidence: revenueEvidenceSet,
				decision: {
					disposition: "needs_context",
					gap: "business_priority",
				},
			}).errors
		).toContain(
			"Revenue is treated as business-critical. Ask about expected behavior or a planned external change, not its priority."
		);
		expect(
			validateInvestigationDecision({
				signal: revenueSignal,
				evidence: [{ ...revenueEvidence, queryType: "utm_campaigns" }],
				decision: {
					disposition: "needs_context",
					gap: "planned_external_change",
				},
			}).errors
		).toContain(
			"Investigate at least one relevant Databuddy query before submitting a terminal decision."
		);
		const surfaced = validateInvestigationDecision({
			signal: revenueSignal,
			evidence: revenueEvidenceSet,
			decision: {
				disposition: "needs_context",
				gap: "planned_external_change",
			},
		});
		expect(surfaced.insight?.suggestion).toBe(
			"Was this revenue change expected? If not, reconcile billing events with revenue tracking."
		);
		expect(surfaced.insight?.impactSummary).toBe(
			"Tracked revenue was 600 from 12 transactions across 8 customers."
		);
		expect(surfaced.insight?.evidence).toEqual([]);
		expect(surfaced.insight?.metrics).toEqual([
			{
				label: "Revenue",
				current: 600,
				previous: 1000,
				format: "number",
			},
		]);
		const conflict = validateInvestigationDecision({
			signal: revenueSignal,
			evidence: revenueEvidenceSet.map((item) => ({
				...item,
				metrics: [
					{ label: "Queried revenue", current: 0, format: "number" },
				],
			})),
			decision: {
				disposition: "needs_context",
				gap: "planned_external_change",
			},
		});
		expect(conflict.errors).toContain(
			"Revenue query totals conflict with the detector. Retry the query instead of producing customer advice."
		);
	});

	it("treats an empty revenue overview as a confirmed zero", () => {
		const revenueSignal: InvestigationSignal = {
			...signal,
			signalKey: "revenue:USD",
			currency: "USD",
			severity: "critical",
			metric: {
				...signal.metric,
				key: "revenue",
				label: "Revenue (USD)",
				current: 0,
				previous: 1000,
			},
		};
		const currentRevenueEvidence: InvestigationEvidence = {
			evidenceId: "evidence:revenue:current-empty",
			signalKey: revenueSignal.signalKey,
			kind: "impact",
			source: "business",
			queryType: "revenue_overview",
			period: "current",
			range: revenueSignal.period.current,
			status: "empty",
			rowCount: 0,
			summary: "revenue_overview returned no rows.",
		};
		const previousRevenueEvidence: InvestigationEvidence = {
			evidenceId: "evidence:revenue:previous",
			signalKey: revenueSignal.signalKey,
			kind: "impact",
			source: "business",
			queryType: "revenue_overview",
			period: "previous",
			range: revenueSignal.period.previous,
			status: "ok",
			rowCount: 1,
			summary: "Tracked USD revenue was 1,000.",
			metrics: [
				{ label: "Queried revenue", current: 1000, format: "number" },
			],
		};

		const result = validateInvestigationDecision({
			signal: revenueSignal,
			evidence: [currentRevenueEvidence, previousRevenueEvidence],
			decision: {
				disposition: "needs_context",
				gap: "planned_external_change",
			},
		});

		expect(result.errors).toEqual([]);
		expect(result.insight).toMatchObject({
			title: "Revenue (USD) fell 100%",
			suggestion:
				"Was this revenue change expected? If not, reconcile billing events with revenue tracking.",
		});
	});

	it("gives a vanished custom event a concrete instrumentation check", () => {
		const eventSignal: InvestigationSignal = {
			...signal,
			signalKey: "custom_event:checkout_completed",
			kind: "missing_expected_data",
			entity: {
				type: "event",
				id: "checkout_completed",
				label: "checkout_completed",
			},
			metric: {
				key: "custom_event:checkout_completed",
				label: "“checkout_completed” users",
				current: 0,
				previous: 24,
				format: "number",
			},
			severity: "critical",
		};
		const eventEvidence: InvestigationEvidence = {
			evidenceId: "evidence:event:checkout-completed",
			signalKey: eventSignal.signalKey,
			kind: "definition",
			source: "product",
			queryType: "custom_events_summary",
			entity: eventSignal.entity,
			period: "current",
			range: eventSignal.period.current,
			status: "ok",
			rowCount: 1,
			summary: "checkout_completed recorded no users in the current period.",
		};

		const result = validateInvestigationDecision({
			signal: eventSignal,
			evidence: [eventEvidence],
			decision: { disposition: "monitor" },
		});

		expect(result.errors).toEqual([]);
		expect(result.insight).toMatchObject({
			title: "Investigate checkout_completed",
			suggestion:
				"Verify that checkout_completed still fires at its expected trigger in Databuddy DevTools. If it does, compare the last nonzero day with the first zero day for ingestion or filtering changes.",
		});
	});

	it("does not turn an internal query failure into a terminal outcome", () => {
		for (const decision of [
			actionReady,
			{ disposition: "monitor" as const },
			{ disposition: "not_a_problem" as const },
			{
				disposition: "needs_context" as const,
				gap: "expected_behavior" as const,
			},
		]) {
			const result = validateInvestigationDecision({
				signal,
				evidence: [failedEvidence()],
				decision,
			});

			expect(result.errors).toContain(
				"A failed Databuddy query must be retried, not turned into a terminal decision."
			);
			expect(result.insight).toBeNull();
		}
	});

	it("requires explanatory evidence to dismiss a signal", () => {
		const result = validateInvestigationDecision({
			signal,
			evidence: [evidence],
			decision: { disposition: "not_a_problem" },
		});

		expect(result.errors).toContain(
			"not_a_problem requires a planned/benign change or exact diagnostic explanation. Otherwise submit monitor."
		);

		const unrelatedAnnotation = validateInvestigationDecision({
			signal,
			evidence: [{ ...contextEvidence, entity: undefined }],
			decision: { disposition: "not_a_problem" },
		});
		expect(unrelatedAnnotation.insight).toBeNull();
		expect(unrelatedAnnotation.errors).not.toEqual([]);
	});

	it("rejects foreign and duplicate backend evidence", () => {
		const foreignEvidence: InvestigationEvidence = {
			...evidence,
			evidenceId: "evidence:foreign",
			signalKey: "signal:other",
		};
		const result = validateInvestigationDecision({
			signal,
			evidence: [evidence, { ...evidence }, foreignEvidence],
			decision: { disposition: "monitor" },
		});

		expect(result.errors).toContain(
			`Duplicate evidence ID: ${evidence.evidenceId}`
		);
		expect(result.errors).toContain(
			"Evidence evidence:foreign belongs to another signal: signal:other"
		);
	});
});
