import { describe, expect, it } from "bun:test";
import dayjs from "dayjs";
import type { DetectSignalsParams } from "./detection";
import {
	type ConversionResult,
	defaultFunnelGoalDeps,
	detectFunnelGoalSignals,
	type FunnelDef,
	type FunnelGoalDeps,
	type GoalDef,
	remeasureFunnelGoalSignal,
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
	description: "A visitor completes checkout.",
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
	description: "A visitor creates an account.",
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
	completions = Math.round((rate * entrants) / 100),
	stepRates = [100, rate]
): ConversionResult {
	return {
		completions,
		entrants,
		rate,
		steps: stepRates.map((stepRate, index) => ({
			name: FUNNEL.steps[index]?.name ?? `Step ${index + 1}`,
			number: index + 1,
			rate: stepRate,
		})),
	};
}

function goalResult(
	rate: number,
	completions: number,
	entrants = 100
): ConversionResult {
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

	it("returns empty when nothing is configured", async () => {
		const signals = await detectFunnelGoalSignals(PARAMS, TODAY, makeDeps({}));
		expect(signals).toEqual([]);
	});

	it("remeasures the same goal below the detector threshold", async () => {
		const prior = prepareInvestigation(
			{
				baseline: 30,
				current: 10,
				deltaPercent: -66.67,
				detectedAt: "2026-05-21",
				direction: "down",
				label: 'Goal "Signup" completion rate',
				method: "wow",
				metric: "goal:g1",
				severity: "critical",
			},
			7
		).signal;
		let call = 0;
		const current = await remeasureFunnelGoalSignal(
			PARAMS,
			prior,
			TODAY,
			makeDeps({
				fetchGoals: async () => [GOAL],
				goalConversion: async () => {
					call += 1;
					return call === 1 ? goalResult(21, 21) : goalResult(20, 20);
				},
			})
		);

		expect(current).toMatchObject({
			current: 21,
			baseline: 20,
			deltaPercent: 5,
			direction: "up",
			metric: "goal:g1",
			subjectKey: prior.signalKey,
		});
	});

	it("keeps a missing goal measurable as configuration evidence", async () => {
		const prior = prepareInvestigation(
			{
				baseline: 30,
				current: 10,
				deltaPercent: -66.67,
				detectedAt: "2026-05-21",
				direction: "down",
				entityLabel: "Signup",
				label: 'Goal "Signup" completion rate',
				method: "wow",
				metric: "goal:g1",
				severity: "critical",
			},
			7
		).signal;
		let includeInactive = false;
		const current = await remeasureFunnelGoalSignal(
			PARAMS,
			prior,
			TODAY,
			makeDeps({
				fetchGoals: async (include) => {
					includeInactive = include === true;
					return [];
				},
			})
		);

		expect(includeInactive).toBe(true);
		expect(current).toMatchObject({
			current: 10,
			baseline: 30,
			detectedAt: "2026-05-21",
			metric: "goal:g1",
			subjectKey: prior.signalKey,
		});
		expect(current?.definitionEvidence).toContain(
			"is no longer present in the website configuration"
		);
	});

	it("remeasures disabled and deleted goals with their current state", async () => {
		const prior = prepareInvestigation(
			{
				baseline: 30,
				current: 10,
				deltaPercent: -66.67,
				detectedAt: "2026-05-21",
				direction: "down",
				label: 'Goal "Signup" completion rate',
				method: "wow",
				metric: "goal:g1",
				severity: "critical",
			},
			7
		).signal;
		for (const [goal, state] of [
			[{ ...GOAL, isActive: false }, "is disabled"],
			[
				{ ...GOAL, deletedAt: new Date("2026-05-28T12:00:00.000Z") },
				"was deleted",
			],
		] as const) {
			let call = 0;
			const current = await remeasureFunnelGoalSignal(
				PARAMS,
				prior,
				TODAY,
				makeDeps({
					fetchGoals: async () => [goal],
					goalConversion: async () => {
						call += 1;
						return call === 1 ? goalResult(21, 21) : goalResult(20, 20);
					},
				})
			);

			expect(current).toMatchObject({ current: 21, baseline: 20 });
			expect(current?.definitionEvidence).toContain(state);
		}
	});

	it("keeps a removed funnel step measurable as configuration evidence", async () => {
		const prior = prepareInvestigation(
			{
				baseline: 40,
				current: 20,
				deltaPercent: -50,
				detectedAt: "2026-05-21",
				direction: "down",
				entityLabel: "Checkout → Buy",
				label: 'Funnel "Checkout" step "Buy" conversion',
				method: "wow",
				metric: "funnel:f1",
				severity: "warning",
				subjectKey: "funnel:f1:step:2",
			},
			7
		).signal;
		const funnel = { ...FUNNEL, steps: FUNNEL.steps.slice(0, 1) };
		let conversions = 0;
		const current = await remeasureFunnelGoalSignal(
			PARAMS,
			prior,
			TODAY,
			makeDeps({
				fetchFunnels: async () => [funnel],
				funnelConversion: async () => {
					conversions += 1;
					return funnelResult(100, 100, 100, [100]);
				},
			})
		);

		expect(conversions).toBe(0);
		expect(current).toMatchObject({
			current: 20,
			baseline: 40,
			detectedAt: "2026-05-21",
			metric: "funnel:f1",
			subjectKey: prior.signalKey,
		});
		expect(current?.definitionEvidence).toContain("no longer contains");
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
		expect(signal).toMatchObject({
			metric: "funnel:f1",
			subjectKey: "funnel:f1:step:2",
			entityLabel: "Checkout → Buy",
		});
		expect(signal.direction).toBe("down");
		expect(signal.deltaPercent).toBe(-50);
		expect(signal.method).toBe("wow");
		expect(signal.detectedAt).toBe("2026-05-28");
		expect(signal.definitionEvidence).toContain(FUNNEL.description);
		const investigation = prepareInvestigation(signal, 7).signal;
		expect(investigation.entity).toEqual({
			type: "funnel_step",
			id: "f1:step:2",
			label: "Checkout → Buy",
		});
		expect(investigation.signalKey).toBe("funnel:f1:step:2");
	});

	for (const { name, current, previous, expected } of [
		{
			name: "flags a funnel conversion rise above threshold",
			current: funnelResult(20, 120),
			previous: funnelResult(10, 100),
			expected: { direction: "up", deltaPercent: 100 },
		},
		{
			name: "ignores funnel changes below threshold",
			current: funnelResult(18, 100),
			previous: funnelResult(20, 100),
			expected: undefined,
		},
		{
			name: "ignores funnels with too few entrants",
			current: funnelResult(10, 10),
			previous: funnelResult(40, 8),
			expected: undefined,
		},
		{
			name: "ignores low-volume funnel completions without a zero-completion state",
			current: funnelResult(0.01, 18_245, 1),
			previous: funnelResult(0.01, 19_516, 2),
			expected: undefined,
		},
	] as const) {
		it(name, async () => {
			let call = 0;
			const signals = await detectFunnelGoalSignals(
				PARAMS,
				TODAY,
				makeDeps({
					fetchFunnels: async () => [FUNNEL],
					funnelConversion: async () => {
						call += 1;
						return call === 1 ? current : previous;
					},
				})
			);

			if (expected) {
				expect(signals).toHaveLength(1);
				expect(signals[0]).toMatchObject(expected);
			} else {
				expect(signals).toEqual([]);
			}
		});
	}

	it("flags a goal completion-rate drop above threshold", async () => {
		let call = 0;
		const filteredGoal: GoalDef = {
			...GOAL,
			filters: [{ field: "plan", operator: "equals", value: "pro" }],
		};
		const deps = makeDeps({
			fetchGoals: async () => [filteredGoal],
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
		expect(signals[0].definitionEvidence).toContain(GOAL.description);
		expect(signals[0].definitionEvidence).toContain(GOAL.type);
		expect(signals[0].definitionEvidence).toContain(GOAL.target);
		expect(signals[0].definitionEvidence).toContain(
			"Filter setup: plan equals (1 value)."
		);
		expect(signals[0].definitionEvidence).not.toContain("pro");
	});

	for (const { name, current, previous } of [
		{
			name: "ignores goals with too few completions",
			current: goalResult(1, 3, 300),
			previous: goalResult(4, 2, 50),
		},
		{
			name: "ignores goal changes with too few current entrants",
			current: goalResult(0, 0, 16),
			previous: goalResult(20, 20, 100),
		},
	] as const) {
		it(name, async () => {
			let call = 0;
			const signals = await detectFunnelGoalSignals(
				PARAMS,
				TODAY,
				makeDeps({
					fetchGoals: async () => [GOAL],
					goalConversion: async () => {
						call += 1;
						return call === 1 ? current : previous;
					},
				})
			);

			expect(signals).toEqual([]);
		});
	}

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

	it("reports an event goal that loses all completions", async () => {
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
		expect(signals[0]?.definitionEvidence).toContain(
			"completed for 0 of 100 observed website visitors"
		);
		const investigation = prepareInvestigation(signals[0], 7);
		expect(investigation.evidence[0]).toBe(signals[0]?.definitionEvidence);
		expect(signals[0]?.subjectKey).toBeUndefined();
	});

	it("reports a persistent zero-completion goal with its own stable subject", async () => {
		let call = 0;
		const [signal] = await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => [GOAL],
				goalConversion: async () => {
					call += 1;
					return call === 1
						? goalResult(0, 0, 100)
						: goalResult(0, 0, 120);
				},
			})
		);

		expect(signal).toMatchObject({
			current: 0,
			baseline: 0,
			direction: "down",
			metric: "goal:g1",
			severity: "warning",
			subjectKey: "goal:g1:zero-completions",
		});
		expect(signal?.definitionEvidence).toContain(
			"completed for 0 of 100 observed website visitors, compared with 0 of 120 previously"
		);
		const investigation = prepareInvestigation(signal, 7).signal;
		expect(investigation).toMatchObject({
			entity: { id: "g1", type: "goal" },
			signalKey: "goal:g1:zero-completions",
			sentiment: "negative",
		});
	});

	it("reports zero current goal completions below the usual WoW completion floor", async () => {
		let call = 0;
		const [signal] = await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => [GOAL],
				goalConversion: async () => {
					call += 1;
					return call === 1
						? goalResult(0, 0, 100)
						: goalResult(1.67, 2, 120);
				},
			})
		);

		expect(signal).toMatchObject({
			baseline: 1.67,
			current: 0,
			direction: "down",
			subjectKey: "goal:g1:zero-completions",
		});
	});

	it("reports a persistent zero-completion funnel with its own stable subject", async () => {
		let call = 0;
		const [signal] = await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchFunnels: async () => [FUNNEL],
				funnelConversion: async () => {
					call += 1;
					return call === 1
						? funnelResult(0, 100, 0)
						: funnelResult(0, 120, 0);
				},
			})
		);

		expect(signal).toMatchObject({
			direction: "down",
			metric: "funnel:f1",
			severity: "warning",
			subjectKey: "funnel:f1:zero-completions",
		});
		expect(signal?.definitionEvidence).toContain(
			'Funnel "Checkout" completed 0 of 100 entrants, compared with 0 of 120 previously'
		);
		const investigation = prepareInvestigation(signal, 7).signal;
		expect(investigation).toMatchObject({
			entity: { id: "f1", type: "funnel" },
			signalKey: "funnel:f1:zero-completions",
			sentiment: "negative",
		});
	});

	it("does not report persistent zero completions below the conservative traffic floor", async () => {
		let call = 0;
		const signals = await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => [GOAL],
				goalConversion: async () => {
					call += 1;
					return call === 1
						? goalResult(0, 0, 49)
						: goalResult(0, 0, 120);
				},
			})
		);

		expect(signals).toEqual([]);
	});

	it("does not report persistent zero completions for a changed definition", async () => {
		const changedGoal = {
			...GOAL,
			updatedAt: new Date("2026-05-20T00:00:00.000Z"),
		};
		const signals = await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => [changedGoal],
				goalConversion: async () => goalResult(0, 0, 100),
			})
		);

		expect(signals).toEqual([]);
	});

	it("remeasures persistent zero-completion goals without losing their state subject", async () => {
		const prior = prepareInvestigation(
			{
				baseline: 0,
				current: 0,
				deltaPercent: 0,
				detectedAt: "2026-05-21",
				direction: "down",
				entityLabel: "Signup",
				label: 'Goal "Signup" has no completions',
				method: "wow",
				metric: "goal:g1",
				severity: "warning",
				subjectKey: "goal:g1:zero-completions",
			},
			7
		).signal;
		let call = 0;
		const signal = await remeasureFunnelGoalSignal(
			PARAMS,
			prior,
			TODAY,
			makeDeps({
				fetchGoals: async () => [GOAL],
				goalConversion: async () => {
					call += 1;
					return call === 1
						? goalResult(0, 0, 100)
						: goalResult(0, 0, 120);
				},
			})
		);

		expect(signal).toMatchObject({
			direction: "down",
			metric: "goal:g1",
			subjectKey: "goal:g1:zero-completions",
		});
	});

	it("remeasures a recovered zero-completion goal as positive", async () => {
		const prior = prepareInvestigation(
			{
				baseline: 0,
				current: 0,
				deltaPercent: 0,
				detectedAt: "2026-05-21",
				direction: "down",
				entityLabel: "Signup",
				label: 'Goal "Signup" has no completions',
				method: "wow",
				metric: "goal:g1",
				severity: "warning",
				subjectKey: "goal:g1:zero-completions",
			},
			7
		).signal;
		let call = 0;
		const signal = await remeasureFunnelGoalSignal(
			PARAMS,
			prior,
			TODAY,
			makeDeps({
				fetchGoals: async () => [GOAL],
				goalConversion: async () => {
					call += 1;
					return call === 1
						? goalResult(5, 5, 100)
						: goalResult(0, 0, 120);
				},
			})
		);

		expect(signal).toMatchObject({
			current: 5,
			direction: "up",
			subjectKey: "goal:g1:zero-completions",
		});
		expect(prepareInvestigation(signal!, 7).signal.sentiment).toBe("positive");
	});

	it("remeasures persistent zero-completion funnels without losing their state subject", async () => {
		const prior = prepareInvestigation(
			{
				baseline: 0,
				current: 0,
				deltaPercent: 0,
				detectedAt: "2026-05-21",
				direction: "down",
				entityLabel: "Checkout",
				label: 'Funnel "Checkout" has no completions',
				method: "wow",
				metric: "funnel:f1",
				severity: "warning",
				subjectKey: "funnel:f1:zero-completions",
			},
			7
		).signal;
		let call = 0;
		const signal = await remeasureFunnelGoalSignal(
			PARAMS,
			prior,
			TODAY,
			makeDeps({
				fetchFunnels: async () => [FUNNEL],
				funnelConversion: async () => {
					call += 1;
					return call === 1
						? funnelResult(0, 100, 0)
						: funnelResult(0, 120, 0);
				},
			})
		);

		expect(signal).toMatchObject({
			direction: "down",
			metric: "funnel:f1",
			subjectKey: "funnel:f1:zero-completions",
		});
	});

	it("reports partial regressions without pre-classifying an action", async () => {
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

		expect(signals).toHaveLength(1);
		expect(signals[0]?.definitionEvidence).toContain(
			"completed for 1 of 100 observed website visitors, compared with 20 previously"
		);
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
		const investigation = prepareInvestigation(detected, 7);
		expect(investigation.signal.entity.label).toBe("Signup");
	});

	it("keeps page-view regressions and ignores recently edited definitions", async () => {
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
		expect(signals[0]?.metric).toBe("goal:g1");
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

	it("limits definition probes to two current and previous pairs", async () => {
		const goals = Array.from({ length: 4 }, (_, index) => ({
			...GOAL,
			id: `goal-${index}`,
		}));
		let active = 0;
		let peak = 0;

		await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => goals,
				goalConversion: async () => {
					active += 1;
					peak = Math.max(peak, active);
					await Bun.sleep(5);
					active -= 1;
					return goalResult(20, 20, 100);
				},
			})
		);

		expect(peak).toBe(4);
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
		expect(calls).toBeLessThanOrEqual(4);
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
		expect(calls).toBeLessThanOrEqual(4);
		release?.();
	});
});
