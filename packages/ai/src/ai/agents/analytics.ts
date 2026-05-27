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
import { createToolkit } from "../tools/toolkit";
import type { AgentConfig, AgentContext, AgentThinking } from "./types";

function thinkingProviderOptions(
	thinking: AgentThinking | undefined,
	modelKey: AgentModelKey
): AgentConfig["providerOptions"] {
	const tier = TIER_CONFIG[modelKey];
	if (!(tier.supportsThinking && thinking) || thinking === "off") {
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
		tools: createToolkit({
			capabilities: [
				"analytics",
				"investigation",
				"mutations",
				"memory",
				"dashboard",
			],
			domain: context.websiteDomain,
			organizationId: context.organizationId,
			userId: context.userId,
		}),
		stopWhen: stepCountIs(tier.maxSteps),
		temperature: tier.temperature,
		providerOptions: thinkingProviderOptions(context.thinking, modelKey),
		experimental_context: appContext,
	};
}
