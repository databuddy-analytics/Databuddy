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
	boundary: { comparison: "at_or_below", value: 600 },
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
		]);

		expect(ranked.map((signal) => signal.metric)).toEqual([
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
});

describe("prepareInvestigation", () => {
	it("uses website-local day bounds across daylight-saving changes", () => {
		const signal = prepareInvestigation(
			{ ...baseSignal, detectedAt: "2026-03-14" },
			{ websiteId: "site-1", lookbackDays: 7 }
		).signal;
		const window = signalAnnotationWindow(signal, "America/New_York");

		expect(window.from.toISOString()).toBe("2026-03-08T05:00:00.000Z");
		expect(window.to.toISOString()).toBe("2026-03-15T03:59:59.999Z");
	});

	it("turns detection into backend-owned identity, metrics, and windows", () => {
		const first = prepareInvestigation(baseSignal, {
			websiteId: "site-1",
			lookbackDays: 7,
		});
		const second = prepareInvestigation(
			{ ...baseSignal, current: 500, detectedAt: "2026-07-17" },
			{ websiteId: "site-1", lookbackDays: 7 }
		);

		expect(first.signal.signalKey).toBe(second.signal.signalKey);
			expect(first.signal).toMatchObject({
			websiteId: "site-1",
			insightType: "traffic_drop",
			sentiment: "negative",
			priority: 7,
			metric: { current: 600, previous: 1000, format: "number" },
			period: {
				current: { from: "2026-07-04", to: "2026-07-10" },
				previous: { from: "2026-06-27", to: "2026-07-03" },
			},
			detection: {
				boundary: { comparison: "at_or_below", value: 600 },
			},
		});
	});

	it("uses the signal as the required measured context", () => {
		const result = prepareInvestigation(baseSignal, {
			websiteId: "site-1",
			lookbackDays: 7,
		});

		expect(result.evidence).toEqual([]);
	});

	it("reuses exact detector-owned goal evidence without another read", () => {
		const result = prepareInvestigation(
			{
				...baseSignal,
				definitionEvidence: {
					metrics: [
						{
							current: 0,
							format: "number",
							label: "Completions",
							previous: 20,
						},
					],
					summary: "Signup had 0 completions from 100 eligible visitors.",
				},
				entityLabel: "Signup",
				metric: "goal:goal-1",
			},
			{ websiteId: "site-1", lookbackDays: 7 }
		);

		expect(result.evidence).toHaveLength(1);
		expect(result.evidence.at(-1)).toMatchObject({
			source: "product",
			summary: "Signup had 0 completions from 100 eligible visitors.",
		});
	});

	it("passes signal-window annotations to the agent without classifying them", () => {
		const result = prepareInvestigation(
			baseSignal,
			{ websiteId: "site-1", lookbackDays: 7 },
			[
				{
					date: "2026-07-08",
					title: "Signup instrumentation intentionally changed",
				},
				{ date: "2026-07-09", title: "Pricing campaign paused" },
			]
		);

		expect(result.evidence).toMatchObject([
			{
				source: "business",
				summary:
					"2026-07-08: Signup instrumentation intentionally changed; 2026-07-09: Pricing campaign paused",
			},
		]);
	});

	it("keeps a renamed goal in the same investigation", () => {
		const first = prepareInvestigation(
			{
				...baseSignal,
				entityLabel: "Signup",
				metric: "goal:signup",
			},
			{ websiteId: "site-1", lookbackDays: 7 }
		);
		const changed = prepareInvestigation(
			{
				...baseSignal,
				entityLabel: "Create account",
				metric: "goal:signup",
			},
			{ websiteId: "site-1", lookbackDays: 7 }
		);

		expect(first.signal.signalKey).toBe(changed.signal.signalKey);
		expect(first.signal.metric.key).toBe("goal:signup");
		expect(changed.signal.metric.key).toBe("goal:signup");
	});

	it("derives good/bad direction and native entity identity", () => {
		const errorRecovery = prepareInvestigation(
			{
				...baseSignal,
				metric: "error_count",
				label: "Errors",
				current: 20,
				baseline: 100,
				deltaPercent: -80,
			},
			{ websiteId: "site-1", lookbackDays: 7 }
		);
		const funnel = prepareInvestigation(
			{
				...baseSignal,
				metric: "funnel:checkout-id",
				label: 'Funnel "Checkout" conversion',
				current: 12,
				baseline: 20,
			},
			{ websiteId: "site-1", lookbackDays: 7 }
		);

		expect(errorRecovery.signal).toMatchObject({
			insightType: "reliability_improved",
			sentiment: "positive",
			entity: { type: "error", id: "error_count" },
		});
		expect(funnel.signal).toMatchObject({
			insightType: "funnel_regression",
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
			{ websiteId: "site-1", lookbackDays: 7 }
		);

		expect(result.signal).toMatchObject({
			entity: { type: "vital", id: "inp" },
			sentiment: "negative",
		});
	});

	it("keeps long entity identities valid and stable", () => {
		const metric = `goal:${"checkout_step_".repeat(20)}`;
		const result = prepareInvestigation(
			{ ...baseSignal, metric, label: "Checkout step" },
			{ websiteId: "site-1", lookbackDays: 7 }
		);

		expect(result.signal.metric.key.length).toBe(160);
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
				zScore: -3.1,
				detectedAt: "2026-07-01",
				baselineDates,
			},
			{ websiteId: "site-1", lookbackDays: 7 }
		);

		expect(result.signal.detection.baselineDates).toEqual(baselineDates);
		expect(result.signal.period.previous).toEqual({
			from: baselineDates[0],
			to: baselineDates.at(-1),
		});
	});
});
