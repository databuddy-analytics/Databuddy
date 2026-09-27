import { ToolLoopAgent } from "ai";
import { AI_MODEL_MAX_RETRIES, ANTHROPIC_CACHE_1H } from "../config/models";
import type { AgentConfig } from "./types";

type ConversationCallbacks = Pick<
	ConstructorParameters<typeof ToolLoopAgent>[0],
	"experimental_telemetry" | "onStepFinish"
>;

export function createConversationAgent(
	config: AgentConfig,
	callbacks: ConversationCallbacks = {}
) {
	return new ToolLoopAgent({
		model: config.model,
		instructions: config.system,
		tools: config.tools,
		activeTools: config.activeTools,
		stopWhen: config.stopWhen,
		temperature: config.temperature,
		providerOptions: config.providerOptions,
		maxRetries: AI_MODEL_MAX_RETRIES,
		experimental_context: config.experimental_context,
		...callbacks,
		prepareStep({ messages }) {
			const last = messages.at(-1);
			if (
				config.model.modelId.startsWith("anthropic/") &&
				last?.role === "user" &&
				!last.providerOptions
			) {
				return {
					messages: [
						...messages.slice(0, -1),
						{ ...last, providerOptions: ANTHROPIC_CACHE_1H },
					],
				};
			}
			return { messages };
		},
	});
}
