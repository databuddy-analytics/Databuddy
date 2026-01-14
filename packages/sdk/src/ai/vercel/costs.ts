import type { TokenCost } from "./types";

/**
 * Compute costs using TokenLens
 */
export const computeCosts = async (
	modelId: string,
	provider: string,
	usage: { inputTokens: number; outputTokens: number },
): Promise<TokenCost> => {
	try {
		const { computeCostUSD } = await import("tokenlens");
		const result = await computeCostUSD({
			modelId,
			provider,
			usage: {
				input_tokens: usage.inputTokens,
				output_tokens: usage.outputTokens,
			},
		});
		return {
			inputTokenCostUSD: result.inputTokenCostUSD,
			outputTokenCostUSD: result.outputTokenCostUSD,
			totalTokenCostUSD: result.totalTokenCostUSD,
		};
	} catch {
		return {};
	}
};
