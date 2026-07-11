import "./tools.test-env";

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import * as actualAi from "ai";
import * as actualQuery from "../../query";

interface QueryCall {
	abortSignal?: AbortSignal;
	request: Record<string, unknown>;
}

const queryCalls: QueryCall[] = [];
const synthesisPrompts: string[] = [];
let queryHasData = true;
let synthesisShouldThrow = false;
let synthesisVerdict: "all_clear" | "watch" = "watch";

mock.module("../../query", () => ({
	...actualQuery,
	executeQuery: async (
		request: Record<string, unknown>,
		_domain?: string | null,
		_timezone?: string,
		abortSignal?: AbortSignal
	) => {
		queryCalls.push({ request, abortSignal });
		if (!queryHasData) {
			return [];
		}
		if (request.type === "events_by_date") {
			return [{ date: "2026-06-10", visitors: 90 }];
		}
		if (request.type === "summary_metrics") {
			return [{ visitors: request.from === request.to ? 90 : 100 }];
		}
		return [];
	},
}));

mock.module("ai", () => ({
	...actualAi,
	generateObject: async (options: { prompt?: string }) => {
		if (synthesisShouldThrow) {
			throw new Error("synthesis exploded");
		}
		synthesisPrompts.push(options.prompt ?? "");
		return {
			usage: { inputTokens: 100, outputTokens: 50 },
			object: {
				headline: "Visitors held near 100 per window",
				narrative: "The fixed analytics windows show no material visitor move.",
				causalChain: [],
				deadEnds: [],
				confidence: {
					level: "medium",
					reason: "summary and daily analytics agree",
				},
				verdict: {
					type: synthesisVerdict,
					reason: "no causal evidence was gathered",
				},
				actions: [],
			},
		};
	},
}));

const { runInvestigation } = await import("./investigate");

const params = {
	apiKey: null,
	billingMode: "skip" as const,
	lookbackDays: 30,
	timezone: "UTC",
	userId: "user_1",
	websiteDomain: "example.com",
	websiteId: "site_1",
};

describe("runInvestigation synthesis wiring", () => {
	beforeEach(() => {
		queryHasData = true;
		synthesisShouldThrow = false;
		synthesisVerdict = "watch";
		queryCalls.length = 0;
		synthesisPrompts.length = 0;
	});

	afterAll(() => {
		mock.module("ai", () => actualAi);
		mock.module("../../query", () => actualQuery);
	});

	test("runs one fixed sweep and one structured synthesis", async () => {
		const result = await runInvestigation(params);

		expect(queryCalls).toHaveLength(11);
		expect(new Set(queryCalls.map((call) => call.abortSignal)).size).toBe(1);
		expect(queryCalls.every((call) => call.abortSignal instanceof AbortSignal)).toBe(
			true
		);
		expect(synthesisPrompts).toHaveLength(1);
		expect(synthesisPrompts[0]).toContain("## Bounded analytics sweep");
		expect(synthesisPrompts[0]).toContain('"visitors":90');
		expect(synthesisPrompts[0]).not.toContain("Protocol");
		expect(result.memo.verdict.type).toBe("watch");
		expect(result.memo.confidence.level).toBe("medium");
		expect(result.receipts.steps).toBe(2);
		expect(result.receipts.queriesRun).toHaveLength(12);
		expect(result.markdown).toContain("Query outputs are not persisted");
	});

	test("falls back cautiously when synthesis throws", async () => {
		synthesisShouldThrow = true;

		const result = await runInvestigation(params);

		expect(result.memo.confidence.level).toBe("low");
		expect(result.memo.verdict.type).toBe("watch");
		expect(result.memo.narrative).toContain("No cause was established");
		expect(result.receipts.steps).toBe(2);
		expect(result.markdown).toContain("## Confidence: low");
	});

	test("does not return all clear when every source is empty", async () => {
		queryHasData = false;
		synthesisVerdict = "all_clear";

		const result = await runInvestigation(params);

		expect(result.memo.verdict.type).toBe("watch");
		expect(result.memo.confidence.level).toBe("low");
		expect(result.memo.verdict.reason).toContain("no all-clear");
	});
});
