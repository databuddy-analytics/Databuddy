import { describe, expect, it } from "bun:test";
import {
	investigationEvidenceSchema,
	investigationOutcomeSchema,
	investigationSignalSchema,
	parseInvestigationOutcome,
} from "./insights";

const signal = {
	signalKey: "site-1|goal|signup|completion_rate",
	websiteId: "site-1",
	insightType: "conversion_leak" as const,
	entity: {
		type: "goal" as const,
		id: "signup",
		label: "Signup completed",
	},
	metric: {
		key: "goal_completion_rate",
		label: "Signup completion rate",
		current: 0,
		previous: 0.18,
		format: "percent" as const,
	},
	changePercent: -100,
	direction: "down" as const,
	severity: "critical" as const,
	sentiment: "negative" as const,
	priority: 10,
	period: {
		current: { from: "2026-07-01", to: "2026-07-07" },
		previous: { from: "2026-06-24", to: "2026-06-30" },
	},
	detectedAt: "2026-07-08",
	detection: {
		method: "rule" as const,
		reason: "The configured goal received traffic but no completions.",
		boundary: { comparison: "at_or_below" as const, value: 0.14 },
	},
};

const evidenceBase = {
	source: "product" as const,
	summary: "The goal is configured for signup_completed.",
};

describe("investigationSignalSchema", () => {
	it("accepts a complete backend-owned signal", () => {
		expect(investigationSignalSchema.parse(signal)).toEqual(signal);
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

	it("requires exact sparse baseline dates for zscore signals", () => {
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
			detection: {
				method: "zscore",
				reason: "The latest day differs from comparable historical days.",
				baselineDates,
			},
		};

		expect(investigationSignalSchema.safeParse(zscoreSignal).success).toBe(true);
		expect(
			investigationSignalSchema.safeParse({
				...zscoreSignal,
				detection: { ...zscoreSignal.detection, baselineDates: undefined },
			}).success
		).toBe(false);
		expect(
			investigationSignalSchema.safeParse({
				...zscoreSignal,
				detection: {
					...zscoreSignal.detection,
					baselineDates: baselineDates.slice(1),
				},
			}).success
		).toBe(false);
	});
});

describe("investigationEvidenceSchema", () => {
	it("keeps one concise context fact", () => {
		expect(investigationEvidenceSchema.safeParse(evidenceBase).success).toBe(
			true
		);
		expect(
			investigationEvidenceSchema.safeParse({
				...evidenceBase,
				status: "ok",
			}).success
		).toBe(false);
	});
});

const outcomeBase = {
	title: "Checkout submission is failing",
	summary: "Checkout failures began after the latest handler change.",
	impact: "The failure blocked 18 checkout attempts.",
	rootCause: null,
	rootCauseConfidence: 0.4,
	impactConfidence: 0,
	evidence: ["The checkout handler changed before failures increased."],
	sources: ["code" as const],
	next: {
		type: "resolve" as const,
		reason: "The change was rolled back.",
	},
};

describe("investigationOutcomeSchema", () => {
	it("accepts concise output with measured or unknown impact", () => {
		expect(investigationOutcomeSchema.safeParse(outcomeBase).success).toBe(true);
		expect(
			investigationOutcomeSchema.safeParse({ ...outcomeBase, impact: null })
				.success
		).toBe(true);
	});

	it("keeps copy editorial and requires the outcome structure", () => {
		expect(
			investigationOutcomeSchema.safeParse({
				...outcomeBase,
				summary: "x".repeat(401),
			}).success
		).toBe(true);
		for (const invalid of [
			{ ...outcomeBase, evidence: [] },
			{ ...outcomeBase, evidence: Array(6).fill("Measured fact") },
		]) {
			expect(investigationOutcomeSchema.safeParse(invalid).success).toBe(false);
		}
	});

	it("reads the canonical outcome", () => {
		expect(parseInvestigationOutcome(outcomeBase)).toEqual(outcomeBase);
		expect(parseInvestigationOutcome({ title: "Incomplete" })).toBeNull();
	});
});
