import { describe, expect, it } from "bun:test";
import type { DetectedSignal } from "./detection";
import {
	coveragePortfolioLimit,
	planCoveragePortfolio,
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
	it("caps manual runs at three signals and scheduled runs at two", () => {
		const candidates = [
			signal({ metric: "error_count", subjectKey: "error:checkout" }),
			signal({ metric: "goal:signup", subjectKey: "goal:signup" }),
			signal({ metric: "visitors" }),
			signal({ metric: "bounce_rate", direction: "up" }),
		];

		expect(coveragePortfolioLimit("manual")).toBe(3);
		expect(coveragePortfolioLimit("scheduled")).toBe(2);
		expect(
			planCoveragePortfolio(candidates, { reason: "manual" })
		).toHaveLength(3);
		expect(
			planCoveragePortfolio(candidates, { reason: "scheduled" })
		).toHaveLength(2);
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
		).toHaveLength(1);
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
		const first = planCoveragePortfolio(candidates, { reason: "manual" });
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
		const second = planCoveragePortfolio(
			eligibleSignalsForInvestigation(
				candidates,
				observations,
				new Date("2026-08-01T00:00:00.000Z")
			),
			{ reason: "manual" }
		);

		expect(first).toHaveLength(3);
		expect(second).toHaveLength(3);
		expect(keys(second).some((key) => keys(first).includes(key))).toBe(false);
	});
});
