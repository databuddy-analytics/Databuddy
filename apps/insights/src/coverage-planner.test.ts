import { describe, expect, it } from "bun:test";
import type { DetectedSignal } from "./detection";
import {
	coveragePortfolioLimit,
	errorQualificationFrontierLimit,
	planCoveragePortfolio,
	planCoveragePortfolioWithTrace,
} from "./coverage-planner";
import {
	prepareInvestigation,
	signalKeyForDetectedSignal,
} from "./investigation";
import { eligibleSignalsForInvestigation } from "./observations";

function signal(
	overrides: Partial<DetectedSignal> & Pick<DetectedSignal, "metric">
): DetectedSignal {
	return {
		baseline: 100,
		current: 50,
		deltaPercent: -50,
		detectedAt: "2026-08-01",
		direction: "down",
		label: overrides.metric,
		method: "wow",
		severity: "warning",
		...overrides,
	};
}

function keys(signals: DetectedSignal[]): string[] {
	return signals.map(signalKeyForDetectedSignal);
}

describe("planCoveragePortfolio", () => {
	it("caps manual runs at six signals and scheduled runs at two", () => {
		const candidates = [
			signal({ metric: "error_count", subjectKey: "error:checkout" }),
			signal({ metric: "goal:signup", subjectKey: "goal:signup" }),
			signal({ metric: "visitors" }),
			signal({ metric: "bounce_rate", direction: "up" }),
			signal({ metric: "revenue" }),
			signal({
				metric: "custom_event_count",
				subjectKey: "custom_event:signup",
			}),
		];

		expect(coveragePortfolioLimit("manual")).toBe(6);
		expect(coveragePortfolioLimit("scheduled")).toBe(2);
		expect(
			planCoveragePortfolio(candidates, { reason: "manual" })
		).toHaveLength(6);
		expect(
			planCoveragePortfolio(candidates, { reason: "scheduled" })
		).toHaveLength(2);
	});

	it("keeps a bounded error-qualification replacement window", () => {
		expect(errorQualificationFrontierLimit("scheduled")).toBe(4);
		expect(errorQualificationFrontierLimit("manual")).toBe(12);
	});

	it("reserves a due recheck before higher-ranked newly detected signals", () => {
		const due = signal({
			metric: "visitors",
			subjectKey: "traffic:weekly-visitors",
		});
		const criticalError = signal({
			baseline: 50,
			current: 100,
			deltaPercent: 100,
			direction: "up",
			metric: "error_count",
			severity: "critical",
			subjectKey: "error:checkout",
		});

		const plan = planCoveragePortfolio([criticalError, due], {
			dueSignalKey: signalKeyForDetectedSignal(due),
			reason: "scheduled",
		});

		expect(keys(plan)).toEqual([
			signalKeyForDetectedSignal(due),
			signalKeyForDetectedSignal(criticalError),
		]);
	});

	it("does not fill capacity from unqualified candidates but preserves a due recheck", () => {
		const genericTraffic = signal({
			metric: "visitors",
			subjectKey: "traffic:weekly-visitors",
		});
		const qualifiedGoal = signal({
			metric: "goal:signup",
			subjectKey: "goal:signup",
		});
		const unqualified = new Set([signalKeyForDetectedSignal(genericTraffic)]);

		const screened = planCoveragePortfolioWithTrace(
			[genericTraffic, qualifiedGoal],
			{ reason: "manual", unqualifiedSignalKeys: unqualified }
		);
		expect(keys(screened.selected)).toEqual([
			signalKeyForDetectedSignal(qualifiedGoal),
		]);
		expect(
			screened.entries.find(
				(entry) =>
					signalKeyForDetectedSignal(entry.signal) ===
					signalKeyForDetectedSignal(genericTraffic)
			)
		).toMatchObject({ omittedFor: ["unqualified"], selectedAt: null });

		const due = planCoveragePortfolio(
			[genericTraffic, qualifiedGoal],
			{
				dueSignalKey: signalKeyForDetectedSignal(genericTraffic),
				reason: "scheduled",
				unqualifiedSignalKeys: unqualified,
			}
		);
		expect(keys(due)).toEqual([
			signalKeyForDetectedSignal(genericTraffic),
			signalKeyForDetectedSignal(qualifiedGoal),
		]);
	});

	it("deduplicates identities and diversifies correlated traffic and exact error subjects", () => {
		const primaryError = signal({
			baseline: 50,
			current: 100,
			deltaPercent: 100,
			direction: "up",
			entityId: "checkout-fingerprint",
			metric: "error_count",
			severity: "critical",
			subjectKey: "error:checkout:count",
		});
		const sameErrorSubject = signal({
			baseline: 50,
			current: 100,
			deltaPercent: 100,
			direction: "up",
			entityId: "checkout-fingerprint",
			metric: "error_count",
			subjectKey: "error:checkout:rate",
		});
		const duplicateWeakError = signal({
			baseline: 50,
			current: 100,
			deltaPercent: 100,
			direction: "up",
			metric: "error_count",
			severity: "info",
			subjectKey: "error:checkout:count",
		});
		const goal = signal({ metric: "goal:signup", subjectKey: "goal:signup" });
		const visitors = signal({ metric: "visitors", severity: "critical" });
		const plan = planCoveragePortfolio(
			[
				primaryError,
				sameErrorSubject,
				duplicateWeakError,
				visitors,
				signal({ metric: "sessions", severity: "info" }),
				signal({ metric: "pageviews", severity: "info" }),
				goal,
			],
			{ reason: "manual" }
		);

		expect(keys(plan)).toEqual([
			signalKeyForDetectedSignal(primaryError),
			signalKeyForDetectedSignal(goal),
			signalKeyForDetectedSignal(visitors),
		]);
		expect(plan.filter((item) => item.metric === "error_count")).toHaveLength(1);
		expect(
			plan.filter((item) => ["visitors", "sessions", "pageviews"].includes(item.metric))
		).toHaveLength(1);
	});

	it("keeps direct regressions ahead of generic changes", () => {
		const error = signal({
			baseline: 50,
			current: 100,
			deltaPercent: 100,
			direction: "up",
			metric: "error_count",
			subjectKey: "error:checkout",
		});
		const traffic = signal({ metric: "visitors" });
		const recovery = signal({
			metric: "error_count",
			subjectKey: "error:search",
		});
		const anotherRecovery = signal({
			baseline: 50,
			current: 100,
			deltaPercent: 100,
			direction: "up",
			metric: "custom_event_count",
			subjectKey: "custom_event:signup",
		});

		const plan = planCoveragePortfolio(
			[traffic, recovery, anotherRecovery, error],
			{ reason: "manual" }
		);

		expect(keys(plan).slice(0, 2)).toEqual([
			signalKeyForDetectedSignal(error),
			signalKeyForDetectedSignal(traffic),
		]);
		expect(
			plan.filter(
				(item) => item === recovery || item === anotherRecovery
			)
		).toHaveLength(2);
	});

	it("does not let a neutral measurement gap suppress useful improvements", () => {
		const candidates = [
			signal({
				baseline: 50,
				current: 100,
				deltaPercent: 100,
				direction: "up",
				metric: "revenue",
			}),
			signal({
				metric: "error_count",
				subjectKey: "error:checkout",
			}),
			signal({
				baseline: 0,
				current: 0,
				deltaPercent: 0,
				direction: "up",
				metric: "measurement_coverage",
				subjectKey: "measurement:conversion-coverage",
			}),
		];

		expect(
			planCoveragePortfolio(candidates, { reason: "manual" })
		).toHaveLength(3);
	});

	it("resolves duplicate same-key candidates deterministically", () => {
		const first = signal({
			baseline: 0,
			baselineDates: ["2026-07-25"],
			current: 0,
			definitionEvidence: "Observed signup event candidate.",
			deltaPercent: 0,
			direction: "up",
			measurementCandidate: {
				basis: "observed_custom_event",
				kind: "event_goal_candidate",
				target: "signup_completed",
				type: "EVENT",
			},
			metric: "measurement_coverage",
			subjectKey: "measurement:conversion-coverage",
		});
		const second = signal({
			...first,
			baselineDates: ["2026-07-26"],
			definitionEvidence: "Observed demo request candidate.",
			measurementCandidate: {
				basis: "observed_custom_event",
				kind: "event_goal_candidate",
				target: "demo_requested",
				type: "EVENT",
			},
		});

		const forward = planCoveragePortfolio([first, second], { reason: "manual" });
		const reversed = planCoveragePortfolio([second, first], { reason: "manual" });

		expect(forward).toEqual(reversed);
	});

	it("treats errors and slow vitals on one route as one health cluster", () => {
		const routeError = signal({
			baseline: 10,
			current: 30,
			deltaPercent: 200,
			direction: "up",
			entityId: "/explore",
			metric: "error_count",
			severity: "critical",
			subjectKey: "route:error:/explore",
		});
		const routeLcp = signal({
			baseline: 2000,
			current: 4000,
			deltaPercent: 100,
			direction: "up",
			entityId: "/explore",
			metric: "lcp",
			severity: "warning",
			subjectKey: "route:lcp:/explore",
		});
		const plan = planCoveragePortfolio(
			[
				routeError,
				routeLcp,
				signal({ metric: "goal:signup", subjectKey: "goal:signup" }),
				signal({ metric: "visitors" }),
			],
			{ reason: "manual" }
		);

		expect(plan).toHaveLength(3);
		expect(
			plan.filter((item) => item.entityId === "/explore")
		).toHaveLength(1);
	});

	it("traces why a correlated candidate is omitted", () => {
		const routeError = signal({
			baseline: 10,
			current: 30,
			deltaPercent: 200,
			direction: "up",
			entityId: "/explore",
			metric: "error_count",
			severity: "critical",
			subjectKey: "route:error:/explore",
		});
		const routeLcp = signal({
			baseline: 2000,
			current: 4000,
			deltaPercent: 100,
			direction: "up",
			entityId: "/explore",
			metric: "lcp",
			severity: "warning",
			subjectKey: "route:lcp:/explore",
		});
		const signals = [
			routeError,
			routeLcp,
			signal({ metric: "goal:signup", subjectKey: "goal:signup" }),
			signal({ metric: "visitors" }),
		];

		const trace = planCoveragePortfolioWithTrace(signals, {
			reason: "manual",
		});

		expect(trace.selected).toEqual(
			planCoveragePortfolio(signals, { reason: "manual" })
		);
		const lcp = trace.entries.find((entry) => entry.signal === routeLcp);
		expect(lcp).toMatchObject({
			omittedFor: ["same_cluster"],
			selectedAt: null,
		});
	});

	it("backfills a distinct signal when overlap evidence covers a redundant route", () => {
		const broadError = signal({
			baseline: 23,
			current: 38,
			deltaPercent: 65.22,
			direction: "up",
			entityId: "manifest-fingerprint",
			metric: "error_count",
			reach: {
				current: 36,
				previous: 23,
				unit: "visitor_identifiers",
			},
			severity: "critical",
			subjectKey: "error:manifest-fingerprint",
		});
		const independentRoute = signal({
			baseline: 2,
			current: 13,
			deltaPercent: 550,
			direction: "up",
			entityId: "/independent",
			metric: "error_count",
			reach: {
				current: 7,
				previous: 2,
				unit: "visitor_identifiers",
			},
			severity: "warning",
			subjectKey: "route:error:/independent",
		});
		const redundantRoute = signal({
			baseline: 6,
			current: 22,
			deltaPercent: 266.67,
			direction: "up",
			entityId: "/covered",
			metric: "error_count",
			reach: {
				current: 16,
				previous: 6,
				unit: "visitor_identifiers",
			},
			severity: "warning",
			subjectKey: "route:error:/covered",
		});
		const backfill = signal({
			metric: "custom_event_count",
			subjectKey: "custom_event:signup_completed",
		});
		const signals = [
			broadError,
			independentRoute,
			redundantRoute,
			signal({ metric: "visitors" }),
			signal({ metric: "revenue" }),
			signal({ metric: "goal:checkout", subjectKey: "goal:checkout" }),
			backfill,
		];

		const plan = planCoveragePortfolioWithTrace(signals, {
			excludedSignalKeys: new Set([
				signalKeyForDetectedSignal(redundantRoute),
			]),
			reason: "manual",
		});

		expect(plan.selected).toHaveLength(6);
		expect(keys(plan.selected)).not.toContain(
			signalKeyForDetectedSignal(redundantRoute)
		);
		expect(keys(plan.selected)).toContain(signalKeyForDetectedSignal(backfill));
		expect(
			plan.entries.find(
				(entry) =>
					signalKeyForDetectedSignal(entry.signal) ===
					signalKeyForDetectedSignal(redundantRoute)
			)
		).toMatchObject({ omittedFor: ["overlap_covered"], selectedAt: null });
	});

	it("can evaluate reach-aware error ordering without changing the default portfolio", () => {
		const criticalError = signal({
			baseline: 23,
			current: 38,
			deltaPercent: 65.22,
			direction: "up",
			metric: "error_count",
			reach: {
				current: 36,
				previous: 23,
				unit: "visitor_identifiers",
			},
			severity: "critical",
			subjectKey: "error:critical",
		});
		const smallerCohortError = signal({
			baseline: 2,
			current: 13,
			deltaPercent: 550,
			direction: "up",
			metric: "error_count",
			reach: {
				current: 7,
				previous: 2,
				unit: "visitor_identifiers",
			},
			severity: "warning",
			subjectKey: "route:error:smaller-cohort",
		});
		const largerCohortError = signal({
			...smallerCohortError,
			baseline: 6,
			current: 22,
			deltaPercent: 266.67,
			reach: {
				current: 16,
				previous: 6,
				unit: "visitor_identifiers",
			},
			subjectKey: "route:error:larger-cohort",
		});
		const vital = signal({
			baseline: 4424,
			current: 5796,
			deltaPercent: 31.01,
			direction: "up",
			metric: "lcp",
			reach: { current: 76, previous: 64, unit: "samples" },
			severity: "warning",
			subjectKey: "route:lcp:checkout",
		});
		const lowerPrioritySignals = [
			signal({
				baseline: 50,
				current: 100,
				deltaPercent: 100,
				direction: "up",
				metric: "visitors",
			}),
			signal({
				baseline: 50,
				current: 100,
				deltaPercent: 100,
				direction: "up",
				metric: "revenue",
			}),
			signal({
				baseline: 50,
				current: 100,
				deltaPercent: 100,
				direction: "up",
				metric: "custom_event_count",
				subjectKey: "custom_event:signup",
			}),
		];
		const signals = [
			criticalError,
			smallerCohortError,
			largerCohortError,
			vital,
			...lowerPrioritySignals,
		];

		const current = keys(
			planCoveragePortfolioWithTrace(signals, { reason: "manual" }).selected
		);
		expect(current).toHaveLength(6);
		expect(current).toContain(signalKeyForDetectedSignal(smallerCohortError));
		expect(current).toContain(signalKeyForDetectedSignal(largerCohortError));
		expect(
			current.indexOf(signalKeyForDetectedSignal(smallerCohortError))
		).toBeLessThan(current.indexOf(signalKeyForDetectedSignal(largerCohortError)));

		const reach = keys(
			planCoveragePortfolioWithTrace(signals, {
				rankingStrategy: "reach",
				reason: "manual",
			}).selected
		);
		expect(reach).toHaveLength(6);
		expect(reach).toContain(signalKeyForDetectedSignal(largerCohortError));
		expect(reach).toContain(signalKeyForDetectedSignal(smallerCohortError));
		expect(
			reach.indexOf(signalKeyForDetectedSignal(largerCohortError))
		).toBeLessThan(reach.indexOf(signalKeyForDetectedSignal(smallerCohortError)));
	});

	it("allows a full diverse portfolio when every candidate is positive", () => {
		const candidates = [
			signal({
				metric: "error_count",
				subjectKey: "error:checkout",
			}),
			signal({
				baseline: 50,
				current: 100,
				deltaPercent: 100,
				direction: "up",
				metric: "custom_event_count",
				subjectKey: "custom_event:signup",
			}),
			signal({
				baseline: 50,
				current: 100,
				deltaPercent: 100,
				direction: "up",
				metric: "revenue",
			}),
		];

		expect(
			planCoveragePortfolio(candidates, { reason: "manual" })
		).toHaveLength(3);
	});

	it("returns the same portfolio order regardless of detector input order", () => {
		const candidates = [
			signal({ metric: "error_count", subjectKey: "error:checkout" }),
			signal({ metric: "goal:signup", subjectKey: "goal:signup" }),
			signal({ metric: "visitors" }),
		];

		expect(
			keys(planCoveragePortfolio(candidates, { reason: "manual" }))
		).toEqual(
			keys(planCoveragePortfolio([...candidates].reverse(), { reason: "manual" }))
		);
	});

	it("rotates a repeated scan to unseen signals instead of repeating the first portfolio", () => {
		const candidates = [
			signal({ metric: "error_count", subjectKey: "error:manifest" }),
			signal({
				baseline: 2000,
				current: 4000,
				direction: "up",
				entityId: "/billing",
				metric: "lcp",
				subjectKey: "route:lcp:/billing",
			}),
			signal({ metric: "goal:signup", subjectKey: "goal:signup" }),
			signal({ metric: "custom_event_count", subjectKey: "custom_event:share" }),
			signal({ metric: "pageviews" }),
			signal({
				baseline: 0,
				current: 0,
				deltaPercent: 0,
				direction: "up",
				metric: "measurement_coverage",
				subjectKey: "measurement:conversion-coverage",
			}),
		];
		const first = planCoveragePortfolio(candidates, { reason: "scheduled" });
		const observations = new Map(
			first.map((candidate) => {
				const prepared = prepareInvestigation(candidate, 7).signal;
				return [
					prepared.signalKey,
					{
						outcome: {
							evidence: ["The signal was investigated."],
							impact: null,
							next: { reason: "No immediate action.", type: "resolve" as const },
							rootCause: null,
							summary: "The signal was investigated.",
							title: "Investigated signal",
						},
						recheckAt: new Date("2026-08-08T00:00:00.000Z"),
						signal: prepared,
					},
				] as const;
			})
		);
		const eligible = eligibleSignalsForInvestigation(
			candidates,
			observations,
			new Date("2026-08-01T00:00:00.000Z")
		);
		const second = planCoveragePortfolio(candidates, {
			preferredSignalKeys: new Set(keys(eligible)),
			reason: "scheduled",
		});

		expect(first).toHaveLength(2);
		expect(second).toHaveLength(2);
		expect(keys(second).some((key) => keys(first).includes(key))).toBe(false);
	});

	it("fills a manual portfolio from cooling signals when every signal was seen", () => {
		const candidates = [
			signal({ metric: "error_count", subjectKey: "error:manifest" }),
			signal({ metric: "goal:signup", subjectKey: "goal:signup" }),
			signal({ metric: "pageviews" }),
		];

		const plan = planCoveragePortfolio(candidates, {
			preferredSignalKeys: new Set(),
			reason: "manual",
		});

		expect(plan).toHaveLength(3);
		expect(new Set(keys(plan))).toEqual(new Set(keys(candidates)));
	});

	it("keeps a due recheck first while preferring fresh signals over cooling work", () => {
		const due = signal({ metric: "visitors", subjectKey: "traffic:due" });
		const fresh = signal({
			metric: "goal:signup",
			subjectKey: "goal:signup",
		});
		const coolingError = signal({
			baseline: 20,
			current: 80,
			deltaPercent: 300,
			direction: "up",
			metric: "error_count",
			severity: "critical",
			subjectKey: "error:checkout",
		});

		const plan = planCoveragePortfolio([coolingError, fresh, due], {
			dueSignalKey: signalKeyForDetectedSignal(due),
			preferredSignalKeys: new Set([
				signalKeyForDetectedSignal(due),
				signalKeyForDetectedSignal(fresh),
			]),
			reason: "manual",
		});

		expect(keys(plan)).toEqual([
			signalKeyForDetectedSignal(due),
			signalKeyForDetectedSignal(fresh),
			signalKeyForDetectedSignal(coolingError),
		]);
	});
});
