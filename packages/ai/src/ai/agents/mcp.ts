import { conversationModelOptions } from "../config/conversation-model";
import type { ApiKeyRow } from "@databuddy/api-keys/resolve";
import type { WebsiteSummary } from "../../lib/accessible-websites";
import { createModelFromId, getDefaultAgentModelId } from "../config/models";
import { createMcpAgentTools } from "../mcp/agent-tools";
import type { DatabuddyAgentSlackContext } from "../mcp/slack-context";
import { buildAnalyticsInstructionsForMcp } from "../prompts/analytics";
import type { AppMutationMode, ServiceAuth } from "../config/context";
import { stopAtMaxSteps } from "./stop-conditions";
import type { AgentConfig } from "./types";

export function createMcpAgentConfig(context: {
	accessibleWebsites?: WebsiteSummary[];
	billingCustomerId?: string | null;
	requestHeaders: Headers;
	apiKey: unknown;
	userId: string | null;
	timezone?: string;
	chatId?: string;
	memoryUserId?: string | null;
	modelOverride?: string | null;
	mutationMode?: AppMutationMode;
	organizationId?: string | null;
	slackContext?: DatabuddyAgentSlackContext | null;
	source?: "dashboard" | "mcp" | "slack";
	websiteDomain?: string | null;
	websiteId?: string | null;
	activeTools?: string[];
}): AgentConfig {
	const timezone = context.timezone ?? "UTC";
	const currentDateTime = new Date().toISOString();
	const chatId = context.chatId ?? crypto.randomUUID();
	const websiteId = context.websiteId ?? "";
	const websiteDomain = context.websiteDomain ?? "";
	const selectedModelId =
		context.modelOverride ?? getDefaultAgentModelId(context.source);

	const modelOptions = conversationModelOptions(selectedModelId);

	const apiKey =
		context.apiKey && typeof context.apiKey === "object"
			? (context.apiKey as ApiKeyRow)
			: null;
	const serviceAuth: ServiceAuth | undefined = apiKey
		? { apiKey, session: null }
		: undefined;

	return {
		model: createModelFromId(selectedModelId),
		system: {
			role: "system" as const,
			content: buildAnalyticsInstructionsForMcp({
				timezone,
				currentDateTime,
				source: context.source,
				websiteDomain,
				websiteId,
			}),
			providerOptions: modelOptions.systemProviderOptions,
		},
		tools: createMcpAgentTools({
			slackContext: context.slackContext,
			organizationId: context.organizationId,
			userId: context.userId,
			websiteDomain: context.websiteDomain,
		}),
		activeTools: context.activeTools,
		stopWhen: stopAtMaxSteps,
		temperature: modelOptions.temperature,
		providerOptions: modelOptions.providerOptions,
		experimental_context: {
			accessibleWebsites: context.accessibleWebsites,
			apiKey,
			billingCustomerId: context.billingCustomerId,
			chatId,
			currentDateTime,
			memoryUserId: context.memoryUserId ?? "",
			mutationMode: context.mutationMode ?? "allow",
			organizationId: context.organizationId ?? null,
			requestHeaders: context.requestHeaders,
			serviceAuth,
			source: context.source ?? "mcp",
			timezone,
			userId: context.userId ?? "",
			websiteId,
			websiteDomain,
		},
	};
}
