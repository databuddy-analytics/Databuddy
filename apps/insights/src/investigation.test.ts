import { describe, expect, it } from "bun:test";
import type { DetectedSignal } from "./detection";
import {
	prepareInvestigation,
	rankSignals,
	signalAnnotationWindow,
} from "./investigation";

const baseSignal: DetectedSignal = {
	metric: "visitors",
	label: "Visitors",
	method: "wow",
	direction: "down",
	current: 600,
	baseline: 1000,
	deltaPercent: -40,
	severity: "warning",
	detectedAt: "2026-07-10",
};

describe("rankSignals", () => {
	it("prioritizes direct regressions over dramatic generic changes", () => {
		const ranked = rankSignals([
			{ ...baseSignal, direction: "up", deltaPercent: 120, severity: "critical" },
			{
				...baseSignal,
				metric: "goal:signup",
				label: "Signup completion rate",
				deltaPercent: -25,
				severity: "info",
			},
			{
				...baseSignal,
				metric: "error_count",
				label: "Errors",
				direction: "up",
				deltaPercent: 45,
				severity: "info",
			},
			{
				...baseSignal,
				deltaPercent: -50,
				metric: "custom_event_count",
				subjectKey: "custom_event:signup_completed",
				severity: "info",
			},
		]);

		expect(ranked.map((signal) => signal.metric)).toEqual([
			"custom_event_count",
			"error_count",
			"goal:signup",
			"visitors",
		]);
	});

	it("uses stable severity, magnitude, and metric tie breakers", () => {
		const ranked = rankSignals([
			{ ...baseSignal, metric: "sessions" },
			{ ...baseSignal, metric: "pageviews", deltaPercent: -60 },
			{ ...baseSignal, metric: "visitors", severity: "critical" },
		]);

		expect(ranked.map((signal) => signal.metric)).toEqual([
			"visitors",
			"pageviews",
			"sessions",
		]);
	});

	it("uses observed reach before percentage for comparable error regressions", () => {
		const smallerCohort = {
			...baseSignal,
			baseline: 2,
			current: 13,
			deltaPercent: 550,
			direction: "up" as const,
			metric: "error_count",
			reach: {
				current: 7,
				previous: 2,
				unit: "visitor_identifiers" as const,
			},
			severity: "warning" as const,
			subjectKey: "error:smaller-cohort",
		};
		const largerCohort = {
			...smallerCohort,
			baseline: 6,
			current: 22,
			deltaPercent: 266.67,
			reach: {
				current: 16,
				previous: 6,
				unit: "visitor_identifiers" as const,
			},
			subjectKey: "error:larger-cohort",
		};

		expect(rankSignals([smallerCohort, largerCohort])).toEqual([
			smallerCohort,
			largerCohort,
		]);
		expect(rankSignals([smallerCohort, largerCohort], "reach")).toEqual([
			largerCohort,
			smallerCohort,
		]);
	});

	it("does not let reach override a more severe regression", () => {
		const critical = {
			...baseSignal,
			baseline: 10,
			current: 20,
			deltaPercent: 100,
			direction: "up" as const,
			metric: "error_count",
			reach: {
				current: 5,
				previous: 2,
				unit: "visitor_identifiers" as const,
			},
			severity: "critical" as const,
			subjectKey: "error:critical",
		};
		const warning = {
			...critical,
			reach: {
				current: 100,
				previous: 10,
				unit: "visitor_identifiers" as const,
			},
			severity: "warning" as const,
			subjectKey: "error:warning",
		};

		expect(rankSignals([warning, critical], "reach")).toEqual([
			critical,
			warning,
		]);
	});

	it("does not compare visitor reach with performance samples", () => {
		const error = {
			...baseSignal,
			baseline: 10,
			current: 20,
			deltaPercent: 100,
			direction: "up" as const,
			metric: "error_count",
			reach: {
				current: 7,
				previous: 3,
				unit: "visitor_identifiers" as const,
			},
			severity: "warning" as const,
		};
		const vital = {
			...error,
			metric: "lcp",
			reach: {
				current: 100,
				previous: 60,
				unit: "samples" as const,
			},
		};

		expect(rankSignals([error, vital], "reach")).toEqual(
			rankSignals([error, vital])
		);
	});

	it("keeps the existing order when a comparable cohort has no reach", () => {
		const knownReach = {
			...baseSignal,
			metric: "error_count",
			direction: "up" as const,
			reach: {
				current: 20,
				previous: 10,
				unit: "visitor_identifiers" as const,
			},
			subjectKey: "error:known",
		};
		const missingReach = {
			...knownReach,
			deltaPercent: 80,
			reach: undefined,
			subjectKey: "error:missing",
		};

		expect(rankSignals([missingReach, knownReach], "reach")).toEqual(
			rankSignals([missingReach, knownReach])
		);
	});
});

describe("prepareInvestigation", () => {
	it("uses website-local day bounds across daylight-saving changes", () => {
		const signal = prepareInvestigation(
			{ ...baseSignal, detectedAt: "2026-03-14" },
			7
		).signal;
		const window = signalAnnotationWindow(signal, "America/New_York");

		expect(window.from.toISOString()).toBe("2026-03-08T05:00:00.000Z");
		expect(window.to.toISOString()).toBe("2026-03-15T03:59:59.999Z");
	});

	it("turns detection into backend-owned identity, metrics, and windows", () => {
		const first = prepareInvestigation(baseSignal, 7);
		const second = prepareInvestigation(
			{ ...baseSignal, current: 500, detectedAt: "2026-07-17" },
			7
		);

		expect(first.signal.signalKey).toBe(second.signal.signalKey);
		expect(first.signal).toMatchObject({
			sentiment: "negative",
			metric: { current: 600, previous: 1000, format: "number" },
			period: {
				current: { from: "2026-07-04", to: "2026-07-10" },
				previous: { from: "2026-06-27", to: "2026-07-03" },
			},
		});
	});

	it("keeps detector definition context private while deriving a typed public fact", () => {
		const result = prepareInvestigation(
			{
				...baseSignal,
				baseline: 20,
				current: 0,
				definitionEvidence:
					'Goal "Signup" tracks the EVENT target "signup_completed". It completed for 0 of 100 observed website visitors, compared with 20 of 120 previously. Business meaning: New accounts. Filter setup: plan equals (1 value).',
				deltaPercent: -100,
				entityLabel: "Signup",
				label: "Signup completion rate",
				metric: "goal:goal-1",
			},
			7
		);

		expect(result.evidence).toHaveLength(1);
		expect(result.evidence.at(-1)).toBe(
			"Signup completion rate: 0% in the current period, compared with 20% previously."
		);
		expect(result.definitionContext).toContain("signup_completed");
		expect(result.definitionContext).toContain("Filter setup");
		expect(result.evidence.join(" ")).not.toContain("signup_completed");
		expect(result.evidence.join(" ")).not.toContain("Filter setup");
	});

	it("prefers customer-display evidence while retaining the detector fact privately", () => {
		const candidate = {
			...baseSignal,
			definitionEvidence:
				"Private detector detail includes bounded sampling and candidate mechanics.",
			displayEvidence:
				"No active goals or funnels are configured despite recorded activity during this period.",
		};

		const result = prepareInvestigation(candidate, 7);

		expect(candidate.definitionEvidence).toContain("sampling");
		expect(result.definitionContext).toBe(candidate.definitionEvidence);
		expect(result.evidence).toEqual([
			"No active goals or funnels are configured despite recorded activity during this period.",
		]);
	});

	it("keeps signal-window annotations out of citable evidence", () => {
		const result = prepareInvestigation(
			{
				...baseSignal,
				definitionEvidence: "The measured signup rate declined this week.",
				displayEvidence: "Signup completion declined in the measured period.",
			},
			7,
			[
				{
					date: "2026-07-08",
					title: "Signup instrumentation intentionally changed",
				},
				{ date: "2026-07-09", title: "Pricing campaign paused" },
			]
		);

		expect(result.annotationContext).toBe(
			"Annotation: 2026-07-08: Signup instrumentation intentionally changed; 2026-07-09: Pricing campaign paused",
		);
		expect(result.evidence).toEqual([
			"Signup completion declined in the measured period.",
		]);
	});

	it("bounds annotation context without changing detector evidence", () => {
		const result = prepareInvestigation(
			{
				...baseSignal,
				definitionEvidence: "The measured signup rate declined this week.",
				displayEvidence: "Signup completion declined in the measured period.",
			},
			7,
			[
				{
					date: "2026-07-08",
					title: "x".repeat(600),
				},
			]
		);

		expect(result.annotationContext).toHaveLength(500);
		expect(result.annotationContext).toEndWith("…");
		expect(result.evidence).toEqual([
			"Signup completion declined in the measured period.",
		]);
	});

	it("keeps a renamed goal in the same investigation", () => {
		const first = prepareInvestigation(
			{
				...baseSignal,
				entityLabel: "Signup",
				metric: "goal:signup",
			},
			7
		);
		const changed = prepareInvestigation(
			{
				...baseSignal,
				entityLabel: "Create account",
				metric: "goal:signup",
			},
			7
		);

		expect(first.signal.signalKey).toBe(changed.signal.signalKey);
		expect(first.signal.signalKey).toBe("goal:signup");
	});

	it("derives good/bad direction and native entity identity", () => {
		const errorRecovery = prepareInvestigation(
			{
				...baseSignal,
				metric: "error_count",
				label: "TypeError: cart is undefined at checkout.ts:42",
				subjectKey: "error:cart is undefined",
				current: 20,
				baseline: 100,
				deltaPercent: -80,
			},
			7
		);
		const funnel = prepareInvestigation(
			{
				...baseSignal,
				metric: "funnel:checkout-id",
				label: 'Funnel "Checkout" conversion',
				current: 12,
				baseline: 20,
			},
			7
		);

		expect(errorRecovery.signal).toMatchObject({
			signalKey: "error:cart is undefined",
			sentiment: "positive",
			entity: {
				type: "error",
				id: "cart is undefined",
			},
		});
		expect(funnel.signal).toMatchObject({
			entity: { type: "funnel", id: "checkout-id" },
			metric: { format: "percent" },
		});
	});

	it("keeps an improving vital actionable while it remains unhealthy", () => {
		const result = prepareInvestigation(
			{
				...baseSignal,
				metric: "inp",
				label: "Interaction speed (INP)",
				direction: "down",
				current: 376,
				baseline: 2840,
				deltaPercent: -86.76,
			},
			7
		);

		expect(result.signal).toMatchObject({
			entity: { type: "vital", id: "inp" },
			sentiment: "negative",
		});
	});

	it("keeps an unchanged remeasurement neutral", () => {
		const result = prepareInvestigation(
			{ ...baseSignal, baseline: 10, current: 10, deltaPercent: 0 },
			7
		);

		expect(result.signal.sentiment).toBe("neutral");
	});

	it("keeps long entity identities valid and stable", () => {
		const metric = `goal:${"checkout_step_".repeat(20)}`;
		const result = prepareInvestigation(
			{ ...baseSignal, metric, label: "Checkout step" },
			7
		);

		expect(result.signal.signalKey.length).toBe(160);
		expect(result.signal.entity.id.length).toBe(160);
	});

	it("preserves sparse comparable dates for zscore baselines", () => {
		const baselineDates = [
			"2026-06-22",
			"2026-06-23",
			"2026-06-24",
			"2026-06-25",
			"2026-06-26",
			"2026-06-29",
		];
		const result = prepareInvestigation(
			{
				...baseSignal,
				method: "zscore",
				detectedAt: "2026-07-01",
				baselineDates,
			},
			7
		);

		expect(result.signal.baselineDates).toEqual(baselineDates);
		expect(result.signal.period.previous).toEqual({
			from: baselineDates[0],
			to: baselineDates.at(-1),
		});
	});
});
