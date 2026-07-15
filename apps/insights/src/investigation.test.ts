import { describe, expect, it } from "bun:test";
import type { DetectedSignal } from "./detection";
import {
	annotationMatchesSignal,
	needsAdditionalEvidence,
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
		});
	});

	it("keeps revenue currencies in distinct signal identities", () => {
		const usd = prepareInvestigation(
			{ ...baseSignal, metric: "revenue", label: "Revenue (USD)", currency: "USD" },
			{ websiteId: "site-1", lookbackDays: 7 }
		).signal;
		const eur = prepareInvestigation(
			{ ...baseSignal, metric: "revenue", label: "Revenue (EUR)", currency: "EUR" },
			{ websiteId: "site-1", lookbackDays: 7 }
		).signal;

		expect(usd.currency).toBe("USD");
		expect(usd.signalKey).not.toBe(eur.signalKey);
	});

	it("uses the event name, not its metric label, as custom-event identity", () => {
		const customEvent = prepareInvestigation(
			{
				...baseSignal,
				metric: "custom_event:checkout_completed",
				label: "“checkout_completed” users",
			},
			{ websiteId: "site-1", lookbackDays: 7 }
		).signal;

		expect(customEvent.entity).toEqual({
			type: "event",
			id: "checkout_completed",
			label: "checkout_completed",
		});
	});

	it("keeps a long custom-event query target exact while bounding durable keys", () => {
		const eventName = `checkout_${"step_".repeat(38)}`;
		const customEvent = prepareInvestigation(
			{
				...baseSignal,
				metric: `custom_event:${eventName}`,
				label: `“${eventName}” users`,
			},
			{ websiteId: "site-1", lookbackDays: 7 }
		).signal;

		expect(eventName.length).toBeGreaterThan(160);
		expect(eventName.length).toBeLessThanOrEqual(256);
		expect(customEvent.entity).toEqual({
			type: "event",
			id: eventName,
			label: eventName.slice(0, 120),
		});
		expect(customEvent.metric.key.length).toBeLessThanOrEqual(160);
		expect(customEvent.signalKey.length).toBeLessThanOrEqual(160);
	});

	it("starts with only exact detector evidence", () => {
		const result = prepareInvestigation(baseSignal, {
			websiteId: "site-1",
			lookbackDays: 7,
		});

		expect(result.evidence).toHaveLength(2);
		expect(
			result.evidence.every(
				(item) => item.signalKey === result.signal.signalKey
			)
		).toBe(true);
		expect(result.evidence.map((item) => item.period)).toEqual([
			"current",
			"previous",
		]);
	});

	it("reuses detector goal context but re-reads a confirmed repair", () => {
		const candidate = {
			...baseSignal,
			definitionEvidence: {
				metrics: [
					{
						current: 0,
						format: "number" as const,
						label: "Completions",
						previous: 20,
					},
				],
				queryType: "goals_summary" as const,
				summary: "Signup had 0 completions from 100 eligible visitors.",
			},
			definitionUpdatedAt: "2026-06-01T00:00:00.000Z",
			entityLabel: "Signup",
			metric: "goal:goal-1",
		};
		const result = prepareInvestigation(
			candidate,
			{ websiteId: "site-1", lookbackDays: 7 }
		);

		expect(needsAdditionalEvidence(result.signal, result.evidence)).toBe(false);
		expect(needsAdditionalEvidence(result.signal, result.evidence.slice(0, 2))).toBe(
			true
		);

		const confirmed = prepareInvestigation(
			{
				...candidate,
				expectation: {
					confirmation: {
						count: 12,
						definitionId: "goal-1",
						definitionType: "goal",
						source: "revenue_transactions",
					},
					definitionUpdatedAt: "2026-06-01T00:00:00.000Z",
					eventName: "sign_up",
					instruction: 'Restore the "sign_up" event when Signup completes.',
					kind: "tracking",
					previousCompletions: 20,
					currentEntrants: 100,
					currentCompletions: 0,
				},
				kind: "missing_expected_data",
			},
			{ websiteId: "site-1", lookbackDays: 7 }
		);

		expect(needsAdditionalEvidence(confirmed.signal, confirmed.evidence)).toBe(
			true
		);
		expect(confirmed.evidence.some((item) => item.remediation)).toBe(false);
	});

	it("ignores unscoped annotations", () => {
		const result = prepareInvestigation(
			baseSignal,
			{ websiteId: "site-1", lookbackDays: 7 },
			[{ date: "2026-07-08", title: "Pricing campaign paused" }]
		);

		expect(result.evidence).toHaveLength(2);
		expect(
			annotationMatchesSignal("Planned visitors dashboard change", result.signal)
		).toBe(false);
	});

	it("only scopes annotations that name the selected signal", () => {
		const result = prepareInvestigation(
			{
				...baseSignal,
				metric: "goal:signup",
				label: "Signup completion rate",
			},
			{ websiteId: "site-1", lookbackDays: 7 },
			[
				{
					date: "2026-07-08",
					signalScoped: true,
					title: "Signup instrumentation intentionally changed",
				},
				{
					date: "2026-07-08",
					signalScoped: true,
					title: "Signup outage started",
				},
				{ date: "2026-07-09", title: "Pricing campaign paused" },
			]
		);

		expect(result.evidence.slice(2)).toMatchObject([
			{
				entity: result.signal.entity,
				queryType: "annotations:planned_signal",
				rowCount: 1,
			},
		]);
		expect(
			annotationMatchesSignal(
				"Signup instrumentation intentionally changed",
				result.signal
			)
		).toBe(true);
		expect(annotationMatchesSignal("Pricing campaign paused", result.signal)).toBe(
			false
		);
	});

	it("matches a goal annotation by its label when its database ID is opaque", () => {
		const result = prepareInvestigation(
			{
				...baseSignal,
				metric: "goal:019f5b32-1af4-78ac-9434-a6be92d9f611",
				label: "Signup completion rate",
			},
			{ websiteId: "site-1", lookbackDays: 7 }
		);

		expect(
			annotationMatchesSignal(
				"Signup instrumentation intentionally changed",
				result.signal
			)
		).toBe(true);
	});

	it("treats a changed goal definition as a new investigation signal", () => {
		const expectation = {
			definitionUpdatedAt: "2026-06-01T00:00:00.000Z",
			eventName: "sign_up",
			instruction: 'Restore the "sign_up" event when Signup completes.',
			kind: "tracking" as const,
			previousCompletions: 20,
			currentEntrants: 100,
			currentCompletions: 0 as const,
		};
		const first = prepareInvestigation(
			{
				...baseSignal,
				expectation,
				kind: "missing_expected_data",
				metric: "goal:signup",
			},
			{ websiteId: "site-1", lookbackDays: 7 }
		);
		const changed = prepareInvestigation(
			{
				...baseSignal,
				expectation: {
					...expectation,
					definitionUpdatedAt: "2026-07-01T00:00:00.000Z",
				},
				kind: "missing_expected_data",
				metric: "goal:signup",
			},
			{ websiteId: "site-1", lookbackDays: 7 }
		);

		expect(first.signal.signalKey).not.toBe(changed.signal.signalKey);
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
		expect(result.evidence[1]).toMatchObject({
			period: "previous",
			range: { from: baselineDates[0], to: baselineDates.at(-1) },
			rowCount: baselineDates.length,
		});
		expect(result.evidence[1].summary).toContain(baselineDates.join(", "));
	});
});
