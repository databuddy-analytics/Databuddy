import { stepCountIs } from "ai";
import { models } from "../config/models";
import { cachedSystemPrompt } from "../config/prompt-cache";
import { createMcpAgentTools } from "../mcp/agent-tools";
import { buildAnalyticsInstructionsForMcp } from "../prompts/analytics";
import { maxSteps } from "./analytics";

export function createMcpAgentConfig(context: {
	billingCustomerId?: string | null;
	requestHeaders: Headers;
	apiKey: unknown;
	userId: string | null;
	timezone?: string;
	chatId?: string;
}) {
	const timezone = context.timezone ?? "UTC";
	const tools = createMcpAgentTools();
	const system = buildAnalyticsInstructionsForMcp({
		timezone,
		currentDateTime: new Date().toISOString(),
	});

	const experimental_context = {
		apiKey: context.apiKey,
		billingCustomerId: context.billingCustomerId,
		chatId: context.chatId ?? crypto.randomUUID(),
		currentDateTime: new Date().toISOString(),
		requestHeaders: context.requestHeaders,
		timezone,
		userId: context.userId ?? "",
		websiteId: "",
		websiteDomain: "",
	};

	return {
		model: models.analytics,
		system: cachedSystemPrompt(system),
		tools,
		stopWhen: stepCountIs(maxSteps),
		temperature: 0.1,
		experimental_context,
	};
}
