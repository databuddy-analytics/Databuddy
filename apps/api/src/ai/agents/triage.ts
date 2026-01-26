import { Agent } from "@ai-sdk-tools/agents";
import type { LanguageModel } from "ai";
import { minimalMemoryConfig } from "../config/memory";
import { models } from "../config/models";
import { buildTriageInstructions } from "../prompts/triage";
import * as analytics from "./analytics";
import type { AgentContext, StreamConfig } from "./types";

export const streamConfig: StreamConfig = {
	maxRounds: 1,
	maxSteps: 5,
};

export function create(context: AgentContext) {
	return new Agent({
		name: "triage",
		model: models.triage as LanguageModel,
		temperature: 0.1,
		instructions: buildTriageInstructions,
		memory: minimalMemoryConfig,
		maxTurns: 1,
		handoffs: [analytics.create(context)],
		modelSettings: {
			toolChoice: { type: "tool", toolName: "handoff_to_agent" },
			failureMode: { maxAttempts: 2 },
		},
	});
}
