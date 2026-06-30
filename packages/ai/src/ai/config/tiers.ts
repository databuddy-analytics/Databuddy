import type { AgentModelKey } from "./models";
import type { AgentThinking } from "../agents/types";

interface TierConfig {
	promptCaching: boolean;
	supportsThinking: boolean;
	temperature: number;
	thinkingBudgets: Record<Exclude<AgentThinking, "off">, number> | null;
}

export const TIER_CONFIG: Record<AgentModelKey, TierConfig> = {
	quick: {
		supportsThinking: false,
		promptCaching: false,
		temperature: 0.1,
		thinkingBudgets: null,
	},
	balanced: {
		supportsThinking: true,
		promptCaching: true,
		temperature: 0.1,
		thinkingBudgets: {
			low: 2048,
			medium: 8192,
			high: 16_384,
		},
	},
	deep: {
		supportsThinking: false,
		promptCaching: false,
		temperature: 0.1,
		thinkingBudgets: null,
	},
};
