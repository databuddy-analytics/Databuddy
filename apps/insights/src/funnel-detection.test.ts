import { describe, expect, it } from "bun:test";
import { validateInvestigationDecision } from "@databuddy/ai/insights/validate";
import type { InvestigationEvidence } from "@databuddy/shared/insights";
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
	UNLINKED_COMPLETIONS_QUERY,
} from "./funnel-detection";
import { prepareInvestigation } from "./investigation";
import { terminalDecisionFromEvidence } from "./terminal-decision";

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

function withVerifiedRemediation(
	investigation: ReturnType<typeof prepareInvestigation>
): InvestigationEvidence[] {
	const definition = investigation.evidence.find(
		(item) => item.kind === "definition"
	);
	if (!(definition && investigation.signal.expectation)) {
		throw new Error("Expected a confirmed definition repair fixture");
	}
	return [
		...investigation.evidence,
		{
			...definition,
			evidenceId: `${definition.evidenceId}:verified`,
			remediation: investigation.signal.expectation,
		},
	];
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
			processGoalConversionCount: async (
				_step,
				completionFilters,
				_params
			) => {
				observed.push(completionFilters);
				return 10;
			},
		});

		const result = await deps.goalConversion(
			{ ...GOAL, filters },
			{ from: "2026-05-22", to: "2026-05-28" }
		);

		expect(observed).toEqual([filters, filters]);
		expect(result).toEqual({ completions: 10, entrants: 50, rate: 20 });
	});

	it("does not infer a definition completion from site-wide revenue", () => {
		const deps = defaultFunnelGoalDeps("test-site", TODAY.toDate(), {
			getTotalWebsiteUsers: async () => 0,
			processGoalConversionCount: async () => 0,
		});

		expect(deps.confirmCompletion).toBeUndefined();
	});

	it("confirms only the exact unlinked event target", async () => {
		const observed: unknown[] = [];
		const deps = defaultFunnelGoalDeps("test-site", TODAY.toDate(), {
			confirmUnlinkedCompletions: async (...args) => {
				observed.push(args.slice(0, 3));
				return 10;
			},
			getTotalWebsiteUsers: async () => 0,
			processGoalConversionCount: async () => 0,
		});

		const result = await deps.confirmCompletion?.({
			definitionId: GOAL.id,
			definitionType: "goal",
			expectation: {
				currentCompletions: 0,
				currentEntrants: 100,
				definitionUpdatedAt: GOAL.updatedAt.toISOString(),
				eventName: GOAL.target,
				instruction: "Restore tracking",
				kind: "tracking",
				previousCompletions: 20,
			},
			filters: [],
			range: { from: "2026-05-22", to: "2026-05-28" },
		});

		expect(observed).toEqual([
			[
				"test-site",
				"sign_up",
				{ from: "2026-05-22", to: "2026-05-28" },
			],
		]);
		expect(result).toEqual({ count: 10, source: "server_completions" });
	});

	it("does not treat identity-linked events as evidence of a missing link", () => {
		expect(UNLINKED_COMPLETIONS_QUERY).toContain(
			"ifNull(profile_id, '') = ''"
		);
		expect(UNLINKED_COMPLETIONS_QUERY).toContain(
			"ifNull(anonymous_id, '') = ''"
		);
		expect(UNLINKED_COMPLETIONS_QUERY).toContain(
			"ifNull(session_id, '') = ''"
		);
	});

	it("does not confirm a filtered definition with unscoped event counts", async () => {
		let confirmationQueries = 0;
		const deps = defaultFunnelGoalDeps("test-site", TODAY.toDate(), {
			confirmUnlinkedCompletions: async () => {
				confirmationQueries += 1;
				return 100;
			},
			getTotalWebsiteUsers: async () => 0,
			processGoalConversionCount: async () => 0,
		});

		const result = await deps.confirmCompletion?.({
			definitionId: GOAL.id,
			definitionType: "goal",
			expectation: {
				currentCompletions: 0,
				currentEntrants: 100,
				definitionUpdatedAt: GOAL.updatedAt.toISOString(),
				eventName: GOAL.target,
				instruction: "Restore tracking",
				kind: "tracking",
				previousCompletions: 20,
			},
			filters: [{ field: "country", operator: "equals", value: "PS" }],
			range: { from: "2026-05-22", to: "2026-05-28" },
		});

		expect(result).toBeUndefined();
		expect(confirmationQueries).toBe(0);
	});

	it("confirms the exact identity-link defect from one matching record", async () => {
		const deps = defaultFunnelGoalDeps("test-site", TODAY.toDate(), {
			confirmUnlinkedCompletions: async () => 1,
			getTotalWebsiteUsers: async () => 0,
			processGoalConversionCount: async () => 0,
		});

		const result = await deps.confirmCompletion?.({
			definitionId: GOAL.id,
			definitionType: "goal",
			expectation: {
				currentCompletions: 0,
				currentEntrants: 100,
				definitionUpdatedAt: GOAL.updatedAt.toISOString(),
				eventName: GOAL.target,
				instruction: "Restore tracking",
				kind: "tracking",
				previousCompletions: 100,
			},
			filters: [],
			range: { from: "2026-05-22", to: "2026-05-28" },
		});

		expect(result).toEqual({ count: 1, source: "server_completions" });
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
				filters: [],
				range: { from: "2026-05-22", to: "2026-05-28" },
			},
		]);
		const investigation = prepareInvestigation(signals[0]!, {
			websiteId: PARAMS.websiteId,
			lookbackDays: PARAMS.lookbackDays,
		});
		expect(
			terminalDecisionFromEvidence(
				investigation.signal,
				investigation.evidence
			)
		).toEqual({ disposition: "needs_context", gap: "expected_behavior" });
		const verifiedEvidence = withVerifiedRemediation(investigation);
		const decision = terminalDecisionFromEvidence(
			investigation.signal,
			verifiedEvidence
		);
		expect(decision).toMatchObject({ disposition: "action_ready" });
			expect(
				validateInvestigationDecision({
					signal: investigation.signal,
					evidence: verifiedEvidence,
					decision,
			}).insight
		).toMatchObject({
			remediationKind: "tracking",
			title: "Fix tracking for Checkout",
		});
		expect(signals[0]?.definitionEvidence?.summary).not.toContain("2026-");
	});

	it("turns identity-less exact-target records into a scoped repair", async () => {
		let call = 0;
		const [signal] = await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				confirmCompletion: async () => ({
					count: 7,
					source: "server_completions",
				}),
				fetchGoals: async () => [GOAL],
				goalConversion: async () => {
					call += 1;
					return call === 1
						? goalResult(0, 0, 100)
						: goalResult(20, 20, 100);
				},
			})
		);

		expect(signal?.expectation).toMatchObject({
			confirmation: {
				count: 7,
				definitionId: GOAL.id,
				definitionType: "goal",
				source: "server_completions",
			},
			instruction:
				'Link "sign_up" custom events to a Databuddy visitor or session so this goal can count them.',
		});
		const investigation = prepareInvestigation(signal!, {
			websiteId: PARAMS.websiteId,
			lookbackDays: PARAMS.lookbackDays,
		});
		expect(
			terminalDecisionFromEvidence(
				investigation.signal,
				investigation.evidence
			)
		).toEqual({ disposition: "needs_context", gap: "expected_behavior" });
		const verifiedEvidence = withVerifiedRemediation(investigation);
		const decision = terminalDecisionFromEvidence(
			investigation.signal,
			verifiedEvidence
		);
		expect(decision).toMatchObject({
			disposition: "action_ready",
			remediation: {
				instruction:
					'Link "sign_up" custom events to a Databuddy visitor or session so this goal can count them.',
				kind: "tracking",
			},
		});
		const validation = validateInvestigationDecision({
			decision,
			evidence: verifiedEvidence,
			signal: investigation.signal,
			});
		expect(validation.errors).toEqual([]);
		expect(validation.insight).toMatchObject({ remediationKind: "tracking" });
	});

	it("keeps a missing purchase as needs-context when confirmation fails", async () => {
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
		const investigation = prepareInvestigation(signal!, {
			websiteId: PARAMS.websiteId,
			lookbackDays: PARAMS.lookbackDays,
		});
		expect(
			terminalDecisionFromEvidence(
				investigation.signal,
				investigation.evidence
			)
		).toEqual({ disposition: "needs_context", gap: "expected_behavior" });
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

	it("uses the product name in customer-facing goal output", async () => {
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
		const decision = terminalDecisionFromEvidence(
			investigation.signal,
			investigation.evidence
		);
		const result = validateInvestigationDecision({
			decision,
			evidence: investigation.evidence,
			signal: investigation.signal,
		});

		expect(investigation.signal.entity.label).toBe("Signup");
		expect(result.insight?.title).toBe("Signup conversion stopped");
		expect(result.insight?.suggestion).toContain(
			"Did users complete Signup?"
		);
		expect(result.insight?.title).not.toContain("completion rate");
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

	it("does not let recent definitions consume the bounded evaluation window", async () => {
		const recent = Array.from({ length: 20 }, (_, index) => ({
			...GOAL,
			id: `recent-${index}`,
			updatedAt: new Date("2026-05-20T00:00:00.000Z"),
		}));
		const evaluated = new Set<string>();
		const diagnostics = {
			activeDefinitionKeys: new Set<string>(),
			eligibleDefinitionKeys: new Set<string>(),
			failedDefinitions: 0,
			truncatedDefinitions: 0,
		};

		await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => [...recent, GOAL],
				goalConversion: async (goal) => {
					evaluated.add(goal.id);
					return goalResult(20, 20, 100);
				},
			}),
			{ diagnostics }
		);

		expect([...evaluated]).toEqual([GOAL.id]);
		expect(diagnostics.activeDefinitionKeys).toEqual(
			new Set([...recent.map((goal) => `goal:${goal.id}`), `goal:${GOAL.id}`])
		);
		expect(diagnostics.eligibleDefinitionKeys).toEqual(
			new Set([`goal:${GOAL.id}`])
		);
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

	it("bounds large definition sets and rotates coverage each week", async () => {
		const goals = Array.from({ length: 100 }, (_, index) => ({
			...GOAL,
			id: `goal-${index.toString().padStart(3, "0")}`,
		}));
		const firstIds = new Set<string>();
		const secondIds = new Set<string>();
		const firstDiagnostics = {
			failedDefinitions: 0,
			truncatedDefinitions: 0,
		};
		const secondDiagnostics = {
			failedDefinitions: 0,
			truncatedDefinitions: 0,
		};

		await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchGoals: async () => goals,
				goalConversion: async (goal) => {
					firstIds.add(goal.id);
					return goalResult(20, 20, 100);
				},
			}),
			{ diagnostics: firstDiagnostics }
		);
		await detectFunnelGoalSignals(
			PARAMS,
			TODAY.add(7, "day"),
			makeDeps({
				fetchGoals: async () => goals,
				goalConversion: async (goal) => {
					secondIds.add(goal.id);
					return goalResult(20, 20, 100);
				},
			}),
			{ diagnostics: secondDiagnostics }
		);

		expect(firstIds.size).toBe(16);
		expect(secondIds.size).toBe(16);
		expect([...firstIds].sort()).not.toEqual([...secondIds].sort());
		expect(firstDiagnostics).toEqual({
			failedDefinitions: 0,
			truncatedDefinitions: 84,
		});
		expect(secondDiagnostics).toEqual(firstDiagnostics);
	});

	it("uses a bounded definition window with exact total diagnostics", async () => {
		const goals = Array.from({ length: 16 }, (_, index) => ({
			...GOAL,
			id: `selected-${index.toString().padStart(2, "0")}`,
		}));
		const eligibleKeys = [
			...goals.map((goal) => `goal:${goal.id}`),
			...Array.from({ length: 84 }, (_, index) => `goal:other-${index}`),
		];
		const evaluated = new Set<string>();
		const diagnostics = {
			failedDefinitions: 0,
			truncatedDefinitions: 0,
		};
		let legacyFetches = 0;
		let rotation: number | undefined;

		await detectFunnelGoalSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchDefinitionWindow: async (value) => {
					rotation = value;
					return {
						activeKeys: eligibleKeys,
						eligibleKeys,
						funnels: [],
						goals,
						total: 100,
					};
				},
				fetchFunnels: async () => {
					legacyFetches += 1;
					return [];
				},
				fetchGoals: async () => {
					legacyFetches += 1;
					return [];
				},
				goalConversion: async (goal) => {
					evaluated.add(goal.id);
					return goalResult(20, 20, 100);
				},
			}),
			{ diagnostics }
		);

		expect(Number.isSafeInteger(rotation)).toBe(true);
		expect(legacyFetches).toBe(0);
		expect(evaluated.size).toBe(16);
		expect(diagnostics).toEqual({
			failedDefinitions: 0,
			truncatedDefinitions: 84,
		});
	});

	it("isolates one failed definition and keeps a valid sibling", async () => {
		const failedGoal = { ...GOAL, id: "failed-goal" };
		const validGoal = { ...GOAL, id: "valid-goal", name: "Purchase" };
		const diagnostics = { failedDefinitions: 0, truncatedDefinitions: 0 };
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
				goalConversion: async () => {
					calls += 1;
					if (calls === 1) {
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
