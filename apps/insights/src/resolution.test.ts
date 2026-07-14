import { describe, expect, it } from "bun:test";
import type { DetectedSignal } from "./detection";
import { signalKeyForMetric } from "./investigation";
import {
	computeResolutions,
	type OpenInsightRow,
	retiredSignalKeyForOutcome,
} from "./resolution";

const NOW = new Date("2026-05-31T12:00:00.000Z");

describe("retiredSignalKeyForOutcome", () => {
	it("retires an old finding only when the new decision is intentionally silent", () => {
		expect(
			retiredSignalKeyForOutcome({
				disposition: "monitor",
				hasInsight: false,
				signalKey: "goal:signup",
			})
		).toBe("goal:signup");
		expect(
			retiredSignalKeyForOutcome({
				disposition: "not_a_problem",
				hasInsight: false,
				signalKey: "goal:signup",
			})
		).toBe("goal:signup");
	});

	it("keeps a surfaced unresolved monitor open", () => {
		expect(
			retiredSignalKeyForOutcome({
				disposition: "monitor",
				hasInsight: true,
				signalKey: "error_count",
			})
		).toBeUndefined();
	});
});

function signal(metric: string, direction: "up" | "down"): DetectedSignal {
	return {
		baseline: 100,
		current: direction === "up" ? 200 : 50,
		deltaPercent: direction === "up" ? 100 : -50,
		detectedAt: "2026-05-31",
		direction,
		label: metric,
		method: "wow",
		metric,
		severity: "warning",
	};
}

function openInsight(
	overrides: Partial<OpenInsightRow> & Pick<OpenInsightRow, "id" | "type">
): OpenInsightRow {
	return {
		changePercent: null,
		createdAt: NOW,
		sentiment: "neutral",
		subjectKey: "",
		...overrides,
	};
}

describe("computeResolutions", () => {
	it("resolves a transient insight as recovered when its signal family stops firing", () => {
		const decisions = computeResolutions({
			canRecover: true,
			detectedSignals: [],
			now: NOW,
			openInsights: [
				openInsight({
					id: "i1",
					type: "traffic_drop",
					changePercent: -42,
					sentiment: "negative",
				}),
			],
		});
		expect(decisions).toEqual([{ id: "i1", reason: "recovered" }]);
	});

	it("keeps a transient insight open when its signal still fires", () => {
		const decisions = computeResolutions({
			canRecover: true,
			detectedSignals: [signal("visitors", "down")],
			now: NOW,
			openInsights: [
				openInsight({
					id: "i1",
					type: "traffic_drop",
					changePercent: -42,
					sentiment: "negative",
					subjectKey: "visitors",
				}),
			],
		});
		expect(decisions).toEqual([]);
	});

	it("retires only the exact open action replaced by a silent decision", () => {
		const decisions = computeResolutions({
			canRecover: true,
			detectedSignals: [
				signal("goal:signup", "down"),
				signal("goal:purchase", "down"),
			],
			now: NOW,
			openInsights: [
				openInsight({
					id: "signup",
					type: "conversion_leak",
					changePercent: -42,
					sentiment: "negative",
					subjectKey: "goal:signup",
				}),
				openInsight({
					id: "purchase",
					type: "conversion_leak",
					changePercent: -42,
					sentiment: "negative",
					subjectKey: "goal:purchase",
				}),
			],
			retiredSignalKey: "goal:signup",
		});

		expect(decisions).toEqual([{ id: "signup", reason: "stale" }]);
	});

	it("retires an exact sustained action replaced by a silent decision", () => {
		const decisions = computeResolutions({
			canRecover: true,
			detectedSignals: [signal("revenue", "down")],
			now: NOW,
			openInsights: [
				openInsight({
					id: "revenue",
					type: "quality_shift",
					changePercent: -42,
					sentiment: "negative",
					subjectKey: "revenue",
				}),
			],
			retiredSignalKey: "revenue",
		});

		expect(decisions).toEqual([{ id: "revenue", reason: "stale" }]);
	});

	it("resolves exact traffic and vital siblings independently", () => {
		const decisions = computeResolutions({
			canRecover: true,
			detectedSignals: [
				signal("sessions", "down"),
				signal("inp", "up"),
			],
			now: NOW,
			openInsights: [
				openInsight({
					id: "traffic",
					type: "traffic_drop",
					changePercent: -42,
					sentiment: "negative",
					subjectKey: "visitors",
				}),
				openInsight({
					id: "vital",
					type: "vitals_degraded",
					changePercent: 42,
					sentiment: "negative",
					subjectKey: "lcp",
				}),
			],
		});

		expect(decisions).toEqual([
			{ id: "traffic", reason: "recovered" },
			{ id: "vital", reason: "recovered" },
		]);
	});

	it("resolves an exact goal when only a sibling conversion fires", () => {
		const decisions = computeResolutions({
			canRecover: true,
			detectedSignals: [signal("goal:purchase", "down")],
			now: NOW,
			openInsights: [
				openInsight({
					id: "i1",
					type: "conversion_leak",
					changePercent: -30,
					sentiment: "negative",
					subjectKey: "goal:signup",
				}),
			],
		});

		expect(decisions).toEqual([{ id: "i1", reason: "recovered" }]);
	});

	it("resolves an exact subject when only the opposite direction fires", () => {
		const decisions = computeResolutions({
			canRecover: true,
			detectedSignals: [signal("visitors", "up")],
			now: NOW,
			openInsights: [
				openInsight({
					id: "i1",
					type: "traffic_drop",
					changePercent: -30,
					sentiment: "negative",
					subjectKey: "visitors",
				}),
			],
		});

		expect(decisions).toEqual([{ id: "i1", reason: "recovered" }]);
	});

	it("keeps bounded long keys exact", () => {
		const prefix = "checkout_step_".repeat(20);
		const active = signalKeyForMetric(`goal:${prefix}a`);
		const sibling = signalKeyForMetric(`goal:${prefix}b`);
		const decisions = computeResolutions({
			canRecover: true,
			detectedSignals: [signal(`goal:${prefix}a`, "down")],
			now: NOW,
			openInsights: [
				openInsight({
					id: "active",
					type: "conversion_leak",
					changePercent: -30,
					sentiment: "negative",
					subjectKey: active,
				}),
				openInsight({
					id: "sibling",
					type: "conversion_leak",
					changePercent: -30,
					sentiment: "negative",
					subjectKey: sibling,
				}),
			],
		});

		expect(decisions).toEqual([{ id: "sibling", reason: "recovered" }]);
	});

	it("resolves a drop when only the opposite direction is detected", () => {
		const decisions = computeResolutions({
			canRecover: true,
			detectedSignals: [signal("visitors", "up")],
			now: NOW,
			openInsights: [
				openInsight({
					id: "i1",
					type: "traffic_drop",
					changePercent: -42,
					sentiment: "negative",
				}),
			],
		});
		expect(decisions).toEqual([{ id: "i1", reason: "recovered" }]);
	});

	it("keeps exact open findings when a detector scan is incomplete", () => {
		const decisions = computeResolutions({
			canRecover: false,
			detectedSignals: [],
			now: NOW,
			openInsights: [
				openInsight({
					id: "i1",
					type: "error_spike",
					changePercent: 80,
					sentiment: "negative",
				}),
				openInsight({
					id: "goal-signup",
					type: "conversion_leak",
					changePercent: -100,
					sentiment: "negative",
					subjectKey: "goal:signup",
				}),
			],
		});
		expect(decisions).toEqual([]);
	});

	it("matches legacy null-change regressions without guessing direction", () => {
		const decisions = computeResolutions({
			canRecover: true,
			detectedSignals: [
				signal("error_count", "up"),
				signal("lcp", "up"),
				signal("bounce_rate", "up"),
			],
			now: NOW,
			openInsights: [
				openInsight({
					id: "error",
					type: "error_spike",
					sentiment: "negative",
					subjectKey: "error_count",
				}),
				openInsight({
					id: "vital",
					type: "vitals_degraded",
					sentiment: "negative",
					subjectKey: "lcp",
				}),
				openInsight({
					id: "bounce",
					type: "bounce_rate_change",
					sentiment: "negative",
					subjectKey: "bounce_rate",
				}),
			],
		});

		expect(decisions).toEqual([]);
	});

	it("maps custom_event signals to the custom_event family", () => {
		const stillFiring = computeResolutions({
			canRecover: true,
			detectedSignals: [signal("custom_event:signup", "up")],
			now: NOW,
			openInsights: [
				openInsight({
					id: "i1",
					type: "custom_event_spike",
					changePercent: 60,
					sentiment: "positive",
				}),
			],
		});
		expect(stillFiring).toEqual([]);
	});

	it("maps funnel and goal signals to the conversion family", () => {
		const decisions = computeResolutions({
			canRecover: true,
			detectedSignals: [signal("funnel:abc", "down")],
			now: NOW,
			openInsights: [
				openInsight({
					id: "i1",
					type: "conversion_leak",
					changePercent: -30,
					sentiment: "negative",
				}),
			],
		});
		expect(decisions).toEqual([]);
	});

	it("resolves agent-only insights as stale after the TTL", () => {
		const old = new Date(NOW.getTime() - 80 * 60 * 60 * 1000);
		const decisions = computeResolutions({
			canRecover: true,
			detectedSignals: [],
			now: NOW,
			openInsights: [
				openInsight({ id: "i1", type: "referrer_change", createdAt: old }),
			],
		});
		expect(decisions).toEqual([{ id: "i1", reason: "stale" }]);
	});

	it("keeps agent-only insights within the TTL", () => {
		const recent = new Date(NOW.getTime() - 10 * 60 * 60 * 1000);
		const decisions = computeResolutions({
			canRecover: true,
			detectedSignals: [],
			now: NOW,
			openInsights: [
				openInsight({ id: "i1", type: "referrer_change", createdAt: recent }),
			],
		});
		expect(decisions).toEqual([]);
	});

	it("treats sustained types as stale-only, never recovered", () => {
		const recent = new Date(NOW.getTime() - 10 * 60 * 60 * 1000);
		const decisions = computeResolutions({
			canRecover: true,
			detectedSignals: [],
			now: NOW,
			openInsights: [
				openInsight({
					id: "i1",
					type: "persistent_error_hotspot",
					changePercent: 50,
					sentiment: "negative",
					createdAt: recent,
				}),
			],
		});
		expect(decisions).toEqual([]);
	});
});
