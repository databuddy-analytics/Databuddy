import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import { compileQuery } from "@databuddy/ai/query";
import dayjs from "dayjs";
import { planCoveragePortfolio } from "./coverage-planner";
import {
	detectSignals,
	type QueryFn,
	remeasureMetricSignal,
} from "./detection";
import {
	isInvestigationCandidate,
	prepareInvestigation,
} from "./investigation";

import {
	investigateWebsitePortfolioWithSources,
	remeasureStoredSignal,
} from "./generation";

const params = { lookbackDays: 7, timezone: "UTC", websiteId: "event-site" };
const today = dayjs("2026-09-07");
const eventName = "report_exported";
const baseline = {
	name: eventName,
	total_events: 1000,
	unique_users: 400,
	unique_sessions: 400,
};

function eventQuery(
	current: Record<string, unknown> | undefined,
	previous: Record<string, unknown> = baseline,
	currentSessions = 1000,
	requests: Parameters<QueryFn>[0][] = []
): QueryFn {
	return async (request) => {
		requests.push(request);
		const isCurrent = request.from === "2026-08-31";
		if (request.type === "summary_metrics") {
			return [{ sessions: isCurrent ? currentSessions : 1000 }];
		}
		if (request.type !== "custom_events") return [];
		const row = isCurrent ? current : previous;
		if (!row) return [];
		for (const filter of request.filters ?? []) {
			if (filter.field !== "event_name") throw new Error("Unexpected selector");
			if (filter.op === "eq" && row.name !== filter.value) return [];
			if (filter.op === "in" && Array.isArray(filter.value)) {
				if (!filter.value.includes(String(row.name))) return [];
			} else if (filter.op !== "eq") throw new Error("Unexpected operator");
		}
		return [row];
	};
}

describe("custom-event reach without configured conversions", () => {
	it("finds the participation change hidden by flat occurrence volume using the existing two reads", async () => {
		const requests: Parameters<QueryFn>[0][] = [];
		const signals = await detectSignals(
			params,
			eventQuery(
				{ ...baseline, unique_users: 100, unique_sessions: 100 },
				baseline,
				1000,
				requests
			),
			today
		);
		expect(signals).toHaveLength(1);
		const signal = signals[0];
		if (!signal) throw new Error("Missing reach change");
		expect(signal).toMatchObject({
			baseline: 400,
			current: 100,
			deltaPercent: -75,
			metric: "custom_event_reach",
			subjectKey: `custom_event_reach:${eventName}`,
		});
		expect(isInvestigationCandidate(signal)).toBe(true);
		expect(planCoveragePortfolio(signals, { reason: "manual" })).toEqual(
			signals
		);
		const prepared = prepareInvestigation(signal, 7);
		expect(prepared.signal).toMatchObject({
			entity: { id: eventName, label: eventName, type: "event" },
			metric: { current: 100, previous: 400, format: "number" },
			period: {
				current: { from: "2026-08-31", to: "2026-09-06" },
				previous: { from: "2026-08-24", to: "2026-08-30" },
			},
		});
		expect(prepared.evidence[0]).toContain(
			"1000 occurrences across 400 recorded visitor identifiers"
		);
		expect(prepared.investigationObjective).toContain(
			"Nonzero unique_users still measures recorded visitor identifiers"
		);
		const eventReads = requests.filter(
			(request) => request.type === "custom_events"
		);
		expect(eventReads).toHaveLength(2);
		for (const request of eventReads) {
			const compiled = compileQuery(request);
			expect(compiled.sql).toContain(
				"uniq(coalesce(nullIf(profile_id, ''), nullIf(anonymous_id, ''))) as unique_users"
			);
			expect(compiled.sql).toContain("COUNT(*) as total_events");
			expect(compiled.params).toMatchObject({
				projectId: "event-site",
				limit: 200,
			});
		}
	});

	it("carries the detected event through no-definition generation and exact stored remeasurement", async () => {
		const query = eventQuery({
			...baseline,
			unique_users: 100,
			unique_sessions: 100,
		});
		const artifacts = await investigateWebsitePortfolioWithSources(
			{
				asOf: "2026-09-07",
				domain: "example.com",
				organizationId: "event-org",
				websiteId: params.websiteId,
				timezone: "UTC",
			},
			{
				detectDefinitionSignals: async () => [],
				detectMetricSignals: () => detectSignals(params, query, today),
				detectRouteHealthSignals: async () => [],
				fetchAnnotations: async () => [],
				loadDueInvestigation: async () => null,
				loadErrorCustomerImpact: async () => null,
				loadRouteVitalContinuation: async () => null,
				loadHistory: async () => [],
				loadOtherOpenWork: async () => [],
				loadObservations: async () => new Map(),
				remeasureSignal: (input, prior, clock) =>
					remeasureStoredSignal(input, prior, clock, undefined, { query }),
				investigateSignal: async (input) => {
					expect(input.signal.entity).toMatchObject({
						id: eventName,
						type: "event",
					});
					expect(input.investigationObjective).toContain(
						"unavailable emitter context does not invalidate it"
					);
					// The stub tests publication plumbing, not model judgment or source proof.
					return {
						toolCallCount: 0,
						outcome: {
							title: "Recorded export reach narrowed",
							summary:
								"Steady event volume no longer shows equally broad recorded use.",
							evidence: input.evidence,
							impact: null,
							rootCause: null,
							publish: true,
							next: {
								type: "resolve",
								reason: "No causal repair is established.",
							},
						},
					};
				},
			},
			"manual"
		);
		expect(artifacts).toHaveLength(1);
		expect(artifacts[0]).toMatchObject({
			status: "completed",
			signal: {
				signalKey: `custom_event_reach:${eventName}`,
				entity: { type: "event" },
			},
			outcome: { publish: true, next: { type: "resolve" } },
		});
		const prior = artifacts[0]?.signal;
		if (!prior) throw new Error("Missing generated signal");
		expect(
			await remeasureStoredSignal(params, prior, today, undefined, { query })
		).toMatchObject({
			current: 100,
			baseline: 400,
			subjectKey: prior.signalKey,
		});
	});

	for (const [label, current, previous, currentSessions] of [
		["stable reach", baseline, baseline, 1000],
		[
			"small population",
			{ ...baseline, unique_users: 2, unique_sessions: 2 },
			{ ...baseline, unique_users: 10, unique_sessions: 10 },
			1000,
		],
		[
			"ordinary traffic decline",
			{ ...baseline, unique_users: 100, unique_sessions: 100 },
			baseline,
			250,
		],
		[
			"missing reach",
			{ name: eventName, total_events: 1000, unique_sessions: 100 },
			baseline,
			1000,
		],
		["null reach", { ...baseline, unique_users: null }, baseline, 1000],
		[
			"malformed reach",
			{ ...baseline, unique_users: "unknown" },
			baseline,
			1000,
		],
		["negative reach", { ...baseline, unique_users: -1 }, baseline, 1000],
		["fractional reach", { ...baseline, unique_users: 1.5 }, baseline, 1000],
	] as const) {
		it(`keeps ${label} out of the new reach path`, async () => {
			const signals = await detectSignals(
				params,
				eventQuery(current, previous, currentSessions),
				today
			);
			expect(
				signals.filter((signal) => signal.metric === "custom_event_reach")
			).toEqual([]);
		});
	}

	for (const occurrences of [100_000, 300_000]) {
		it(`retains detection and rechecks with approximate native reach and ${occurrences} occurrences`, async () => {
			// Native uniq estimates above its exact range may exceed COUNT(*).
			const previous = {
				name: eventName,
				total_events: 300_000,
				unique_users: 300_600,
				unique_sessions: 300_300,
			};
			const current = {
				name: eventName,
				total_events: occurrences,
				unique_users: 100_200,
				unique_sessions: 100_100,
			};
			const query = eventQuery(current, previous);
			const signals = await detectSignals(params, query, today);
			const metric =
				occurrences === 100_000 ? "custom_event_count" : "custom_event_reach";
			const signal = signals[0];
			expect(signals).toHaveLength(1);
			expect(signal).toMatchObject({
				metric,
				current: occurrences === 100_000 ? 100_000 : 100_200,
				baseline: occurrences === 100_000 ? 300_000 : 300_600,
			});
			if (!signal) throw new Error("Missing event change");
			expect(
				await remeasureMetricSignal(
					params,
					prepareInvestigation(signal, 7).signal,
					query,
					today
				)
			).toMatchObject({
				metric,
				current: signal.current,
				baseline: signal.baseline,
				subjectKey: signal.subjectKey,
			});
		});
	}

	it("remeasures recorded identifiers, preserving the exact subject and a recovery", async () => {
		const signals = await detectSignals(
			params,
			eventQuery({ ...baseline, unique_users: 100, unique_sessions: 100 }),
			today
		);
		if (!signals[0]) throw new Error("Missing reach change");
		const prior = prepareInvestigation(signals[0], 7).signal;
		const requests: Parameters<QueryFn>[0][] = [];
		const recovered = await remeasureMetricSignal(
			params,
			prior,
			eventQuery(
				baseline,
				{ ...baseline, unique_users: 100, unique_sessions: 100 },
				1000,
				requests
			),
			today
		);
		expect(recovered).toMatchObject({
			current: 400,
			baseline: 100,
			deltaPercent: 300,
			subjectKey: prior.signalKey,
		});
		expect(requests.map((request) => request.filters)).toEqual([
			[{ field: "event_name", op: "eq", value: eventName }],
			[{ field: "event_name", op: "eq", value: eventName }],
		]);
		const unavailable = await remeasureMetricSignal(
			params,
			prior,
			eventQuery({ ...baseline, unique_users: null }),
			today
		);
		expect(unavailable).toBeNull();
	});

	it("retains a real zero-identity observation without claiming users stopped", async () => {
		const signals = await detectSignals(
			params,
			eventQuery({ ...baseline, unique_users: 0, unique_sessions: 0 }),
			today
		);
		expect(signals[0]).toMatchObject({ current: 0, baseline: 400 });
		expect(signals[0]?.definitionEvidence).toContain(
			"1000 times across 0 recorded visitor identifiers"
		);
	});

	it("does not add a duplicate reach subject when occurrences disappear", async () => {
		const signals = await detectSignals(params, eventQuery(undefined), today);
		expect(signals.map((signal) => signal.subjectKey)).toEqual([
			`custom_event:${eventName}`,
		]);
	});
});
