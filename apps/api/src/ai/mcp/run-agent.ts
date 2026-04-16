import type { LanguageModelUsage } from "ai";
import { ToolLoopAgent } from "ai";
import {
	formatMemoryForPrompt,
	getMemoryContext,
	isMemoryEnabled,
	storeConversation,
} from "../../lib/supermemory";
import {
	ensureAgentCreditsAvailable,
	resolveAgentBillingCustomerId,
	trackAgentUsageAndBill,
} from "../agents/execution";
import { createMcpAgentConfig } from "../agents/mcp";
import { getAILogger } from "../config/ai-logger";
import { modelNames } from "../config/models";

const MCP_AGENT_TIMEOUT_MS = 45_000;

export interface RunMcpAgentOptions {
	apiKey: Awaited<
		ReturnType<typeof import("../../lib/api-key").getApiKeyFromHeader>
	>;
	conversationId?: string;
	priorMessages?: Array<{ role: "user" | "assistant"; content: string }>;
	question: string;
	requestHeaders: Headers;
	timezone?: string;
	userId: string | null;
}

export async function runMcpAgent(
	options: RunMcpAgentOptions
): Promise<string> {
	const sessionId = options.conversationId ?? crypto.randomUUID();
	const mcpUserId = options.userId ?? options.apiKey?.userId ?? null;
	const organizationId = options.apiKey?.organizationId ?? null;

	const apiKeyId =
		options.apiKey &&
		typeof options.apiKey === "object" &&
		"id" in options.apiKey
			? (options.apiKey as { id: string }).id
			: null;

	const billingCustomerId = await resolveAgentBillingCustomerId({
		userId: mcpUserId,
		apiKey: options.apiKey,
		organizationId,
	});

	if (!(await ensureAgentCreditsAvailable(billingCustomerId))) {
		throw new Error(
			"You're out of Databunny credits this month. Upgrade or wait for the monthly reset."
		);
	}

	const [config, memoryCtx] = await Promise.all([
		Promise.resolve(
			createMcpAgentConfig({
				billingCustomerId,
				requestHeaders: options.requestHeaders,
				apiKey: options.apiKey,
				userId: mcpUserId,
				timezone: options.timezone,
				chatId: sessionId,
			})
		),
		isMemoryEnabled()
			? getMemoryContext(options.question, mcpUserId, apiKeyId)
			: Promise.resolve(null),
	]);

	const memoryBlock = memoryCtx ? formatMemoryForPrompt(memoryCtx) : "";
	if (memoryBlock) {
		config.system.content = `${config.system.content}\n\n${memoryBlock}`;
	}
	const instructions = config.system;

	const mcpTelemetryMetadata: Record<string, string> = {
		source: "mcp",
		authType: options.apiKey ? "api_key" : "session",
		timezone: options.timezone ?? "UTC",
		"tcc.conversational": "true",
	};
	if (mcpUserId) {
		mcpTelemetryMetadata.userId = mcpUserId;
	}
	if (options.apiKey?.organizationId) {
		mcpTelemetryMetadata.organizationId = options.apiKey.organizationId;
	}
	mcpTelemetryMetadata["tcc.sessionId"] = sessionId;

	const ai = getAILogger();
	const agent = new ToolLoopAgent({
		model: ai.wrap(config.model),
		instructions,
		tools: config.tools,
		stopWhen: config.stopWhen,
		temperature: config.temperature,
		experimental_context: config.experimental_context,
		experimental_telemetry: {
			isEnabled: true,
			functionId: "databuddy.mcp.ask",
			metadata: mcpTelemetryMetadata,
		},
	});

	const messages =
		options.priorMessages && options.priorMessages.length > 0
			? [
					...options.priorMessages,
					{ role: "user" as const, content: options.question },
				]
			: [{ role: "user" as const, content: options.question }];

	const abortController = new AbortController();
	const timeout = setTimeout(
		() => abortController.abort(),
		MCP_AGENT_TIMEOUT_MS
	);

	try {
		const result = await agent.generate({
			messages,
			abortSignal: abortController.signal,
		});

		const usage = (result as { usage?: LanguageModelUsage }).usage;
		if (usage) {
			await trackAgentUsageAndBill({
				usage,
				modelId: modelNames.analytics,
				source: "mcp",
				organizationId,
				userId: mcpUserId,
				chatId: sessionId,
				billingCustomerId,
			});
		}

		const answer = result.text ?? "No response generated.";

		storeConversation(
			[
				{ role: "user", content: options.question },
				{ role: "assistant", content: answer },
			],
			mcpUserId,
			apiKeyId,
			{
				metadata: { source: "mcp" },
				conversationId: sessionId,
			}
		);

		return answer;
	} finally {
		clearTimeout(timeout);
	}
}
