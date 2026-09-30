import {
	lookupAgentModelCost,
	resolveAgentModelCost,
	usdToAgentCredits,
} from "@databuddy/shared/agent-credits";
import type { LanguageModelUsage } from "ai";
import type { SourceModel } from "tokenlens";
import { computeTokenCostsForModel } from "tokenlens/helpers";
import { vercelModels } from "tokenlens/providers/vercel";

const catalogModels: Record<
	string,
	Omit<SourceModel, "canonical_id">
> = vercelModels.models;

function resolveCostModel(modelId: string, inputTokens = 0) {
	const configured = lookupAgentModelCost(modelId, inputTokens);
	const catalogModel = catalogModels[modelId];
	const resolved =
		configured ??
		(catalogModel?.cost
			? { cost: catalogModel.cost, fallback: false, id: catalogModel.id }
			: resolveAgentModelCost(modelId));
	return {
		...resolved,
		canonical_id: resolved.id,
		name: resolved.id,
	} satisfies SourceModel;
}

function toCostUsage(usage: LanguageModelUsage) {
	return {
		input_tokens:
			num(usage.inputTokenDetails?.noCacheTokens) ||
			Math.max(
				0,
				num(usage.inputTokens) -
					num(usage.inputTokenDetails?.cacheReadTokens) -
					num(usage.inputTokenDetails?.cacheWriteTokens)
			),
		output_tokens: usage.outputTokens,
		cache_read_tokens: usage.inputTokenDetails?.cacheReadTokens,
		cache_write_tokens: usage.inputTokenDetails?.cacheWriteTokens,
		reasoning_tokens: usage.outputTokenDetails?.reasoningTokens,
	};
}

export type AgentUsage = LanguageModelUsage & {
	stepUsages?: LanguageModelUsage[];
};

export type UsageTelemetry = ReturnType<typeof summarizeAgentUsage>;

const num = (value: number | undefined): number =>
	typeof value === "number" && Number.isFinite(value) ? value : 0;

export function summarizeAgentUsage(modelId: string, usage: AgentUsage) {
	const inputTokens = num(usage.inputTokens);
	const outputTokens = num(usage.outputTokens);
	const cacheReadTokens = num(usage.inputTokenDetails?.cacheReadTokens);
	const cacheWriteTokens = num(usage.inputTokenDetails?.cacheWriteTokens);
	const freshInputTokens = toCostUsage(usage).input_tokens;
	const costModel = resolveCostModel(modelId);
	const costs = {
		inputTokenCostUSD: 0,
		outputTokenCostUSD: 0,
		totalTokenCostUSD: 0,
		cacheReadTokenCostUSD: 0,
		cacheWriteTokenCostUSD: 0,
		reasoningTokenCostUSD: 0,
	};
	// Context pricing is per request, never the sum of an agent's steps.
	const usages = usage.stepUsages?.length ? usage.stepUsages : [usage];
	for (const stepUsage of usages) {
		const stepCosts = computeTokenCostsForModel({
			model: resolveCostModel(modelId, num(stepUsage.inputTokens)),
			usage: toCostUsage(stepUsage),
		});
		costs.inputTokenCostUSD += num(stepCosts.inputTokenCostUSD);
		costs.outputTokenCostUSD += num(stepCosts.outputTokenCostUSD);
		costs.totalTokenCostUSD += num(stepCosts.totalTokenCostUSD);
		costs.cacheReadTokenCostUSD += num(stepCosts.cacheReadTokenCostUSD);
		costs.cacheWriteTokenCostUSD += num(stepCosts.cacheWriteTokenCostUSD);
		costs.reasoningTokenCostUSD += num(stepCosts.reasoningTokenCostUSD);
	}
	const costTotalUsd = num(costs.totalTokenCostUSD);

	return {
		input_tokens: inputTokens,
		fresh_input_tokens: freshInputTokens,
		output_tokens: outputTokens,
		total_tokens: inputTokens + outputTokens,
		cache_read_tokens: cacheReadTokens,
		cache_write_tokens: cacheWriteTokens,
		reasoning_tokens: num(usage.outputTokenDetails?.reasoningTokens),
		cost_input_usd: num(costs.inputTokenCostUSD),
		cost_output_usd: num(costs.outputTokenCostUSD),
		cost_total_usd: costTotalUsd,
		cost_cache_read_usd: num(costs.cacheReadTokenCostUSD),
		cost_cache_write_usd: num(costs.cacheWriteTokenCostUSD),
		cost_reasoning_usd: num(costs.reasoningTokenCostUSD),
		cost_model_id: costModel.id,
		cost_fallback: costModel.fallback,
		agent_credits_used: usdToAgentCredits(costTotalUsd),
	};
}
