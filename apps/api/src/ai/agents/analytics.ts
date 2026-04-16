import { stepCountIs } from "ai";
import type { AppContext } from "../config/context";
import { models } from "../config/models";
import { cachedSystemPrompt } from "../config/prompt-cache";
import { buildAnalyticsInstructions } from "../prompts/analytics";
import { createAnnotationTools } from "../tools/annotations";
import { executeSqlQueryTool } from "../tools/execute-sql-query";
import { createFunnelTools } from "../tools/funnels";
import { getDataTool } from "../tools/get-data";
import { createGoalTools } from "../tools/goals";
import { createLinksTools } from "../tools/links";
import { createMemoryTools } from "../tools/memory";
import { createProfileTools } from "../tools/profiles";
import { webSearchTool } from "../tools/web-search";
import type { AgentConfig, AgentContext, AgentThinking } from "./types";

function createTools() {
	return {
		get_data: getDataTool,
		execute_sql_query: executeSqlQueryTool,
		web_search: webSearchTool,
		...createMemoryTools(),
		...createProfileTools(),
		...createFunnelTools(),
		...createGoalTools(),
		...createAnnotationTools(),
		...createLinksTools(),
	};
}

export const maxSteps = 20;

// Anthropic extended thinking budget per effort tier (tokens). Values are
// conservative — the model may use less but won't exceed this.
const THINKING_BUDGET: Record<Exclude<AgentThinking, "off">, number> = {
	low: 2048,
	medium: 8192,
	high: 16_384,
};

function buildProviderOptions(
	thinking: AgentThinking | undefined
): AgentConfig["providerOptions"] {
	if (!thinking || thinking === "off") {
		return;
	}
	return {
		anthropic: {
			thinking: { type: "enabled", budgetTokens: THINKING_BUDGET[thinking] },
		},
	};
}

export function createConfig(context: AgentContext): AgentConfig {
	const appContext: AppContext = {
		userId: context.userId,
		websiteId: context.websiteId,
		websiteDomain: context.websiteDomain,
		timezone: context.timezone,
		currentDateTime: new Date().toISOString(),
		chatId: context.chatId,
		requestHeaders: context.requestHeaders,
		billingCustomerId: context.billingCustomerId,
	};

	return {
		model: models.analytics,
		system: cachedSystemPrompt(buildAnalyticsInstructions(appContext)),
		tools: createTools(),
		stopWhen: stepCountIs(maxSteps),
		temperature: 0.1,
		providerOptions: buildProviderOptions(context.thinking),
		experimental_context: appContext,
	};
}
