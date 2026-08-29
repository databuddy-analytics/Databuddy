import { describe, expect, test } from "bun:test";
import {
	AGENT_CREDIT_MARKUP,
	AGENT_CREDITS_PER_USD,
	AGENT_MODEL_COSTS_USD_PER_MILLION,
	AGENT_PRICING_BASELINE_MODEL_ID,
	lookupAgentModelCost,
	resolveAgentModelCost,
	usdToAgentCredits,
} from "./agent-credits";

describe("agent credit math", () => {
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

});

describe("agent model cost resolution", () => {
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
