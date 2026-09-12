import { describe, expect, test } from "bun:test";
import { summarizeAgentUsage } from "./usage-telemetry";

describe("summarizeAgentUsage", () => {
	test("records Luna fresh and cached costs without a model fallback", () => {
		const summary = summarizeAgentUsage("openai/gpt-5.6-luna", {
			inputTokens: 3_000_000,
			outputTokens: 1_000_000,
			inputTokenDetails: {
				cacheReadTokens: 1_000_000,
				cacheWriteTokens: 1_000_000,
			},
		});

		expect(summary.cost_fallback).toBe(false);
		expect(summary.cost_model_id).toBe("openai/gpt-5.6-luna");
		expect(summary.cost_input_usd).toBe(0.2);
		expect(summary.cost_cache_read_usd).toBe(0.02);
		expect(summary.cost_cache_write_usd).toBe(0.25);
		expect(summary.cost_output_usd).toBe(1.2);
		expect(summary.cost_total_usd).toBe(1.67);
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

	test("uses Terra cache pricing for insight investigations", () => {
		const summary = summarizeAgentUsage("openai/gpt-5.6-terra", {
			inputTokens: 3_000_000,
			outputTokens: 1_000_000,
			inputTokenDetails: {
				cacheReadTokens: 1_000_000,
				cacheWriteTokens: 1_000_000,
			},
		});

		expect(summary.cost_fallback).toBe(false);
		expect(summary.cost_model_id).toBe("openai/gpt-5.6-terra");
		expect(summary.cost_input_usd).toBe(2.5);
		expect(summary.cost_cache_read_usd).toBe(0.25);
		expect(summary.cost_cache_write_usd).toBe(3.125);
		expect(summary.cost_output_usd).toBe(15);
		expect(summary.cost_total_usd).toBe(20.875);
		expect(summary.agent_credits_used).toBe(417.5);
	});
});
