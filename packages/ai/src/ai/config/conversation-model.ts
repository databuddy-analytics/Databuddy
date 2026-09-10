import type { SystemModelMessage } from "ai";
import type { AgentConfig, AgentThinking } from "../agents/types";
import { ANTHROPIC_CACHE_1H } from "./models";

export function conversationModelOptions(
	modelId: string,
	thinking?: AgentThinking
): Pick<AgentConfig, "temperature" | "providerOptions"> & {
	systemProviderOptions?: SystemModelMessage["providerOptions"];
} {
	const effort = thinking && thinking !== "off" ? thinking : undefined;
	if (modelId.startsWith("anthropic/")) {
		const budgets = { low: 2048, medium: 8192, high: 16_384 };
		return {
			systemProviderOptions: ANTHROPIC_CACHE_1H,
			temperature: effort ? undefined : 0.1,
			providerOptions: effort
				? {
						anthropic: {
							thinking: { type: "enabled", budgetTokens: budgets[effort] },
						},
					}
				: undefined,
		};
	}
	// Register effort support by concrete model ID, so changing the default tier
	// cannot send these OpenAI options to an unrelated model.
	if (modelId === "openai/gpt-5.6-terra" && effort) {
		return {
			temperature: undefined,
			providerOptions: { openai: { reasoningEffort: effort } },
		};
	}
	// "off" means no application override, not disabling model-native reasoning.
	return { temperature: 0.1 };
}
