import { auth, websitesApi } from "@databuddy/auth";
import {
	convertToModelMessages,
	generateId,
	pruneMessages,
	safeValidateUIMessages,
	smoothStream,
	ToolLoopAgent,
	type UIMessage,
} from "ai";
import { Elysia, t } from "elysia";
import { useLogger } from "evlog/elysia";
import type { AgentConfig, AgentType } from "../ai/agents";
import { createAgentConfig } from "../ai/agents";
import { trackAgentEvent } from "../lib/databuddy";
import {
	formatMemoryForPrompt,
	getMemoryContext,
	isMemoryEnabled,
	storeConversation,
} from "../lib/supermemory";
import { captureError, mergeWideEvent } from "../lib/tracing";
import { validateWebsite } from "../lib/website-utils";

function jsonError(status: number, code: string, message: string): Response {
	return new Response(
		JSON.stringify({ success: false, error: message, code }),
		{
			status,
			headers: { "Content-Type": "application/json" },
		}
	);
}

function getErrorMessage(error: unknown, fallback = "Unknown error"): string {
	if (error instanceof Error) {
		return error.message;
	}
	return fallback;
}

function getErrorName(error: unknown, fallback = "UnknownError"): string {
	if (error instanceof Error) {
		return error.name;
	}
	return fallback;
}

function getLastMessagePreview(
	messages: Array<{ parts?: Array<{ type?: string; text?: string }> }>
): string {
	const last = messages.at(-1);
	if (!last?.parts) {
		return "";
	}
	return last.parts
		.filter((p) => p.type === "text")
		.map((p) => p.text ?? "")
		.join("");
}

const MAX_MESSAGES = 100;
const MAX_PARTS_PER_MESSAGE = 50;
const MAX_PROPERTIES_PER_PART = 20;

type AgentExperimentalTelemetry = {
	isEnabled: true;
	functionId: string;
	metadata?: Record<string, string>;
};

/**
 * Schema uses t.Any() for message parts because UIMessage parts
 * are polymorphic (text, tool, reasoning, etc.) and validated
 * at the AI SDK level via convertToModelMessages.
 * Limits prevent resource exhaustion from oversized payloads.
 */
const UIMessageSchema = t.Object({
	id: t.String(),
	role: t.Union([t.Literal("user"), t.Literal("assistant")]),
	parts: t.Array(
		t.Record(t.String(), t.Any(), { maxProperties: MAX_PROPERTIES_PER_PART }),
		{
			maxItems: MAX_PARTS_PER_MESSAGE,
		}
	),
});

const AgentRequestSchema = t.Object({
	websiteId: t.String(),
	messages: t.Array(UIMessageSchema, { maxItems: MAX_MESSAGES }),
	id: t.Optional(t.String()),
	timezone: t.Optional(t.String()),
	model: t.Optional(
		t.Union([t.Literal("basic"), t.Literal("agent"), t.Literal("agent-max")])
	),
});

/**
 * Create a ToolLoopAgent from AgentConfig.
 */
function createToolLoopAgent(
	config: AgentConfig,
	experimentalTelemetry?: AgentExperimentalTelemetry
): InstanceType<typeof ToolLoopAgent> {
	return new ToolLoopAgent({
		model: config.model,
		instructions: config.system,
		tools: config.tools,
		stopWhen: config.stopWhen,
		temperature: config.temperature,
		experimental_context: config.experimental_context,
		experimental_telemetry: experimentalTelemetry,
	});
}

const MODEL_TO_AGENT: Record<string, AgentType> = {
	basic: "triage",
	agent: "analytics",
	"agent-max": "reflection-max",
};

export const agent = new Elysia({ prefix: "/v1/agent" })
	.derive(async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		return { user: session?.user ?? null };
	})
	.onBeforeHandle(({ user, set }) => {
		if (!user) {
			set.status = 401;
			return {
				success: false,
				error: "Authentication required",
				code: "AUTH_REQUIRED",
			};
		}
	})
	.post(
		"/chat",
		function agentChat({ body, user, request }) {
			return (async () => {
				const chatId = body.id ?? generateId();
				let organizationId: string | null = null;

				mergeWideEvent({
					agent_website_id: body.websiteId,
					agent_user_id: user?.id ?? "unknown",
					agent_chat_id: chatId,
				});

				try {
					const websiteValidation = await validateWebsite(body.websiteId);
					if (!(websiteValidation.success && websiteValidation.website)) {
						return jsonError(
							404,
							"WEBSITE_NOT_FOUND",
							websiteValidation.error ?? "Website not found"
						);
					}

					const { website } = websiteValidation;
					organizationId = website.organizationId ?? null;

					const hasPermission =
						website.isPublic ||
						(website.organizationId &&
							(
								await websitesApi.hasPermission({
									headers: request.headers,
									body: { permissions: { website: ["read"] } },
								})
							).success);

					if (!hasPermission) {
						return jsonError(
							403,
							"ACCESS_DENIED",
							"Access denied to this website"
						);
					}

					if (!user?.id) {
						return jsonError(401, "AUTH_REQUIRED", "User ID required");
					}
					const userId = user.id;

					const model = body.model ?? "agent";
					const agentType: AgentType = MODEL_TO_AGENT[model] ?? "reflection";
					const timezone = body.timezone ?? "UTC";
					const domain = website.domain ?? "unknown";

					trackAgentEvent("agent_activity", {
						action: "chat_started",
						source: "dashboard",
						model,
						agent_type: agentType,
						website_id: body.websiteId,
						organization_id: organizationId,
						user_id: userId,
					});

					useLogger().info("Creating agent", {
						agent: {
							type: agentType,
							model,
							websiteId: body.websiteId,
							messageCount: body.messages.length,
							lastMessage: getLastMessagePreview(body.messages),
						},
					});

					const lastMessage = getLastMessagePreview(body.messages);

					const [config, memoryCtx] = await Promise.all([
						Promise.resolve(
							createAgentConfig(agentType, {
								userId,
								websiteId: body.websiteId,
								websiteDomain: domain,
								timezone,
								chatId,
								requestHeaders: request.headers,
							})
						),
						isMemoryEnabled() && lastMessage
							? getMemoryContext(lastMessage, userId, null)
							: Promise.resolve(null),
					]);

					const memoryBlock = memoryCtx ? formatMemoryForPrompt(memoryCtx) : "";
					if (memoryBlock) {
						config.system = `${config.system}\n\n${memoryBlock}`;
					}

					const validation = await safeValidateUIMessages({
						messages: body.messages as UIMessage[],
						tools: config.tools as Parameters<
							typeof safeValidateUIMessages
						>[0]["tools"],
					});

					if (!validation.success) {
						return jsonError(
							400,
							"INVALID_MESSAGES",
							getErrorMessage(validation.error, "Invalid message format")
						);
					}

					let modelMessages = await convertToModelMessages(validation.data, {
						tools: config.tools,
						ignoreIncompleteToolCalls: true,
					});

					modelMessages = pruneMessages({
						messages: modelMessages,
						reasoning: "before-last-message",
						toolCalls: "before-last-2-messages",
						emptyMessages: "remove",
					});

					const dashboardTelemetryMetadata: Record<string, string> = {
						source: "dashboard",
						userId,
						websiteId: body.websiteId,
						websiteDomain: domain,
						chatId,
						agentType,
						model,
						timezone,
						"tcc.sessionId": chatId,
						"tcc.conversational": "true",
					};
					if (organizationId) {
						dashboardTelemetryMetadata.organizationId = organizationId;
					}

					const agent = createToolLoopAgent(config, {
						isEnabled: true,
						functionId: `databuddy.dashboard.agent.${agentType}`,
						metadata: dashboardTelemetryMetadata,
					});

					if (isMemoryEnabled() && lastMessage) {
						storeConversation(
							[{ role: "user", content: lastMessage }],
							userId,
							null,
							{
								source: "dashboard",
								websiteId: body.websiteId,
							}
						);
					}

					const result = await agent.stream({
						messages: modelMessages,
						experimental_transform: smoothStream({ chunking: "word" }),
						options: undefined,
					});

					return result.toUIMessageStreamResponse({
						originalMessages: validation.data,
					});
				} catch (error) {
					trackAgentEvent("agent_activity", {
						action: "chat_error",
						source: "dashboard",
						model: body.model ?? "agent",
						error_type: getErrorName(error),
						organization_id: organizationId,
						user_id: user?.id ?? null,
						website_id: body.websiteId,
					});
					captureError(error, {
						agent_error: true,
						agent_model_type: body.model ?? "agent",
						agent_chat_id: chatId,
						agent_website_id: body.websiteId,
						agent_user_id: user?.id ?? "unknown",
						error_type: getErrorName(error),
					});
					return jsonError(500, "INTERNAL_ERROR", getErrorMessage(error));
				}
			})();
		},
		{ body: AgentRequestSchema, idleTimeout: 60_000 }
	);
