import { auth } from "@databuddy/auth";
import { and, db, eq } from "@databuddy/db";
import { agentChats } from "@databuddy/db/schema";
import { getRateLimitHeaders, ratelimit } from "@databuddy/redis/rate-limit";
import {
	appendStreamChunk,
	clearActiveStream,
	getActiveStream,
	markStreamDone,
	readStreamHistory,
	setActiveStream,
	streamBufferKey,
	tailStream,
} from "@databuddy/redis/stream-buffer";
import {
	convertToModelMessages,
	generateId,
	generateText,
	type ModelMessage,
	pruneMessages,
	safeValidateUIMessages,
	smoothStream,
	ToolLoopAgent,
	type UIMessage,
} from "ai";
import { Elysia, t } from "elysia";
import { log, parseError } from "evlog";
import { useLogger } from "evlog/elysia";
import { createConfig as createAgentConfig } from "../ai/agents/analytics";
import {
	checkWebsiteReadPermissionCached,
	enrichAgentContextCached,
	ensureAgentCreditsAvailableCached,
	getMemoryContextCached,
} from "../ai/agents/cache";
import {
	resolveAgentBillingCustomerId,
	trackAgentUsageAndBill,
} from "../ai/agents/execution";
import { routeMessage } from "../ai/agents/router";
import { AGENT_THINKING_LEVELS, type AgentConfig } from "../ai/agents/types";
import {
	type AgentModelKey,
	AI_MODEL_MAX_RETRIES,
	ANTHROPIC_CACHE_1H,
	modelNames,
	models,
} from "../ai/config/models";
import { getAILogger } from "../lib/ai-logger";
import {
	getAccessibleWebsiteIds,
	getApiKeyFromHeader,
	hasGlobalAccess,
	hasKeyScope,
	isApiKeyPresent,
} from "../lib/api-key";
import { trackAgentEvent } from "../lib/databuddy";
import {
	formatMemoryForPrompt,
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

function prependContextToLastUserMessage(
	messages: ModelMessage[],
	context: string
): ModelMessage[] {
	if (!context) {
		return messages;
	}
	const block = `<context>\n${context}\n</context>\n\n`;
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (!msg || msg.role !== "user") {
			continue;
		}
		const next = [...messages];
		if (typeof msg.content === "string") {
			next[i] = { ...msg, content: `${block}${msg.content}` };
		} else {
			next[i] = {
				...msg,
				content: [{ type: "text", text: block }, ...msg.content],
			};
		}
		return next;
	}
	return messages;
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
			model: getAILogger().wrap(models.tiny),
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

// UIMessage parts are polymorphic (text/tool/reasoning/...) and re-validated
// by safeValidateUIMessages + convertToModelMessages, so we only cap sizes here.
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

const AGENT_TYPE = "analytics";

function createToolLoopAgent(
	config: AgentConfig,
	experimentalTelemetry?: AgentExperimentalTelemetry
): InstanceType<typeof ToolLoopAgent> {
	const ai = getAILogger();
	// Anthropic rejects `temperature` when extended thinking is enabled.
	const thinkingEnabled = Boolean(config.providerOptions);
	return new ToolLoopAgent({
		model: ai.wrap(config.model),
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
				const t0 = performance.now();
				let organizationId: string | null = null;

				mergeWideEvent({
					agent_website_id: body.websiteId,
					agent_user_id: user?.id ?? "unknown",
					agent_chat_id: chatId,
				});

				try {
					if (!(user || apiKey)) {
						return jsonError(401, "AUTH_REQUIRED", "Authentication required");
					}
					const rateLimitKey = user
						? `agent-chat:user:${user.id}`
						: `agent-chat:apikey:${apiKey?.id}`;
					const userId = user?.id ?? `apikey:${apiKey?.id}`;

					const [websiteValidation, rl] = await Promise.all([
						validateWebsite(body.websiteId),
						ratelimit(rateLimitKey, 40, 600),
					]);

					if (!(websiteValidation.success && websiteValidation.website)) {
						return jsonError(
							404,
							"WEBSITE_NOT_FOUND",
							websiteValidation.error ?? "Website not found"
						);
					}

					const { website } = websiteValidation;
					organizationId = website.organizationId ?? null;

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

					const resolvePermission = (): Promise<boolean> => {
						if (apiKey) {
							if (hasGlobalAccess(apiKey)) {
								return Promise.resolve(
									apiKey.organizationId != null &&
										apiKey.organizationId === website.organizationId
								);
							}
							return Promise.resolve(
								getAccessibleWebsiteIds(apiKey).includes(body.websiteId)
							);
						}
						if (!(user && website.organizationId)) {
							return Promise.resolve(false);
						}
						return checkWebsiteReadPermissionCached(
							user.id,
							website.organizationId,
							request.headers
						);
					};
					const permissionCheck = resolvePermission();

					const [hasPermission, billingCustomerId] = await Promise.all([
						permissionCheck,
						resolveAgentBillingCustomerId({
							userId: user?.id ?? null,
							apiKey,
							organizationId,
						}),
					]);

					if (!hasPermission) {
						return jsonError(
							403,
							"ACCESS_DENIED",
							"Access denied to this website"
						);
					}

					if (billingCustomerId) {
						try {
							if (
								!(await ensureAgentCreditsAvailableCached(billingCustomerId))
							) {
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

					const timezone = body.timezone ?? "UTC";
					const domain = website.domain ?? "unknown";
					const lastMessage = getLastMessagePreview(body.messages);
					const routeLabel = lastMessage
						? routeMessage(lastMessage)
						: "complex";
					const modelKey: AgentModelKey =
						routeLabel === "simple" ? "fast" : "analytics";

					mergeWideEvent({
						agent_route_label: routeLabel,
						agent_model_key: modelKey,
					});

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
							lastMessage,
						},
					});

					const [memoryCtx, enrichment] =
						modelKey === "fast"
							? [null, ""]
							: await Promise.all([
									getMemoryContextCached(lastMessage, userId, body.websiteId),
									enrichAgentContextCached(
										userId,
										body.websiteId,
										organizationId
									),
								]);

					const config = createAgentConfig(
						{
							userId,
							websiteId: body.websiteId,
							websiteDomain: domain,
							timezone,
							chatId,
							requestHeaders: request.headers,
							thinking: body.thinking,
							billingCustomerId,
						},
						modelKey
					);

					const extras = [
						memoryCtx ? formatMemoryForPrompt(memoryCtx) : "",
						enrichment,
					]
						.filter(Boolean)
						.join("\n\n");

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

					modelMessages = prependContextToLastUserMessage(
						modelMessages,
						extras
					);

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
								metadata: {
									source: "dashboard",
								},
								websiteId: body.websiteId,
								conversationId: chatId,
								domain,
							}
						);
					}

					mergeWideEvent({
						agent_phase_pre_ai_total_ms: Math.round(performance.now() - t0),
					});

					const streamStart = performance.now();
					let firstChunkLogged = false;
					const ttftTransform = () =>
						new TransformStream({
							transform(chunk, controller) {
								if (!firstChunkLogged) {
									firstChunkLogged = true;
									mergeWideEvent({
										agent_ttft_ms: Math.round(performance.now() - streamStart),
										agent_ttft_total_from_request_ms: Math.round(
											performance.now() - t0
										),
									});
								}
								controller.enqueue(chunk);
							},
						});
					const result = await agent.stream({
						messages: modelMessages,
						experimental_transform: [
							ttftTransform,
							smoothStream({ chunking: "word" }),
						],
						options: undefined,
					});

					const persistedUserId = user?.id;
					const persistedOrgId = organizationId;
					const fallbackTitle = lastMessage.slice(0, 60);
					const isNewChat = validation.data.length <= 1;

					result.consumeStream();

					Promise.resolve(result.totalUsage)
						.then(async (usage) => {
							await trackAgentUsageAndBill({
								usage,
								modelId: modelNames[modelKey],
								source: "dashboard",
								agentType: AGENT_TYPE,
								websiteId: body.websiteId,
								organizationId,
								userId: persistedUserId ?? null,
								chatId,
								billingCustomerId,
							});
						})
						.catch((usageError) => {
							captureError(usageError, {
								agent_usage_telemetry_error: true,
								agent_chat_id: chatId,
								agent_website_id: body.websiteId,
							});
						});

					const streamId = generateId();
					const streamKey = streamBufferKey(body.websiteId, chatId, streamId);
					await setActiveStream(body.websiteId, chatId, streamId);

					if (persistedUserId) {
						try {
							await db
								.insert(agentChats)
								.values({
									id: chatId,
									websiteId: body.websiteId,
									userId: persistedUserId,
									organizationId: persistedOrgId,
									title: fallbackTitle,
									messages: validation.data,
									updatedAt: new Date(),
								})
								.onConflictDoUpdate({
									target: agentChats.id,
									set: {
										messages: validation.data,
										updatedAt: new Date(),
									},
								});
						} catch (persistError) {
							captureError(persistError, {
								agent_user_message_persist_error: true,
								agent_chat_id: chatId,
								agent_website_id: body.websiteId,
							});
						}
					}

					const response = result.toUIMessageStreamResponse({
						originalMessages: validation.data,
						onFinish: async ({ messages }) => {
							try {
								await clearActiveStream(body.websiteId, chatId);
							} catch {}
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

					if (response.body) {
						const [forClient, forStorage] = response.body.tee();
						(async () => {
							const reader = forStorage.getReader();
							try {
								while (true) {
									const { done, value } = await reader.read();
									if (done) {
										break;
									}
									if (value && value.byteLength > 0) {
										await appendStreamChunk(streamKey, value);
									}
								}
							} finally {
								reader.releaseLock();
								try {
									await markStreamDone(streamKey);
								} catch {}
							}
						})().catch((storageError) => {
							captureError(storageError, {
								agent_stream_persist_error: true,
								agent_chat_id: chatId,
								agent_website_id: body.websiteId,
							});
						});
						return new Response(forClient, {
							status: response.status,
							headers: response.headers,
						});
					}
					return response;
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
	)
	.get("/chat/:chatId/stream", async ({ params, user, request }) => {
		if (!user?.id) {
			return jsonError(401, "AUTH_REQUIRED", "Authentication required");
		}
		const chat = await db.query.agentChats.findFirst({
			where: and(
				eq(agentChats.id, params.chatId),
				eq(agentChats.userId, user.id)
			),
			columns: { id: true, websiteId: true },
		});
		if (!chat) {
			return new Response(null, { status: 204 });
		}
		const streamId = await getActiveStream(chat.websiteId, chat.id);
		if (!streamId) {
			return new Response(null, { status: 204 });
		}
		const key = streamBufferKey(chat.websiteId, chat.id, streamId);

		const abortController = new AbortController();
		request.signal?.addEventListener("abort", () => {
			abortController.abort();
		});

		const body = new ReadableStream<Uint8Array>({
			async start(controller) {
				try {
					const history = await readStreamHistory(key);
					let lastId = "0-0";
					for (const entry of history) {
						lastId = entry.id;
						if (entry.done) {
							controller.close();
							return;
						}
						if (entry.data.byteLength > 0) {
							controller.enqueue(entry.data);
						}
					}
					for await (const entry of tailStream(key, lastId, {
						signal: abortController.signal,
					})) {
						if (entry.done) {
							controller.close();
							return;
						}
						if (entry.data.byteLength > 0) {
							controller.enqueue(entry.data);
						}
					}
					controller.close();
				} catch (streamError) {
					controller.error(streamError);
				}
			},
			cancel() {
				abortController.abort();
			},
		});

		return new Response(body, {
			status: 200,
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
				"X-Accel-Buffering": "no",
				"x-vercel-ai-ui-message-stream": "v1",
			},
		});
	});
