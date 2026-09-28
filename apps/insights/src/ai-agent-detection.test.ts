import { describe, expect, it } from "bun:test";
import type { InvestigationSignal } from "@databuddy/shared/insights";
import dayjs from "dayjs";
import {
	type AiAgentDetectionDeps,
	detectAiAgentSignals,
	remeasureAiAgentSignal,
} from "./ai-agent-detection";
import type { DetectSignalsParams } from "./detection";

const TODAY = dayjs("2026-08-01");
const PARAMS: DetectSignalsParams = {
	lookbackDays: 7,
	timezone: "UTC",
	websiteId: "test-site",
};
const CURRENT_FROM = "2026-07-25";

const DEPS: AiAgentDetectionDeps = {
	query: async (input) =>
		input.from === CURRENT_FROM
			? [
					{ product: "Claude Code", requests: 120, visitors: 0 },
					{ product: "ChatGPT", requests: 600, visitors: 30 },
					{ product: "Perplexity", requests: 10, visitors: 15 },
					{ product: "Meta AI", requests: 45, visitors: 0 },
					{ product: "Google Gemini", requests: 0, visitors: 19 },
				]
			: [
					{ product: "ChatGPT", requests: 400, visitors: 28 },
					{ product: "Perplexity", requests: 12, visitors: 40 },
					{ product: "Meta AI", requests: 30, visitors: 0 },
					{ product: "Google Gemini", requests: 0, visitors: 10 },
				],
};

describe("detectAiAgentSignals", () => {
	it("flags only large changes on meaningful volume", async () => {
		const signals = await detectAiAgentSignals(PARAMS, TODAY, DEPS);
		expect(
			signals.map((signal) => [
				signal.subjectKey,
				signal.current,
				signal.baseline,
				signal.direction,
			])
		).toEqual([
			["ai_agents:requests:Claude Code", 120, 0, "up"],
			["ai_agents:visitors:Perplexity", 15, 40, "down"],
		]);
	});

	it("remeasures a stored signal for the same product and metric", async () => {
		const signal = await remeasureAiAgentSignal(
			PARAMS,
			{ signalKey: "ai_agents:visitors:ChatGPT" } as InvestigationSignal,
			TODAY,
			DEPS
		);
		expect(signal).toMatchObject({
			baseline: 28,
			current: 30,
			entityId: "ChatGPT",
			subjectKey: "ai_agents:visitors:ChatGPT",
		});
	});
});
