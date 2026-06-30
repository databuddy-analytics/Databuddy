import { describe, expect, it } from "bun:test";
import type { DetectedSignal } from "./detection";
import { computeResolutions, type OpenInsightRow } from "./resolution";

const NOW = new Date("2026-05-31T12:00:00.000Z");

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
				}),
			],
		});
		expect(decisions).toEqual([]);
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

	it("never recovers transient insights when canRecover is false", () => {
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
