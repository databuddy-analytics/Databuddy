import {
	AGENT_PRICING_BASELINE_MODEL_ID,
	resolveAgentModelCost,
	usdPerMillionTokensToAgentCreditsPerToken,
} from "@databuddy/shared/agent-credits";

export const BASELINE_MODEL_ID = AGENT_PRICING_BASELINE_MODEL_ID;

const baseline = resolveAgentModelCost(BASELINE_MODEL_ID).cost;

export const AGENT_CREDIT_SCHEMA = {
	input: usdPerMillionTokensToAgentCreditsPerToken(baseline.input),
	output: usdPerMillionTokensToAgentCreditsPerToken(baseline.output),
	cacheRead: usdPerMillionTokensToAgentCreditsPerToken(baseline.cache_read),
	cacheWrite: usdPerMillionTokensToAgentCreditsPerToken(baseline.cache_write),
};
