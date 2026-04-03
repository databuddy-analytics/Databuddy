import { type ClientOptions, OpenAI as OpenAIOriginal } from "openai";
import type { APIPromise } from "openai/core";
import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionCreateParamsNonStreaming,
	ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";
import type { Stream } from "openai/streaming";
import { v7 as uuidv7 } from "uuid";

import { formatMessages, formatResponse, formatStreamOutput } from "./messages";
import type {
	OpenAICallOptions,
	OpenAICost,
	OpenAILLMCall,
	OpenAIToolInfo,
	OpenAITrackerOptions,
	OpenAITransport,
	OpenAIUsage,
} from "./types";
import { extractUsage, getWebSearchCount } from "./usage";

export type {
	OpenAICallOptions,
	OpenAILLMCall,
	OpenAITrackerOptions,
	OpenAITransport,
} from "./types";

/** Creates a trace ID using UUIDv7 */
export function createTraceId(): string {
	return uuidv7();
}

/** Default HTTP transport */
export function httpTransport(url: string, apiKey?: string): OpenAITransport {
	return async (call) => {
		await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
			},
			body: JSON.stringify(call),
		});
	};
}

function createTransport(apiUrl?: string, apiKey?: string): OpenAITransport {
	const url =
		apiUrl ?? process.env.DATABUDDY_API_URL ?? "https://api.databuddy.cc/llm";
	const key = apiKey ?? process.env.DATABUDDY_API_KEY;
	return httpTransport(url, key);
}

function createErrorInfo(error: unknown): {
	name: string;
	message: string;
	stack?: string;
} {
	if (error instanceof Error) {
		return { name: error.name, message: error.message, stack: error.stack };
	}
	return { name: "Error", message: String(error) };
}

function getHttpStatus(error: unknown): number {
	if (error && typeof error === "object" && "status" in error) {
		const status = (error as { status: unknown }).status;
		if (typeof status === "number") {
			return status;
		}
	}
	return 500;
}

async function computeCost(
	model: string,
	usage: OpenAIUsage
): Promise<OpenAICost> {
	try {
		const { computeCostUSD } = await import("tokenlens");
		const result = await computeCostUSD({
			modelId: model,
			provider: "openai",
			usage: {
				input_tokens: usage.inputTokens,
				output_tokens: usage.outputTokens,
			},
		});
		return {
			inputCostUSD: result.inputTokenCostUSD,
			outputCostUSD: result.outputTokenCostUSD,
			totalCostUSD: result.totalTokenCostUSD,
		};
	} catch {
		return {};
	}
}

interface OpenAIConfig extends ClientOptions {
	databuddy?: OpenAITrackerOptions;
}

type CreateParams = (
	| ChatCompletionCreateParamsNonStreaming
	| ChatCompletionCreateParamsStreaming
) & {
	databuddy?: OpenAICallOptions;
};

interface TransportConfig {
	computeCosts: boolean;
	onError?: (call: OpenAILLMCall) => void;
	onSuccess?: (call: OpenAILLMCall) => void;
	privacyMode: boolean;
	transport: OpenAITransport;
}

/** OpenAI client with Databuddy observability */
export class OpenAI extends OpenAIOriginal {
	private readonly db: TransportConfig;
	override chat: DatabuddyChat;

	constructor(config: OpenAIConfig = {}) {
		const { databuddy, ...openAIConfig } = config;
		super(openAIConfig);

		this.db = {
			transport:
				databuddy?.transport ??
				createTransport(databuddy?.apiUrl, databuddy?.apiKey),
			computeCosts: databuddy?.computeCosts ?? true,
			privacyMode: databuddy?.privacyMode ?? false,
			onSuccess: databuddy?.onSuccess,
			onError: databuddy?.onError,
		};

		this.chat = new DatabuddyChat(this as OpenAIOriginal, this.db);
	}
}

class DatabuddyChat extends OpenAIOriginal.Chat {
	override completions: DatabuddyCompletions;

	constructor(client: OpenAIOriginal, db: TransportConfig) {
		// @ts-expect-error OpenAI class override causes structural mismatch
		super(client);
		this.completions = new DatabuddyCompletions(client, db);
	}
}

class DatabuddyCompletions extends OpenAIOriginal.Chat.Completions {
	private readonly db: TransportConfig;

	constructor(client: OpenAIOriginal, db: TransportConfig) {
		// @ts-expect-error OpenAI class override causes structural mismatch
		super(client);
		this.db = db;
	}

	create(
		body: ChatCompletionCreateParamsNonStreaming & {
			databuddy?: OpenAICallOptions;
		}
	): APIPromise<ChatCompletion>;
	create(
		body: ChatCompletionCreateParamsStreaming & {
			databuddy?: OpenAICallOptions;
		}
	): APIPromise<Stream<ChatCompletionChunk>>;
	create(
		body: CreateParams
	): APIPromise<ChatCompletion | Stream<ChatCompletionChunk>> {
		const { databuddy: opts, ...params } = body;
		const startTime = Date.now();
		const traceId = opts?.traceId ?? createTraceId();
		const isPrivate = opts?.privacyMode ?? this.db.privacyMode;
		const shouldCost = opts?.computeCosts ?? this.db.computeCosts;
		const onSuccess = opts?.onSuccess ?? this.db.onSuccess;
		const onError = opts?.onError ?? this.db.onError;

		const sendCall = (call: OpenAILLMCall) => {
			Promise.resolve(this.db.transport(call)).catch((err) => {
				console.error("[databuddy] Failed to send LLM log:", err);
			});
			if (call.error) {
				onError?.(call);
			} else {
				onSuccess?.(call);
			}
		};

		const input = isPrivate
			? []
			: formatMessages(params.messages as Parameters<typeof formatMessages>[0]);
		const tools: OpenAIToolInfo = {
			callCount: 0,
			resultCount: 0,
			calledTools: [],
			availableTools: params.tools?.map((t) => t.function.name),
		};

		const promise = super.create(params);

		if (params.stream) {
			return promise.then((value) => {
				if (!("tee" in value)) {
					return value;
				}

				const [stream1, stream2] = value.tee();

				(async () => {
					try {
						let text = "";
						let modelFromResponse: string | undefined;
						let usage: OpenAIUsage = {
							inputTokens: 0,
							outputTokens: 0,
							totalTokens: 0,
						};
						const toolCalls = new Map<
							number,
							{ id: string; name: string; arguments: string }
						>();

						for await (const chunk of stream1) {
							if (!modelFromResponse && chunk.model) {
								modelFromResponse = chunk.model;
							}

							const choice = chunk.choices?.[0];
							if (choice?.delta?.content) {
								text += choice.delta.content;
							}

							if (choice?.delta?.tool_calls) {
								for (const tc of choice.delta.tool_calls) {
									const idx = tc.index;
									if (idx === undefined) {
										continue;
									}

									if (!toolCalls.has(idx)) {
										toolCalls.set(idx, {
											id: tc.id ?? "",
											name: tc.function?.name ?? "",
											arguments: "",
										});
									}

									const inProgress = toolCalls.get(idx);
									if (inProgress) {
										if (tc.id) {
											inProgress.id = tc.id;
										}
										if (tc.function?.name) {
											inProgress.name = tc.function.name;
										}
										if (tc.function?.arguments) {
											inProgress.arguments += tc.function.arguments;
										}
									}
								}
							}

							if (chunk.usage) {
								usage = extractUsage(chunk.usage);
								usage.webSearchCount = getWebSearchCount(chunk);
							}
						}

						const durationMs = Date.now() - startTime;
						const cost: OpenAICost =
							shouldCost && (usage.inputTokens > 0 || usage.outputTokens > 0)
								? await computeCost(modelFromResponse ?? params.model, usage)
								: {};

						tools.callCount = toolCalls.size;
						tools.calledTools = Array.from(
							new Set(
								Array.from(toolCalls.values())
									.map((t) => t.name)
									.filter(Boolean)
							)
						);

						const call: OpenAILLMCall = {
							timestamp: new Date(),
							traceId,
							type: "stream",
							model: modelFromResponse ?? params.model,
							provider: "openai",
							input,
							output: isPrivate ? [] : formatStreamOutput(text, toolCalls),
							usage,
							cost,
							tools,
							durationMs,
							httpStatus: 200,
						};

						sendCall(call);
					} catch (error) {
						const call: OpenAILLMCall = {
							timestamp: new Date(),
							traceId,
							type: "stream",
							model: params.model,
							provider: "openai",
							input,
							output: [],
							usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
							cost: {},
							tools,
							error: createErrorInfo(error),
							durationMs: Date.now() - startTime,
							httpStatus: getHttpStatus(error),
						};
						sendCall(call);
					}
				})();

				return stream2;
			}) as APIPromise<Stream<ChatCompletionChunk>>;
		}

		return (promise as APIPromise<ChatCompletion>).then(
			async (result) => {
				const durationMs = Date.now() - startTime;
				const usage = extractUsage(result.usage);
				usage.webSearchCount = getWebSearchCount(result);

				const cost: OpenAICost =
					shouldCost && (usage.inputTokens > 0 || usage.outputTokens > 0)
						? await computeCost(result.model ?? params.model, usage)
						: {};

				const output = isPrivate ? [] : formatResponse(result);
				const calledTools =
					result.choices?.[0]?.message?.tool_calls?.map(
						(tc) => tc.function.name
					) ?? [];

				tools.callCount = calledTools.length;
				tools.calledTools = Array.from(new Set(calledTools));

				const call: OpenAILLMCall = {
					timestamp: new Date(),
					traceId,
					type: "generate",
					model: result.model ?? params.model,
					provider: "openai",
					finishReason: result.choices?.[0]?.finish_reason ?? undefined,
					input,
					output,
					usage,
					cost,
					tools,
					durationMs,
					httpStatus: 200,
				};

				sendCall(call);
				return result;
			},
			(error) => {
				const call: OpenAILLMCall = {
					timestamp: new Date(),
					traceId,
					type: "generate",
					model: params.model,
					provider: "openai",
					input,
					output: [],
					usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
					cost: {},
					tools,
					error: createErrorInfo(error),
					durationMs: Date.now() - startTime,
					httpStatus: getHttpStatus(error),
				};

				sendCall(call);
				throw error;
			}
		) as APIPromise<ChatCompletion>;
	}
}
