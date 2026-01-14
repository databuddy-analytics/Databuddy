/**
 * Tests for Vercel AI SDK middleware
 * 
 * Test patterns adapted from PostHog's AI SDK tests:
 * https://github.com/PostHog/posthog-js/tree/main/packages/ai/tests
 */

import { describe, expect, it, mock } from "bun:test";
import type {
	LanguageModelV2,
	LanguageModelV2CallOptions,
	LanguageModelV3,
	LanguageModelV3CallOptions,
} from "@ai-sdk/provider";
import { databuddyLLM } from "./middleware";
import type { AICall, Transport } from "./types";

const createMockTransport = (): {
	transport: Transport;
	calls: AICall[];
} => {
	const calls: AICall[] = [];
	return {
		transport: async (call: AICall) => {
			calls.push(call);
		},
		calls,
	};
};

const getPromptText = (content: unknown): string => {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		const textPart = (content as Array<{ type: string; text?: string }>).find(
			(c) => c.type === "text"
		);
		return textPart?.text || "";
	}
	return "";
};

const v3TokenUsage = (
	input: number,
	output: number,
	reasoning?: number,
	cacheRead?: number,
	cacheWrite?: number
) => ({
	inputTokens: {
		total: input + (cacheRead ?? 0) + (cacheWrite ?? 0),
		noCache: input,
		cacheRead: cacheRead ?? 0,
		cacheWrite: cacheWrite ?? 0,
	},
	outputTokens: {
		total: output,
		text: output - (reasoning ?? 0),
		reasoning: reasoning ?? 0,
	},
});

const createMockV3Model = (modelId: string): LanguageModelV3 => {
	const mockResponses: Record<
		string,
		{ text: string; usage: ReturnType<typeof v3TokenUsage> }
	> = {
		"What is 9 + 10?": { text: "19", usage: v3TokenUsage(10, 2) },
		"What is 10 + 11?": { text: "21", usage: v3TokenUsage(10, 2) },
	};

	return {
		specificationVersion: "v3" as const,
		provider: "openai",
		modelId: modelId,
		supportedUrls: {},
		doGenerate: mock(async (params: LanguageModelV3CallOptions) => {
			const userMessage = params.prompt.find((m: any) => m.role === "user");
			const promptText = getPromptText(userMessage?.content);
			const response =
				mockResponses[promptText] ||
				({ text: "Unknown", usage: v3TokenUsage(5, 1) } as const);

			return {
				text: response.text,
				usage: response.usage,
				content: [{ type: "text", text: response.text }],
				response: { modelId: modelId },
				providerMetadata: {},
				finishReason: { unified: "stop" as const, raw: undefined },
				warnings: [],
			};
		}),
		doStream: mock(async () => {
			return {
				stream: new ReadableStream(),
				response: { modelId: modelId },
			};
		}),
	} as LanguageModelV3;
};

const createMockV2Model = (modelId: string): LanguageModelV2 => {
	const mockResponses: Record<
		string,
		{ text: string; usage: { inputTokens: number; outputTokens: number } }
	> = {
		"What is 9 + 10?": { text: "19", usage: { inputTokens: 10, outputTokens: 2 } },
		"What is 10 + 11?": { text: "21", usage: { inputTokens: 10, outputTokens: 2 } },
	};

	return {
		specificationVersion: "v2" as const,
		provider: "openai",
		modelId: modelId,
		supportedUrls: {},
		doGenerate: mock(async (params: LanguageModelV2CallOptions) => {
			const userMessage = params.prompt.find((m: any) => m.role === "user");
			const promptText = getPromptText(userMessage?.content);
			const response =
				mockResponses[promptText] ||
				({ text: "Unknown", usage: { inputTokens: 5, outputTokens: 1 } } as const);

			return {
				text: response.text,
				usage: response.usage,
				content: [{ type: "text", text: response.text }],
				response: { modelId: modelId },
				providerMetadata: {},
				finishReason: "stop" as const,
				warnings: [],
			};
		}),
		doStream: mock(async () => {
			return {
				stream: new ReadableStream(),
				response: { modelId: modelId },
			};
		}),
	} as LanguageModelV2;
};

describe("Vercel AI SDK Middleware", () => {
	describe("V3 Model Support", () => {
		it("should wrap a V3 model and track generation", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = databuddyLLM({ transport });

			const baseModel = createMockV3Model("gpt-4");
			const model = track(baseModel, { traceId: "test-v3-123" });

			expect(model.specificationVersion).toBe("v3");

			const result = await model.doGenerate({
				prompt: [
					{ role: "user", content: [{ type: "text", text: "What is 9 + 10?" }] },
				],
			});

			expect(result.content[0]?.text).toBe("19");
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(calls.length).toBe(1);
			const call = calls[0];
			expect(call.type).toBe("generate");
			expect(call.model).toBe("gpt-4");
			expect(call.provider).toBe("openai");
			expect(call.usage.inputTokens).toBe(10);
			expect(call.usage.outputTokens).toBe(2);
			expect(call.traceId).toBe("test-v3-123");
		});

		it("should handle V3 finishReason object format", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = databuddyLLM({ transport });

			const baseModel = createMockV3Model("gpt-4");
			baseModel.doGenerate = mock(async () => ({
				text: "test",
				usage: v3TokenUsage(10, 2),
				content: [{ type: "text", text: "test" }],
				response: { modelId: "gpt-4" },
				providerMetadata: {},
				finishReason: { unified: "stop" as const, raw: undefined },
				warnings: [],
			}));

			const model = track(baseModel);
			await model.doGenerate({
				prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
			});

			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(calls[0].finishReason).toBe("stop");
		});
	});

	describe("V2 Model Support", () => {
		it("should wrap a V2 model and track generation", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = databuddyLLM({ transport });

			const baseModel = createMockV2Model("gpt-3.5-turbo");
			const model = track(baseModel, { traceId: "test-v2-123" });

			expect(model.specificationVersion).toBe("v2");

			const result = await model.doGenerate({
				prompt: [
					{ role: "user", content: [{ type: "text", text: "What is 9 + 10?" }] },
				],
			});

			expect(result.content[0]?.text).toBe("19");

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(calls.length).toBe(1);
			const call = calls[0];
			expect(call.type).toBe("generate");
			expect(call.model).toBe("gpt-3.5-turbo");
			expect(call.usage.inputTokens).toBe(10);
			expect(call.usage.outputTokens).toBe(2);
			expect(call.traceId).toBe("test-v2-123");
		});

		it("should handle V2 finishReason string format", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = databuddyLLM({ transport });

			const baseModel = createMockV2Model("gpt-3.5-turbo");
			baseModel.doGenerate = mock(async () => ({
				text: "test",
				usage: { inputTokens: 10, outputTokens: 2 },
				content: [{ type: "text", text: "test" }],
				response: { modelId: "gpt-3.5-turbo" },
				providerMetadata: {},
				finishReason: "stop" as const,
				warnings: [],
			}));

			const model = track(baseModel);
			await model.doGenerate({
				prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
			});

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(calls[0].finishReason).toBe("stop");
		});
	});

	describe("Token Extraction", () => {
		it("should extract V3 nested token counts", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = databuddyLLM({ transport });

			const baseModel = createMockV3Model("gpt-4");
			baseModel.doGenerate = mock(async () => ({
				text: "test",
				usage: v3TokenUsage(100, 50, 10, 20, 5),
				content: [{ type: "text", text: "test" }],
				response: { modelId: "gpt-4" },
				providerMetadata: {
					anthropic: {
						cacheCreationInputTokens: 5,
					},
				},
				finishReason: { unified: "stop" as const, raw: undefined },
				warnings: [],
			}));

			const model = track(baseModel);
			await model.doGenerate({
				prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
			});

			await new Promise((resolve) => setTimeout(resolve, 10));
			const call = calls[0];
			expect(call.usage.inputTokens).toBe(125);
			expect(call.usage.outputTokens).toBe(50);
			expect(call.usage.reasoningTokens).toBe(10);
			expect(call.usage.cachedInputTokens).toBe(20);
			expect(call.usage.cacheCreationInputTokens).toBe(5);
		});

		it("should adjust Anthropic V3 cache tokens", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = databuddyLLM({ transport });

			const baseModel = createMockV3Model("claude-3-opus");
			baseModel.provider = "anthropic";
			baseModel.doGenerate = mock(async () => ({
				text: "test",
				// V3 usage: total = 125 (100 noCache + 20 cacheRead + 5 cacheWrite)
				usage: v3TokenUsage(100, 50, undefined, 20, 5),
				content: [{ type: "text", text: "test" }],
				response: { modelId: "claude-3-opus" },
				providerMetadata: {
					anthropic: {
						cacheCreationInputTokens: 5,
					},
				},
				finishReason: { unified: "stop" as const, raw: undefined },
				warnings: [],
			}));

			const model = track(baseModel);
			await model.doGenerate({
				prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
			});

			await new Promise((resolve) => setTimeout(resolve, 10));
			const call = calls[0];
			expect(call.usage.inputTokens).toBe(100);
			expect(call.usage.totalTokens).toBe(150);
		});
	});

	describe("Error Handling", () => {
		it("should track errors in generate calls", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = databuddyLLM({ transport });

			const baseModel = createMockV3Model("gpt-4");
			baseModel.doGenerate = mock(async () => {
				throw new Error("API Error");
			});

			const model = track(baseModel);

			await expect(
				model.doGenerate({
					prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
				})
			).rejects.toThrow("API Error");

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(calls.length).toBe(1);
			expect(calls[0].error).toBeDefined();
			expect(calls[0].error?.message).toBe("API Error");
		});
	});

	describe("Privacy Mode", () => {
		it("should not capture input/output in privacy mode", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = databuddyLLM({ transport, privacyMode: true });

			const baseModel = createMockV3Model("gpt-4");
			const model = track(baseModel);

			await model.doGenerate({
				prompt: [
					{ role: "user", content: [{ type: "text", text: "secret message" }] },
				],
			});

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(calls[0].input).toEqual([]);
			expect(calls[0].output).toEqual([]);
		});
	});

	describe("Streaming", () => {
		it("should track streaming calls with text deltas", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = databuddyLLM({ transport });

			const baseModel = createMockV3Model("gpt-4");
			baseModel.doStream = mock(async () => {
				let chunkCount = 0;
				const stream = new ReadableStream({
					async start(controller) {
						controller.enqueue({
							type: "text-delta",
							id: "text-1",
							delta: "Hello",
						});
						controller.enqueue({
							type: "text-delta",
							id: "text-1",
							delta: " world",
						});
						controller.enqueue({
							type: "finish",
							usage: v3TokenUsage(10, 2),
							finishReason: { unified: "stop" as const, raw: undefined },
							providerMetadata: {},
						});
						controller.close();
					},
				});

				return {
					stream,
					response: { modelId: "gpt-4" },
				};
			});

			const model = track(baseModel);
			const result = await model.doStream({
				prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
			});

			const reader = result.stream.getReader();
			while (!(await reader.read()).done) {
				// Consume stream
			}
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(calls.length).toBe(1);
			const call = calls[0];
			expect(call.type).toBe("stream");
			expect(call.usage.inputTokens).toBe(10);
			expect(call.usage.outputTokens).toBe(2);
			expect(JSON.stringify(call.output)).toContain("Hello world");
		});

		it("should track tool calls in streaming", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = databuddyLLM({ transport });

			const baseModel = createMockV3Model("gpt-4");
			baseModel.doStream = mock(async () => {
				const stream = new ReadableStream({
					async start(controller) {
						controller.enqueue({
							type: "tool-input-start",
							id: "tc-1",
							toolName: "get_weather",
						});
						controller.enqueue({
							type: "tool-input-delta",
							id: "tc-1",
							delta: '{"location":"NYC"}',
						});
						controller.enqueue({
							type: "tool-input-end",
							id: "tc-1",
						});
						controller.enqueue({
							type: "finish",
							usage: v3TokenUsage(20, 15),
							finishReason: { unified: "stop" as const, raw: undefined },
							providerMetadata: {},
						});
						controller.close();
					},
				});

				return {
					stream,
					response: { modelId: "gpt-4" },
				};
			});

			const model = track(baseModel);
			const result = await model.doStream({
				prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
				tools: [{ name: "get_weather" }],
			});

			const reader = result.stream.getReader();
			while (!(await reader.read()).done) {
				// Read all chunks
			}

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(calls[0].tools.toolCallCount).toBe(1);
			expect(calls[0].tools.toolCallNames).toContain("get_weather");
		});

		it("should track source chunks in streaming", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = databuddyLLM({ transport });

			const baseModel = createMockV3Model("gpt-4");
			baseModel.doStream = mock(async () => {
				const stream = new ReadableStream({
					async start(controller) {
						controller.enqueue({
							type: "text-delta",
							id: "text-1",
							delta: "Based on ",
						});
						controller.enqueue({
							type: "source",
							sourceType: "web",
							id: "src-1",
							url: "https://example.com",
							title: "Example",
						});
						controller.enqueue({
							type: "finish",
							usage: v3TokenUsage(10, 5),
							finishReason: { unified: "stop" as const, raw: undefined },
							providerMetadata: {},
						});
						controller.close();
					},
				});

				return {
					stream,
					response: { modelId: "gpt-4" },
				};
			});

			const model = track(baseModel);
			const result = await model.doStream({
				prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
			});

			const reader = result.stream.getReader();
			while (!(await reader.read()).done) {
				// Read all chunks
			}

			await new Promise((resolve) => setTimeout(resolve, 50));

			const output = calls[0].output[0]?.content;
			if (Array.isArray(output)) {
				const sourceItem = output.find((item: any) => item.type === "source");
				expect(sourceItem).toBeDefined();
				expect(sourceItem?.sourceType).toBe("web");
				expect(sourceItem?.url).toBe("https://example.com");
			}
		});
	});

	describe("Tool Calls", () => {
		it("should extract tool call information from generate result", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = databuddyLLM({ transport });

			const baseModel = createMockV3Model("gpt-4");
			baseModel.doGenerate = mock(async () => ({
				text: "test",
				usage: v3TokenUsage(10, 5),
				content: [
					{ type: "text", text: "I'll check the weather" },
					{
						type: "tool-call",
						toolCallId: "tc-1",
						toolName: "get_weather",
						input: { location: "NYC" },
					},
				],
				response: { modelId: "gpt-4" },
				providerMetadata: {},
				finishReason: { unified: "stop" as const, raw: undefined },
				warnings: [],
			}));

			const model = track(baseModel);
			await model.doGenerate({
				prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
				tools: [{ name: "get_weather" }, { name: "get_time" }],
			});

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(calls[0].tools.toolCallCount).toBe(1);
			expect(calls[0].tools.toolCallNames).toContain("get_weather");
			expect(calls[0].tools.availableTools).toEqual(["get_weather", "get_time"]);
		});
	});

	describe("Web Search Count", () => {
		it("should extract web search count from Anthropic metadata", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = databuddyLLM({ transport });

			const baseModel = createMockV3Model("claude-3-opus");
			baseModel.provider = "anthropic";
			baseModel.doGenerate = mock(async () => ({
				text: "test",
				usage: v3TokenUsage(10, 5),
				content: [{ type: "text", text: "test" }],
				response: { modelId: "claude-3-opus" },
				providerMetadata: {
					anthropic: {
						server_tool_use: {
							web_search_requests: 3,
						},
					},
				},
				finishReason: { unified: "stop" as const, raw: undefined },
				warnings: [],
			}));

			const model = track(baseModel);
			await model.doGenerate({
				prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
			});

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(calls[0].usage.webSearchCount).toBe(3);
		});
	});
});
