import { describe, expect, it } from "bun:test";
import type { InvestigationOutcome } from "@databuddy/shared/insights";
import type { DetectedSignal } from "./detection";
import {
	prepareInvestigation,
	signalKeyForDetectedSignal,
} from "./investigation";
import {
	type LatestInsightObservation,
	eligibleSignalsForInvestigation,
	nextRecheckAt,
} from "./observations";

const NOW = new Date("2026-07-12T12:00:00.000Z");
const LATER = new Date("2026-08-12T12:00:00.000Z");

function detected(
	metric: string,
	overrides: Partial<DetectedSignal> = {}
): DetectedSignal {
	return {
		baseline: 100,
		current: 50,
		deltaPercent: -50,
		detectedAt: "2026-07-11",
		direction: "down",
		label: metric,
		method: "wow",
		metric,
		severity: "warning",
		...overrides,
	};
}

function observed(
	signal: DetectedSignal,
	recheckAt: Date = LATER
): LatestInsightObservation {
	return {
		asOf: NOW,
		evidence: [],
		outcome: {
			evidence: ["Signup conversion changed in the measured window."],
			impact: "Signup completion is affected.",
			impactConfidence: 0.8,
			next: {
				escalation: "Escalate if signup conversion falls another 10%.",
				type: "watch",
			},
			rootCause: null,
			rootCauseConfidence: 0.2,
			sources: ["web"],
			summary: "Signup conversion needs attention.",
			title: "Signup conversion changed",
		},
		recheckAt,
		signal: prepareInvestigation(signal, {
			lookbackDays: 7,
			websiteId: "site-1",
		}).signal,
	};
}

function memory(
	entries: [DetectedSignal, LatestInsightObservation][]
): Map<string, LatestInsightObservation> {
	return new Map(
		entries.map(([signal, observation]) => [
			signalKeyForDetectedSignal(signal),
			observation,
		])
	);
}

describe("eligibleSignalsForInvestigation", () => {
	it("returns every unseen signal in detection rank order", () => {
		const first = detected("goal:signup");
		const second = detected("goal:purchase");
		expect(
			eligibleSignalsForInvestigation([first, second], new Map(), NOW)
		).toEqual([first, second]);
	});

	it("rotates past a cooling signal to an unseen signal", () => {
		const first = detected("goal:signup");
		const second = detected("goal:purchase", { deltaPercent: -30 });
		expect(
			eligibleSignalsForInvestigation(
				[first, second],
				memory([[first, observed(first)]]),
				NOW
			)
		).toEqual([second]);
	});

	it("chooses unseen work before a higher-ranked due recheck", () => {
		const due = detected("goal:signup");
		const unseen = detected("goal:purchase", { deltaPercent: -30 });
		expect(
			eligibleSignalsForInvestigation(
				[due, unseen],
				memory([[due, observed(due, NOW)]]),
				NOW
			)
		).toEqual([unseen, due]);
	});

	it("defers when every unchanged signal is cooling down", () => {
		const first = detected("goal:signup");
		const second = detected("goal:purchase");
		expect(
			eligibleSignalsForInvestigation(
				[first, second],
				memory([
					[first, observed(first)],
					[second, observed(second)],
				]),
				NOW
			)
		).toEqual([]);
	});

	it("rechecks at the exact due boundary", () => {
		const first = detected("goal:signup");
		expect(
			eligibleSignalsForInvestigation(
				[first],
				memory([[first, observed(first, NOW)]]),
				NOW
			)
		).toEqual([first]);
	});

	it("keeps resolved signals closed until they materially worsen", () => {
		const resolvedSignal = detected("goal:signup", { deltaPercent: -40 });
		const resolution = observed(resolvedSignal, NOW);
		resolution.outcome = {
			...resolution.outcome,
			next: { reason: "The measured regression recovered.", type: "resolve" },
		};

		expect(
			eligibleSignalsForInvestigation(
				[resolvedSignal],
				memory([[resolvedSignal, resolution]]),
				NOW
			)
		).toEqual([]);

		const worsened = detected("goal:signup", { deltaPercent: -60 });
		expect(
			eligibleSignalsForInvestigation(
				[worsened],
				memory([[resolvedSignal, resolution]]),
				NOW
			)
		).toEqual([worsened]);
	});

	it("bypasses cooldown for a negative severity or 1.5x magnitude increase", () => {
		const baseline = detected("goal:signup", { deltaPercent: -40 });
		const severity = detected("goal:signup", {
			deltaPercent: -40,
			severity: "critical",
		});
		const magnitude = detected("goal:signup", { deltaPercent: -60 });
		const observations = memory([[baseline, observed(baseline)]]);

		expect(
			eligibleSignalsForInvestigation([severity], observations, NOW)
		).toEqual([severity]);
		expect(
			eligibleSignalsForInvestigation([magnitude], observations, NOW)
		).toEqual([magnitude]);
	});

	it("does not bypass for a 1.49x change or a larger improvement", () => {
		const baseline = detected("goal:signup", { deltaPercent: -40 });
		const almost = detected("goal:signup", { deltaPercent: -59.6 });
		const improved = detected("visitors", {
			current: 200,
			deltaPercent: 100,
			direction: "up",
			severity: "critical",
		});

		expect(
			eligibleSignalsForInvestigation(
				[almost],
				memory([[baseline, observed(baseline)]]),
				NOW
			)
		).toEqual([]);
		expect(
			eligibleSignalsForInvestigation(
				[improved],
				memory([[improved, observed(improved)]]),
				NOW
			)
		).toEqual([]);
	});

	it("immediately investigates a signal that flips from positive to negative", () => {
		const positive = detected("visitors", {
			current: 150,
			deltaPercent: 50,
			direction: "up",
		});
		const negative = detected("visitors", { deltaPercent: -20 });
		expect(
			eligibleSignalsForInvestigation(
				[negative],
				memory([[positive, observed(positive)]]),
				NOW
			)
		).toEqual([negative]);
	});

	it("keeps sibling and long signal keys independent", () => {
		const first = detected("goal:signup");
		const sibling = detected("goal:purchase");
		const longPrefix = "checkout_step_".repeat(20);
		const longFirst = detected(`goal:${longPrefix}a`, { label: "Checkout A" });
		const longSibling = detected(`goal:${longPrefix}b`, {
			label: "Checkout B",
		});

		expect(
			eligibleSignalsForInvestigation(
				[sibling],
				memory([[first, observed(first)]]),
				NOW
			)
		).toEqual([sibling]);
		expect(
			eligibleSignalsForInvestigation(
				[longFirst, longSibling],
				memory([[longFirst, observed(longFirst)]]),
				NOW
			)
		).toEqual([longSibling]);
	});

	it("keeps cooldown on the same goal after it is renamed", () => {
		const previous = detected("goal:signup", { entityLabel: "Signup" });
		const changed = detected("goal:signup", {
			entityLabel: "Create account",
		});

		expect(
			eligibleSignalsForInvestigation(
				[changed],
				memory([[previous, observed(previous)]]),
				NOW
			)
		).toEqual([]);
	});
});

describe("nextRecheckAt", () => {
	it("uses one comparison window for act/watch and 30 days otherwise", () => {
		const cases: [InvestigationOutcome["next"]["type"], string][] = [
			["act", "2026-07-19T12:00:00.000Z"],
			["watch", "2026-07-19T12:00:00.000Z"],
			["ask", "2026-08-11T12:00:00.000Z"],
			["resolve", "2026-08-11T12:00:00.000Z"],
		];
		for (const [next, expected] of cases) {
			expect(nextRecheckAt(NOW, next).toISOString()).toBe(expected);
		}
	});
});
