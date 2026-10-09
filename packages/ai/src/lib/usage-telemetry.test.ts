import { describe, expect, test } from "bun:test";
import type { LanguageModelUsage } from "ai";
import { summarizeAgentUsage } from "./usage-telemetry";

const emptyUsage: LanguageModelUsage = {
	inputTokens: undefined,
	outputTokens: undefined,
	totalTokens: undefined,
	inputTokenDetails: {
		noCacheTokens: undefined,
		cacheReadTokens: undefined,
		cacheWriteTokens: undefined,
	},
	outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
};

describe("summarizeAgentUsage", () => {
	test("uses Jev input-only pricing without a model fallback", () => {
		const summary = summarizeAgentUsage("typesafe-ai/jev", {
			...emptyUsage,
			inputTokens: 1_000_000,
			outputTokens: 1000,
			totalTokens: 1_001_000,
			inputTokenDetails: {
				noCacheTokens: 1_000_000,
				cacheReadTokens: undefined,
				cacheWriteTokens: undefined,
			},
			outputTokenDetails: { textTokens: 1000, reasoningTokens: undefined },
		});
		expect(summary.cost_fallback).toBe(false);
		expect(summary.cost_model_id).toBe("typesafe-ai/jev");
		expect(summary.cost_total_usd).toBe(0.042);
	});
	test("records Sol 6.1 fresh and cached costs without a model fallback", () => {
		const summary = summarizeAgentUsage("openai/gpt-6.1-sol", {
			...emptyUsage,
			inputTokens: 3000,
			outputTokens: 1000,
			inputTokenDetails: {
				noCacheTokens: 1000,
				cacheReadTokens: 1000,
				cacheWriteTokens: 1000,
			},
		});

		expect(summary.cost_fallback).toBe(false);
		expect(summary.cost_model_id).toBe("openai/gpt-6.1-sol");
		expect(summary.fresh_input_tokens).toBe(1000);
		expect(summary.cost_input_usd).toBeCloseTo(0.002, 9);
		expect(summary.cost_cache_read_usd).toBeCloseTo(0.0001, 9);
		expect(summary.cost_cache_write_usd).toBeCloseTo(0.0025, 9);
		expect(summary.cost_output_usd).toBeCloseTo(0.01, 9);
		expect(summary.cost_total_usd).toBeCloseTo(0.0146, 9);
	});

	test.each([
		{ inputTokens: 272_000, cost: 0.0415 },
		{ inputTokens: 272_001, cost: 0.078 },
	])("prices Sol's full request at its context tier: $inputTokens", ({
		inputTokens,
		cost,
	}) => {
		const summary = summarizeAgentUsage("openai/gpt-6.1-sol", {
			...emptyUsage,
			inputTokens,
			outputTokens: 1000,
			inputTokenDetails: {
				noCacheTokens: 1000,
				cacheReadTokens: inputTokens - 2000,
				cacheWriteTokens: 1000,
			},
		});
		expect(summary.cost_total_usd).toBeCloseTo(cost, 9);
		expect(summary.agent_credits_used).toBeCloseTo(cost * 20, 9);
		expect(summary.agent_steps).toBe(1);
	});

	test.each([
		{ secondInput: 200_000, cost: 0.82 },
		{ secondInput: 300_000, cost: 1.625 },
	])("prices Sol steps separately: $secondInput", ({ secondInput, cost }) => {
		const summary = summarizeAgentUsage("openai/gpt-6.1-sol", {
			...emptyUsage,
			inputTokens: 200_000 + secondInput,
			outputTokens: 2000,
			stepUsages: [
				{ ...emptyUsage, inputTokens: 200_000, outputTokens: 1000 },
				{ ...emptyUsage, inputTokens: secondInput, outputTokens: 1000 },
			],
		});
		expect(summary.input_tokens).toBe(200_000 + secondInput);
		expect(summary.cost_total_usd).toBeCloseTo(cost, 9);
		expect(summary.agent_credits_used).toBeCloseTo(cost * 20, 9);
	});
	test.each([
		{ missing: false },
		{ missing: true },
	])("counts steps: $missing", ({ missing }) => {
		const summary = summarizeAgentUsage("openai/gpt-6.1-sol", {
			...emptyUsage,
			inputTokens: missing ? undefined : 200_000,
			inputTokenDetails: {
				...emptyUsage.inputTokenDetails,
				noCacheTokens: missing ? undefined : 100_000,
			},
			stepUsages: [
				{
					...emptyUsage,
					inputTokens: 100_000,
					inputTokenDetails: {
						...emptyUsage.inputTokenDetails,
						noCacheTokens: 100_000,
					},
				},
				{ ...emptyUsage, inputTokens: 100_000, outputTokens: 1000 },
			],
		});
		expect(summary.input_tokens).toBe(200_000);
		expect(summary.fresh_input_tokens).toBe(200_000);
		expect(summary.output_tokens).toBe(1000);
		expect(summary.total_tokens).toBe(201_000);
		expect(summary.cost_total_usd).toBeCloseTo(0.41, 9);
		expect(summary.agent_steps).toBe(2);
	});
	test("preserves explicitly zero fresh input", () => {
		const summary = summarizeAgentUsage("openai/gpt-6.1-sol", {
			...emptyUsage,
			inputTokens: 1000,
			inputTokenDetails: { ...emptyUsage.inputTokenDetails, noCacheTokens: 0 },
		});
		expect(summary.fresh_input_tokens).toBe(0);
		expect(summary.cost_total_usd).toBe(0);
	});

	test.each([
		{ model: "xai/grok-3-mini", output: 0.0003, reasoning: 0.0002 },
		{ model: "openai/gpt-6.1-sol", output: 0.01, reasoning: 0 },
		{ model: "unknown/model", output: 0.015, reasoning: 0 },
	])("charges reasoning once: $model", ({ model, output, reasoning }) => {
		const summary = summarizeAgentUsage(model, {
			...emptyUsage,
			outputTokens: 1000,
			outputTokenDetails: { textTokens: 600, reasoningTokens: 400 },
		});
		expect(summary.cost_output_usd).toBe(output);
		expect(summary.cost_reasoning_usd).toBe(reasoning);
		expect(summary.cost_total_usd).toBeCloseTo(output + reasoning, 9);
		expect(summary.agent_credits_used).toBeCloseTo(
			(output + reasoning) * 20,
			9
		);
		expect(summary.cost_fallback).toBe(model === "unknown/model");
	});

	test("records Luna fresh and cached costs without a model fallback", () => {
		const summary = summarizeAgentUsage("openai/gpt-5.6-luna", {
			...emptyUsage,
			inputTokens: 3_000_000,
			outputTokens: 1_000_000,
			inputTokenDetails: {
				...emptyUsage.inputTokenDetails,
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
			...emptyUsage,
			inputTokens: 1_000_000,
			outputTokens: 0,
			inputTokenDetails: {
				...emptyUsage.inputTokenDetails,
				cacheWriteTokens: 1_000_000,
			},
		});

		expect(summary.fresh_input_tokens).toBe(0);
		expect(summary.cost_input_usd).toBe(0);
		expect(summary.cost_cache_write_usd).toBe(6);
		expect(summary.cost_total_usd).toBe(6);
		expect(summary.agent_credits_used).toBe(120);
	});

	test("uses DeepSeek V4 Flash pricing for Slack without falling back to Sonnet", () => {
		const summary = summarizeAgentUsage("deepseek/deepseek-v4-flash", {
			...emptyUsage,
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
			...emptyUsage,
			inputTokens: 3_000_000,
			outputTokens: 1_000_000,
			inputTokenDetails: {
				...emptyUsage.inputTokenDetails,
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
