import { models } from "../config";
import { buildTriageInstructions } from "../prompts/triage";
import { analyticsAgent } from "./analytics";
import { createAgent } from "./factory";
import { funnelsAgent } from "./funnels";

/**
 * Triage agent that routes user requests to the appropriate specialist.
 * This is the main entry point for all agent interactions.
 */
export const triageAgent = createAgent({
	name: "triage",
	model: models.triage,
	temperature: 0.1,
	modelSettings: {
		toolChoice: {
			type: "tool",
			toolName: "handoff_to_agent",
		},
		failureMode: {
			maxAttempts: 2,
		},
	},
	instructions: buildTriageInstructions,
	handoffs: [analyticsAgent, funnelsAgent],
	maxTurns: 1,
});