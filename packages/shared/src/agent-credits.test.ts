import { describe, expect, test } from "bun:test";
import {
	AGENT_CREDIT_MARKUP,
	AGENT_CREDIT_MARKUP_PERCENT,
	AGENT_PRICING_BASELINE_MODEL_ID,
	MIN_AGENT_CREDIT_CHECK_BALANCE,
	resolveAgentModelCost,
	usdPerMillionTokensToAgentCreditsPerToken,
	usdToAgentCredits,
} from "./agent-credits";

describe("agent credit math", () => {
	test("converts USD into credits with the configured multiplier", () => {
		expect(AGENT_CREDIT_MARKUP_PERCENT).toBe(100);
		expect(AGENT_CREDIT_MARKUP).toBe(2);
		expect(usdToAgentCredits(0.1)).toBe(2);
	});

	test("converts model per-million-token prices into per-token credits", () => {
		expect(usdPerMillionTokensToAgentCreditsPerToken(3)).toBe(0.000_06);
		expect(usdPerMillionTokensToAgentCreditsPerToken(15)).toBe(0.000_3);
	});

	test("keeps explicit prices for every currently configured agent model", () => {
		expect(resolveAgentModelCost(AGENT_PRICING_BASELINE_MODEL_ID)).toEqual({
			cost: {
				input: 3,
				output: 15,
				cache_read: 0.3,
				cache_write: 6,
			},
			fallback: false,
			id: AGENT_PRICING_BASELINE_MODEL_ID,
		});
		expect(resolveAgentModelCost("google/gemini-2.5-flash-lite")).toMatchObject({
			cost: { input: 0.1, output: 0.4, cache_read: 0.01 },
			fallback: false,
		});
		expect(resolveAgentModelCost("deepseek/deepseek-v4-flash")).toMatchObject({
			cost: { input: 0.14, output: 0.28, cache_read: 0.028 },
			fallback: false,
		});
		expect(resolveAgentModelCost("openai/gpt-oss-120b")).toMatchObject({
			cost: { input: 0.1, output: 0.5 },
			fallback: false,
		});
	});

	test("keeps a small preflight threshold for fractional-credit requests", () => {
		expect(MIN_AGENT_CREDIT_CHECK_BALANCE).toBeGreaterThan(0);
		expect(MIN_AGENT_CREDIT_CHECK_BALANCE).toBeLessThan(1);
	});
});
