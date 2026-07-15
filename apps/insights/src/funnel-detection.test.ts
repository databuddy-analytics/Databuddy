import { describe, expect, it } from "bun:test";
import dayjs from "dayjs";
import type { DetectSignalsParams } from "./detection";
import {
	defaultFunnelGoalDeps,
	detectFunnelGoalSignals,
	type FunnelConversion,
	type FunnelDef,
	type FunnelGoalDeps,
	type GoalConversion,
	type GoalDef,
} from "./funnel-detection";
import { prepareInvestigation } from "./investigation";

const TODAY = dayjs("2026-05-29");

const PARAMS: DetectSignalsParams = {
	websiteId: "test-site",
	lookbackDays: 7,
	timezone: "UTC",
};

const FUNNEL: FunnelDef = {
	createdAt: new Date("2026-05-01T00:00:00.000Z"),
	id: "f1",
	name: "Checkout",
	steps: [
		{ name: "View", target: "/cart", type: "PAGE_VIEW" },
		{ name: "Buy", target: "purchase", type: "EVENT" },
	],
	filters: null,
	updatedAt: new Date("2026-05-01T00:00:00.000Z"),
};

const GOAL: GoalDef = {
	createdAt: new Date("2026-05-01T00:00:00.000Z"),
	id: "g1",
	name: "Signup",
	type: "EVENT",
	target: "sign_up",
	filters: null,
	updatedAt: new Date("2026-05-01T00:00:00.000Z"),
};

function funnelResult(
	rate: number,
	entrants: number,
	completions = Math.round((rate * entrants) / 100)
): FunnelConversion {
	return {
		completions,
		entrants,
		rate,
		steps: [
			{ stepNumber: 1, users: entrants },
			{ stepNumber: 2, users: completions },
		],
	};
}

function goalResult(
	rate: number,
	completions: number,
	entrants = 100
): GoalConversion {
	return { completions, entrants, rate };
}

function makeDeps(overrides: Partial<FunnelGoalDeps>): FunnelGoalDeps {
	return {
		fetchFunnels: async () => [],
		fetchGoals: async () => [],
		funnelConversion: async () => funnelResult(0, 0),
		goalConversion: async () => goalResult(0, 0, 0),
		...overrides,
	};
}

describe("detectFunnelGoalSignals", () => {
	it("uses the goal filters for both completions and the visitor denominator", async () => {
		const filters = [
			{ field: "country", operator: "equals" as const, value: "PS" },
		];
		const observed: unknown[] = [];
		const deps = defaultFunnelGoalDeps("test-site", TODAY.toDate(), {
			getTotalWebsiteUsers: async (
				_websiteId,
				_startDate,
				_endDate,
				denominatorFilters
			) => {
				observed.push(denominatorFilters);
				return 50;
			},
			processGoalAnalytics: async (
				_steps,
				completionFilters,
				_params,
				totalUsers
			) => {
				observed.push(completionFilters, totalUsers);
				return {
					overall_conversion_rate: 20,
					total_users_completed: 10,
					total_users_entered: 50,
				} as never;
			},
		});

		const result = await deps.goalConversion(
			{ ...GOAL, filters },
			{ from: "2026-05-22", to: "2026-05-28" }
		);

		expect(observed).toEqual([filters, filters, 50]);
		expect(result).toEqual({ completions: 10, entrants: 50, rate: 20 });
	});

	it("does not infer a definition completion from site-wide revenue", () => {
		const deps = defaultFunnelGoalDeps("test-site", TODAY.toDate(), {
			getTotalWebsiteUsers: async () => 0,
			processGoalAnalytics: async () => ({}) as never,
		});

		expect(deps.confirmCompletion).toBeUndefined();
	});

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
					? funnelResult(10, 100)
					: funnelResult(20, 120);
			},
		});

		const signals = await detectFunnelGoalSignals(PARAMS, TODAY, deps);

		expect(signals.length).toBe(1);
		const signal = signals[0];
		expect(signal.metric).toBe("funnel:f1");
		expect(signal.direction).toBe("down");
		expect(signal.deltaPercent).toBe(-50);
		expect(signal.method).toBe("wow");
		expect(signal.detectedAt).toBe("2026-05-28");
	});

	it("flags a funnel conversion rise above threshold", async () => {
		let call = 0;
		const deps = makeDeps({
			fetchFunnels: async () => [FUNNEL],
			funnelConversion: async () => {
				call += 1;
				return call === 1
					? funnelResult(20, 120)
					: funnelResult(10, 100);
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
					? funnelResult(18, 100)
					: funnelResult(20, 100);
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
					? funnelResult(10, 10)
					: funnelResult(40, 8);
			},
		});

		const signals = await detectFunnelGoalSignals(PARAMS, TODAY, deps);
		expect(signals.length).toBe(0);
	});

	it("ignores dramatic funnel deltas caused by only a few completions", async () => {
		let call = 0;
		const deps = makeDeps({
			fetchFunnels: async () => [FUNNEL],
			funnelConversion: async () => {
				call += 1;
				return call === 1
					? funnelResult(0, 18_245)
					: funnelResult(0.01, 19_516);
			},
		});

		const signals = await detectFunnelGoalSignals(PARAMS, TODAY, deps);
		expect(signals).toEqual([]);
	});

	it("flags a goal completion-rate drop above threshold", async () => {
		let call = 0;
		const deps = makeDeps({
			fetchGoals: async () => [GOAL],
			goalConversion: async () => {
				call += 1;
				return call === 1
					? goalResult(2.5, 50, 2000)
					: goalResult(5, 100, 2000);
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
					? goalResult(1, 3, 300)
					: goalResult(4, 2, 50);
			},
		});

		const signals = await detectFunnelGoalSignals(PARAMS, TODAY, deps);
		expect(signals.length).toBe(0);
	});

	it("ignores goal changes with too few current entrants", async () => {
		let call = 0;
		const signals = await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => [GOAL],
				goalConversion: async () => {
					call += 1;
					return call === 1
						? goalResult(0, 0, 16)
						: goalResult(20, 20, 100);
				},
			})
		);

		expect(signals).toEqual([]);
	});

	it("passes the correct week-over-week windows to the analytics deps", async () => {
		const ranges: Array<{ from: string; to: string }> = [];
		const deps = makeDeps({
			fetchFunnels: async () => [FUNNEL],
			funnelConversion: async (_funnel, range) => {
				ranges.push(range);
				return funnelResult(10, 100);
			},
		});

		await detectFunnelGoalSignals(PARAMS, TODAY, deps);

		expect(ranges).toContainEqual({ from: "2026-05-22", to: "2026-05-28" });
		expect(ranges).toContainEqual({ from: "2026-05-15", to: "2026-05-21" });
	});

	it("creates an exact action candidate when an event goal loses all completions", async () => {
		let call = 0;
		const signals = await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => [GOAL],
				goalConversion: async () => {
					call += 1;
					return call === 1
						? goalResult(0, 0, 100)
						: goalResult(20, 20, 100);
				},
			})
		);

		expect(signals).toHaveLength(1);
		expect(signals[0]).toMatchObject({
			definitionEvidence: {
				summary:
					'Signup had 0 completions from 100 eligible visitors. The active goal target is "sign_up".',
			},
			kind: "missing_expected_data",
			expectation: {
				eventName: "sign_up",
				previousCompletions: 20,
				currentEntrants: 100,
				currentCompletions: 0,
				kind: "tracking",
			},
		});
		expect(signals[0]?.definitionEvidence?.summary).not.toContain("2026-");
	});

	it("creates an action only from confirmation scoped to the exact funnel", async () => {
		let call = 0;
		const confirmationRequests: unknown[] = [];
		const signals = await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				confirmCompletion: async (request) => {
					confirmationRequests.push(request);
					return { count: 12, source: "revenue_transactions" };
				},
				fetchFunnels: async () => [FUNNEL],
				funnelConversion: async () => {
					call += 1;
					return call === 1
						? funnelResult(0, 100, 0)
						: funnelResult(20, 100, 20);
				},
			})
		);

		expect(signals[0]).toMatchObject({
			definitionEvidence: {
				summary:
					'Checkout had 0 completions from 100 entrants. The "purchase" event at Buy had 0 users, down from 20. Independent revenue tracking recorded 12 transactions for this funnel.',
			},
			kind: "missing_expected_data",
			expectation: {
				confirmation: {
					count: 12,
					definitionId: "f1",
					definitionType: "funnel",
					source: "revenue_transactions",
				},
				eventName: "purchase",
				stepName: "Buy",
			},
		});
		expect(signals[0]?.definitionEvidence?.metrics).toContainEqual({
			current: 0,
			format: "number",
			label: "Buy step users",
			previous: 20,
		});
		expect(signals[0]?.definitionEvidence?.metrics).toContainEqual({
			current: 12,
			format: "number",
			label: "Flow revenue transactions",
		});
		expect(confirmationRequests).toEqual([
			{
				definitionId: "f1",
				definitionType: "funnel",
				expectation: expect.objectContaining({ eventName: "purchase" }),
				range: { from: "2026-05-22", to: "2026-05-28" },
			},
		]);
		expect(signals[0]?.definitionEvidence?.summary).not.toContain("2026-");
	});

	it("leaves confirmation absent when its independent query fails", async () => {
		let call = 0;
		const [signal] = await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				confirmCompletion: async () => {
					throw new Error("Revenue query unavailable");
				},
				fetchFunnels: async () => [FUNNEL],
				funnelConversion: async () => {
					call += 1;
					return call === 1
						? funnelResult(0, 100, 0)
						: funnelResult(20, 100, 20);
				},
			})
		);

		expect(signal?.expectation?.confirmation).toBeUndefined();
	});

	it("keeps partial regressions as non-actionable changes", async () => {
		let call = 0;
		const signals = await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => [GOAL],
				goalConversion: async () => {
					call += 1;
					return call === 1
						? goalResult(1, 1, 100)
						: goalResult(20, 20, 100);
				},
			})
		);

		expect(signals[0]?.kind).toBeUndefined();
		expect(signals[0]?.expectation).toBeUndefined();
	});

	it("keeps the product name as the investigation entity", async () => {
		let call = 0;
		const [detected] = await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => [GOAL],
				goalConversion: async () => {
					call += 1;
					return call === 1
						? goalResult(0, 0, 100)
						: goalResult(20, 20, 100);
				},
			})
		);
		const investigation = prepareInvestigation(detected, {
			lookbackDays: 7,
			websiteId: PARAMS.websiteId,
		});
		expect(investigation.signal.entity.label).toBe("Signup");
	});

	it("does not create actions for page-view goals or recently edited definitions", async () => {
		const pageGoal = { ...GOAL, type: "PAGE_VIEW" as const, target: "/done" };
		const editedGoal = {
			...GOAL,
			id: "g2",
			updatedAt: new Date("2026-05-20T00:00:00.000Z"),
		};
		let call = 0;
		const signals = await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => [pageGoal, editedGoal],
				goalConversion: async () => {
					call += 1;
					return call % 2 === 1
						? goalResult(0, 0, 100)
						: goalResult(20, 20, 100);
				},
			})
		);

		expect(signals).toHaveLength(1);
		expect(signals[0]?.kind).toBeUndefined();
	});

	it("evaluates definitions beyond the old ten-item cap", async () => {
		const goals = Array.from({ length: 11 }, (_, index) => ({
			...GOAL,
			id: `goal-${index + 1}`,
		}));
		const calls = new Map<string, number>();
		const signals = await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => goals,
				goalConversion: async (goal) => {
					const call = (calls.get(goal.id) ?? 0) + 1;
					calls.set(goal.id, call);
					return goal.id === "goal-11" && call === 1
						? goalResult(0, 0, 100)
						: goalResult(20, 20, 100);
				},
			})
		);

		expect(signals.map((signal) => signal.metric)).toContain("goal:goal-11");
	});

	it("isolates one failed definition and keeps a valid sibling", async () => {
		const failedGoal = { ...GOAL, id: "failed-goal" };
		const validGoal = { ...GOAL, id: "valid-goal", name: "Purchase" };
		const diagnostics = { failedDefinitions: 0 };
		const calls = new Map<string, number>();
		const signals = await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => [failedGoal, validGoal],
				goalConversion: async (goal) => {
					if (goal.id === failedGoal.id) {
						throw new Error("goal analytics unavailable");
					}
					const call = (calls.get(goal.id) ?? 0) + 1;
					calls.set(goal.id, call);
					return call === 1
						? goalResult(0, 0, 100)
						: goalResult(20, 20, 100);
				},
			}),
			{ diagnostics }
		);

		expect(signals).toHaveLength(1);
		expect(signals[0]?.metric).toBe("goal:valid-goal");
		expect(diagnostics.failedDefinitions).toBe(1);
	});

	it("keeps AbortError fatal and stops scheduling more definitions", async () => {
		const goals = Array.from({ length: 20 }, (_, index) => ({
			...GOAL,
			id: `goal-${index}`,
		}));
		const abortError = new Error("goal analytics aborted");
		abortError.name = "AbortError";
		let calls = 0;

		await expect(
			detectFunnelGoalSignals(
				PARAMS,
				TODAY,
				makeDeps({
					fetchGoals: async () => goals,
					goalConversion: async () => {
						calls += 1;
						throw abortError;
					},
				})
			)
		).rejects.toThrow("goal analytics aborted");
		expect(calls).toBeLessThanOrEqual(8);
	});

	it("aborts sibling workers when one definition fails fatally", async () => {
		const goals = Array.from({ length: 20 }, (_, index) => ({
			...GOAL,
			id: `goal-${index}`,
		}));
		const abortError = new Error("goal analytics aborted");
		abortError.name = "AbortError";
		let calls = 0;
		let release: (() => void) | undefined;
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});

		const detection = detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => goals,
				goalConversion: async (goal) => {
					calls += 1;
					if (goal.id === "goal-0") {
						throw abortError;
					}
					await blocked;
					return goalResult(20, 20, 100);
				},
			})
		);

		await expect(detection).rejects.toThrow("goal analytics aborted");
		const callsAtFailure = calls;
		release?.();
		await Bun.sleep(0);
		expect(calls).toBe(callsAtFailure);
	});

	it("stops scheduling definition queries when the detection budget expires", async () => {
		const definitions = Array.from({ length: 30 }, (_, index) => ({
			...GOAL,
			id: `goal-${index}`,
		}));
		let calls = 0;
		let release: (() => void) | undefined;
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		const detection = detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => definitions,
				goalConversion: async () => {
					calls += 1;
					await blocked;
					return goalResult(20, 20, 100);
				},
			}),
			{ timeoutMs: 5 }
		);

		await expect(detection).rejects.toThrow("detection exceeded 5ms");
		expect(calls).toBeLessThanOrEqual(8);
		release?.();
	});
});
