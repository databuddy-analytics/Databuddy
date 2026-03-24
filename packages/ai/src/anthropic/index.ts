import AnthropicOriginal from "@anthropic-ai/sdk";
import type { APIPromise } from "@anthropic-ai/sdk/core";
import type {
	Message,
	MessageCreateParamsNonStreaming,
	MessageCreateParamsStreaming,
	RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages";
import type { Stream } from "@anthropic-ai/sdk/streaming";
import { v7 as uuidv7 } from "uuid";

import { formatMessages, formatResponse, formatStreamOutput } from "./messages";
import type {
	AnthropicCallOptions,
	AnthropicCost,
	AnthropicLLMCall,
	AnthropicRawUsage,
	AnthropicToolInfo,
	AnthropicTrackerOptions,
	AnthropicTransport,
	AnthropicUsage,
} from "./types";
import { extractUsage } from "./usage";

export type {
	AnthropicCallOptions,
	AnthropicLLMCall,
	AnthropicTrackerOptions,
	AnthropicTransport,
} from "./types";

/** Creates a trace ID using UUIDv7 */
export function createTraceId(): string {
	return uuidv7();
}

/** Default HTTP transport */
export function httpTransport(
	url: string,
	apiKey?: string
): AnthropicTransport {
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

function createTransport(apiUrl?: string, apiKey?: string): AnthropicTransport {
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
	usage: AnthropicUsage
): Promise<AnthropicCost> {
	try {
		const { computeCostUSD } = await import("tokenlens");
		const result = await computeCostUSD({
			modelId: model,
			provider: "anthropic",
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

interface AnthropicConfig {
	apiKey?: string;
	baseURL?: string;
	databuddy?: AnthropicTrackerOptions;
}

type CreateParams = (
	| MessageCreateParamsNonStreaming
	| MessageCreateParamsStreaming
) & {
	databuddy?: AnthropicCallOptions;
};

interface TransportConfig {
	transport: AnthropicTransport;
	computeCosts: boolean;
	privacyMode: boolean;
	onSuccess?: (call: AnthropicLLMCall) => void;
	onError?: (call: AnthropicLLMCall) => void;
}

/** Anthropic client with Databuddy observability */
export class Anthropic extends AnthropicOriginal {
	private readonly db: TransportConfig;
	override messages: DatabuddyMessages;

	constructor(config: AnthropicConfig = {}) {
		const { databuddy, ...anthropicConfig } = config;
		super(anthropicConfig);

		this.db = {
			transport:
				databuddy?.transport ??
				createTransport(databuddy?.apiUrl, databuddy?.apiKey),
			computeCosts: databuddy?.computeCosts ?? true,
			privacyMode: databuddy?.privacyMode ?? false,
			onSuccess: databuddy?.onSuccess,
			onError: databuddy?.onError,
		};

		this.messages = new DatabuddyMessages(this as AnthropicOriginal, this.db);
	}
}

class DatabuddyMessages extends AnthropicOriginal.Messages {
	private readonly db: TransportConfig;

	constructor(client: AnthropicOriginal, db: TransportConfig) {
		super(client);
		this.db = db;
	}

	create(
		body: MessageCreateParamsNonStreaming & { databuddy?: AnthropicCallOptions }
	): APIPromise<Message>;
	create(
		body: MessageCreateParamsStreaming & { databuddy?: AnthropicCallOptions }
	): APIPromise<Stream<RawMessageStreamEvent>>;
	create(
		body: CreateParams
	): APIPromise<Message | Stream<RawMessageStreamEvent>> {
		const { databuddy: opts, ...params } = body;
		const startTime = Date.now();
		const traceId = opts?.traceId ?? createTraceId();
		const isPrivate = opts?.privacyMode ?? this.db.privacyMode;
		const shouldCost = opts?.computeCosts ?? this.db.computeCosts;
		const onSuccess = opts?.onSuccess ?? this.db.onSuccess;
		const onError = opts?.onError ?? this.db.onError;

		const sendCall = (call: AnthropicLLMCall) => {
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
			: formatMessages(
					params.messages as Parameters<typeof formatMessages>[0],
					params.system as Parameters<typeof formatMessages>[1]
				);

		const tools: AnthropicToolInfo = {
			callCount: 0,
			resultCount: 0,
			calledTools: [],
			availableTools: params.tools?.map((t) => t.name),
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
						let usage: AnthropicUsage = {
							inputTokens: 0,
							outputTokens: 0,
							totalTokens: 0,
						};
						const contentBlocks: Array<{
							type: string;
							text?: string;
							id?: string;
							name?: string;
							arguments?: string;
						}> = [];
						const toolsInProgress = new Map<
							string,
							{ index: number; inputString: string }
						>();
						let currentTextIndex: number | null = null;

						for await (const chunk of stream1) {
							if (chunk.type === "content_block_start") {
								if (chunk.content_block?.type === "text") {
									currentTextIndex = contentBlocks.length;
									contentBlocks.push({ type: "text", text: "" });
								} else if (chunk.content_block?.type === "tool_use") {
									const id = chunk.content_block.id;
									contentBlocks.push({
										type: "tool-call",
										id,
										name: chunk.content_block.name,
										arguments: "",
									});
									toolsInProgress.set(id, {
										index: contentBlocks.length - 1,
										inputString: "",
									});
									currentTextIndex = null;
								}
							}

							if (chunk.type === "content_block_delta" && "delta" in chunk) {
								if (
									chunk.delta?.type === "text_delta" &&
									currentTextIndex !== null
								) {
									const block = contentBlocks[currentTextIndex];
									if (block) {
										block.text = (block.text ?? "") + (chunk.delta.text ?? "");
									}
								}
								if (chunk.delta?.type === "input_json_delta") {
									const block =
										chunk.index === undefined
											? undefined
											: contentBlocks[chunk.index];
									if (block?.type === "tool-call" && block.id) {
										const tool = toolsInProgress.get(block.id);
										if (tool) {
											tool.inputString += chunk.delta.partial_json ?? "";
										}
									}
								}
							}

							if (
								chunk.type === "content_block_stop" &&
								chunk.index !== undefined
							) {
								const block = contentBlocks[chunk.index];
								if (block?.type === "tool-call" && block.id) {
									const tool = toolsInProgress.get(block.id);
									if (tool) {
										block.arguments = tool.inputString;
										toolsInProgress.delete(block.id);
									}
								}
								currentTextIndex = null;
							}

							if (chunk.type === "message_start" && chunk.message?.usage) {
								usage = extractUsage(chunk.message.usage as AnthropicRawUsage);
							}

							if (chunk.type === "message_delta" && "usage" in chunk) {
								const deltaUsage = chunk.usage as { output_tokens?: number };
								usage.outputTokens =
									deltaUsage.output_tokens ?? usage.outputTokens;
								usage.totalTokens = usage.inputTokens + usage.outputTokens;
							}
						}

						const durationMs = Date.now() - startTime;
						const cost: AnthropicCost =
							shouldCost && (usage.inputTokens > 0 || usage.outputTokens > 0)
								? await computeCost(params.model, usage)
								: {};

						const toolCalls = contentBlocks.filter(
							(b) => b.type === "tool-call"
						);
						tools.callCount = toolCalls.length;
						tools.calledTools = Array.from(
							new Set(toolCalls.map((t) => t.name).filter(Boolean))
						) as string[];

						const call: AnthropicLLMCall = {
							timestamp: new Date(),
							traceId,
							type: "stream",
							model: params.model,
							provider: "anthropic",
							input,
							output: isPrivate ? [] : formatStreamOutput(contentBlocks),
							usage,
							cost,
							tools,
							durationMs,
							httpStatus: 200,
						};

						sendCall(call);
					} catch (error) {
						const call: AnthropicLLMCall = {
							timestamp: new Date(),
							traceId,
							type: "stream",
							model: params.model,
							provider: "anthropic",
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
			}) as APIPromise<Stream<RawMessageStreamEvent>>;
		}

		return (promise as APIPromise<Message>).then(
			async (result) => {
				const durationMs = Date.now() - startTime;
				const usage = extractUsage(result.usage as AnthropicRawUsage);

				const cost: AnthropicCost =
					shouldCost && (usage.inputTokens > 0 || usage.outputTokens > 0)
						? await computeCost(params.model, usage)
						: {};

				const output = isPrivate ? [] : formatResponse(result);
				const toolCalls =
					result.content?.filter((c) => c.type === "tool_use") ?? [];

				tools.callCount = toolCalls.length;
				tools.calledTools = Array.from(new Set(toolCalls.map((t) => t.name)));

				const call: AnthropicLLMCall = {
					timestamp: new Date(),
					traceId,
					type: "generate",
					model: params.model,
					provider: "anthropic",
					finishReason: result.stop_reason ?? undefined,
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
				const call: AnthropicLLMCall = {
					timestamp: new Date(),
					traceId,
					type: "generate",
					model: params.model,
					provider: "anthropic",
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
		) as APIPromise<Message>;
	}
}
