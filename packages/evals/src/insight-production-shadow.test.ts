import { describe, expect, test } from "bun:test";
import {
	projectTraceUsage,
	resolveReferenceTime,
	runCancellableAttempt,
	sanitizeText,
	summarizeInvestigationCosts,
	summarizeShadowOutcomes,
} from "./insight-production-shadow";

describe("production shadow redaction", () => {
	test("removes known names and campaign identifiers", () => {
		const value = sanitizeText(
			"Example Labs saw utm_campaign=summer-launch and campaign id: renewal_2026",
			["Example Labs"]
		);
		expect(value).not.toContain("Example Labs");
		expect(value).not.toContain("summer-launch");
		expect(value).not.toContain("renewal_2026");
	});
});

describe("production shadow reference time", () => {
	test("freezes an explicit instant", () => {
		expect(
			resolveReferenceTime("2026-07-17T20:16:54.076Z").toISOString()
		).toBe("2026-07-17T20:16:54.076Z");
	});

	test("rejects an invalid instant", () => {
		expect(() => resolveReferenceTime("not-a-date")).toThrow(
			"reference-time must be a valid ISO timestamp"
		);
	});

	test("uses the supplied clock by default", () => {
		expect(
			resolveReferenceTime(undefined, () =>
				new Date("2026-07-17T20:16:54.076Z")
			).toISOString()
		).toBe("2026-07-17T20:16:54.076Z");
	});
});

describe("production shadow investigation cost", () => {
	test("reports per-investigation min, max, average, and fallback count", () => {
		const base = {
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			costFallback: false,
			inputTokens: 0,
			modelId: "model",
			outputTokens: 0,
			reasoningTokens: 0,
		};
		expect(
			summarizeInvestigationCosts([
				{ ...base, estimatedCostUsd: 0.01 },
				{ ...base, costFallback: true, estimatedCostUsd: 0.03 },
				null,
			])
		).toEqual({
			average: 0.02,
			fallbackPricedInvestigations: 1,
			investigations: 2,
			max: 0.03,
			min: 0.01,
			total: 0.04,
		});
	});

	test("reports zeroes when no investigation invoked the agent", () => {
		expect(summarizeInvestigationCosts([null])).toEqual({
			average: 0,
			fallbackPricedInvestigations: 0,
			investigations: 0,
			max: 0,
			min: 0,
			total: 0,
		});
	});

	test("reconstructs failed-agent cost from step usage", () => {
		expect(
			projectTraceUsage([
				{
					cacheReadTokens: 0,
					cacheWriteTokens: 0,
					inputTokens: 2000,
					modelId: "anthropic/claude-sonnet-4.6",
					outputTokens: 300,
					reasoningTokens: 0,
					tools: [],
				},
			])
		).toMatchObject({
			estimatedCostUsd: 0.0105,
			inputTokens: 2000,
			outputTokens: 300,
		});
	});

	test("uses the eval catalog for a gateway model missing from billing", () => {
		expect(
			projectTraceUsage([
				{
					cacheReadTokens: 0,
					cacheWriteTokens: 0,
					inputTokens: 2000,
					modelId: "openai/gpt-5.6-luna",
					outputTokens: 300,
					reasoningTokens: 0,
					tools: [],
				},
			])
		).toMatchObject({
			costFallback: false,
			estimatedCostUsd: 0.0038,
			modelId: "openai/gpt-5.6-luna",
		});
	});

	test("prices cached reads and writes at the model's published rates", () => {
		expect(
			projectTraceUsage([
				{
					cacheReadTokens: 1000,
					cacheWriteTokens: 500,
					inputTokens: 2000,
					modelId: "openai/gpt-5.6-luna",
					outputTokens: 300,
					reasoningTokens: 0,
					tools: [],
				},
			])
		).toMatchObject({
			estimatedCostUsd: 0.003025,
		});
	});

});

describe("production shadow outcome quality", () => {
	test("reports which completed outcomes would surface to a user", () => {
		expect(
			summarizeShadowOutcomes([
				{
					outcome: {
						impact: null,
						next: { type: "ask" },
						rootCause: null,
					},
					toolCallCount: 3,
				},
				{
					outcome: {
						impact: "18 checkout sessions were affected.",
						next: { type: "act" },
						rootCause: "The tracking event was removed.",
					},
					toolCallCount: 5,
				},
				{
					outcome: {
						impact: null,
						next: { type: "watch" },
						rootCause: null,
					},
					toolCallCount: 1,
				},
				{ outcome: null, toolCallCount: 0 },
			])
		).toEqual({
			next: { act: 1, ask: 1, watch: 1 },
			rootCause: { known: 1, unknown: 2 },
			surfaced: 1,
			toolCalls: { average: 3, max: 5, total: 9 },
		});
	});
});

describe("production shadow attempt deadline", () => {
	test("aborts timed-out work with the same generic error", async () => {
		let observedSignal: AbortSignal | undefined;
		const attempt = runCancellableAttempt(
			(signal) => {
				observedSignal = signal;
				return new Promise((_resolve, reject) => {
					signal.addEventListener("abort", () => reject(signal.reason), {
						once: true,
					});
				});
			},
			5
		);

		await expect(attempt).rejects.toThrow(
			"Production shadow attempt exceeded 5ms"
		);
		expect(observedSignal?.aborted).toBe(true);
		expect((observedSignal?.reason as Error).name).toBe("TimeoutError");
	});

	test("returns completed work before the deadline", async () => {
		let observedSignal: AbortSignal | undefined;
		await expect(
			runCancellableAttempt(async (signal) => {
				observedSignal = signal;
				expect(signal.aborted).toBe(false);
				return "done";
			}, 5)
		).resolves.toBe("done");

		await Bun.sleep(10);
		expect(observedSignal?.aborted).toBe(false);
	});

	test("keeps concurrent attempt deadlines isolated", async () => {
		let completedSignal: AbortSignal | undefined;
		const timedOut = runCancellableAttempt(
			(signal) =>
				new Promise((_resolve, reject) => {
					signal.addEventListener("abort", () => reject(signal.reason), {
						once: true,
					});
				}),
			5
		);
		const completed = runCancellableAttempt(async (signal) => {
			completedSignal = signal;
			await Bun.sleep(15);
			return "done";
		}, 50);

		await expect(timedOut).rejects.toThrow(
			"Production shadow attempt exceeded 5ms"
		);
		await expect(completed).resolves.toBe("done");
		expect(completedSignal?.aborted).toBe(false);
	});
});
