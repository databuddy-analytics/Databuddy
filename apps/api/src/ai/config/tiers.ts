import type { AgentModelKey } from "./models";
import type { AgentThinking } from "../agents/types";

interface TierConfig {
	maxSteps: number;
	supportsThinking: boolean;
	promptCaching: boolean;
	temperature: number;
	thinkingBudgets: Record<Exclude<AgentThinking, "off">, number> | null;
}

export const TIER_CONFIG: Record<AgentModelKey, TierConfig> = {
	quick: {
		maxSteps: 10,
		supportsThinking: false,
		promptCaching: false,
		temperature: 0.1,
		thinkingBudgets: null,
	},
	balanced: {
		maxSteps: 20,
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
		maxSteps: 20,
		supportsThinking: false,
		promptCaching: false,
		temperature: 0.1,
		thinkingBudgets: null,
	},
};
