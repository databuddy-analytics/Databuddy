import { describe, expect, it } from "bun:test";
import type { EnrichedSignal } from "./enrichment";
import { prepareInvestigation } from "./investigation";

const baseSignal: EnrichedSignal = {
	metric: "visitors",
	label: "Visitors",
	method: "wow",
	direction: "down",
	current: 600,
	baseline: 1000,
	deltaPercent: -40,
	severity: "warning",
	detectedAt: "2026-07-10",
	segments: [
		{
			dimension: "pages",
			topMovers: [
				{
					name: "/pricing",
					current: 120,
					previous: 300,
					delta: -180,
					deltaPercent: -60,
				},
			],
		},
	],
	annotations: [],
};

describe("prepareInvestigation", () => {
	it("turns detection into backend-owned identity, metrics, and windows", () => {
		const first = prepareInvestigation([baseSignal], {
			websiteId: "site-1",
			lookbackDays: 7,
		});
		const second = prepareInvestigation(
			[{ ...baseSignal, current: 500, detectedAt: "2026-07-17" }],
			{ websiteId: "site-1", lookbackDays: 7 }
		);

		expect(first.signals[0].signalKey).toBe(second.signals[0].signalKey);
		expect(first.signals[0]).toMatchObject({
			websiteId: "site-1",
			insightType: "traffic_drop",
			sentiment: "negative",
			priority: 7,
			metric: { current: 600, previous: 1000, format: "number" },
			period: {
				current: { from: "2026-07-04", to: "2026-07-10" },
				previous: { from: "2026-06-27", to: "2026-07-03" },
			},
		});
	});

	it("creates exact, signal-scoped evidence instead of prose-only context", () => {
		const result = prepareInvestigation([baseSignal], {
			websiteId: "site-1",
			lookbackDays: 7,
		});
		const signalKey = result.signals[0].signalKey;

		expect(result.evidence).toHaveLength(3);
		expect(result.evidence.every((item) => item.signalKey === signalKey)).toBe(
			true
		);
		expect(result.evidence.map((item) => item.period)).toEqual([
			"current",
			"previous",
			"custom",
		]);
		expect(result.evidence[2]).toMatchObject({
			kind: "breakdown",
			status: "ok",
			rowCount: 1,
			metrics: [{ current: 120, previous: 300 }],
		});
	});

	it("derives good/bad direction and native entity identity", () => {
		const errorRecovery = prepareInvestigation(
			[
				{
					...baseSignal,
					metric: "error_count",
					label: "Errors",
					current: 20,
					baseline: 100,
					deltaPercent: -80,
					segments: [],
				},
			],
			{ websiteId: "site-1", lookbackDays: 7 }
		);
		const funnel = prepareInvestigation(
			[
				{
					...baseSignal,
					metric: "funnel:checkout-id",
					label: 'Funnel "Checkout" conversion',
					current: 12,
					baseline: 20,
					segments: [],
				},
			],
			{ websiteId: "site-1", lookbackDays: 7 }
		);

		expect(errorRecovery.signals[0]).toMatchObject({
			insightType: "reliability_improved",
			sentiment: "positive",
			entity: { type: "error", id: "error_count" },
		});
		expect(funnel.signals[0]).toMatchObject({
			insightType: "funnel_regression",
			entity: { type: "funnel", id: "checkout-id" },
			metric: { format: "percent" },
		});
	});

	it("keeps long custom event identities valid and stable", () => {
		const metric = `custom_event:${"checkout_step_".repeat(20)}`;
		const result = prepareInvestigation(
			[{ ...baseSignal, metric, label: "Checkout step", segments: [] }],
			{ websiteId: "site-1", lookbackDays: 7 }
		);

		expect(result.signals[0].metric.key.length).toBe(160);
		expect(result.signals[0].entity.id.length).toBe(160);
		expect(result.evidence[0].queryType.length).toBe(160);
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
			[
				{
					...baseSignal,
					method: "zscore",
					zScore: -3.1,
					detectedAt: "2026-07-01",
					baselineDates,
					segments: [],
				},
			],
			{ websiteId: "site-1", lookbackDays: 7 }
		);

		expect(result.signals[0].detection.baselineDates).toEqual(baselineDates);
		expect(result.evidence[1]).toMatchObject({
			period: "previous",
			range: { from: baselineDates[0], to: baselineDates.at(-1) },
			rowCount: baselineDates.length,
		});
		expect(result.evidence[1].summary).toContain(baselineDates.join(", "));
	});
});
