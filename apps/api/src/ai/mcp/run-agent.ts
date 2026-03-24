import { ToolLoopAgent } from "ai";
import {
	formatMemoryForPrompt,
	getMemoryContext,
	isMemoryEnabled,
	storeConversation,
} from "../../lib/supermemory";
import { createMcpAgentConfig } from "../agents/mcp";
import { models } from "../config/models";

const MCP_AGENT_TIMEOUT_MS = 45_000;

export interface RunMcpAgentOptions {
	question: string;
	requestHeaders: Headers;
	apiKey: Awaited<
		ReturnType<typeof import("../../lib/api-key").getApiKeyFromHeader>
	>;
	userId: string | null;
	timezone?: string;
	conversationId?: string;
	priorMessages?: Array<{ role: "user" | "assistant"; content: string }>;
}

export async function runMcpAgent(
	options: RunMcpAgentOptions
): Promise<string> {
	const sessionId = options.conversationId ?? crypto.randomUUID();

	const apiKeyId =
		options.apiKey &&
		typeof options.apiKey === "object" &&
		"id" in options.apiKey
			? (options.apiKey as { id: string }).id
			: null;

	const [config, memoryCtx] = await Promise.all([
		Promise.resolve(
			createMcpAgentConfig(models.analyticsMcp, {
				requestHeaders: options.requestHeaders,
				apiKey: options.apiKey,
				userId: options.userId,
				timezone: options.timezone,
				chatId: sessionId,
			})
		),
		isMemoryEnabled()
			? getMemoryContext(options.question, options.userId, apiKeyId)
			: Promise.resolve(null),
	]);

	const memoryBlock = memoryCtx ? formatMemoryForPrompt(memoryCtx) : "";
	const instructions = memoryBlock
		? `${config.system}\n\n${memoryBlock}`
		: config.system;

	const mcpUserId = options.userId ?? options.apiKey?.userId;
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

	const agent = new ToolLoopAgent({
		model: config.model,
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

		const answer = result.text ?? "No response generated.";

		storeConversation(
			[
				{ role: "user", content: options.question },
				{ role: "assistant", content: answer },
			],
			options.userId,
			apiKeyId,
			{ source: "mcp" }
		);

		return answer;
	} finally {
		clearTimeout(timeout);
	}
}
