import type { AppContext } from "../config/context";
import {
	type AgentModelKey,
	createModelFromId,
	modelNames,
} from "../config/models";
import { conversationModelOptions } from "../config/conversation-model";
import { buildAnalyticsInstructions } from "../prompts/analytics";
import { createToolkit } from "../tools/toolkit";
import { stopAtMaxSteps } from "./stop-conditions";
import type { AgentConfig, AgentContext } from "./types";

export function createConfig(
	context: AgentContext,
	modelKey: AgentModelKey = "balanced",
	modelOverride?: string | null
): AgentConfig {
	const modelId = modelOverride ?? modelNames[modelKey];
	const options = conversationModelOptions(modelId, context.thinking);

	const appContext: AppContext = {
		userId: context.userId,
		websiteId: context.websiteId,
		websiteDomain: context.websiteDomain,
		defaultWebsiteId: context.defaultWebsiteId ?? context.websiteId,
		accessibleWebsites: context.accessibleWebsites,
		organizationId: context.organizationId,
		source: "dashboard",
		timezone: context.timezone,
		currentDateTime: new Date().toISOString(),
		chatId: context.chatId,
		requestHeaders: context.requestHeaders,
		billingCustomerId: context.billingCustomerId,
	};

	return {
		model: createModelFromId(modelId),
		system: {
			role: "system",
			content: buildAnalyticsInstructions(appContext),
			providerOptions: options.systemProviderOptions,
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
		stopWhen: stopAtMaxSteps,
		temperature: options.temperature,
		providerOptions: options.providerOptions,
		experimental_context: appContext,
	};
}
