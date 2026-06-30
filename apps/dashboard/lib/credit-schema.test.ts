import { describe, expect, test } from "bun:test";
import { AGENT_CREDIT_SCHEMA, BASELINE_MODEL_ID } from "./credit-schema";

describe("agent credit schema", () => {
	test("prices dashboard agent credits from current Sonnet pricing", () => {
		expect(BASELINE_MODEL_ID).toBe("anthropic/claude-sonnet-4.6");
		expect(AGENT_CREDIT_SCHEMA).toEqual({
			input: 0.000_06,
			output: 0.000_3,
			cacheRead: 0.000_006,
			cacheWrite: 0.000_12,
		});
	});
});
