import { stepCountIs } from "ai";
import { ANTHROPIC_CACHE_1H, models } from "../config/models";
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
	const currentDateTime = new Date().toISOString();
	const chatId = context.chatId ?? crypto.randomUUID();

	return {
		model: models.balanced,
		system: {
			role: "system" as const,
			content: buildAnalyticsInstructionsForMcp({ timezone, currentDateTime }),
			providerOptions: ANTHROPIC_CACHE_1H,
		},
		tools: createMcpAgentTools(),
		stopWhen: stepCountIs(maxSteps),
		temperature: 0.1,
		experimental_context: {
			apiKey: context.apiKey,
			billingCustomerId: context.billingCustomerId,
			chatId,
			currentDateTime,
			requestHeaders: context.requestHeaders,
			timezone,
			userId: context.userId ?? "",
			websiteId: "",
			websiteDomain: "",
		},
	};
}
