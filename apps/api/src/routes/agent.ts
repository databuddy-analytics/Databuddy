import {
	type ApiKeyRow,
	hasKeyScope,
	isApiKeyPresent,
} from "@databuddy/api-keys/resolve";
import {
	claimToolApprovals,
	createConversationAgent,
	settleStaleToolApprovals,
} from "@databuddy/ai/agents/conversation";
import { createConfig as createAgentConfig } from "@databuddy/ai/agents/analytics";
import { trackAgentUsageAndBill } from "@databuddy/ai/agents/execution";
import { AGENT_THINKING_LEVELS, AGENT_TIERS } from "@databuddy/ai/agents/types";
import { type AgentModelKey, models } from "@databuddy/ai/config/models";
import {
	AgentError,
	askDatabuddyAgent,
	type DatabuddyAgentActor,
	type DatabuddyAgentOptions,
	prepareAgentRequest,
	streamDatabuddyAgent,
	toAgentErrorResponse,
} from "@databuddy/ai/agent";
import {
	asksToRemember,
	formatMemoryForPrompt,
	isMemoryEnabled,
	storeConversation,
	type MemoryContext,
} from "@databuddy/ai/lib/supermemory";
import { db, eq } from "@databuddy/db";
import { agentChats } from "@databuddy/db/schema";
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
import { getRedisCache } from "@databuddy/redis";
import {
	convertToModelMessages,
	generateId,
	generateText,
	pruneMessages,
	safeValidateUIMessages,
	smoothStream,
	type UIMessage,
} from "ai";
import { Elysia, t } from "elysia";
import { useLogger } from "evlog/elysia";
import {
	type AgentContextSnapshotResult,
	getAgentContextSnapshot,
	getMemoryContextCached,
	shouldLoadMemoryContext,
} from "@databuddy/ai/agents/cache";
import { getAILogger } from "@databuddy/ai/lib/ai-logger";
import { trackAgentEvent } from "@databuddy/ai/lib/databuddy";
import { resolveRequestAuth } from "../lib/auth-wide-event";
import { captureError, mergeWideEvent } from "@databuddy/ai/lib/tracing";
import { loadOrganizationBusinessContext } from "@databuddy/ai/lib/organization-business-context";
import { CHAT_TITLE_INSTRUCTIONS } from "@databuddy/ai/prompts/analytics";
import { prependBackgroundContext } from "@databuddy/ai/prompts/context";
import { resolveToolIntegrations } from "@databuddy/ai/tools/toolkit";
import { warnAgentStreamRedisSideEffect } from "./agent-stream-errors";

function getErrorName(error: unknown, fallback = "UnknownError"): string {
	if (error instanceof Error) {
		return error.name;
	}
	return fallback;
}

interface AgentAuth {
	activeOrganizationId: string | null;
	apiKey: ApiKeyRow | null;
	user: { id: string } | null;
}

function agentActor(
	{ activeOrganizationId, apiKey, user }: AgentAuth,
	requestHeaders: Headers
): DatabuddyAgentActor {
	if (apiKey) {
		return {
			apiKey,
			requestHeaders,
			type: "api_key",
			userId: user?.id ?? null,
		};
	}
	if (user) {
		return {
			activeOrganizationId,
			requestHeaders,
			type: "session",
			userId: user.id,
		};
	}
	throw new AgentError("auth_required");
}

function agentFailure(
	error: unknown,
	source: "api" | "dashboard",
	chatId: string,
	{
		activeOrganizationId,
		apiKey,
		body,
		user,
	}: AgentAuth & { body: { organizationId?: string; websiteId?: string } }
): Response {
	if (error instanceof AgentError && error.status < 500) {
		mergeWideEvent({ agent_rejected: error.code });
		return toAgentErrorResponse(error);
	}
	const errorType = getErrorName(error);
	trackAgentEvent("agent_activity", {
		action: "chat_error",
		source,
		agent_type: AGENT_TYPE,
		error_type: errorType,
		organization_id:
			body.organizationId ??
			activeOrganizationId ??
			apiKey?.organizationId ??
			null,
		user_id: user?.id ?? null,
		website_id: body.websiteId ?? null,
	});
	captureError(error, {
		agent_error: true,
		agent_type: AGENT_TYPE,
		agent_chat_id: chatId,
		...(body.websiteId ? { agent_website_id: body.websiteId } : {}),
		...(user?.id ? { agent_user_id: user.id } : {}),
		error_type: errorType,
		source,
	});
	return toAgentErrorResponse(error);
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
			system: CHAT_TITLE_INSTRUCTIONS,
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

const APPROVAL_CLAIM_TTL_SEC = 86_400;

async function claimApproval(
	userId: string,
	organizationId: string,
	chatId: string,
	approvalId: string
): Promise<boolean> {
	try {
		const claimed = await getRedisCache().set(
			`agent:approval:${userId}:${organizationId}:${chatId}:${approvalId}`,
			"1",
			"EX",
			APPROVAL_CLAIM_TTL_SEC,
			"NX"
		);
		return claimed === "OK";
	} catch (error) {
		captureError(error, { agent_approval_claim_failed: true });
		return true;
	}
}

const MAX_MESSAGES = 100;
const MAX_PARTS_PER_MESSAGE = 50;
const MAX_PROPERTIES_PER_PART = 20;

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

const MAX_MENTIONS = 20;

const AgentRequestSchema = t.Object({
	organizationId: t.Optional(t.String()),
	websiteId: t.Optional(t.String()),
	mentions: t.Optional(t.Array(t.String(), { maxItems: MAX_MENTIONS })),
	messages: t.Array(UIMessageSchema, { maxItems: MAX_MESSAGES }),
	id: t.Optional(t.String()),
	timezone: t.Optional(t.String()),
	thinking: t.Optional(
		t.Union(AGENT_THINKING_LEVELS.map((level) => t.Literal(level)))
	),
	tier: t.Optional(t.Union(AGENT_TIERS.map((tier) => t.Literal(tier)))),
});

const AgentAskRequestSchema = t.Object({
	organizationId: t.Optional(t.String()),
	question: t.String({ minLength: 1, maxLength: 2000 }),
	id: t.Optional(t.String({ minLength: 1 })),
	stream: t.Optional(t.Boolean()),
	timezone: t.Optional(t.String()),
});

const AGENT_TYPE = "analytics";
const AGENT_MEMORY_CONTEXT_TIMEOUT_MS = 700;
const AGENT_ENRICHMENT_CONTEXT_TIMEOUT_MS = 700;
const SSE_DONE_MARKER = "data: [DONE]";

const EMPTY_MEMORY_CONTEXT: MemoryContext = {
	staticProfile: [],
	dynamicProfile: [],
	relevantMemories: [],
};

async function timeAgentPhase<T>(
	name: string,
	work: Promise<T> | (() => Promise<T> | T)
): Promise<T> {
	const start = performance.now();
	try {
		return typeof work === "function" ? await work() : await work;
	} finally {
		mergeWideEvent({
			[`agent_phase_${name}_ms`]: Math.round(performance.now() - start),
		});
	}
}

function optionalAgentContext<T>(
	name: "memory" | "enrichment",
	promise: Promise<T>,
	fallback: T,
	timeoutMs: number,
	errorContext: Record<string, string | number | boolean>
): Promise<T> {
	const start = performance.now();
	const phaseName = name === "memory" ? "memory_only" : "enrich_only";
	let timedOut = false;
	let timer: ReturnType<typeof setTimeout> | undefined;

	const guarded = promise.catch((error) => {
		captureError(error, {
			agent_optional_context_error: true,
			agent_optional_context_name: name,
			...errorContext,
		});
		return fallback;
	});

	const timeout = new Promise<T>((resolve) => {
		timer = setTimeout(() => {
			timedOut = true;
			mergeWideEvent({
				[`agent_${name}_context_timeout`]: true,
				[`agent_${name}_context_timeout_ms`]: timeoutMs,
				[`agent_phase_${phaseName}_ms`]: timeoutMs,
			});
			resolve(fallback);
		}, timeoutMs);
	});

	return Promise.race([guarded, timeout]).finally(() => {
		if (timer) {
			clearTimeout(timer);
		}
		if (!timedOut) {
			const elapsed = Math.round(performance.now() - start);
			mergeWideEvent({
				[`agent_${name}_context_total_ms`]: elapsed,
				[`agent_phase_${phaseName}_ms`]: elapsed,
			});
		}
	});
}

function createAgentUsageInjector(
	usagePromise: PromiseLike<{
		inputTokens?: number;
		outputTokens?: number;
		totalTokens?: number;
	}>
) {
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();
	let buffer = "";
	let injected = false;

	function enqueueText(
		controller: TransformStreamDefaultController<Uint8Array>,
		text: string
	) {
		if (text) {
			controller.enqueue(encoder.encode(text));
		}
	}

	function flushSafePrefix(
		controller: TransformStreamDefaultController<Uint8Array>
	) {
		const keepLength = SSE_DONE_MARKER.length - 1;
		if (buffer.length <= keepLength) {
			return;
		}
		const emitLength = buffer.length - keepLength;
		enqueueText(controller, buffer.slice(0, emitLength));
		buffer = buffer.slice(emitLength);
	}

	return new TransformStream<Uint8Array, Uint8Array>({
		async transform(chunk, controller) {
			if (injected) {
				controller.enqueue(chunk);
				return;
			}

			buffer += decoder.decode(chunk, { stream: true });
			const doneIndex = buffer.indexOf(SSE_DONE_MARKER);
			if (doneIndex === -1) {
				flushSafePrefix(controller);
				return;
			}

			const beforeDone = buffer.slice(0, doneIndex).trimEnd();
			if (beforeDone) {
				enqueueText(controller, `${beforeDone}\n\n`);
			}

			try {
				const usage = await usagePromise;
				const event = JSON.stringify({
					type: "data-usage",
					transient: true,
					data: {
						inputTokens: usage.inputTokens ?? 0,
						outputTokens: usage.outputTokens ?? 0,
						totalTokens: usage.totalTokens,
					},
				});
				enqueueText(controller, `data: ${event}\n\n`);
			} catch {
				// Usage telemetry is best-effort; never turn a completed answer into
				// a broken UI stream because token accounting failed.
			}

			enqueueText(controller, `${SSE_DONE_MARKER}\n\n`);
			injected = true;
			buffer = "";
		},
		flush(controller) {
			if (injected) {
				return;
			}
			const remaining = buffer + decoder.decode();
			if (remaining) {
				enqueueText(controller, remaining);
			}
		},
	});
}

async function createPlainTextStreamResponse(
	stream: AsyncGenerator<string>
): Promise<Response> {
	let first = await stream.next();
	while (!(first.done || first.value)) {
		first = await stream.next();
	}
	const encoder = new TextEncoder();
	return new Response(
		new ReadableStream<Uint8Array>({
			async start(controller) {
				try {
					if (!first.done) {
						controller.enqueue(encoder.encode(first.value));
					}
					for await (const chunk of stream) {
						if (chunk) {
							controller.enqueue(encoder.encode(chunk));
						}
					}
					controller.close();
				} catch (error) {
					controller.error(error);
				}
			},
		}),
		{
			headers: {
				"Cache-Control": "no-cache",
				"Content-Type": "text/plain; charset=utf-8",
			},
		}
	);
}

export const agent = new Elysia({ prefix: "/v1/agent" })
	.derive(async ({ request }) => {
		const { apiKey, session } = await resolveRequestAuth(request.headers);
		const scopedKey =
			apiKey && hasKeyScope(apiKey, "read:data") ? apiKey : null;
		const agentHeaders = new Headers(request.headers);
		if (scopedKey) {
			agentHeaders.delete("cookie");
		} else {
			agentHeaders.delete("x-api-key");
			if (
				agentHeaders.get("authorization")?.toLowerCase().startsWith("bearer ")
			) {
				agentHeaders.delete("authorization");
			}
		}
		return {
			activeOrganizationId: scopedKey
				? null
				: (session?.session.activeOrganizationId ?? null),
			agentHeaders,
			apiKey: scopedKey,
			user: scopedKey ? null : (session?.user ?? null),
		};
	})
	.onBeforeHandle(({ apiKey, user, request }) => {
		if (!(user || apiKey)) {
			return toAgentErrorResponse(
				new AgentError(
					isApiKeyPresent(request.headers) ? "invalid_api_key" : "auth_required"
				)
			);
		}
	})
	.post(
		"/ask",
		async function agentAsk({
			body,
			request,
			user,
			apiKey,
			activeOrganizationId,
			agentHeaders,
		}) {
			const conversationId = body.id ?? generateId();
			mergeWideEvent({ agent_chat_id: conversationId, source: "api" });

			try {
				const principal = await prepareAgentRequest({
					actor: agentActor(
						{ activeOrganizationId, apiKey, user },
						agentHeaders
					),
					organizationId: body.organizationId,
					rateLimit: "agent:ask",
				});
				mergeWideEvent({
					organization_id: principal.organizationId,
					agent_user_id: user?.id ?? `apikey:${apiKey?.id}`,
				});
				const options: DatabuddyAgentOptions = {
					abortSignal: request.signal,
					conversationId,
					input: body.question,
					mutationMode: "dry-run",
					output: "markdown",
					principal,
					source: "api",
					timezone: body.timezone,
				};
				if (body.stream) {
					return await createPlainTextStreamResponse(
						streamDatabuddyAgent(options)
					);
				}
				return await askDatabuddyAgent(options);
			} catch (error) {
				return agentFailure(error, "api", conversationId, {
					activeOrganizationId,
					apiKey,
					body,
					user,
				});
			}
		},
		{ body: AgentAskRequestSchema, idleTimeout: 60_000 }
	)
	.post(
		"/chat",
		function agentChat({
			body,
			user,
			apiKey,
			activeOrganizationId,
			agentHeaders,
			request,
		}) {
			return (async () => {
				const chatId = body.id ?? generateId();
				const t0 = performance.now();

				mergeWideEvent({
					...(user?.id ? { agent_user_id: user.id } : {}),
					...(body.websiteId ? { agent_website_id: body.websiteId } : {}),
					agent_chat_id: chatId,
				});

				try {
					const userId = user?.id ?? `apikey:${apiKey?.id}`;
					const principal = await timeAgentPhase(
						"prepare_request",
						prepareAgentRequest({
							actor: agentActor(
								{ activeOrganizationId, apiKey, user },
								agentHeaders
							),
							organizationId: body.organizationId,
							rateLimit: "agent:chat",
							websiteId: body.websiteId,
						})
					);
					const {
						accessibleWebsites,
						billingAccess,
						billingCustomerId,
						organizationId,
					} = principal;
					mergeWideEvent({ organization_id: organizationId });
					if (accessibleWebsites.length === 0) {
						throw new AgentError(
							"access_denied",
							"No accessible websites in this organization"
						);
					}
					const defaultWebsiteId = principal.website?.id ?? null;
					const defaultDomain = principal.website?.domain ?? undefined;

					const mentionedWebsites = (body.mentions ?? [])
						.map((id) => accessibleWebsites.find((w) => w.id === id))
						.filter((w): w is (typeof accessibleWebsites)[number] =>
							Boolean(w)
						);

					if (body.id) {
						const existingChat = await db.query.agentChats.findFirst({
							where: { id: chatId },
							columns: { userId: true, organizationId: true },
						});
						if (
							existingChat &&
							(existingChat.userId !== userId ||
								(existingChat.organizationId != null &&
									existingChat.organizationId !== organizationId))
						) {
							throw new AgentError("access_denied", "Access denied to chat");
						}
					}

					const timezone = body.timezone ?? "UTC";
					const lastMessage = getLastMessagePreview(body.messages);
					const latestUserMessage =
						body.messages.at(-1)?.role === "user" ? lastMessage : "";

					const modelKey: AgentModelKey = body.tier ?? "balanced";

					mergeWideEvent({
						agent_tier: modelKey,
						agent_model_key: modelKey,
					});

					trackAgentEvent("agent_activity", {
						action: "chat_started",
						source: "dashboard",
						agent_type: AGENT_TYPE,
						website_id: defaultWebsiteId,
						organization_id: organizationId,
						user_id: userId,
					});

					useLogger().info("Creating agent", {
						agent: {
							type: AGENT_TYPE,
							websiteId: defaultWebsiteId,
							accessibleWebsiteCount: accessibleWebsites.length,
							messageCount: body.messages.length,
							lastMessage,
						},
					});

					const loadMemoryContext = shouldLoadMemoryContext(latestUserMessage);
					mergeWideEvent({
						agent_memory_context_strategy: loadMemoryContext
							? "inline"
							: "tool_on_demand",
					});
					if (!loadMemoryContext) {
						mergeWideEvent({
							agent_memory_context_skipped: true,
							agent_phase_memory_only_ms: 0,
						});
					}

					const [memoryCtx, enrichment, businessContext, integrations] =
						await timeAgentPhase(
							"memory_enrich",
							Promise.all([
								loadMemoryContext
									? optionalAgentContext(
											"memory",
											getMemoryContextCached(latestUserMessage, userId),
											EMPTY_MEMORY_CONTEXT,
											AGENT_MEMORY_CONTEXT_TIMEOUT_MS,
											{
												agent_chat_id: chatId,
												...(defaultWebsiteId && {
													agent_website_id: defaultWebsiteId,
												}),
											}
										)
									: Promise.resolve(EMPTY_MEMORY_CONTEXT),
								defaultWebsiteId
									? optionalAgentContext(
											"enrichment",
											getAgentContextSnapshot(
												userId,
												defaultWebsiteId,
												organizationId
											),
											{ context: "", source: "error" },
											AGENT_ENRICHMENT_CONTEXT_TIMEOUT_MS,
											{
												agent_chat_id: chatId,
												agent_website_id: defaultWebsiteId,
											}
										)
									: Promise.resolve<AgentContextSnapshotResult>({
											context: "",
											source: "miss",
										}),
								loadOrganizationBusinessContext({
									organizationId,
									accessibleWebsites,
									websiteIds: [
										...(defaultWebsiteId ? [defaultWebsiteId] : []),
										...(body.mentions ?? []),
									],
									abortSignal: request.signal,
								}),
								timeAgentPhase(
									"tool_integrations",
									resolveToolIntegrations(organizationId, userId).catch(
										(error: unknown): undefined => {
											mergeWideEvent({
												agent_tool_integrations_error: getErrorName(error),
											});
										}
									)
								),
							])
						);
					mergeWideEvent({
						agent_enrichment_context_source: enrichment.source,
					});

					const modelOverride =
						process.env.NODE_ENV === "development"
							? request.headers.get("x-model-override")
							: null;

					const config = createAgentConfig(
						{
							userId,
							organizationId: organizationId ?? undefined,
							websiteId: defaultWebsiteId ?? undefined,
							websiteDomain: defaultDomain,
							defaultWebsiteId,
							accessibleWebsites,
							timezone,
							chatId,
							requestHeaders: agentHeaders,
							thinking: body.thinking,
							billingCustomerId,
							integrations,
							latestUserMessage,
						},
						modelKey,
						modelOverride
					);

					const mentionContext =
						mentionedWebsites.length > 0
							? `<mentioned-websites>\nThe user referenced these websites in their message. Prioritize them when choosing which website(s) to query:\n${mentionedWebsites
									.map(
										(w) =>
											`- ${w.name ?? w.domain ?? w.id} (id: ${w.id}${w.domain ? `, domain: ${w.domain}` : ""})`
									)
									.join("\n")}\n</mentioned-websites>`
							: "";

					const validation = await timeAgentPhase("validate_messages", () =>
						safeValidateUIMessages({
							messages: body.messages as UIMessage[],
							tools: config.tools as Parameters<
								typeof safeValidateUIMessages
							>[0]["tools"],
						})
					);

					if (!validation.success) {
						throw new AgentError("invalid_messages");
					}
					const approvalOrganizationId = organizationId;
					const chatMessages = await claimToolApprovals(
						settleStaleToolApprovals(validation.data),
						(approvalId) =>
							claimApproval(userId, approvalOrganizationId, chatId, approvalId)
					);

					const modelMessages = await timeAgentPhase(
						"convert_prune",
						async () => {
							const converted = await convertToModelMessages(chatMessages, {
								tools: config.tools,
								ignoreIncompleteToolCalls: true,
							});

							const pruned = pruneMessages({
								messages: converted,
								reasoning: "before-last-message",
								toolCalls: "before-last-2-messages",
								emptyMessages: "remove",
							});

							return prependBackgroundContext(pruned, [
								businessContext,
								memoryCtx ? formatMemoryForPrompt(memoryCtx) : "",
								enrichment.context,
								mentionContext,
							]);
						}
					);

					const dashboardTelemetryMetadata: Record<string, string> = {
						source: "dashboard",
						userId,
						chatId,
						agentType: AGENT_TYPE,
						timezone,
						"tcc.sessionId": chatId,
						"tcc.conversational": "true",
					};
					if (defaultWebsiteId) {
						dashboardTelemetryMetadata.websiteId = defaultWebsiteId;
					}
					if (defaultDomain) {
						dashboardTelemetryMetadata.websiteDomain = defaultDomain;
					}
					if (organizationId) {
						dashboardTelemetryMetadata.organizationId = organizationId;
					}

					const agent = createConversationAgent(
						{ ...config, model: getAILogger().wrap(config.model) },
						{
							experimental_telemetry: {
								isEnabled: true,
								functionId: `databuddy.dashboard.agent.${AGENT_TYPE}`,
								metadata: dashboardTelemetryMetadata,
							},
						}
					);

					if (
						isMemoryEnabled() &&
						defaultWebsiteId &&
						asksToRemember(latestUserMessage)
					) {
						storeConversation(
							[{ role: "user", content: latestUserMessage }],
							userId,
							null,
							{
								metadata: {
									source: "dashboard",
								},
								websiteId: defaultWebsiteId,
								conversationId: chatId,
								...(defaultDomain ? { domain: defaultDomain } : {}),
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
					const isNewChat = chatMessages.length <= 1;

					result.consumeStream();

					Promise.all([result.totalUsage, result.steps])
						.then(async ([usage, steps]) => {
							await trackAgentUsageAndBill({
								usage: {
									...usage,
									stepUsages: steps.map((step) => step.usage),
								},
								modelId: config.model.modelId,
								source: "dashboard",
								agentType: AGENT_TYPE,
								websiteId: defaultWebsiteId ?? undefined,
								organizationId,
								userId: persistedUserId ?? null,
								chatId,
								billingCustomerId,
								billingAccess,
							});
						})
						.catch((usageError) => {
							captureError(usageError, {
								agent_usage_telemetry_error: true,
								agent_chat_id: chatId,
								...(defaultWebsiteId
									? { agent_website_id: defaultWebsiteId }
									: {}),
							});
						});

					const streamScope = userId;
					const streamId = generateId();
					const streamKey = streamBufferKey(streamScope, chatId, streamId);
					await timeAgentPhase("stream_setup", () =>
						setActiveStream(streamScope, chatId, streamId)
					);

					if (persistedUserId) {
						try {
							await timeAgentPhase("persist_user_message", () =>
								db
									.insert(agentChats)
									.values({
										id: chatId,
										websiteId: defaultWebsiteId,
										userId: persistedUserId,
										organizationId: persistedOrgId,
										title: fallbackTitle,
										messages: chatMessages,
										updatedAt: new Date(),
									})
									.onConflictDoUpdate({
										target: agentChats.id,
										set: {
											messages: chatMessages,
											updatedAt: new Date(),
										},
									})
							);
						} catch (persistError) {
							captureError(persistError, {
								agent_user_message_persist_error: true,
								agent_chat_id: chatId,
								...(defaultWebsiteId
									? { agent_website_id: defaultWebsiteId }
									: {}),
							});
						}
					}

					const usagePromise = result.totalUsage;
					const response = result.toUIMessageStreamResponse({
						originalMessages: chatMessages,
						onFinish: async ({ messages }) => {
							try {
								await clearActiveStream(streamScope, chatId, streamId);
							} catch (cleanupError) {
								warnAgentStreamRedisSideEffect(
									cleanupError,
									"clear_active_stream",
									{
										chatId,
										websiteId: defaultWebsiteId,
									}
								);
							}
							if (!persistedUserId) {
								return;
							}
							try {
								await db
									.insert(agentChats)
									.values({
										id: chatId,
										websiteId: defaultWebsiteId,
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
									...(defaultWebsiteId
										? { agent_website_id: defaultWebsiteId }
										: {}),
								});
							}
						},
					});

					if (response.body) {
						const injectedStream = response.body.pipeThrough(
							createAgentUsageInjector(usagePromise)
						);
						const [forClient, forStorage] = injectedStream.tee();
						(async () => {
							const reader = forStorage.getReader();
							try {
								while (true) {
									const { done, value } = await reader.read();
									if (done) {
										break;
									}
									if (value && value.byteLength > 0) {
										try {
											await appendStreamChunk(streamKey, value);
										} catch (persistError) {
											warnAgentStreamRedisSideEffect(
												persistError,
												"append_stream_chunk",
												{
													chatId,
													websiteId: defaultWebsiteId,
												}
											);
											break;
										}
									}
								}
							} finally {
								reader.releaseLock();
								try {
									await markStreamDone(streamKey);
								} catch (cleanupError) {
									warnAgentStreamRedisSideEffect(
										cleanupError,
										"mark_stream_done",
										{
											chatId,
											websiteId: defaultWebsiteId,
										}
									);
								}
							}
						})().catch((storageError) => {
							captureError(storageError, {
								agent_stream_persist_error: true,
								agent_chat_id: chatId,
								...(defaultWebsiteId
									? { agent_website_id: defaultWebsiteId }
									: {}),
							});
						});
						return new Response(forClient, {
							status: response.status,
							headers: response.headers,
						});
					}
					return response;
				} catch (error) {
					return agentFailure(error, "dashboard", chatId, {
						activeOrganizationId,
						apiKey,
						body,
						user,
					});
				}
			})();
		},
		{ body: AgentRequestSchema, idleTimeout: 60_000 }
	)
	.get("/chat/:chatId/stream", async ({ params, user, request }) => {
		if (!user?.id) {
			return toAgentErrorResponse(new AgentError("auth_required"));
		}
		const chat = await db.query.agentChats.findFirst({
			where: { id: params.chatId, userId: user.id },
			columns: { id: true },
		});
		if (!chat) {
			return new Response(null, { status: 204 });
		}
		const streamId = await getActiveStream(user.id, chat.id);
		if (!streamId) {
			return new Response(null, { status: 204 });
		}
		const key = streamBufferKey(user.id, chat.id, streamId);

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
