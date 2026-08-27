import { describe, expect, test } from "bun:test";
import {
	AGENT_CREDIT_MARKUP,
	AGENT_CREDIT_MARKUP_PERCENT,
	AGENT_CREDITS_PER_USD,
	AGENT_MODEL_COSTS_USD_PER_MILLION,
	AGENT_PRICING_BASELINE_MODEL_ID,
	lookupAgentModelCost,
	resolveAgentModelCost,
	usdPerMillionTokensToAgentCreditsPerToken,
	usdToAgentCredits,
} from "./agent-credits";

describe("agent credit math", () => {
	test("derives the markup multiplier from the configured percent", () => {
		expect(AGENT_CREDIT_MARKUP).toBe(1 + AGENT_CREDIT_MARKUP_PERCENT / 100);
	});

	test("converts USD into credits with markup applied", () => {
		expect(usdToAgentCredits(1)).toBe(
			AGENT_CREDITS_PER_USD * AGENT_CREDIT_MARKUP
		);
		expect(usdToAgentCredits(0.1)).toBe(
			0.1 * AGENT_CREDITS_PER_USD * AGENT_CREDIT_MARKUP
		);
	});

	test("clamps non-billable amounts to zero", () => {
		expect(usdToAgentCredits(0)).toBe(0);
		expect(usdToAgentCredits(-5)).toBe(0);
		expect(usdToAgentCredits(Number.NaN)).toBe(0);
		expect(usdToAgentCredits(Number.POSITIVE_INFINITY)).toBe(0);
	});

	test("avoids floating-point residue in credit amounts", () => {
		expect(usdToAgentCredits(0.1 + 0.2)).toBe(
			0.3 * AGENT_CREDITS_PER_USD * AGENT_CREDIT_MARKUP
		);
	});

	test("converts per-million-token prices into per-token credits", () => {
		expect(usdPerMillionTokensToAgentCreditsPerToken(3)).toBe(
			(3 / 1_000_000) * AGENT_CREDITS_PER_USD * AGENT_CREDIT_MARKUP
		);
		expect(usdPerMillionTokensToAgentCreditsPerToken(0)).toBe(0);
	});
});

describe("agent model cost resolution", () => {
	test("resolves an explicit price for every configured model", () => {
		for (const modelId of Object.keys(AGENT_MODEL_COSTS_USD_PER_MILLION)) {
			expect(resolveAgentModelCost(modelId)).toEqual({
				cost: AGENT_MODEL_COSTS_USD_PER_MILLION[modelId],
				fallback: false,
				id: modelId,
			});
		}
	});

	test("keeps an explicit price entry for the pricing baseline model", () => {
		expect(
			AGENT_MODEL_COSTS_USD_PER_MILLION[AGENT_PRICING_BASELINE_MODEL_ID]
		).toBeDefined();
	});

	test("falls back to baseline pricing for unknown models", () => {
		expect(lookupAgentModelCost("unknown/model")).toBeNull();
		expect(resolveAgentModelCost("unknown/model")).toEqual({
			cost: AGENT_MODEL_COSTS_USD_PER_MILLION[AGENT_PRICING_BASELINE_MODEL_ID],
			fallback: true,
			id: AGENT_PRICING_BASELINE_MODEL_ID,
		});
	});
});
