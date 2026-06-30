import "./tools.test-env";

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import * as actualAi from "ai";
import * as actualRunAgent from "./run-agent";

const traceResult = {
	answer: "Pageviews fell 30% on /pricing after June 8.",
	steps: 7,
	toolCalls: [
		{
			index: 0,
			name: "get_data",
			input: { websiteId: "site_1" },
			output: { batch: true },
		},
	],
	truncated: false,
	usage: {},
};

let synthesisShouldThrow = false;

mock.module("./run-agent", () => ({
	...actualRunAgent,
	runMcpAgentWithTrace: async () => traceResult,
}));

mock.module("ai", () => ({
	...actualAi,
	generateObject: async () => {
		if (synthesisShouldThrow) {
			throw new Error("synthesis exploded");
		}
		return {
			object: {
				headline: "Pageviews fell 30% on /pricing after deploy d4f21a9",
				narrative: "Drop concentrated on /pricing.",
				causalChain: [],
				deadEnds: [],
				confidence: { level: "high", reason: "timing aligns" },
				verdict: { type: "act", reason: "rollbackable deploy" },
				actions: ["Roll back d4f21a9"],
			},
		};
	},
}));

const { runInvestigation } = await import("./investigate");

const params = {
	apiKey: {} as Parameters<typeof runInvestigation>[0]["apiKey"],
	lookbackDays: 30,
	requestHeaders: new Headers(),
	userId: "user_1",
	websiteDomain: "example.com",
	websiteId: "site_1",
};

describe("runInvestigation synthesis wiring", () => {
	beforeEach(() => {
		synthesisShouldThrow = false;
	});

	afterAll(() => {
		mock.module("ai", () => actualAi);
		mock.module("./run-agent", () => actualRunAgent);
	});

	test("returns the synthesized memo when generateObject succeeds", async () => {
		const result = await runInvestigation(params);
		expect(result.memo.verdict.type).toBe("act");
		expect(result.memo.confidence.level).toBe("high");
		expect(result.receipts.steps).toBe(7);
		expect(result.markdown).toContain("**Act now.**");
	});

	test("falls back to a low-confidence memo when synthesis throws", async () => {
		synthesisShouldThrow = true;
		const result = await runInvestigation(params);
		expect(result.memo.confidence.level).toBe("low");
		expect(result.memo.verdict.type).toBe("watch");
		expect(result.memo.narrative).toContain("/pricing");
		expect(result.receipts.steps).toBe(7);
		expect(result.markdown).toContain("## Confidence: low");
	});
});
