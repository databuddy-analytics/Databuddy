import { Agent } from "@ai-sdk-tools/agents";
import type { LanguageModel } from "ai";
import { maxMemoryConfig, standardMemoryConfig } from "../config/memory";
import { models } from "../config/models";
import { buildReflectionInstructions } from "../prompts/reflection";
import * as analytics from "./analytics";
import type { AgentContext, StreamConfig } from "./types";

export const streamConfig: StreamConfig = {
	maxRounds: 5,
	maxSteps: 20,
};

export const maxStreamConfig: StreamConfig = {
	maxRounds: 10,
	maxSteps: 40,
};

export function create(context: AgentContext) {
	console.log("[Reflection Agent] Creating reflection agent");
	return new Agent({
		name: "reflection",
		model: models.analytics as LanguageModel,
		temperature: 0,
		instructions: (ctx) => {
			const prompt = buildReflectionInstructions(ctx);
			console.log("[Reflection Agent] Instructions length:", prompt.length);
			return prompt;
		},
		memory: standardMemoryConfig,
		maxTurns: 15,
		handoffs: [analytics.create(context)],
		modelSettings: {
			failureMode: { maxAttempts: 2 },
		},
	});
}

export function createMax(context: AgentContext) {
	return new Agent({
		name: "reflection-max",
		model: models.advanced as LanguageModel,
		temperature: 0,
		instructions: buildReflectionInstructions,
		memory: maxMemoryConfig,
		maxTurns: 20,
		handoffs: [analytics.create(context)],
		modelSettings: {
			failureMode: { maxAttempts: 2 },
		},
	});
}
