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

export type AgentUsage = LanguageModelUsage & {
	stepUsages?: LanguageModelUsage[];
};

export type UsageTelemetry = ReturnType<typeof summarizeAgentUsage>;

const num = (value: number | undefined): number =>
	typeof value === "number" && Number.isFinite(value) ? value : 0;

export function summarizeAgentUsage(modelId: string, usage: AgentUsage) {
	const costModel = resolveCostModel(modelId);
	const summary = {
		input_tokens: 0,
		fresh_input_tokens: 0,
		output_tokens: 0,
		cache_read_tokens: 0,
		cache_write_tokens: 0,
		reasoning_tokens: 0,
		cost_input_usd: 0,
		cost_output_usd: 0,
		cost_total_usd: 0,
		cost_cache_read_usd: 0,
		cost_cache_write_usd: 0,
		cost_reasoning_usd: 0,
		cost_model_id: costModel.id,
		cost_fallback: costModel.fallback,
	};
	// Completed requests are authoritative, including after a stream abort.
	const usages = usage.stepUsages?.length ? usage.stepUsages : [usage];
	for (const stepUsage of usages) {
		const model = resolveCostModel(modelId, num(stepUsage.inputTokens));
		const inputTokens = num(stepUsage.inputTokens);
		const outputTokens = num(stepUsage.outputTokens);
		const cacheReadTokens = num(stepUsage.inputTokenDetails?.cacheReadTokens);
		const cacheWriteTokens = num(stepUsage.inputTokenDetails?.cacheWriteTokens);
		const reasoningTokens = num(stepUsage.outputTokenDetails?.reasoningTokens);
		const freshInputTokens = num(
			stepUsage.inputTokenDetails?.noCacheTokens ??
				Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens)
		);
		// Context tiers and rounding apply to each request, never the run total.
		const costs = computeTokenCostsForModel({
			model,
			usage: {
				input_tokens: freshInputTokens,
				// Native output totals include reasoning; separate rates must not overlap.
				output_tokens:
					model.cost.reasoning === undefined
						? outputTokens
						: Math.max(0, outputTokens - reasoningTokens),
				cache_read_tokens: cacheReadTokens,
				cache_write_tokens: cacheWriteTokens,
				reasoning_tokens: reasoningTokens,
			},
		});
		summary.input_tokens += inputTokens;
		summary.fresh_input_tokens += freshInputTokens;
		summary.output_tokens += outputTokens;
		summary.cache_read_tokens += cacheReadTokens;
		summary.cache_write_tokens += cacheWriteTokens;
		summary.reasoning_tokens += reasoningTokens;
		summary.cost_input_usd += num(costs.inputTokenCostUSD);
		summary.cost_output_usd += num(costs.outputTokenCostUSD);
		summary.cost_total_usd += num(costs.totalTokenCostUSD);
		summary.cost_cache_read_usd += num(costs.cacheReadTokenCostUSD);
		summary.cost_cache_write_usd += num(costs.cacheWriteTokenCostUSD);
		summary.cost_reasoning_usd += num(costs.reasoningTokenCostUSD);
	}
	return {
		...summary,
		total_tokens: summary.input_tokens + summary.output_tokens,
		cost_input_usd: num(summary.cost_input_usd),
		cost_output_usd: num(summary.cost_output_usd),
		cost_total_usd: num(summary.cost_total_usd),
		cost_cache_read_usd: num(summary.cost_cache_read_usd),
		cost_cache_write_usd: num(summary.cost_cache_write_usd),
		cost_reasoning_usd: num(summary.cost_reasoning_usd),
		agent_credits_used: usdToAgentCredits(summary.cost_total_usd),
	};
}
