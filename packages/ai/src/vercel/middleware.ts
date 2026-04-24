import { computeCost } from "../shared/costs";
import { createTransport } from "../shared/transport";
import type {
	CallOptions,
	Cost,
	LLMCall,
	ToolInfo,
	TrackerOptions,
	Transport,
} from "../shared/types";
import { createErrorInfo, createTraceId } from "../shared/utils";
import {
	outputToMessages,
	promptToMessages,
	streamToMessages,
} from "./messages";
import type { Model, StreamChunk } from "./providers";
import { getProvider } from "./providers";
import {
	adjustAnthropicCache,
	buildToolInfo,
	buildUsage,
	getWebSearchCount,
} from "./usage";

const DEFAULT_MAX_SIZE = 1_048_576;
const DEFAULT_API_URL = "https://basket.databuddy.cc/llm";

function createErrorRecord(
	traceId: string,
	type: "generate" | "stream",
	model: string,
	provider: string,
	input: LLMCall["input"],
	durationMs: number,
	error: unknown
): LLMCall {
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
		tools: { callCount: 0, resultCount: 0, calledTools: [] },
		durationMs,
		error: createErrorInfo(error),
	};
}

function sendCall(
	call: LLMCall,
	transport: Transport,
	onSuccess?: (call: LLMCall) => void,
	onError?: (call: LLMCall) => void
): void {
	Promise.resolve(transport(call)).catch((err) => {
		console.error("[databuddy] Failed to send LLM log:", err);
	});
	if (call.error) {
		onError?.(call);
	} else {
		onSuccess?.(call);
	}
}

function getFinishReason(raw: unknown): string | undefined {
	if (typeof raw === "string") {
		return raw;
	}
	if (raw && typeof raw === "object") {
		if ("unified" in raw) {
			return (raw as { unified: string }).unified;
		}
		if ("type" in raw) {
			return (raw as { type: string }).type;
		}
	}
	return;
}

/**
 * Creates a Databuddy LLM tracker for Vercel AI SDK models
 *
 * @example
 * ```ts
 * import { createTracker } from "@databuddy/ai/vercel";
 * import { openai } from "@ai-sdk/openai";
 * import { generateText } from "ai";
 *
 * const { track } = createTracker({ apiKey: "your-api-key" });
 *
 * const result = await generateText({
 *   model: track(openai("gpt-4o")),
 *   prompt: "Hello!",
 * });
 * ```
 */
export function createTracker(options: TrackerOptions = {}) {
	const {
		apiUrl,
		apiKey,
		transport: customTransport,
		computeCosts: shouldComputeCosts = true,
		privacyMode: globalPrivacyMode = false,
		maxContentSize = DEFAULT_MAX_SIZE,
		onSuccess: globalOnSuccess,
		onError: globalOnError,
	} = options;

	const transport: Transport =
		customTransport ??
		createTransport(
			apiUrl ?? process.env.DATABUDDY_API_URL ?? DEFAULT_API_URL,
			apiKey ?? process.env.DATABUDDY_API_KEY
		);

	function track<T extends Model>(model: T, opts: CallOptions = {}): T {
		const getTransport = () => opts.transport ?? transport;
		const isPrivate = () => opts.privacyMode ?? globalPrivacyMode;
		const shouldCost = () => opts.computeCosts ?? shouldComputeCosts;
		const onSuccess = opts.onSuccess ?? globalOnSuccess;
		const onError = opts.onError ?? globalOnError;

		return Object.create(model, {
			doGenerate: {
				value: async (params: unknown) => {
					const startTime = Date.now();
					const traceId = opts.traceId ?? createTraceId();
					const activeTransport = getTransport();

					try {
						const result = await model.doGenerate(params as never);
						const durationMs = Date.now() - startTime;
						const provider = getProvider(model);
						const usage = buildUsage(result.usage, result.providerMetadata);

						adjustAnthropicCache(model, provider, usage);

						const cost: Cost =
							shouldCost() && (usage.inputTokens > 0 || usage.outputTokens > 0)
								? await computeCost(model.modelId, model.provider, usage)
								: {};

						const promptParams = params as {
							prompt: Parameters<typeof promptToMessages>[0];
						};
						const input = isPrivate()
							? []
							: promptToMessages(promptParams.prompt, maxContentSize);
						const output = isPrivate()
							? []
							: outputToMessages(
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

						const call: LLMCall = {
							timestamp: new Date(),
							traceId,
							type: "generate",
							model: result.response?.modelId ?? model.modelId,
							provider,
							finishReason: getFinishReason(result.finishReason),
							input,
							output,
							usage,
							cost,
							tools: buildToolInfo(
								result.content as Array<{ type: string; toolName?: string }>,
								params as { tools?: Array<{ name: string }> }
							),
							durationMs,
							httpStatus: 200,
						};

						sendCall(call, activeTransport, onSuccess, onError);
						return result;
					} catch (error) {
						const durationMs = Date.now() - startTime;
						const promptParams = params as {
							prompt: Parameters<typeof promptToMessages>[0];
						};
						const input = isPrivate()
							? []
							: promptToMessages(promptParams.prompt, maxContentSize);

						sendCall(
							createErrorRecord(
								traceId,
								"generate",
								model.modelId,
								getProvider(model),
								input,
								durationMs,
								error
							),
							activeTransport,
							onSuccess,
							onError
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
					const traceId = opts.traceId ?? createTraceId();
					const activeTransport = getTransport();

					try {
						const { stream, ...rest } = await model.doStream(params as never);

						let text = "";
						let reasoning = "";
						let finishReason: string | undefined;
						let providerMetadata: unknown;
						let rawUsage: Record<string, unknown> = {};
						const toolCalls = new Map<
							string,
							{ toolCallId: string; toolName: string; input: string }
						>();
						const sources: Array<{
							sourceType: string;
							id: string;
							url: string;
							title: string;
						}> = [];

						const transform = new TransformStream<StreamChunk, StreamChunk>({
							transform(chunk, controller) {
								switch (chunk.type) {
									case "text-delta":
										text += chunk.delta;
										break;
									case "reasoning-delta":
										reasoning += chunk.delta;
										break;
									case "tool-input-start":
										toolCalls.set(chunk.id, {
											toolCallId: chunk.id,
											toolName: chunk.toolName,
											input: "",
										});
										break;
									case "tool-input-delta": {
										const tc = toolCalls.get(chunk.id);
										if (tc) {
											tc.input += chunk.delta;
										}
										break;
									}
									case "tool-call": {
										const input = (chunk as { input?: unknown }).input;
										toolCalls.set(chunk.toolCallId, {
											toolCallId: chunk.toolCallId,
											toolName: chunk.toolName,
											input:
												typeof input === "string"
													? input
													: JSON.stringify(input ?? {}),
										});
										break;
									}
									case "source": {
										const src = chunk as {
											sourceType?: string;
											id?: string;
											url?: string;
											title?: string;
										};
										sources.push({
											sourceType: src.sourceType ?? "unknown",
											id: src.id ?? "",
											url: src.url ?? "",
											title: src.title ?? "",
										});
										break;
									}
									case "finish":
										providerMetadata = chunk.providerMetadata;
										rawUsage = (chunk.usage as Record<string, unknown>) ?? {};
										finishReason = getFinishReason(chunk.finishReason);
										break;
									default:
								}
								controller.enqueue(chunk);
							},

							flush: async () => {
								const durationMs = Date.now() - startTime;
								const provider = getProvider(model);

								const usage = buildUsage(rawUsage, providerMetadata);
								usage.webSearchCount = getWebSearchCount(
									providerMetadata,
									rawUsage
								);

								adjustAnthropicCache(model, provider, usage);

								const cost: Cost =
									shouldCost() &&
									(usage.inputTokens > 0 || usage.outputTokens > 0)
										? await computeCost(model.modelId, model.provider, usage)
										: {};

								const promptParams = params as {
									prompt: Parameters<typeof promptToMessages>[0];
								};
								const input = isPrivate()
									? []
									: promptToMessages(promptParams.prompt, maxContentSize);
								const output = isPrivate()
									? []
									: streamToMessages(text, reasoning, toolCalls, sources);

								const tools: ToolInfo = {
									callCount: toolCalls.size,
									resultCount: 0,
									calledTools: [
										...new Set([...toolCalls.values()].map((t) => t.toolName)),
									],
									availableTools: (
										params as { tools?: Array<{ name: string }> }
									).tools?.map((t) => t.name),
								};

								const call: LLMCall = {
									timestamp: new Date(),
									traceId,
									type: "stream",
									model: model.modelId,
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

								sendCall(call, activeTransport, onSuccess, onError);
							},
						});

						return { stream: stream.pipeThrough(transform), ...rest };
					} catch (error) {
						const durationMs = Date.now() - startTime;
						const promptParams = params as {
							prompt: Parameters<typeof promptToMessages>[0];
						};
						const input = isPrivate()
							? []
							: promptToMessages(promptParams.prompt, maxContentSize);

						sendCall(
							createErrorRecord(
								traceId,
								"stream",
								model.modelId,
								getProvider(model),
								input,
								durationMs,
								error
							),
							activeTransport,
							onSuccess,
							onError
						);
						throw error;
					}
				},
				writable: true,
				configurable: true,
				enumerable: false,
			},
		}) as T;
	}

	return { track, transport };
}
