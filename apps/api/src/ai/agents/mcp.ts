import { type LanguageModel, stepCountIs } from "ai";
import type { models } from "../config/models";
import { createMcpAgentTools } from "../mcp/agent-tools";
import { buildAnalyticsInstructionsForMcp } from "../prompts/analytics";
import { maxSteps } from "./analytics";

export function createMcpAgentConfig(
	model: (typeof models)["analytics"],
	context: {
		requestHeaders: Headers;
		apiKey: unknown;
		userId: string | null;
		timezone?: string;
		chatId?: string;
	}
) {
	const timezone = context.timezone ?? "UTC";
	const tools = createMcpAgentTools();
	const system = buildAnalyticsInstructionsForMcp({
		timezone,
		currentDateTime: new Date().toISOString(),
	});

	const experimental_context = {
		userId: context.userId ?? "",
		websiteId: "",
		websiteDomain: "",
		timezone,
		currentDateTime: new Date().toISOString(),
		chatId: context.chatId ?? crypto.randomUUID(),
		requestHeaders: context.requestHeaders,
		apiKey: context.apiKey,
	};

	return {
		model: model as LanguageModel,
		system,
		tools,
		stopWhen: stepCountIs(maxSteps),
		temperature: 0.3,
		experimental_context,
	};
}
