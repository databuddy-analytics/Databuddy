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

function waitForAbort(signal?: AbortSignal): Promise<never> {
	return new Promise((_resolve, reject) => {
		const onAbort = () =>
			reject(signal?.reason ?? new Error("Definition probe aborted"));
		if (signal?.aborted) {
			onAbort();
			return;
		}
		signal?.addEventListener("abort", onAbort, { once: true });
	});
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

	it("remeasures sparse zero-completion funnels without keeping the zero warning", async () => {
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
					return call === 1 ? funnelResult(0, 1, 0) : funnelResult(0, 120, 0);
				},
			})
		);

		expect(signal).toMatchObject({
			label: 'Funnel "Checkout" conversion',
			subjectKey: "funnel:f1:zero-completions",
		});
		expect(signal?.definitionEvidence).toContain("converted 0 of 1 entrants");
		expect(signal?.definitionEvidence).not.toContain("completed 0 of 1 entrants");
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

	it("settles a failed pair before starting the next bounded batch", async () => {
		const goals = Array.from({ length: 4 }, (_, index) => ({
			...GOAL,
			id: `goal-${index}`,
		}));
		const diagnostics = { failedDefinitions: 0 };
		const calls = new Map<string, number>();
		let active = 0;
		let peak = 0;

		await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => goals,
				goalConversion: async (goal) => {
					active += 1;
					peak = Math.max(peak, active);
					const call = (calls.get(goal.id) ?? 0) + 1;
					calls.set(goal.id, call);
					try {
						await Bun.sleep(goal.id === "goal-0" && call === 1 ? 1 : 5);
						if (goal.id === "goal-0" && call === 1) {
							throw new Error("current period failed");
						}
						return goalResult(20, 20, 100);
					} finally {
						active -= 1;
					}
				},
			}),
			{ diagnostics }
		);

		expect(diagnostics.failedDefinitions).toBe(1);
		expect(peak).toBeLessThanOrEqual(4);
		expect(active).toBe(0);
		expect(calls.size).toBe(goals.length);
	});

	it("lets a retry complete a full pass over many slow definitions", async () => {
		const goals = Array.from({ length: 10 }, (_, index) => ({
			...GOAL,
			id: `goal-${index}`,
		}));
		const seenByAttempt = [new Set<string>(), new Set<string>()];
		const calls = new Map<string, number>();
		let attempt = 0;
		const deps = makeDeps({
			fetchGoals: async () => goals,
			goalConversion: async (goal) => {
				seenByAttempt[attempt]?.add(goal.id);
				await Bun.sleep(5);
				if (attempt === 0 && goal.id === "goal-0") {
					throw new Error("temporary definition failure");
				}
				const key = `${attempt}:${goal.id}`;
				const call = (calls.get(key) ?? 0) + 1;
				calls.set(key, call);
				return goal.id === "goal-9" && call === 1
					? goalResult(0, 0, 100)
					: goalResult(20, 20, 100);
			},
		});
		const firstDiagnostics = { failedDefinitions: 0 };

		await detectFunnelGoalSignals(PARAMS, TODAY, deps, {
			diagnostics: firstDiagnostics,
			timeoutMs: 100,
		});

		expect(firstDiagnostics.failedDefinitions).toBe(1);
		expect(seenByAttempt[0]?.size).toBe(goals.length);

		attempt = 1;
		const retryDiagnostics = { failedDefinitions: 0 };
		const signals = await detectFunnelGoalSignals(PARAMS, TODAY, deps, {
			diagnostics: retryDiagnostics,
			timeoutMs: 100,
		});

		expect(retryDiagnostics.failedDefinitions).toBe(0);
		expect(seenByAttempt[1]?.size).toBe(goals.length);
		expect(signals.map((signal) => signal.metric)).toContain("goal:goal-9");
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

		const detection = detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => goals,
				goalConversion: async (goal, _range, signal) => {
					calls += 1;
					if (goal.id === "goal-0") {
						throw abortError;
					}
					return waitForAbort(signal);
				},
			})
		);

		await expect(detection).rejects.toThrow("goal analytics aborted");
		const callsAtFailure = calls;
		await Bun.sleep(0);
		expect(calls).toBe(callsAtFailure);
	});

	it("keeps a same-batch sibling when one definition times out", async () => {
		const slowGoal = { ...GOAL, id: "slow-goal" };
		const validGoal = { ...GOAL, id: "valid-goal", name: "Purchase" };
		const diagnostics = { failedDefinitions: 0 };
		let validCalls = 0;
		const signals = await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => [slowGoal, validGoal],
				goalConversion: async (goal, _range, signal) => {
					if (goal.id === slowGoal.id) {
						return waitForAbort(signal);
					}
					validCalls += 1;
					return validCalls === 1
						? goalResult(0, 0, 100)
						: goalResult(20, 20, 100);
				},
			}),
			{ diagnostics, overallTimeoutMs: 200, timeoutMs: 15 }
		);

		expect(diagnostics.failedDefinitions).toBe(1);
		expect(signals.map((signal) => signal.metric)).toContain("goal:valid-goal");
	});

	it("continues past an uncooperative definition after its hard deadline", async () => {
		const definitions = Array.from({ length: 3 }, (_, index) => ({
			...GOAL,
			id: `goal-${index}`,
		}));
		const diagnostics = { failedDefinitions: 0 };
		const seen = new Set<string>();
		await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => definitions,
				goalConversion: async (goal) => {
					seen.add(goal.id);
					if (goal.id === "goal-0") {
						return new Promise<ConversionResult>(() => undefined);
					}
					return goalResult(20, 20, 100);
				},
			}),
			{ diagnostics, overallTimeoutMs: 200, timeoutMs: 15 }
		);

		expect(diagnostics.failedDefinitions).toBe(1);
		expect(seen).toEqual(new Set(["goal-0", "goal-1", "goal-2"]));
	});

	it("continues with later definitions after one bounded batch times out", async () => {
		const definitions = Array.from({ length: 4 }, (_, index) => ({
			...GOAL,
			id: `goal-${index}`,
		}));
		const diagnostics = { failedDefinitions: 0 };
		const seen = new Set<string>();
		await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => definitions,
				goalConversion: async (goal, _range, signal) => {
					seen.add(goal.id);
					if (goal.id === "goal-0" || goal.id === "goal-1") {
						return waitForAbort(signal);
					}
					return goalResult(20, 20, 100);
				},
			}),
			{ diagnostics, overallTimeoutMs: 100, timeoutMs: 5 }
		);

		expect(diagnostics.failedDefinitions).toBe(2);
		expect(seen).toEqual(
			new Set(["goal-0", "goal-1", "goal-2", "goal-3"])
		);
	});

	it("uses one overall budget for definition fetch and scanning", async () => {
		const definitions = Array.from({ length: 3 }, (_, index) => ({
			...GOAL,
			id: `goal-${index}`,
		}));
		const diagnostics = { failedDefinitions: 0 };
		const seen = new Set<string>();
		const slowAbortDelays: number[] = [];
		let fetchFinishedAt = 0;
		const startedAt = performance.now();
		await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => {
					await Bun.sleep(100);
					fetchFinishedAt = performance.now();
					return definitions;
				},
				goalConversion: async (goal, _range, signal) => {
					seen.add(goal.id);
					if (goal.id !== "goal-0") {
						return goalResult(20, 20, 100);
					}
					try {
						return await waitForAbort(signal);
					} finally {
						slowAbortDelays.push(performance.now() - fetchFinishedAt);
					}
				},
			}),
			{ diagnostics, overallTimeoutMs: 300, timeoutMs: 500 }
		);

		const elapsedMs = performance.now() - startedAt;
		expect(diagnostics.failedDefinitions).toBe(1);
		expect(seen).toEqual(new Set(["goal-0", "goal-1", "goal-2"]));
		expect(slowAbortDelays).toHaveLength(2);
		expect(slowAbortDelays.every((delay) => delay < 500)).toBe(true);
		expect(elapsedMs).toBeLessThan(800);
	});

	it("shares the remaining scan budget without starving later batches", async () => {
		const definitions = Array.from({ length: 6 }, (_, index) => ({
			...GOAL,
			id: `goal-${index}`,
		}));
		const diagnostics = { failedDefinitions: 0 };
		const seen = new Set<string>();
		const startedAt = performance.now();
		await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => definitions,
				goalConversion: async (goal) => {
					seen.add(goal.id);
					if (["goal-0", "goal-1", "goal-2", "goal-3"].includes(goal.id)) {
						return new Promise<ConversionResult>(() => undefined);
					}
					return goalResult(20, 20, 100);
				},
			}),
			{ diagnostics, overallTimeoutMs: 300, timeoutMs: 500 }
		);

		expect(diagnostics.failedDefinitions).toBe(4);
		expect(seen).toEqual(
			new Set(["goal-0", "goal-1", "goal-2", "goal-3", "goal-4", "goal-5"])
		);
		expect(performance.now() - startedAt).toBeLessThan(800);
	});

	it("does not fetch definitions for a pre-aborted caller", async () => {
		const controller = new AbortController();
		controller.abort(new Error("discovery already canceled"));
		let fetchCalls = 0;
		let conversionCalls = 0;

		await expect(
			detectFunnelGoalSignals(
				PARAMS,
				TODAY,
				makeDeps({
					fetchFunnels: async () => {
						fetchCalls += 1;
						return [];
					},
					fetchGoals: async () => {
						fetchCalls += 1;
						return [GOAL];
					},
					goalConversion: async () => {
						conversionCalls += 1;
						return goalResult(20, 20, 100);
					},
				}),
				{ abortSignal: controller.signal }
			)
		).rejects.toThrow("discovery already canceled");
		expect(fetchCalls).toBe(0);
		expect(conversionCalls).toBe(0);
	});

	it("composes a caller abort and does not start future batches", async () => {
		const definitions = Array.from({ length: 6 }, (_, index) => ({
			...GOAL,
			id: `goal-${index}`,
		}));
		const controller = new AbortController();
		let active = 0;
		let calls = 0;
		let started: (() => void) | undefined;
		const firstWaveStarted = new Promise<void>((resolve) => {
			started = resolve;
		});
		const detection = detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => definitions,
				goalConversion: async (_goal, _range, signal) => {
					active += 1;
					calls += 1;
					if (calls === 4) {
						started?.();
					}
					try {
						return await waitForAbort(signal);
					} finally {
						active -= 1;
					}
				},
			}),
			{ abortSignal: controller.signal }
		);

		await firstWaveStarted;
		controller.abort(new Error("discovery canceled"));
		await expect(detection).rejects.toThrow("discovery canceled");
		expect(calls).toBe(4);
		expect(active).toBe(0);
	});
});
