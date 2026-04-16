import type { LanguageModelUsage } from "ai";
import { getUsage } from "tokenlens/helpers";
import { vercelModels } from "tokenlens/providers/vercel";

/**
 * Best-effort token telemetry for the agent route.
 *
 * - Always returns raw token counts from the AI SDK usage object.
 * - Looks up USD cost in the Vercel AI Gateway catalog. Falls back to
 *   `anthropic/claude-4-sonnet` when the exact model id isn't recognized
 *   (the gateway uses `claude-sonnet-4.6` which the catalog doesn't ship
 *   yet — directionally correct cost). The `costFallback` flag lets
 *   downstream analytics filter or correct estimated rows.
 */

const FALLBACK_MODEL_ID = "anthropic/claude-4-sonnet";

export interface UsageTelemetry {
	cache_read_tokens: number;
	cache_write_tokens: number;
	cost_cache_read_usd: number;
	cost_cache_write_usd: number;
	cost_fallback: boolean;
	cost_input_usd: number;
	cost_model_id: string;
	cost_output_usd: number;
	cost_reasoning_usd: number;
	cost_total_usd: number;
	/** Fresh, non-cached input tokens — what to bill at the input rate. */
	fresh_input_tokens: number;
	/** Total input tokens reported by the provider (cache + non-cache). */
	input_tokens: number;
	output_tokens: number;
	reasoning_tokens: number;
	total_tokens: number;
	[k: string]: string | number | boolean;
}

const num = (value: number | undefined): number =>
	typeof value === "number" && Number.isFinite(value) ? value : 0;

export function summarizeAgentUsage(
	modelId: string,
	usage: LanguageModelUsage
): UsageTelemetry {
	const inputTokens = num(usage.inputTokens);
	const outputTokens = num(usage.outputTokens);
	const cacheReadTokens = num(usage.inputTokenDetails?.cacheReadTokens);
	const cacheWriteTokens = num(usage.inputTokenDetails?.cacheWriteTokens);
	// Prefer the provider-reported fresh count; fall back to subtraction if
	// the provider doesn't expose it explicitly.
	const freshInputTokens =
		num(usage.inputTokenDetails?.noCacheTokens) ||
		Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens);

	let costModelId = modelId;
	let costs = getUsage({
		modelId,
		usage,
		providers: vercelModels,
	}).costUSD;

	if (costs?.totalUSD === undefined) {
		costModelId = FALLBACK_MODEL_ID;
		costs = getUsage({
			modelId: FALLBACK_MODEL_ID,
			usage,
			providers: vercelModels,
		}).costUSD;
	}

	return {
		input_tokens: inputTokens,
		fresh_input_tokens: freshInputTokens,
		output_tokens: outputTokens,
		total_tokens: inputTokens + outputTokens,
		cache_read_tokens: cacheReadTokens,
		cache_write_tokens: cacheWriteTokens,
		reasoning_tokens: num(usage.outputTokenDetails?.reasoningTokens),
		cost_input_usd: num(costs?.inputUSD),
		cost_output_usd: num(costs?.outputUSD),
		cost_total_usd: num(costs?.totalUSD),
		cost_cache_read_usd: num(costs?.cacheReadUSD),
		cost_cache_write_usd: num(costs?.cacheWriteUSD),
		cost_reasoning_usd: num(costs?.reasoningUSD),
		cost_model_id: costModelId,
		cost_fallback: costModelId !== modelId,
	};
}
