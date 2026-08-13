import { describe, expect, it } from "bun:test";
import type { InvestigationSignal } from "@databuddy/shared/insights";
import dayjs from "dayjs";
import type { DetectSignalsParams } from "./detection";
import {
	canonicalStaticRoute,
	detectRouteHealthSignals,
	loadRouteVitalContinuation,
	remeasureRouteHealthSignal,
	routeVitalContinuationEvidence,
	type RouteHealthDetectionDeps,
	type RouteHealthQueryInput,
} from "./route-health-detection";

const TODAY = dayjs("2026-08-01");
const PARAMS: DetectSignalsParams = {
	lookbackDays: 7,
	timezone: "UTC",
	websiteId: "test-site",
};

function queryDeps(
	rows: (input: RouteHealthQueryInput) => Record<string, unknown>[]
): RouteHealthDetectionDeps {
	return { query: async (input) => rows(input) };
}

function routeSignal(signalKey: string): InvestigationSignal {
	return {
		changePercent: 56.52,
		entity: { id: "/explore", label: "Route /explore", type: "error" },
		metric: {
			current: 36,
			format: "number",
			label: "Errors on /explore",
			previous: 23,
		},
		period: {
			current: { from: "2026-07-25", to: "2026-07-31" },
			previous: { from: "2026-07-18", to: "2026-07-24" },
		},
		severity: "warning",
		sentiment: "negative",
		signalKey,
	};
}

function routeVitalSignal(
	overrides: Partial<InvestigationSignal> = {}
): InvestigationSignal {
	return {
		changePercent: 44,
		entity: { id: "/sign-in", label: "Route /sign-in", type: "page" },
		metric: {
			current: 7_200,
			format: "duration_ms",
			label: "Page load time (LCP) on /sign-in",
			previous: 5_000,
		},
		period: {
			current: { from: "2026-07-25", to: "2026-07-31" },
			previous: { from: "2026-07-18", to: "2026-07-24" },
		},
		severity: "warning",
		sentiment: "negative",
		signalKey: "route:lcp:/sign-in",
		...overrides,
	};
}

const routeVitalContinuationRow = {
	candidate_control_sessions: 80,
	candidate_exposed_sessions: 100,
	control_continued_sessions: 30,
	control_continuation_percent: 50,
	exposed_continued_sessions: 12,
	exposed_continuation_percent: 20,
	matched_control_sessions: 60,
	matched_exposed_sessions: 60,
	unmatched_control_sessions: 20,
	unmatched_exposed_sessions: 40,
};

describe("canonicalStaticRoute", () => {
	it("retains only a conservative fixed vocabulary of static routes", () => {
		expect(canonicalStaticRoute("/explore")).toBe("/explore");
		expect(canonicalStaticRoute("/sign-in/")).toBe("/sign-in");
		expect(canonicalStaticRoute("/creations")).toBe("/creations");
		expect(
			canonicalStaticRoute(
				"https://quiver.example/explore?email=ari@example.com&token=private"
			)
		).toBe("/explore");
	});

	it("rejects identifiers, emails, slugs, encoded values, and non-path inputs", () => {
		expect(canonicalStaticRoute("/users/ari")).toBeNull();
		expect(canonicalStaticRoute("/creations/019fb864-acd8-7000-8186-24934df81e46")).toBeNull();
		expect(canonicalStaticRoute("/explore/12345")).toBeNull();
			expect(canonicalStaticRoute("/explore/ari@example.com")).toBeNull();
			expect(canonicalStaticRoute("/explore/%61ri")).toBeNull();
			expect(canonicalStaticRoute("/Explore")).toBeNull();
			expect(canonicalStaticRoute("explore")).toBeNull();
		});
	});

describe("detectRouteHealthSignals", () => {
	it("finds high-reach route regressions and omits raw dynamic paths", async () => {
		const requests: RouteHealthQueryInput[] = [];
		const signals = await detectRouteHealthSignals(
			PARAMS,
			TODAY,
			{
				query: async (input) => {
					requests.push(input);
					if (input.type === "errors_by_page" && input.from === "2026-07-25") {
						return [
							{ errors: 36, name: "/explore", users: 35 },
							{
								errors: 120,
								name: "/users/ari@example.com?token=private",
								users: 90,
							},
						];
					}
					if (input.type === "errors_by_page") {
						return [{ errors: 23, name: "/explore", users: 19 }];
					}
					if (input.from === "2026-07-25") {
						return [
							{ metric_name: "LCP", p75: 4_000, page: "/creations", samples: 48 },
							{
								metric_name: "INP",
								p75: 600,
								page: "/explore/019fb864-acd8-7000-8186-24934df81e46",
								samples: 80,
							},
						];
					}
					return [{ metric_name: "LCP", p75: 2_500, page: "/creations", samples: 50 }];
				},
			}
		);

		expect(requests).toHaveLength(4);
		expect(requests.map((request) => request.type).sort()).toEqual([
			"errors_by_page",
			"errors_by_page",
			"vitals_by_page",
			"vitals_by_page",
		]);
		expect(requests.every((request) => request.limit === 1000)).toBe(true);
		expect(signals).toHaveLength(2);
		expect(signals).toContainEqual(
			expect.objectContaining({
				current: 36,
				entityId: "/explore",
				entityLabel: "Route /explore",
				metric: "error_count",
				severity: "warning",
				subjectKey: "route:error:/explore",
			})
		);
		expect(signals).toContainEqual(
			expect.objectContaining({
				current: 4_000,
				entityId: "/creations",
				metric: "lcp",
				severity: "warning",
				subjectKey: "route:lcp:/creations",
			})
		);
		const serialized = JSON.stringify(signals);
		expect(serialized).not.toContain("ari@example.com");
		expect(serialized).not.toContain("private");
		expect(serialized).not.toContain("019fb864");
	});

	it("paginates route aggregates before applying static-route eligibility", async () => {
		const requests: RouteHealthQueryInput[] = [];
		const crowdedDynamicRows = Array.from({ length: 1000 }, (_, index) => ({
			errors: 1000 - index,
			name: `/users/person-${index}`,
			users: 50,
		}));
		const signals = await detectRouteHealthSignals(PARAMS, TODAY, {
			query: async (input) => {
				requests.push(input);
				if (input.type !== "errors_by_page") {
					return [];
				}
				if ((input.offset ?? 0) === 0) {
					return crowdedDynamicRows;
				}
				return [
					{
						errors: input.from === "2026-07-25" ? 36 : 23,
						name: "/explore",
						users: input.from === "2026-07-25" ? 35 : 19,
					},
				];
			},
		});

		expect(
			requests.filter(
				(request) =>
					request.type === "errors_by_page" && request.offset === 1000
			)
		).toHaveLength(2);
		expect(signals).toContainEqual(
			expect.objectContaining({
				current: 36,
				entityId: "/explore",
				metric: "error_count",
				subjectKey: "route:error:/explore",
			})
		);
	});

	it("suppresses low-reach errors and non-regressing or healthy vital rows", async () => {
		const signals = await detectRouteHealthSignals(
			PARAMS,
			TODAY,
			queryDeps((input) => {
				if (input.type === "errors_by_page" && input.from === "2026-07-25") {
					return [{ errors: 30, name: "/sign-in", users: 4 }];
				}
				if (input.type === "errors_by_page") {
					return [{ errors: 10, name: "/sign-in", users: 4 }];
				}
				if (input.from === "2026-07-25") {
					return [
						{ metric_name: "LCP", p75: 2_400, page: "/explore", samples: 60 },
						{ metric_name: "INP", p75: 220, page: "/sign-in", samples: 19 },
					];
				}
				return [
					{ metric_name: "LCP", p75: 1_500, page: "/explore", samples: 60 },
					{ metric_name: "INP", p75: 120, page: "/sign-in", samples: 30 },
				];
			})
		);

		expect(signals).toEqual([]);
	});

	it("requires a material relative error increase as well as an absolute increase", async () => {
		const signals = await detectRouteHealthSignals(
			PARAMS,
			TODAY,
			queryDeps((input) => {
				if (input.type === "errors_by_page") {
					return [
						{
							errors: input.from === "2026-07-25" ? 30 : 25,
							name: "/explore",
							users: 12,
						},
					];
				}
				return [];
			})
		);

		expect(signals).toEqual([]);
	});
});

describe("loadRouteVitalContinuation", () => {
	it("adds only a matched aggregate continuation comparison for a poor canonical route vital", async () => {
		const requests: Record<string, unknown>[] = [];
		const continuation = await loadRouteVitalContinuation(
			{
				signal: routeVitalSignal(),
				websiteId: "test-site",
			},
			async (input) => {
				requests.push(input);
				return [routeVitalContinuationRow];
			}
		);

		expect(requests).toEqual([
			expect.objectContaining({
				badThreshold: 2_500,
				from: "2026-07-25",
				maxPlausible: 60_000,
				metric: "LCP",
				route: "/sign-in",
				to: "2026-07-31",
				websiteId: "test-site",
			}),
		]);
		expect(continuation).toMatchObject({
			comparison: {
				controlSessions: 60,
				exposedSessions: 60,
				percentagePointDifference: -30,
			},
			metric: "LCP",
			route: "/sign-in",
		});
		if (!continuation) {
			throw new Error("Expected matched route vital continuation");
		}
		const evidence = routeVitalContinuationEvidence(continuation);
		expect(evidence).toContain("later viewed a different page within 10 minutes");
		expect(evidence).toContain("This is an association, not proof");
		expect(evidence).not.toContain("bounce");
		expect(evidence).not.toContain("session_id");
	});

	it("does not query healthy, implausible, dynamic, or non-vital route signals", async () => {
		let calls = 0;
		const query = async () => {
			calls += 1;
			return [routeVitalContinuationRow];
		};
		const invalidSignals = [
			routeVitalSignal({
				metric: {
					current: 2_500,
					format: "duration_ms",
					label: "Page load time (LCP) on /sign-in",
					previous: 2_000,
				},
			}),
			routeVitalSignal({
				metric: {
					current: 60_001,
					format: "duration_ms",
					label: "Page load time (LCP) on /sign-in",
					previous: 5_000,
				},
			}),
			routeVitalSignal({
				entity: {
					id: "/users/example-user",
					label: "Route /users/example-user",
					type: "page",
				},
				signalKey: "route:lcp:/users/example-user",
			}),
			routeVitalSignal({ signalKey: "route:error:/sign-in" }),
		];

		for (const signal of invalidSignals) {
			expect(
				await loadRouteVitalContinuation(
					{ signal, websiteId: "test-site" },
					query
				)
			).toBeNull();
		}
		expect(calls).toBe(0);
	});

	it("requires a large, sufficiently matched, materially lower continuation cohort", async () => {
		const variants = [
			{
				...routeVitalContinuationRow,
				control_continued_sessions: 24,
				control_continuation_percent: 49,
				exposed_continued_sessions: 10,
				exposed_continuation_percent: 20.4,
				matched_control_sessions: 49,
				matched_exposed_sessions: 49,
				unmatched_control_sessions: 31,
				unmatched_exposed_sessions: 51,
			},
			{
				...routeVitalContinuationRow,
				control_continuation_percent: 50.8,
				exposed_continuation_percent: 20.3,
				matched_control_sessions: 59,
				matched_exposed_sessions: 59,
				unmatched_control_sessions: 21,
				unmatched_exposed_sessions: 41,
			},
			{
				...routeVitalContinuationRow,
				control_continued_sessions: 24,
				control_continuation_percent: 40,
				exposed_continued_sessions: 13,
				exposed_continuation_percent: 21.7,
			},
		];

		for (const row of variants) {
			expect(
				await loadRouteVitalContinuation(
					{ signal: routeVitalSignal(), websiteId: "test-site" },
					async () => [row]
				)
			).toBeNull();
		}
	});
});

describe("remeasureRouteHealthSignal", () => {
	it("returns a route recovery without applying the discovery impact threshold", async () => {
		const requests: RouteHealthQueryInput[] = [];
		const signal = await remeasureRouteHealthSignal(
			PARAMS,
			routeSignal("route:error:/explore"),
			TODAY,
			queryDeps((input) => {
				requests.push(input);
				return input.from === "2026-07-25"
					? [{ errors: 3, name: "/explore", users: 2 }]
					: [{ errors: 36, name: "/explore", users: 35 }];
			})
		);

		expect(signal).toMatchObject({
			baseline: 36,
			current: 3,
			direction: "down",
			subjectKey: "route:error:/explore",
		});
		expect(requests.map((request) => request.filters)).toEqual([
			undefined,
			undefined,
		]);
	});

	it("refuses a stored route key that is not already canonical and static", async () => {
		let calls = 0;
		const signal = await remeasureRouteHealthSignal(
			PARAMS,
			routeSignal("route:error:/users/ari@example.com?token=private"),
			TODAY,
			{
				query: async () => {
					calls += 1;
					return [];
				},
			}
		);

		expect(signal).toBeNull();
		expect(calls).toBe(0);
	});
});
