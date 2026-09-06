import { describe, expect, it } from "bun:test";
import {
	agentInvestigationOutcomeSchema,
	describeInsightDefinitionAction,
	insightDefinitionEditError,
	insightBriefItemSchema,
	insightDefinitionOperationSchema,
	investigationOutcomeSchema,
	investigationSignalSchema,
	parseInvestigationOutcome,
	parseInvestigationSignal,
} from "./insights";

const signal = {
	signalKey: "site-1|goal|signup|completion_rate",
	entity: {
		type: "goal" as const,
		id: "signup",
		label: "Signup completed",
	},
	metric: {
		label: "Signup completion rate",
		current: 0,
		previous: 0.18,
		format: "percent" as const,
	},
	changePercent: -100,
	severity: "critical" as const,
	sentiment: "negative" as const,
	period: {
		current: { from: "2026-07-01", to: "2026-07-07" },
		previous: { from: "2026-06-24", to: "2026-06-30" },
	},
};

describe("investigationSignalSchema", () => {
	it("accepts a complete backend-owned signal", () => {
		expect(investigationSignalSchema.parse(signal)).toEqual(signal);
		expect(
			investigationSignalSchema.parse({
				...signal,
				cohortMeasurement: {
					type: "matched_error_continuation",
					controlContinuationPercent: 60,
					exposedContinuationPercent: 20,
					matchedSessions: 40,
				},
			})
		).toMatchObject({
			cohortMeasurement: { type: "matched_error_continuation" },
		});
		expect(
			investigationSignalSchema.safeParse({
				...signal,
				cohortMeasurement: {
					type: "matched_error_continuation",
					controlContinuationPercent: 60,
					exposedContinuationPercent: 63,
					matchedSessions: 40,
				},
			}).success
		).toBe(true);
		expect(
			parseInvestigationSignal({
				...signal,
				detection: { method: "period_comparison" },
				metric: { ...signal.metric, key: signal.signalKey },
				websiteId: "legacy-site-id",
			})
		).toEqual(signal);
	});

	it("requires exact entity identity and comparison windows", () => {
		expect(
			investigationSignalSchema.safeParse({
				...signal,
				entity: { type: "goal", label: "Signup completed" },
			}).success
		).toBe(false);
		expect(
			investigationSignalSchema.safeParse({
				...signal,
				period: {
					...signal.period,
					current: { from: "last week", to: "2026-07-07" },
				},
			}).success
		).toBe(false);
	});

	it("rejects model-authored identity fields", () => {
		expect(
			investigationSignalSchema.safeParse({
				...signal,
				subjectKey: "signup",
			}).success
		).toBe(false);
	});

	it("keeps sparse baseline dates inside the comparison envelope", () => {
		const baselineDates = [
			"2026-06-24",
			"2026-06-25",
			"2026-06-26",
			"2026-06-27",
			"2026-06-28",
			"2026-06-30",
		];
		const zscoreSignal = {
			...signal,
			period: {
				...signal.period,
				previous: { from: baselineDates[0], to: baselineDates.at(-1) },
			},
			baselineDates,
		};

		expect(investigationSignalSchema.safeParse(zscoreSignal).success).toBe(
			true
		);
		expect(
			investigationSignalSchema.safeParse({
				...zscoreSignal,
				baselineDates: baselineDates.slice(1),
			}).success
		).toBe(false);
	});
});

const outcomeBase = {
	title: "Checkout recovered after the handler rollback",
	summary:
		"Checkout failures ended after the latest handler change was rolled back.",
	impact: "The failure blocked 18 checkout attempts before the rollback.",
	rootCause: null,
	evidence: ["Checkout submissions resumed after the handler rollback."],
	next: {
		type: "resolve" as const,
		reason: "Checkout submissions returned to their previous success rate.",
	},
};

const agentFields = {
	evidenceRefs: [{ index: 0, source: "provided" as const }],
	findingKind: "product_outcome" as const,
	publicationBasis: "measured_impact" as const,
};

describe("insightDefinitionOperationSchema", () => {
	it("accepts a minimal goal target patch without redundant metadata fields", () => {
		expect(
			insightDefinitionOperationSchema.parse({
				operation: "edit",
				action: "Repair the workspace goal target.",
				changes: { target: "/workspace" },
			}).changes
		).toEqual({ target: "/workspace" });
	});

	it("describes the executable patch instead of a conflicting model action", () => {
		const operation = insightDefinitionOperationSchema.parse({
			operation: "edit",
			action: "Delete the goal.",
			changes: {
				name: null,
				description: null,
				target: "/workspace",
				type: "PAGE_VIEW",
				filters: [],
			},
		});
		expect(
			describeInsightDefinitionAction("Reached workspace", operation)
		).toBe(
			'For Reached workspace, set target to "/workspace"; set type to PAGE_VIEW; set filters to none.'
		);
		if (operation.operation !== "edit") throw new Error("Expected an edit");
		expect(insightDefinitionEditError("goal", operation.changes)).toBeNull();
		expect(insightDefinitionEditError("funnel", operation.changes)).toContain(
			"replace steps"
		);
	});

	it("rejects unsupported filter fields in executable patches", () => {
		expect(
			insightDefinitionOperationSchema.safeParse({
				operation: "edit",
				action: "Change the cohort.",
				changes: {
					name: null,
					description: null,
					filters: [
						{ field: "unknown_column", operator: "equals", value: "mobile" },
					],
				},
			}).success
		).toBe(false);
	});

	it("accepts an exact funnel rename", () => {
		const execution = {
			action: "Rename Sign-Up Flow to Homepage-to-Getting Started Journey.",
			changes: {
				description: null,
				name: "Homepage-to-Getting Started Journey",
			},
			operation: "edit" as const,
		};

		expect(insightDefinitionOperationSchema.parse(execution)).toEqual(
			execution
		);
	});

	it("rejects an empty edit and display-only operations", () => {
		const base = {
			action: "Update the funnel definition.",
			changes: { description: null, name: null },
			operation: "edit" as const,
		};

		expect(insightDefinitionOperationSchema.safeParse(base).success).toBe(
			false
		);
		expect(
			insightDefinitionOperationSchema.safeParse({
				action: "Review the funnel definition.",
				changes: null,
				operation: null,
			}).success
		).toBe(false);
	});
});

describe("insightBriefItemSchema", () => {
	it("keeps readable context and measured signal data without case mechanics", () => {
		const parsed = insightBriefItemSchema.parse({
			asOf: "2026-07-07T00:00:00.000Z",
			createdAt: "2026-07-07T01:00:00.000Z",
			evidence: outcomeBase.evidence,
			id: "observation-1",
			impact: outcomeBase.impact,
			investigationId: null,
			next: outcomeBase.next,
			rootCause: outcomeBase.rootCause,
			signal,
			summary: outcomeBase.summary,
			title: outcomeBase.title,
			websiteDomain: "example.com",
			websiteId: "site-1",
			websiteName: "Example",
		});

		expect(parsed.investigationId).toBeNull();
		expect(parsed.signal.entity.label).toBe("Signup completed");
		expect(parsed).not.toHaveProperty("next");
	});

	it("rejects incomplete observations", () => {
		expect(
			insightBriefItemSchema.safeParse({
				id: "observation-1",
				summary: "Signup improved.",
			}).success
		).toBe(false);
	});
});

describe("investigationOutcomeSchema", () => {
	it("accepts concise titles while rejecting empty titles and raw identifiers", () => {
		const accepted = {
			...outcomeBase,
			...agentFields,
			publish: true,
		};
		const withTitle = (title: string) =>
			agentInvestigationOutcomeSchema.safeParse({ ...accepted, title }).success;

		expect(withTitle("263 visitors hit a Facebook script syntax error")).toBe(
			true
		);
		expect(withTitle("Signup conversion improved")).toBe(true);
		expect(withTitle(" ")).toBe(false);
		expect(withTitle("a".repeat(121))).toBe(false);
		expect(
			withTitle(
				"The signup_completed event stopped firing after the last deploy"
			)
		).toBe(false);
		expect(
			withTitle(
				"Errors rose on a977a75d-88e4-4c10-91a5-f2c4b37d38c2 during checkout"
			)
		).toBe(false);
		expect(
			withTitle("Errors rose on https://example.com/checkout this week")
		).toBe(false);
	});

	it("requires every new agent turn to make the publish decision", () => {
		expect(agentInvestigationOutcomeSchema.safeParse(outcomeBase).success).toBe(
			false
		);
		expect(
			agentInvestigationOutcomeSchema.safeParse({
				...outcomeBase,
				...agentFields,
				publish: true,
			}).success
		).toBe(true);
	});

	it("requires an explicit, grounded reason to publish", () => {
		const published = {
			...outcomeBase,
			...agentFields,
			publish: true,
		};
		expect(agentInvestigationOutcomeSchema.safeParse(published).success).toBe(
			true
		);
		expect(
			agentInvestigationOutcomeSchema.safeParse({
				...published,
				publicationBasis: null,
			}).success
		).toBe(false);
		expect(
			agentInvestigationOutcomeSchema.safeParse({
				...published,
				findingKind: "measurement_definition",
			}).success
		).toBe(false);
		expect(
			agentInvestigationOutcomeSchema.safeParse({
				...published,
				findingKind: "measurement_definition",
				impact: null,
				publicationBasis: "decision_safety",
			}).success
		).toBe(false);
		expect(
			agentInvestigationOutcomeSchema.safeParse({
				...published,
				findingKind: "measurement_definition",
				impact:
					"The funnel cannot answer whether visitors complete account registration.",
				publicationBasis: "decision_safety",
			}).success
		).toBe(true);
		expect(
			agentInvestigationOutcomeSchema.safeParse({
				...published,
				publicationBasis: "decision_safety",
			}).success
		).toBe(false);
		expect(
			agentInvestigationOutcomeSchema.safeParse({
				...published,
				findingKind: "user_experience",
				impact: null,
			}).success
		).toBe(false);
		expect(
			agentInvestigationOutcomeSchema.safeParse({
				...published,
				findingKind: "reliability_exposure",
				impact: "36 route-loading failures were measured.",
				publicationBasis: "measured_reliability",
			}).success
		).toBe(true);
		expect(
			agentInvestigationOutcomeSchema.safeParse({
				...published,
				findingKind: "reliability_exposure",
				impact: "36 route-loading failures were measured.",
			}).success
		).toBe(false);
		expect(
			agentInvestigationOutcomeSchema.safeParse({
				...published,
				publish: false,
			}).success
		).toBe(false);
	});

	it("keeps old stored outcomes and strips legacy recommendation keys", () => {
		expect(investigationOutcomeSchema.parse(outcomeBase)).toEqual(outcomeBase);
		expect(
			investigationOutcomeSchema.safeParse({
				...outcomeBase,
				findingKind: "product_outcome",
			}).success
		).toBe(false);
		expect(
			investigationOutcomeSchema.safeParse({
				...outcomeBase,
				publicationBasis: null,
			}).success
		).toBe(false);
		expect(
			investigationOutcomeSchema.parse({
				...outcomeBase,
				recommendation: {
					action: "Rename Clicked Nav.",
					changes: { description: null, name: "Navigation clicks" },
					operation: "edit",
				},
			})
		).toEqual(outcomeBase);
	});

	it("requires an exact future measurement window from the agent", () => {
		const action = {
			action: "Roll back the checkout handler.",
			execution: null,
			target: "Checkout handler",
			type: "act" as const,
			verification: "Checkout attempts succeed again.",
		};

		expect(
			agentInvestigationOutcomeSchema.safeParse({
				...outcomeBase,
				...agentFields,
				next: action,
				publish: true,
				rootCause: "The handler rejected valid checkout submissions.",
			}).success
		).toBe(false);
		expect(
			agentInvestigationOutcomeSchema.safeParse({
				...outcomeBase,
				...agentFields,
				next: { ...action, recheckAt: "2026-07-20T12:00:00.000Z" },
				publish: true,
				rootCause: "The handler rejected valid checkout submissions.",
			}).success
		).toBe(true);
	});

	it("keeps executable definition changes separate from display copy", () => {
		const action = {
			action: "Rename Clicked Nav to Navigation clicks.",
			execution: {
				action: "Rename Clicked Nav to Navigation clicks.",
				changes: { description: null, name: "Navigation clicks" },
				operation: "edit" as const,
			},
			recheckAt: "2026-07-20T12:00:00.000Z",
			target: "Goal: Clicked Nav",
			type: "act" as const,
			verification: "The goal name reflects the mixed navigation scope.",
		};
		const candidate = {
			...outcomeBase,
			...agentFields,
			next: action,
			publish: true,
			rootCause: "The goal name does not match its configured target.",
		};

		expect(agentInvestigationOutcomeSchema.safeParse(candidate).success).toBe(
			true
		);
		expect(
			agentInvestigationOutcomeSchema.safeParse({
				...candidate,
				next: {
					...action,
					execution: {
						...action.execution,
						changes: { description: null, name: null },
					},
				},
			}).success
		).toBe(false);
		const legacyAction = agentInvestigationOutcomeSchema.safeParse({
			...candidate,
			next: {
				...action,
				execution: {
					...action.execution,
					action: "Delete Clicked Nav.",
				},
			},
		});
		expect(legacyAction.success).toBe(true);
		if (
			legacyAction.success &&
			legacyAction.data.next.type === "act" &&
			legacyAction.data.next.execution
		) {
			expect("action" in legacyAction.data.next.execution).toBe(false);
		}
	});

	it("keeps historical watch conditions readable but excludes them from agent output", () => {
		const watch = {
			escalation: "Escalate if visitors fall below the baseline.",
			recheckAt: "2026-07-20T12:00:00.000Z",
			threshold: {
				anchor: "prior_baseline" as const,
				comparison: "below" as const,
				evidenceRef: { index: 0, source: "provided" as const },
				value: 800,
			},
			type: "watch" as const,
		};
		const candidate = {
			...outcomeBase,
			...agentFields,
			next: watch,
			publish: false,
			publicationBasis: null,
		};

		expect(investigationOutcomeSchema.safeParse(candidate).success).toBe(true);
		expect(
			agentInvestigationOutcomeSchema.safeParse({
				...candidate,
			}).success
		).toBe(false);
	});

	it("accepts concise output with measured or unknown impact", () => {
		expect(investigationOutcomeSchema.safeParse(outcomeBase).success).toBe(
			true
		);
		expect(
			investigationOutcomeSchema.safeParse({ ...outcomeBase, impact: null })
				.success
		).toBe(true);
		expect(
			investigationOutcomeSchema.safeParse({
				...outcomeBase,
				impact: null,
				rootCause: "The handler change dropped valid checkout submissions.",
				next: {
					action: "Roll back the checkout handler.",
					target: "Checkout handler",
					type: "act",
					verification: "Checkout attempts succeed again.",
				},
			}).success
		).toBe(false);
		expect(
			investigationOutcomeSchema.safeParse({
				...outcomeBase,
				next: {
					action: "Roll back the checkout handler.",
					target: "Checkout handler",
					type: "act",
					verification: "Checkout attempts succeed again.",
				},
			}).success
		).toBe(false);
		expect(
			investigationOutcomeSchema.safeParse({
				...outcomeBase,
				impact: null,
				next: {
					type: "ask",
					question: "Which repository owns the checkout handler?",
				},
			}).success
		).toBe(true);
	});

	it("requires concise evidence", () => {
		for (const invalid of [
			{ ...outcomeBase, evidence: [] },
			{ ...outcomeBase, evidence: Array(3).fill("Measured fact") },
		]) {
			expect(investigationOutcomeSchema.safeParse(invalid).success).toBe(false);
		}
	});

	it("keeps routine rechecks private without hiding actions or questions", () => {
		expect(
			investigationOutcomeSchema.safeParse({
				...outcomeBase,
				publish: false,
			}).success
		).toBe(true);
		expect(
			investigationOutcomeSchema.safeParse({
				...outcomeBase,
				next: {
					question: "Which repository owns checkout?",
					type: "ask",
				},
				publish: false,
			}).success
		).toBe(false);
	});

	it("reads the canonical outcome", () => {
		expect(parseInvestigationOutcome(outcomeBase)).toEqual(outcomeBase);
		expect(
			parseInvestigationOutcome({
				...outcomeBase,
				impactConfidence: 0.8,
				sources: ["web"],
			})
		).toEqual(outcomeBase);
		expect(parseInvestigationOutcome({ title: "Incomplete" })).toBeNull();
	});
});
