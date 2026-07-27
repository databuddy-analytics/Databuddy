import { describe, expect, it } from "bun:test";
import {
	agentInvestigationOutcomeSchema,
	insightBriefItemSchema,
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

		expect(investigationSignalSchema.safeParse(zscoreSignal).success).toBe(true);
		expect(
			investigationSignalSchema.safeParse({
				...zscoreSignal,
				baselineDates: baselineDates.slice(1),
			}).success
		).toBe(false);
	});
});

const outcomeBase = {
	title: "Checkout recovered after rollback",
	summary: "Checkout failures ended after the latest handler change was rolled back.",
	impact: "The failure blocked 18 checkout attempts before the rollback.",
	rootCause: null,
	evidence: ["Checkout submissions resumed after the handler rollback."],
	next: {
		type: "resolve" as const,
		reason: "Checkout submissions returned to their previous success rate.",
	},
};

describe("insightBriefItemSchema", () => {
	it("keeps readable context and measured signal data without case mechanics", () => {
		const recommendation = {
			action: "Rename Signup completed to Checkout completed.",
			changes: {
				description: "Counts completed checkout events.",
				name: "Checkout completed",
			},
			operation: "edit" as const,
		};
		const parsed = insightBriefItemSchema.parse({
			asOf: "2026-07-07T00:00:00.000Z",
			createdAt: "2026-07-07T01:00:00.000Z",
			evidence: outcomeBase.evidence,
			id: "observation-1",
			impact: outcomeBase.impact,
			investigationId: null,
			next: outcomeBase.next,
			recommendation,
			rootCause: outcomeBase.rootCause,
			signal,
			summary: outcomeBase.summary,
			title: outcomeBase.title,
			websiteDomain: "example.com",
			websiteId: "site-1",
			websiteName: "Example",
		});

		expect(parsed.investigationId).toBeNull();
		expect(parsed.recommendation).toEqual(recommendation);
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
	it("requires every new agent turn to make the publish decision", () => {
		expect(agentInvestigationOutcomeSchema.safeParse(outcomeBase).success).toBe(
			false
		);
		expect(
			agentInvestigationOutcomeSchema.safeParse({
				...outcomeBase,
				publish: true,
				recommendation: null,
			}).success
		).toBe(true);
	});

	it("keeps old stored outcomes while enforcing recommendation lifecycle", () => {
		expect(investigationOutcomeSchema.parse(outcomeBase)).toEqual(outcomeBase);
		expect(
			investigationOutcomeSchema.safeParse({
				...outcomeBase,
				publish: false,
				recommendation: {
					action: "Rename Clicked Nav.",
					changes: { description: null, name: "Navigation clicks" },
					operation: "edit",
				},
			}).success
		).toBe(false);
		expect(
			investigationOutcomeSchema.safeParse({
				...outcomeBase,
				next: {
					action: "Rename Clicked Nav.",
					target: "Goal: Clicked Nav",
					type: "act",
					verification: "The goal name reflects its broad scope.",
				},
				publish: true,
				recommendation: {
					action: "Rename Clicked Nav.",
					changes: { description: null, name: "Navigation clicks" },
					operation: "edit",
				},
				rootCause: "The goal name does not match its configured target.",
			}).success
		).toBe(false);
	});

	it("requires an exact future measurement window from the agent", () => {
		const action = {
			action: "Roll back the checkout handler.",
			target: "Checkout handler",
			type: "act" as const,
			verification: "Checkout attempts succeed again.",
		};

		expect(
			agentInvestigationOutcomeSchema.safeParse({
				...outcomeBase,
				next: action,
				publish: true,
				recommendation: null,
				rootCause: "The handler rejected valid checkout submissions.",
			}).success
		).toBe(false);
		expect(
			agentInvestigationOutcomeSchema.safeParse({
				...outcomeBase,
				next: { ...action, recheckAt: "2026-07-20T12:00:00.000Z" },
				publish: true,
				recommendation: null,
				rootCause: "The handler rejected valid checkout submissions.",
			}).success
		).toBe(true);
	});

	it("allows only exact goal mutations to be attached to actions", () => {
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
			next: action,
			publish: true,
			recommendation: null,
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
		expect(
			agentInvestigationOutcomeSchema.safeParse({
			...candidate,
			next: {
				...action,
				execution: {
					...action.execution,
					action: "Delete Clicked Nav.",
				},
			},
		}).success
	).toBe(false);
	});

	it("requires exact fields for every new goal edit recommendation", () => {
		const recommendation = {
			action:
				"Rename Clicked Nav to Navigation clicks and describe its broad scope.",
			changes: {
				description:
					"All navigation activity across the navbar, footer, feature menu, and external destinations.",
				name: "Navigation clicks",
			},
			operation: "edit" as const,
		};
		const deletion = {
			action: "Delete the duplicate Clicked Nav goal.",
			changes: null,
			operation: "delete" as const,
		};
		const accepts = (candidate: unknown) =>
			agentInvestigationOutcomeSchema.safeParse({
				...outcomeBase,
				publish: true,
				recommendation: candidate,
			}).success;

		for (const [candidate, expected] of [
			[recommendation, true],
			[
				{
					...recommendation,
					changes: { description: null, name: "Navigation clicks" },
				},
				true,
			],
			[{ ...recommendation, changes: { name: "Navigation clicks" } }, false],
			[{ ...recommendation, changes: null }, false],
			[{ ...deletion, changes: recommendation.changes }, false],
			[deletion, true],
			[
				{ action: "Review the pricing-page CTA.", changes: null, operation: null },
				true,
			],
		] as const) {
			expect(accepts(candidate)).toBe(expected);
		}
	});

	it("accepts concise output with measured or unknown impact", () => {
		expect(investigationOutcomeSchema.safeParse(outcomeBase).success).toBe(true);
		expect(
			investigationOutcomeSchema.safeParse({ ...outcomeBase, impact: null })
				.success
		).toBe(true);
			expect(
				investigationOutcomeSchema.safeParse({
					...outcomeBase,
					impact: null,
					rootCause:
						"The handler change dropped valid checkout submissions.",
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
