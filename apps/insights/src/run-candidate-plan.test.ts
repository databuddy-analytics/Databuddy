import { describe, expect, it } from "bun:test";
import {
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

describe("parseFrozenInvestigationPlan", () => {
	it("accepts a bounded safe candidate snapshot", () => {
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
