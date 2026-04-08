import { auth, websitesApi } from "@databuddy/auth";
import { agentChats, db, eq } from "@databuddy/db";
import { getRateLimitHeaders, rateLimit } from "@databuddy/redis/rate-limit";
import { getAutumn, getBillingCustomerId } from "@databuddy/rpc";
import {
	convertToModelMessages,
	generateId,
	generateText,
	pruneMessages,
	safeValidateUIMessages,
	smoothStream,
	ToolLoopAgent,
	type UIMessage,
} from "ai";
import { Elysia, t } from "elysia";
import { log, parseError } from "evlog";
import { useLogger } from "evlog/elysia";
import type { AgentConfig, AgentType } from "../ai/agents";
import { createAgentConfig } from "../ai/agents";
import { AGENT_THINKING_LEVELS } from "../ai/agents/types";
import { enrichAgentContext } from "../ai/config/enrich-context";
import { modelNames, models } from "../ai/config/models";
import { ANTHROPIC_CACHE_1H } from "../ai/config/prompt-cache";
import { AI_MODEL_MAX_RETRIES } from "../ai/config/retry";
import {
	getApiKeyFromHeader,
	hasKeyScope,
	isApiKeyPresent,
} from "../lib/api-key";
import { trackAgentEvent } from "../lib/databuddy";
import { summarizeAgentUsage } from "../lib/usage-telemetry";
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

function getTextFromMessage(message: UIMessage | undefined): string {
	if (!message?.parts) {
		return "";
	}
	return message.parts
		.filter((p): p is { type: "text"; text: string } => p.type === "text")
		.map((p) => p.text)
		.join(" ");
}

const TITLE_MAX_LEN = 60;

/**
 * Generate a short, descriptive title from the first user/assistant exchange.
 * Falls back to a truncated user message on any failure.
 */
async function generateChatTitle(
	messages: UIMessage[]
): Promise<string | null> {
	const firstUser = messages.find((m) => m.role === "user");
	const firstAssistant = messages.find((m) => m.role === "assistant");
	const userText = getTextFromMessage(firstUser).trim();
	if (!userText) {
		return null;
	}
	const assistantText = getTextFromMessage(firstAssistant).trim().slice(0, 400);

	try {
		const result = await generateText({
			model: models.triage,
			temperature: 0.2,
			maxOutputTokens: 32,
			system:
				"You generate concise chat titles. Output 3-6 words, Title Case, no quotes, no trailing punctuation. Describe what the user is trying to learn or do — never echo the question verbatim.",
			prompt: `User asked: "${userText.slice(0, 300)}"${
				assistantText ? `\nAssistant began: "${assistantText}"` : ""
			}\n\nTitle:`,
		});
		const title = result.text.trim().replace(/^["']|["']$/g, "");
		if (!title) {
			return null;
		}
		return title.slice(0, TITLE_MAX_LEN);
	} catch {
		return null;
	}
}

const MAX_MESSAGES = 100;
const MAX_PARTS_PER_MESSAGE = 50;
const MAX_PROPERTIES_PER_PART = 20;

interface AgentExperimentalTelemetry {
	functionId: string;
	isEnabled: true;
	metadata?: Record<string, string>;
}

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
	thinking: t.Optional(
		t.Union(AGENT_THINKING_LEVELS.map((level) => t.Literal(level)))
	),
});

const AGENT_TYPE: AgentType = "analytics";

function createToolLoopAgent(
	config: AgentConfig,
	experimentalTelemetry?: AgentExperimentalTelemetry
): InstanceType<typeof ToolLoopAgent> {
	// Anthropic rejects `temperature` when extended thinking is enabled.
	const thinkingEnabled = Boolean(config.providerOptions);
	return new ToolLoopAgent({
		model: config.model,
		instructions: config.system,
		tools: config.tools,
		stopWhen: config.stopWhen,
		temperature: thinkingEnabled ? undefined : config.temperature,
		maxRetries: AI_MODEL_MAX_RETRIES,
		experimental_context: config.experimental_context,
		experimental_telemetry: experimentalTelemetry,
		providerOptions: config.providerOptions,
		prepareStep({ messages }) {
			if (messages.length === 0) {
				return { messages };
			}
			const last = messages.at(-1);
			if (last && last.role === "user" && !last.providerOptions) {
				return {
					messages: [
						...messages.slice(0, -1),
						{ ...last, providerOptions: ANTHROPIC_CACHE_1H },
					],
				};
			}
			return { messages };
		},
	});
}

export const agent = new Elysia({ prefix: "/v1/agent" })
	.derive(async ({ request }) => {
		const hasApiKey = isApiKeyPresent(request.headers);
		const [apiKey, session] = await Promise.all([
			hasApiKey ? getApiKeyFromHeader(request.headers) : null,
			auth.api.getSession({ headers: request.headers }),
		]);

		const user = session?.user ?? null;
		const validApiKey =
			apiKey && hasKeyScope(apiKey, "read:data") ? apiKey : null;

		return {
			user,
			apiKey: validApiKey,
			isAuthenticated: Boolean(user ?? validApiKey),
		};
	})
	.onBeforeHandle(({ isAuthenticated, set }) => {
		if (!isAuthenticated) {
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
		function agentChat({ body, user, apiKey, request }) {
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

					// API key auth: key's org must match the website's org
					const apiKeyOrg = apiKey?.organizationId ?? null;
					const hasPermission =
						website.isPublic ||
						(apiKey && apiKeyOrg && apiKeyOrg === website.organizationId) ||
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

					const userId = user?.id ?? apiKeyOrg ?? "api-key";

					const billingCustomerId = user?.id
						? await getBillingCustomerId(user.id, organizationId)
						: null;

					if (billingCustomerId) {
						try {
							const allowed = await getAutumn().check({
								customerId: billingCustomerId,
								featureId: "agent_credits",
							});
							if (allowed.allowed === false) {
								mergeWideEvent({ agent_rejected: "out_of_credits" });
								return jsonError(
									402,
									"OUT_OF_CREDITS",
									"You're out of Databunny credits this month. Upgrade or wait for the monthly reset."
								);
							}
						} catch (creditCheckError) {
							captureError(creditCheckError, {
								agent_credit_check_error: true,
								agent_chat_id: chatId,
								agent_website_id: body.websiteId,
							});
						}
					}

					// Rate limit: 40 chat turns per 10 minutes per user (LLM cost abuse guard).
					const rl = await rateLimit(`agent-chat:${userId}`, 40, 600);
					if (!rl.success) {
						mergeWideEvent({ agent_rejected: "rate_limit" });
						return new Response(
							JSON.stringify({
								success: false,
								error:
									"Rate limit exceeded. Please wait a moment before sending more messages.",
								code: "RATE_LIMITED",
							}),
							{
								status: 429,
								headers: {
									"Content-Type": "application/json",
									...getRateLimitHeaders(rl),
								},
							}
						);
					}

					const timezone = body.timezone ?? "UTC";
					const domain = website.domain ?? "unknown";

					trackAgentEvent("agent_activity", {
						action: "chat_started",
						source: "dashboard",
						agent_type: AGENT_TYPE,
						website_id: body.websiteId,
						organization_id: organizationId,
						user_id: userId,
					});

					useLogger().info("Creating agent", {
						agent: {
							type: AGENT_TYPE,
							websiteId: body.websiteId,
							messageCount: body.messages.length,
							lastMessage: getLastMessagePreview(body.messages),
						},
					});

					const lastMessage = getLastMessagePreview(body.messages);

					const [config, memoryCtx, enrichment] = await Promise.all([
						Promise.resolve(
							createAgentConfig({
								userId,
								websiteId: body.websiteId,
								websiteDomain: domain,
								timezone,
								chatId,
								requestHeaders: request.headers,
								thinking: body.thinking,
								billingCustomerId,
							})
						),
						isMemoryEnabled() && lastMessage
							? getMemoryContext(lastMessage, userId, null)
							: Promise.resolve(null),
						enrichAgentContext({
							userId,
							websiteId: body.websiteId,
							organizationId,
						}),
					]);

					const extras = [
						memoryCtx ? formatMemoryForPrompt(memoryCtx) : "",
						enrichment,
					]
						.filter(Boolean)
						.join("\n\n");
					if (extras) {
						config.system.content = `${config.system.content}\n\n${extras}`;
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
						agentType: AGENT_TYPE,
						timezone,
						"tcc.sessionId": chatId,
						"tcc.conversational": "true",
					};
					if (organizationId) {
						dashboardTelemetryMetadata.organizationId = organizationId;
					}

					const agent = createToolLoopAgent(config, {
						isEnabled: true,
						functionId: `databuddy.dashboard.agent.${AGENT_TYPE}`,
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

					// Capture for the persistence closure (avoid TDZ on the outer `user`).
					const persistedUserId = user?.id;
					const persistedOrgId = organizationId;
					const fallbackTitle = lastMessage.slice(0, 60);
					const isNewChat = validation.data.length <= 1;

					// Ensure the stream completes (and onFinish runs) even if the
					// client disconnects mid-response.
					result.consumeStream();

					// `totalUsage` resolves once the stream finishes; run as a
					// parallel side effect so it never blocks the response.
					Promise.resolve(result.totalUsage)
						.then(async (usage) => {
							const summary = summarizeAgentUsage(modelNames.analytics, usage);
							mergeWideEvent(summary);
							trackAgentEvent("agent_activity", {
								action: "chat_usage",
								source: "dashboard",
								agent_type: AGENT_TYPE,
								website_id: body.websiteId,
								organization_id: organizationId,
								user_id: persistedUserId ?? null,
								...summary,
							});

							if (!billingCustomerId) {
								return;
							}
							const autumn = getAutumn();
							// Bill fresh input only — cache_read/cache_write are tracked
							// as their own metered features and would otherwise be charged
							// twice (once at the input rate, once at the cache rate).
							const tokenTracks: [string, number][] = [
								["agent_input_tokens", summary.fresh_input_tokens],
								["agent_output_tokens", summary.output_tokens],
								["agent_cache_read_tokens", summary.cache_read_tokens],
								["agent_cache_write_tokens", summary.cache_write_tokens],
							];
							await Promise.allSettled(
								tokenTracks
									.filter(([, value]) => value > 0)
									.map(([featureId, value]) =>
										autumn.track({
											customerId: billingCustomerId,
											featureId,
											value,
										})
									)
							);
						})
						.catch((usageError) => {
							captureError(usageError, {
								agent_usage_telemetry_error: true,
								agent_chat_id: chatId,
								agent_website_id: body.websiteId,
							});
						});

					return result.toUIMessageStreamResponse({
						originalMessages: validation.data,
						onFinish: async ({ messages }) => {
							if (!persistedUserId) {
								return;
							}
							try {
								await db
									.insert(agentChats)
									.values({
										id: chatId,
										websiteId: body.websiteId,
										userId: persistedUserId,
										organizationId: persistedOrgId,
										title: fallbackTitle,
										messages,
										updatedAt: new Date(),
									})
									.onConflictDoUpdate({
										target: agentChats.id,
										set: {
											messages,
											updatedAt: new Date(),
										},
									});

								// First-turn title polish: generate a real title once we
								// have an assistant response. Run after the upsert so a
								// failed/slow LLM call never blocks message persistence.
								if (isNewChat) {
									const generatedTitle = await generateChatTitle(messages);
									if (generatedTitle) {
										await db
											.update(agentChats)
											.set({ title: generatedTitle })
											.where(eq(agentChats.id, chatId));
									}
								}
							} catch (persistError) {
								captureError(persistError, {
									agent_persist_error: true,
									agent_chat_id: chatId,
									agent_website_id: body.websiteId,
								});
							}
						},
					});
				} catch (error) {
					const parsed = parseError(error);
					const err = error instanceof Error ? error : new Error(String(error));
					try {
						useLogger().error(err, {
							agent: {
								chatId,
								agentType: AGENT_TYPE,
								phase: "dashboard_chat_stream",
								userId: user?.id ?? null,
								websiteId: body.websiteId,
							},
							...(parsed.fix !== "" && parsed.fix != null
								? { fix: parsed.fix }
								: {}),
							...(parsed.why !== "" && parsed.why != null
								? { why: parsed.why }
								: {}),
						});
					} catch {
						log.error({
							agent: "dashboard_chat",
							chatId,
							error_message: err.message,
							error_name: err.name,
							service: "api",
							websiteId: body.websiteId,
							...(parsed.fix !== "" && parsed.fix != null
								? { fix: parsed.fix }
								: {}),
							...(parsed.why !== "" && parsed.why != null
								? { why: parsed.why }
								: {}),
						});
					}

					trackAgentEvent("agent_activity", {
						action: "chat_error",
						source: "dashboard",
						agent_type: AGENT_TYPE,
						error_type: getErrorName(error),
						organization_id: organizationId,
						user_id: user?.id ?? null,
						website_id: body.websiteId,
					});
					captureError(error, {
						agent_error: true,
						agent_type: AGENT_TYPE,
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
