import { describe, expect, it } from "bun:test";
import {
	MAX_COVERED_ROUTE_CONTEXT_SIGNALS,
	parseFrozenInvestigationPlan,
} from "./run-candidate-plan";

const candidate = {
	evidence: ["The route recorded a materially higher error count."],
	signal: {
		changePercent: 56.52,
		entity: { id: "/explore", label: "Route /explore", type: "page" },
		metric: {
			current: 36,
			format: "number",
			label: "Errors on /explore",
			previous: 23,
		},
		period: {
			current: { from: "2026-07-25", to: "2026-07-31" },
			previous: { from: "2026-07-18", to: "2026-07-24" },
		},
		severity: "warning",
		sentiment: "negative",
		signalKey: "route:error:/explore",
	},
};

const broadErrorCandidate = {
	...candidate,
	signal: {
		...candidate.signal,
		entity: {
			id: "opaque-fingerprint",
			label: "Opaque fingerprint",
			type: "error",
		},
		signalKey: "error:opaque-fingerprint",
	},
};

describe("parseFrozenInvestigationPlan", () => {
	it("accepts a bounded legacy candidate snapshot without covered-route context", () => {
		expect(
			parseFrozenInvestigationPlan({
				asOf: "2026-08-01T12:00:00.000Z",
				candidates: [candidate],
				reason: "manual",
			})
		).toEqual({
			asOf: "2026-08-01T12:00:00.000Z",
			candidates: [candidate],
			reason: "manual",
		});
	});

	it("freezes bounded private definition context without changing public evidence", () => {
		const definitionContext =
			'Goal "Signup" tracks the EVENT target "signup_completed". Filter setup: plan equals (1 value).';
		const plan = parseFrozenInvestigationPlan({
			asOf: "2026-08-01T12:00:00.000Z",
			candidates: [{ ...candidate, definitionContext }],
			reason: "manual",
		});

		expect(plan.candidates[0]).toMatchObject({
			definitionContext,
			evidence: candidate.evidence,
		});
		expect(() =>
			parseFrozenInvestigationPlan({
				asOf: "2026-08-01T12:00:00.000Z",
				candidates: [
					{ ...candidate, definitionContext: "x".repeat(501) },
				],
				reason: "manual",
			})
		).toThrow();
	});

	it("accepts one exact covered route only for its broad error owner", () => {
		expect(
			parseFrozenInvestigationPlan({
				asOf: "2026-08-01T12:00:00.000Z",
				candidates: [
					{
						...broadErrorCandidate,
						coveredRouteSignals: [candidate.signal],
					},
				],
				reason: "manual",
			})
		).toMatchObject({
			candidates: [
				{
					coveredRouteSignals: [candidate.signal],
					signal: broadErrorCandidate.signal,
				},
			],
		});
	});

	it("rejects covered-route context on a non-broad owner", () => {
		expect(() =>
			parseFrozenInvestigationPlan({
				asOf: "2026-08-01T12:00:00.000Z",
				candidates: [{ ...candidate, coveredRouteSignals: [candidate.signal] }],
				reason: "manual",
			})
		).toThrow("requires an exact broad error owner");
	});

	it("rejects a covered route that is not an exact route-error page", () => {
		expect(() =>
			parseFrozenInvestigationPlan({
				asOf: "2026-08-01T12:00:00.000Z",
				candidates: [
					{
						...broadErrorCandidate,
						coveredRouteSignals: [
							{
								...candidate.signal,
								entity: {
									...candidate.signal.entity,
									type: "website",
								},
							},
						],
					},
				],
				reason: "manual",
			})
		).toThrow("must contain exact route-error page signals");
	});

	it("rejects a covered route outside the broad error comparison period", () => {
		expect(() =>
			parseFrozenInvestigationPlan({
				asOf: "2026-08-01T12:00:00.000Z",
				candidates: [
					{
						...broadErrorCandidate,
						coveredRouteSignals: [
							{
								...candidate.signal,
								period: {
									...candidate.signal.period,
									current: {
										...candidate.signal.period.current,
										to: "2026-08-01",
									},
								},
							},
						],
					},
				],
				reason: "manual",
			})
		).toThrow("must use the broad error owner's comparison period");
	});

	it("rejects duplicate, selected, empty, and over-limit covered routes", () => {
		const routes = Array.from(
			{ length: MAX_COVERED_ROUTE_CONTEXT_SIGNALS + 1 },
			(_, index) => ({
				...candidate.signal,
				entity: {
					...candidate.signal.entity,
					id: `/covered-${index + 1}`,
				},
				signalKey: `route:error:/covered-${index + 1}`,
			})
		);
		const plan = {
			asOf: "2026-08-01T12:00:00.000Z",
			reason: "manual" as const,
		};
		expect(() =>
			parseFrozenInvestigationPlan({
				...plan,
				candidates: [
					{
						...broadErrorCandidate,
						coveredRouteSignals: [candidate.signal, candidate.signal],
					},
				],
			})
		).toThrow("cannot repeat a route signal");
		expect(() =>
			parseFrozenInvestigationPlan({
				...plan,
				candidates: [
					{
						...broadErrorCandidate,
						coveredRouteSignals: [candidate.signal],
					},
					candidate,
				],
			})
		).toThrow("cannot include another selected candidate");
		expect(() =>
			parseFrozenInvestigationPlan({
				...plan,
				candidates: [{ ...broadErrorCandidate, coveredRouteSignals: [] }],
			})
		).toThrow();
		expect(() =>
			parseFrozenInvestigationPlan({
				...plan,
				candidates: [{ ...broadErrorCandidate, coveredRouteSignals: routes }],
			})
		).toThrow();
	});

	it("rejects a plan that repeats one signal", () => {
		expect(() =>
			parseFrozenInvestigationPlan({
				asOf: "2026-08-01T12:00:00.000Z",
				candidates: [candidate, candidate],
				reason: "manual",
			})
		).toThrow("cannot repeat a signal");
	});

	it("rejects a scheduled snapshot that exceeds the scheduled portfolio cap", () => {
		const candidates = [
			candidate,
			{
				...candidate,
				signal: { ...candidate.signal, signalKey: "route:lcp:/explore" },
			},
			{
				...candidate,
				signal: { ...candidate.signal, signalKey: "route:inp:/explore" },
			},
		];
		expect(() =>
			parseFrozenInvestigationPlan({
				asOf: "2026-08-01T12:00:00.000Z",
				candidates,
				reason: "scheduled",
			})
		).toThrow("exceeds its portfolio limit");
	});

	it("accepts six manual candidates and rejects a seventh", () => {
		const candidates = Array.from({ length: 6 }, (_, index) => ({
			...candidate,
			signal: {
				...candidate.signal,
				signalKey: `route:error:/example-${index + 1}`,
			},
		}));
		expect(
			parseFrozenInvestigationPlan({
				asOf: "2026-08-01T12:00:00.000Z",
				candidates,
				reason: "manual",
			})
		).toMatchObject({ candidates, reason: "manual" });
		expect(() =>
			parseFrozenInvestigationPlan({
				asOf: "2026-08-01T12:00:00.000Z",
				candidates: [...candidates, { ...candidates[0] }],
				reason: "manual",
			})
		).toThrow();
	});

	it("rejects a snapshot if its trigger reason changes before execution", () => {
		const plan = parseFrozenInvestigationPlan({
			asOf: "2026-08-01T12:00:00.000Z",
			candidates: [candidate],
			reason: "manual",
		});

		expect(() => parseFrozenInvestigationPlan(plan, "scheduled")).toThrow(
			"does not match its run"
		);
	});

	it("rejects falsy malformed snapshots", () => {
		expect(() => parseFrozenInvestigationPlan(false)).toThrow();
	});

	it("rejects noncanonical persisted measurement candidates", () => {
		expect(() =>
			parseFrozenInvestigationPlan({
				asOf: "2026-08-01T12:00:00.000Z",
				candidates: [
					{
						...candidate,
						measurementCandidate: {
							basis: "observed_navigation_proxy",
							kind: "page_navigation_proxy",
							target: "//signup",
							type: "PAGE_VIEW",
						},
					},
				],
				reason: "manual",
			})
		).toThrow("Measurement candidate target must be canonical");
	});

	it("freezes a safe measurement-gap guide and rejects a raw route", () => {
		const measurementGapRecommendationCandidate = {
			action:
				"Choose the completed behavior to measure around /signup, instrument it as a Databuddy custom event, then review the observed event as a goal or funnel.",
			kind: "measurement_gap" as const,
			route: "/signup",
		};
		expect(
			parseFrozenInvestigationPlan({
				asOf: "2026-08-01T12:00:00.000Z",
				candidates: [
					{ ...candidate, measurementGapRecommendationCandidate },
				],
				reason: "manual",
			})
		).toMatchObject({
			candidates: [{ measurementGapRecommendationCandidate }],
		});
		expect(() =>
			parseFrozenInvestigationPlan({
				asOf: "2026-08-01T12:00:00.000Z",
				candidates: [
					{
						...candidate,
						measurementGapRecommendationCandidate: {
							...measurementGapRecommendationCandidate,
							route: "/checkout/ari",
						},
					},
				],
				reason: "manual",
			})
		).toThrow("Measurement-gap route must be canonical");
	});

	it("accepts a typed empty snapshot so retries keep the same discovery result", () => {
		expect(
			parseFrozenInvestigationPlan({
				asOf: "2026-08-01T12:00:00.000Z",
				candidates: [],
				emptyStatus: "no_signals",
				reason: "scheduled",
			})
		).toEqual({
			asOf: "2026-08-01T12:00:00.000Z",
			candidates: [],
			emptyStatus: "no_signals",
			reason: "scheduled",
		});
	});

	it("rejects an empty snapshot without its terminal discovery status", () => {
		expect(() =>
			parseFrozenInvestigationPlan({
				asOf: "2026-08-01T12:00:00.000Z",
				candidates: [],
				reason: "scheduled",
			})
		).toThrow();
	});

	it("rejects a candidate snapshot with an empty discovery status", () => {
		expect(() =>
			parseFrozenInvestigationPlan({
				asOf: "2026-08-01T12:00:00.000Z",
				candidates: [candidate],
				emptyStatus: "deferred",
				reason: "scheduled",
			})
		).toThrow();
	});
});
