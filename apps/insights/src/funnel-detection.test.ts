import { describe, expect, it } from "bun:test";
import dayjs from "dayjs";
import type { DetectSignalsParams } from "./detection";
import {
	detectFunnelGoalSignals,
	type FunnelDef,
	type FunnelGoalDeps,
	type GoalDef,
} from "./funnel-detection";

const TODAY = dayjs("2026-05-29");

const PARAMS: DetectSignalsParams = {
	websiteId: "test-site",
	lookbackDays: 7,
	timezone: "UTC",
};

const FUNNEL: FunnelDef = {
	id: "f1",
	name: "Checkout",
	steps: [
		{ name: "View", target: "/cart", type: "PAGE_VIEW" },
		{ name: "Buy", target: "purchase", type: "EVENT" },
	],
	filters: null,
};

const GOAL: GoalDef = {
	id: "g1",
	name: "Signup",
	type: "EVENT",
	target: "sign_up",
	filters: null,
};

function makeDeps(overrides: Partial<FunnelGoalDeps>): FunnelGoalDeps {
	return {
		fetchFunnels: async () => [],
		fetchGoals: async () => [],
		funnelConversion: async () => ({ rate: 0, entrants: 0 }),
		goalConversion: async () => ({ rate: 0, completions: 0 }),
		...overrides,
	};
}

describe("detectFunnelGoalSignals", () => {
	it("returns empty when nothing is configured", async () => {
		const signals = await detectFunnelGoalSignals(PARAMS, TODAY, makeDeps({}));
		expect(signals).toEqual([]);
	});

	it("flags a funnel conversion drop above threshold", async () => {
		let call = 0;
		const deps = makeDeps({
			fetchFunnels: async () => [FUNNEL],
			funnelConversion: async () => {
				call += 1;
				return call === 1
					? { rate: 10, entrants: 100 }
					: { rate: 20, entrants: 120 };
			},
		});

		const signals = await detectFunnelGoalSignals(PARAMS, TODAY, deps);

		expect(signals.length).toBe(1);
		const signal = signals[0];
		expect(signal.metric).toBe("funnel:f1");
		expect(signal.direction).toBe("down");
		expect(signal.deltaPercent).toBe(-50);
		expect(signal.method).toBe("wow");
		expect(signal.detectedAt).toBe("2026-05-29");
	});

	it("flags a funnel conversion rise above threshold", async () => {
		let call = 0;
		const deps = makeDeps({
			fetchFunnels: async () => [FUNNEL],
			funnelConversion: async () => {
				call += 1;
				return call === 1
					? { rate: 20, entrants: 120 }
					: { rate: 10, entrants: 100 };
			},
		});

		const signals = await detectFunnelGoalSignals(PARAMS, TODAY, deps);

		expect(signals.length).toBe(1);
		expect(signals[0].direction).toBe("up");
		expect(signals[0].deltaPercent).toBe(100);
	});

	it("ignores funnel changes below threshold", async () => {
		let call = 0;
		const deps = makeDeps({
			fetchFunnels: async () => [FUNNEL],
			funnelConversion: async () => {
				call += 1;
				return call === 1
					? { rate: 18, entrants: 100 }
					: { rate: 20, entrants: 100 };
			},
		});

		const signals = await detectFunnelGoalSignals(PARAMS, TODAY, deps);
		expect(signals.length).toBe(0);
	});

	it("ignores funnels with too few entrants", async () => {
		let call = 0;
		const deps = makeDeps({
			fetchFunnels: async () => [FUNNEL],
			funnelConversion: async () => {
				call += 1;
				return call === 1
					? { rate: 10, entrants: 10 }
					: { rate: 40, entrants: 8 };
			},
		});

		const signals = await detectFunnelGoalSignals(PARAMS, TODAY, deps);
		expect(signals.length).toBe(0);
	});

	it("flags a goal completion-rate drop above threshold", async () => {
		let call = 0;
		const deps = makeDeps({
			fetchGoals: async () => [GOAL],
			goalConversion: async () => {
				call += 1;
				return call === 1
					? { rate: 2.5, completions: 50 }
					: { rate: 5, completions: 100 };
			},
		});

		const signals = await detectFunnelGoalSignals(PARAMS, TODAY, deps);

		expect(signals.length).toBe(1);
		expect(signals[0].metric).toBe("goal:g1");
		expect(signals[0].direction).toBe("down");
		expect(signals[0].deltaPercent).toBe(-50);
	});

	it("ignores goals with too few completions", async () => {
		let call = 0;
		const deps = makeDeps({
			fetchGoals: async () => [GOAL],
			goalConversion: async () => {
				call += 1;
				return call === 1
					? { rate: 1, completions: 3 }
					: { rate: 4, completions: 2 };
			},
		});

		const signals = await detectFunnelGoalSignals(PARAMS, TODAY, deps);
		expect(signals.length).toBe(0);
	});

	it("passes the correct week-over-week windows to the analytics deps", async () => {
		const ranges: Array<{ from: string; to: string }> = [];
		const deps = makeDeps({
			fetchFunnels: async () => [FUNNEL],
			funnelConversion: async (_funnel, range) => {
				ranges.push(range);
				return { rate: 10, entrants: 100 };
			},
		});

		await detectFunnelGoalSignals(PARAMS, TODAY, deps);

		expect(ranges).toContainEqual({ from: "2026-05-23", to: "2026-05-29" });
		expect(ranges).toContainEqual({ from: "2026-05-16", to: "2026-05-22" });
	});
});
