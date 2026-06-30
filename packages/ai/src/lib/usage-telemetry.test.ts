import { describe, expect, test } from "bun:test";
import { summarizeAgentUsage } from "./usage-telemetry";

describe("summarizeAgentUsage", () => {
	test("treats Sonnet 4.6 as first-class priced instead of fallback-priced", () => {
		const summary = summarizeAgentUsage("anthropic/claude-sonnet-4.6", {
			inputTokens: 1_000_000,
			outputTokens: 1_000_000,
		});

		expect(summary.cost_fallback).toBe(false);
		expect(summary.cost_model_id).toBe("anthropic/claude-sonnet-4.6");
		expect(summary.cost_total_usd).toBe(18);
		expect(summary.agent_credits_used).toBe(360);
	});

	test("bills cache-write tokens at the Sonnet 1-hour cache-write rate", () => {
		const summary = summarizeAgentUsage("anthropic/claude-sonnet-4.6", {
			inputTokens: 1_000_000,
			outputTokens: 0,
			inputTokenDetails: { cacheWriteTokens: 1_000_000 },
		});

		expect(summary.fresh_input_tokens).toBe(0);
		expect(summary.cost_input_usd).toBe(0);
		expect(summary.cost_cache_write_usd).toBe(6);
		expect(summary.cost_total_usd).toBe(6);
		expect(summary.agent_credits_used).toBe(120);
	});

	test("uses Gemini 2.5 Flash Lite pricing for quick agent runs", () => {
		const summary = summarizeAgentUsage("google/gemini-2.5-flash-lite", {
			inputTokens: 1_000_000,
			outputTokens: 1_000_000,
		});

		expect(summary.cost_fallback).toBe(false);
		expect(summary.cost_model_id).toBe("google/gemini-2.5-flash-lite");
		expect(summary.cost_total_usd).toBe(0.5);
		expect(summary.agent_credits_used).toBe(10);
	});

	test("uses DeepSeek V4 Flash pricing for Slack without falling back to Sonnet", () => {
		const summary = summarizeAgentUsage("deepseek/deepseek-v4-flash", {
			inputTokens: 1_000_000,
			outputTokens: 1_000_000,
		});

		expect(summary.cost_fallback).toBe(false);
		expect(summary.cost_model_id).toBe("deepseek/deepseek-v4-flash");
		expect(summary.cost_total_usd).toBe(0.42);
		expect(summary.agent_credits_used).toBe(8.4);
	});

	test("uses GPT OSS 120B pricing for title generation telemetry if summarized", () => {
		const summary = summarizeAgentUsage("openai/gpt-oss-120b", {
			inputTokens: 1_000_000,
			outputTokens: 1_000_000,
		});

		expect(summary.cost_fallback).toBe(false);
		expect(summary.cost_model_id).toBe("openai/gpt-oss-120b");
		expect(summary.cost_total_usd).toBe(0.6);
		expect(summary.agent_credits_used).toBe(12);
	});
});
