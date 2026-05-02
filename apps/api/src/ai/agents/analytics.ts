import { stepCountIs } from "ai";
import type { AppContext } from "../config/context";
import {
	type AgentModelKey,
	ANTHROPIC_CACHE_1H,
	createModelFromId,
	models,
} from "../config/models";
import { TIER_CONFIG } from "../config/tiers";
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

const analyticsTools = {
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

function thinkingProviderOptions(
	thinking: AgentThinking | undefined,
	modelKey: AgentModelKey
): AgentConfig["providerOptions"] {
	const tier = TIER_CONFIG[modelKey];
	if (!tier.supportsThinking || !thinking || thinking === "off") {
		return;
	}
	const budget = tier.thinkingBudgets?.[thinking];
	if (!budget) {
		return;
	}
	return {
		anthropic: {
			thinking: { type: "enabled", budgetTokens: budget },
		},
	};
}

export function createConfig(
	context: AgentContext,
	modelKey: AgentModelKey = "balanced",
	modelOverride?: string | null
): AgentConfig {
	const tier = TIER_CONFIG[modelKey];

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

	const useOverride = modelOverride != null;

	return {
		model: useOverride ? createModelFromId(modelOverride) : models[modelKey],
		system: {
			role: "system",
			content: buildAnalyticsInstructions(appContext),
			providerOptions: tier.promptCaching ? ANTHROPIC_CACHE_1H : undefined,
		},
		tools: analyticsTools,
		stopWhen: stepCountIs(tier.maxSteps),
		temperature: tier.temperature,
		providerOptions: thinkingProviderOptions(context.thinking, modelKey),
		experimental_context: appContext,
	};
}
