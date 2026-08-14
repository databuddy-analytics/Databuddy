import { describe, expect, it } from "bun:test";
import type { DetectedSignal } from "./detection";
import { planCoveragePortfolio } from "./coverage-planner";
import { signalKeyForDetectedSignal } from "./investigation";

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
	it("caps manual runs at five signals and scheduled runs at two", () => {
		const candidates = [
			signal({ metric: "error_count", subjectKey: "error:checkout" }),
			signal({ metric: "goal:signup", subjectKey: "goal:signup" }),
			signal({ metric: "visitors" }),
			signal({ metric: "bounce_rate", direction: "up" }),
			signal({ metric: "revenue" }),
			signal({ metric: "custom_event_count", subjectKey: "event:share" }),
		];

		expect(
			planCoveragePortfolio(candidates, { reason: "manual" })
		).toHaveLength(5);
		expect(
			planCoveragePortfolio(candidates, { reason: "scheduled" })
		).toHaveLength(2);
	});

	it("uses a manual full scan for family breadth before repeated reliability work", () => {
		const reliabilitySignals = ["checkout", "search", "billing", "account", "docs"].map(
			(subject) =>
				signal({
					baseline: 50,
					current: 100,
					deltaPercent: 100,
					direction: "up",
					metric: "error_count",
					severity: "critical",
					subjectKey: `error:${subject}`,
				})
		);
		const revenue = signal({
			baseline: 100,
			current: 25,
			deltaPercent: -75,
			direction: "down",
			metric: "revenue",
		});

		const manual = planCoveragePortfolio([...reliabilitySignals, revenue], {
			reason: "manual",
		});
		const scheduled = planCoveragePortfolio([...reliabilitySignals, revenue], {
			reason: "scheduled",
		});

		expect(manual).toHaveLength(5);
		expect(manual).toContain(revenue);
		expect(manual.filter((item) => item.metric === "error_count")).toHaveLength(
			4
		);
		expect(scheduled).toHaveLength(2);
		expect(scheduled).not.toContain(revenue);
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

	it("suppresses duplicate and correlated signals", () => {
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
			signalKeyForDetectedSignal(visitors),
			signalKeyForDetectedSignal(goal),
		]);
		expect(plan.filter((item) => item.metric === "error_count")).toHaveLength(1);
		expect(
			plan.filter((item) => ["visitors", "sessions", "pageviews"].includes(item.metric))
		).toHaveLength(1);
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
