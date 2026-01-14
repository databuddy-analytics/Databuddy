/**
 * Vercel AI SDK middleware for Databuddy
 * 
 * Inspired by and adapted from PostHog's AI SDK implementation:
 * https://github.com/PostHog/posthog-js/tree/main/packages/ai
 */

import { computeCosts } from "./costs";
import {
	adjustAnthropicV3CacheTokens,
	extractAdditionalTokenValues,
	extractCacheReadTokens,
	extractReasoningTokens,
	extractTokenCount,
	extractToolInfo,
	extractUsage,
	extractWebSearchCount,
} from "./extractors";
import type { LanguageModel, LanguageModelStreamPart } from "./guards";
import {
	buildStreamOutput,
	mapPromptToMessages,
	mapResultToMessages,
} from "./mappers";
import { createDefaultTransport } from "./transport";
import type {
	AICall,
	DatabuddyLLMOptions,
	TokenCost,
	ToolCallInfo,
	TrackOptions,
	Transport,
} from "./types";
import { generateTraceId } from "./utils";

const MAX_CONTENT_SIZE = 1_048_576;

const extractProvider = (model: LanguageModel): string => {
	return model.provider.toLowerCase().split(".")[0];
};
const createErrorCall = (
	traceId: string,
	type: "generate" | "stream",
	model: string,
	provider: string,
	input: AICall["input"],
	durationMs: number,
	error: unknown
): AICall => {
	return {
		timestamp: new Date(),
		traceId,
		type,
		model,
		provider,
		input,
		output: [],
		usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
		cost: {},
		tools: { toolCallCount: 0, toolResultCount: 0, toolCallNames: [] },
		durationMs,
		error: {
			name: error instanceof Error ? error.name : "UnknownError",
			message: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		},
	};
};

const sendCall = (
	call: AICall,
	transport: Transport,
	onSuccess?: (call: AICall) => void,
	onError?: (call: AICall) => void
): void => {
	Promise.resolve(transport(call)).catch((error) => {
		console.error("[databuddy] Failed to send AI log:", error);
	});
	call.error ? onError?.(call) : onSuccess?.(call);
};

/**
 * Create a Databuddy LLM tracking instance
 *
 * @example
 * ```ts
 * import { databuddyLLM } from "@databuddy/sdk/ai/vercel";
 *
 * const { track } = databuddyLLM({ apiKey: "your-api-key" });
 * const model = track(openai("gpt-4"));
 * ```
 */
export const databuddyLLM = (options: DatabuddyLLMOptions = {}) => {
	const {
		apiUrl,
		apiKey,
		clientId,
		transport: customTransport,
		computeCosts: defaultComputeCosts = true,
		privacyMode: defaultPrivacyMode = false,
		maxContentSize = MAX_CONTENT_SIZE,
		onSuccess: defaultOnSuccess,
		onError: defaultOnError,
	} = options;

	const transport: Transport = customTransport
		? customTransport
		: createDefaultTransport(
			apiUrl ?? process.env.DATABUDDY_API_URL ?? "https://basket.databuddy.cc/llm",
			clientId ?? process.env.DATABUDDY_CLIENT_ID,
			apiKey ?? process.env.DATABUDDY_API_KEY
		);

	const track = <T extends LanguageModel>(
		model: T,
		trackOptions: TrackOptions = {}
	): T => {
		const getEffectiveTransport = (): Transport => {
			if (trackOptions.transport) {
				return trackOptions.transport;
			}
			if (trackOptions.clientId && trackOptions.clientId !== clientId) {
				return createDefaultTransport(
					apiUrl ?? process.env.DATABUDDY_API_URL ?? "https://basket.databuddy.cc/llm",
					trackOptions.clientId,
					apiKey ?? process.env.DATABUDDY_API_KEY
				);
			}
			return transport;
		};

		return Object.create(model, {
			doGenerate: {
				value: async (params: unknown) => {
					const startTime = Date.now();
					const traceId = trackOptions.traceId ?? generateTraceId();
					const effectiveTransport = getEffectiveTransport();

					try {
						const result = await model.doGenerate(params as never);
						const durationMs = Date.now() - startTime;
						const tools = extractToolInfo(
							result.content as Array<{ type: string; toolName?: string }>,
							params as { tools?: Array<{ name: string }> }
						);
						const provider = extractProvider(model);
						const usage = extractUsage(result.usage, result.providerMetadata);

						adjustAnthropicV3CacheTokens(model, provider, usage);

						const cost: TokenCost =
							(trackOptions.computeCosts ?? defaultComputeCosts) &&
								(usage.inputTokens > 0 || usage.outputTokens > 0)
								? await computeCosts(model.modelId, model.provider, {
									inputTokens: usage.inputTokens,
									outputTokens: usage.outputTokens,
								})
								: {};

						const input =
							(trackOptions.privacyMode ?? defaultPrivacyMode)
								? []
								: mapPromptToMessages(
									(
										params as {
											prompt: Parameters<typeof mapPromptToMessages>[0];
										}
									).prompt,
									maxContentSize
								);
						const output =
							(trackOptions.privacyMode ?? defaultPrivacyMode)
								? []
								: mapResultToMessages(
									result.content as Array<{
										type: string;
										text?: string;
										toolCallId?: string;
										toolName?: string;
										input?: unknown;
										data?: unknown;
										mediaType?: string;
									}>
								);

						const rawFinishReason = result.finishReason;
						let finishReason: string | undefined;
						if (typeof rawFinishReason === "string") {
							finishReason = rawFinishReason;
						} else if (rawFinishReason && typeof rawFinishReason === "object") {
							if ("unified" in rawFinishReason) {
								finishReason = (rawFinishReason as { unified: string }).unified;
							} else if ("type" in rawFinishReason) {
								finishReason = (rawFinishReason as { type: string }).type;
							}
						}

						const call: AICall = {
							timestamp: new Date(),
							traceId,
							type: "generate",
							model: result.response?.modelId ?? model.modelId,
							provider,
							finishReason,
							input,
							output,
							usage,
							cost,
							tools,
							durationMs,
							httpStatus: 200,
						};

						sendCall(
							call,
							effectiveTransport,
							trackOptions.onSuccess ?? defaultOnSuccess,
							trackOptions.onError ?? defaultOnError
						);

						return result;
					} catch (error) {
						const durationMs = Date.now() - startTime;
						const input =
							(trackOptions.privacyMode ?? defaultPrivacyMode)
								? []
								: mapPromptToMessages(
									(
										params as {
											prompt: Parameters<typeof mapPromptToMessages>[0];
										}
									).prompt,
									maxContentSize
								);

						const call = createErrorCall(
							traceId,
							"generate",
							model.modelId,
							extractProvider(model),
							input,
							durationMs,
							error
						);

						sendCall(
							call,
							effectiveTransport,
							trackOptions.onSuccess ?? defaultOnSuccess,
							trackOptions.onError ?? defaultOnError
						);

						throw error;
					}
				},
				writable: true,
				configurable: true,
				enumerable: false,
			},
			doStream: {
				value: async (params: unknown) => {
					const startTime = Date.now();
					const traceId = trackOptions.traceId ?? generateTraceId();
					const effectiveTransport = getEffectiveTransport();

					try {
						const { stream, ...rest } = await model.doStream(params as never);

						let generatedText = "";
						let reasoningText = "";
						let finishReason: string | undefined;
						let providerMetadata: unknown;
						let usage: {
							inputTokens?: number;
							outputTokens?: number;
							reasoningTokens?: unknown;
							cacheReadInputTokens?: unknown;
							cacheCreationInputTokens?: unknown;
						} = {};
						const toolCallsInProgress = new Map<
							string,
							{
								toolCallId: string;
								toolName: string;
								input: string;
							}
						>();
						const sources: Array<{
							sourceType: string;
							id: string;
							url: string;
							title: string;
						}> = [];

						const transformStream = new TransformStream<
							LanguageModelStreamPart,
							LanguageModelStreamPart
						>({
							transform(chunk, controller) {
								if (chunk.type === "text-delta") {
									generatedText += chunk.delta;
								}
								if (chunk.type === "reasoning-delta") {
									reasoningText += chunk.delta;
								}
								if (chunk.type === "tool-input-start") {
									toolCallsInProgress.set(chunk.id, {
										toolCallId: chunk.id,
										toolName: chunk.toolName,
										input: "",
									});
								}
								if (chunk.type === "tool-input-delta") {
									const toolCall = toolCallsInProgress.get(chunk.id);
									if (toolCall) {
										toolCall.input += chunk.delta;
									}
								}
								if (chunk.type === "tool-call") {
									const input = (chunk as { input?: unknown }).input;
									toolCallsInProgress.set(chunk.toolCallId, {
										toolCallId: chunk.toolCallId,
										toolName: chunk.toolName,
										input:
											typeof input === "string"
												? input
												: JSON.stringify(input ?? {}),
									});
								}
								if (chunk.type === "source") {
									const sourceChunk = chunk as {
										sourceType?: string;
										id?: string;
										url?: string;
										title?: string;
									};
									sources.push({
										sourceType: sourceChunk.sourceType ?? "unknown",
										id: sourceChunk.id ?? "",
										url: sourceChunk.url ?? "",
										title: sourceChunk.title ?? "",
									});
								}

								if (chunk.type === "finish") {
									providerMetadata = chunk.providerMetadata;
									const additionalTokenValues = extractAdditionalTokenValues(
										providerMetadata
									);
									const chunkUsage = (chunk.usage as Record<string, unknown>) ?? {};
									usage = {
										inputTokens: extractTokenCount(chunk.usage?.inputTokens),
										outputTokens: extractTokenCount(chunk.usage?.outputTokens),
										reasoningTokens: extractReasoningTokens(chunkUsage),
										cacheReadInputTokens: extractCacheReadTokens(chunkUsage),
										...additionalTokenValues,
									};
									const rawFinishReason = chunk.finishReason;
									if (typeof rawFinishReason === "string") {
										finishReason = rawFinishReason;
									} else if (
										rawFinishReason &&
										typeof rawFinishReason === "object"
									) {
										if ("unified" in rawFinishReason) {
											finishReason = (rawFinishReason as { unified: string })
												.unified;
										} else if ("type" in rawFinishReason) {
											finishReason = (rawFinishReason as { type: string }).type;
										}
									}
								}

								controller.enqueue(chunk);
							},

							flush: async () => {
								const durationMs = Date.now() - startTime;
								const webSearchCount = extractWebSearchCount(
									providerMetadata,
									usage
								);
								const finalUsageObj = {
									...usage,
									webSearchCount,
								};
								const finalUsage = extractUsage(
									finalUsageObj as {
										inputTokens?: unknown;
										outputTokens?: unknown;
										totalTokens?: number;
									},
									providerMetadata
								);
								const provider = extractProvider(model);

								adjustAnthropicV3CacheTokens(model, provider, finalUsage);

								const output =
									(trackOptions.privacyMode ?? defaultPrivacyMode)
										? []
										: buildStreamOutput(
											generatedText,
											reasoningText,
											toolCallsInProgress,
											sources
										);

								const tools: ToolCallInfo = {
									toolCallCount: toolCallsInProgress.size,
									toolResultCount: 0,
									toolCallNames: [
										...new Set(
											[...toolCallsInProgress.values()].map((t) => t.toolName)
										),
									],
									availableTools: (
										params as { tools?: Array<{ name: string }> }
									).tools?.map((t) => t.name),
								};

								const cost: TokenCost =
									(trackOptions.computeCosts ?? defaultComputeCosts) &&
										(finalUsage.inputTokens > 0 || finalUsage.outputTokens > 0)
										? await computeCosts(model.modelId, model.provider, {
											inputTokens: finalUsage.inputTokens,
											outputTokens: finalUsage.outputTokens,
										})
										: {};

								const input =
									(trackOptions.privacyMode ?? defaultPrivacyMode)
										? []
										: mapPromptToMessages(
											(
												params as {
													prompt: Parameters<typeof mapPromptToMessages>[0];
												}
											).prompt,
											maxContentSize
										);

								const call: AICall = {
									timestamp: new Date(),
									traceId,
									type: "stream",
									model: model.modelId,
									provider,
									finishReason,
									input,
									output,
									usage: finalUsage,
									cost,
									tools,
									durationMs,
									httpStatus: 200,
								};

								sendCall(
									call,
									effectiveTransport,
									trackOptions.onSuccess ?? defaultOnSuccess,
									trackOptions.onError ?? defaultOnError
								);
							},
						});

						return { stream: stream.pipeThrough(transformStream), ...rest };
					} catch (error) {
						const durationMs = Date.now() - startTime;
						const input =
							(trackOptions.privacyMode ?? defaultPrivacyMode)
								? []
								: mapPromptToMessages(
									(
										params as {
											prompt: Parameters<typeof mapPromptToMessages>[0];
										}
									).prompt,
									maxContentSize
								);

						const call = createErrorCall(
							traceId,
							"stream",
							model.modelId,
							extractProvider(model),
							input,
							durationMs,
							error
						);

						sendCall(
							call,
							effectiveTransport,
							trackOptions.onSuccess ?? defaultOnSuccess,
							trackOptions.onError ?? defaultOnError
						);

						throw error;
					}
				},
				writable: true,
				configurable: true,
				enumerable: false,
			},
		}) as T;
	};

	return { track, transport };
};

// biome-ignore lint/performance/noBarrelFile: we need to export the transport function
export { httpTransport } from "./transport";
