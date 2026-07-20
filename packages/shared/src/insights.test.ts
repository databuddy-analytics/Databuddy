import { describe, expect, it } from "bun:test";
import {
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

describe("investigationOutcomeSchema", () => {
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
					question:
						"Does ‘Checkout completed’ mean a successful charge? If yes, I’ll correct the goal to the payment event; if not, I’ll keep the current submission definition.",
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
