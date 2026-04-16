import { describe, expect, it, mock } from "bun:test";
import type {
	LanguageModelV2,
	LanguageModelV2CallOptions,
	LanguageModelV3,
	LanguageModelV3CallOptions,
} from "@ai-sdk/provider";
import { createTracker } from "./middleware";
import type { LLMCall, Transport } from "./types";

function createMockTransport(): { transport: Transport; calls: LLMCall[] } {
	const calls: LLMCall[] = [];
	return {
		transport: async (call) => {
			calls.push(call);
		},
		calls,
	};
}

function getPromptText(content: unknown): string {
	if (typeof content === "string") {
		return content;
	}
	if (Array.isArray(content)) {
		const text = content.find(
			(c: { type: string; text?: string }) => c.type === "text"
		);
		return text?.text ?? "";
	}
	return "";
}

function v3Usage(
	input: number,
	output: number,
	reasoning?: number,
	cacheRead?: number,
	cacheWrite?: number
) {
	return {
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
	};
}

function createV3Model(modelId: string): LanguageModelV3 {
	const responses: Record<
		string,
		{ text: string; usage: ReturnType<typeof v3Usage> }
	> = {
		"What is 9 + 10?": { text: "19", usage: v3Usage(10, 2) },
	};

	return {
		specificationVersion: "v3",
		provider: "openai",
		modelId,
		supportedUrls: {},
		doGenerate: mock(async (params: LanguageModelV3CallOptions) => {
			const user = params.prompt.find(
				(m: { role: string }) => m.role === "user"
			);
			const response = responses[getPromptText(user?.content)] ?? {
				text: "Unknown",
				usage: v3Usage(5, 1),
			};
			return {
				text: response.text,
				usage: response.usage,
				content: [{ type: "text", text: response.text }],
				response: { modelId },
				providerMetadata: {},
				finishReason: { unified: "stop", raw: undefined },
				warnings: [],
			};
		}),
		doStream: mock(async () => ({
			stream: new ReadableStream(),
			response: { modelId },
		})),
	} as LanguageModelV3;
}

function createV2Model(modelId: string): LanguageModelV2 {
	const responses: Record<
		string,
		{ text: string; usage: { inputTokens: number; outputTokens: number } }
	> = {
		"What is 9 + 10?": {
			text: "19",
			usage: { inputTokens: 10, outputTokens: 2 },
		},
	};

	return {
		specificationVersion: "v2",
		provider: "openai",
		modelId,
		supportedUrls: {},
		doGenerate: mock(async (params: LanguageModelV2CallOptions) => {
			const user = params.prompt.find(
				(m: { role: string }) => m.role === "user"
			);
			const response = responses[getPromptText(user?.content)] ?? {
				text: "Unknown",
				usage: { inputTokens: 5, outputTokens: 1 },
			};
			return {
				text: response.text,
				usage: response.usage,
				content: [{ type: "text", text: response.text }],
				response: { modelId },
				providerMetadata: {},
				finishReason: "stop",
				warnings: [],
			};
		}),
		doStream: mock(async () => ({
			stream: new ReadableStream(),
			response: { modelId },
		})),
	} as LanguageModelV2;
}

describe("createTracker", () => {
	describe("V3 models", () => {
		it("tracks generation calls", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = createTracker({ transport });

			const model = track(createV3Model("gpt-4"), { traceId: "test-123" });
			const result = await model.doGenerate({
				prompt: [
					{
						role: "user",
						content: [{ type: "text", text: "What is 9 + 10?" }],
					},
				],
			});

			expect(result.content[0]?.text).toBe("19");
			await new Promise((r) => setTimeout(r, 10));

			expect(calls.length).toBe(1);
			expect(calls[0].type).toBe("generate");
			expect(calls[0].model).toBe("gpt-4");
			expect(calls[0].provider).toBe("openai");
			expect(calls[0].usage.inputTokens).toBe(10);
			expect(calls[0].traceId).toBe("test-123");
		});

		it("handles finishReason object format", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = createTracker({ transport });

			const model = createV3Model("gpt-4");
			model.doGenerate = mock(async () => ({
				text: "test",
				usage: v3Usage(10, 2),
				content: [{ type: "text", text: "test" }],
				response: { modelId: "gpt-4" },
				providerMetadata: {},
				finishReason: { unified: "stop", raw: undefined },
				warnings: [],
			}));

			await track(model).doGenerate({
				prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
			});

			await new Promise((r) => setTimeout(r, 10));
			expect(calls[0].finishReason).toBe("stop");
		});
	});

	describe("V2 models", () => {
		it("tracks generation calls", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = createTracker({ transport });

			const model = track(createV2Model("gpt-3.5-turbo"), {
				traceId: "test-456",
			});
			const result = await model.doGenerate({
				prompt: [
					{
						role: "user",
						content: [{ type: "text", text: "What is 9 + 10?" }],
					},
				],
			});

			expect(result.content[0]?.text).toBe("19");
			await new Promise((r) => setTimeout(r, 10));

			expect(calls.length).toBe(1);
			expect(calls[0].model).toBe("gpt-3.5-turbo");
			expect(calls[0].usage.inputTokens).toBe(10);
		});
	});

	describe("token extraction", () => {
		it("extracts V3 nested token counts", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = createTracker({ transport });

			const model = createV3Model("gpt-4");
			model.doGenerate = mock(async () => ({
				text: "test",
				usage: v3Usage(100, 50, 10, 20, 5),
				content: [{ type: "text", text: "test" }],
				response: { modelId: "gpt-4" },
				providerMetadata: { anthropic: { cacheCreationInputTokens: 5 } },
				finishReason: { unified: "stop", raw: undefined },
				warnings: [],
			}));

			await track(model).doGenerate({
				prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
			});

			await new Promise((r) => setTimeout(r, 10));
			expect(calls[0].usage.inputTokens).toBe(125);
			expect(calls[0].usage.outputTokens).toBe(50);
			expect(calls[0].usage.reasoningTokens).toBe(10);
			expect(calls[0].usage.cachedInputTokens).toBe(20);
			expect(calls[0].usage.cacheCreationInputTokens).toBe(5);
		});

		it("adjusts Anthropic V3 cache tokens", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = createTracker({ transport });

			const model = createV3Model("claude-3-opus");
			model.provider = "anthropic";
			model.doGenerate = mock(async () => ({
				text: "test",
				usage: v3Usage(100, 50, undefined, 20, 5),
				content: [{ type: "text", text: "test" }],
				response: { modelId: "claude-3-opus" },
				providerMetadata: { anthropic: { cacheCreationInputTokens: 5 } },
				finishReason: { unified: "stop", raw: undefined },
				warnings: [],
			}));

			await track(model).doGenerate({
				prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
			});

			await new Promise((r) => setTimeout(r, 10));
			expect(calls[0].usage.inputTokens).toBe(100);
			expect(calls[0].usage.totalTokens).toBe(150);
		});
	});

	describe("error handling", () => {
		it("tracks errors in generate calls", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = createTracker({ transport });

			const model = createV3Model("gpt-4");
			model.doGenerate = mock(async () => {
				throw new Error("API Error");
			});

			await expect(
				track(model).doGenerate({
					prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
				})
			).rejects.toThrow("API Error");

			await new Promise((r) => setTimeout(r, 10));
			expect(calls[0].error?.message).toBe("API Error");
		});
	});

	describe("privacy mode", () => {
		it("does not capture input/output when enabled", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = createTracker({ transport, privacyMode: true });

			await track(createV3Model("gpt-4")).doGenerate({
				prompt: [{ role: "user", content: [{ type: "text", text: "secret" }] }],
			});

			await new Promise((r) => setTimeout(r, 10));
			expect(calls[0].input).toEqual([]);
			expect(calls[0].output).toEqual([]);
		});
	});

	describe("streaming", () => {
		it("tracks text deltas", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = createTracker({ transport });

			const model = createV3Model("gpt-4");
			model.doStream = mock(async () => {
				const stream = new ReadableStream({
					start(ctrl) {
						ctrl.enqueue({ type: "text-delta", id: "1", delta: "Hello" });
						ctrl.enqueue({ type: "text-delta", id: "1", delta: " world" });
						ctrl.enqueue({
							type: "finish",
							usage: v3Usage(10, 2),
							finishReason: { unified: "stop", raw: undefined },
							providerMetadata: {},
						});
						ctrl.close();
					},
				});
				return { stream, response: { modelId: "gpt-4" } };
			});

			const result = await track(model).doStream({
				prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
			});

			const reader = result.stream.getReader();
			while (!(await reader.read()).done) {}
			await new Promise((r) => setTimeout(r, 50));

			expect(calls[0].type).toBe("stream");
			expect(JSON.stringify(calls[0].output)).toContain("Hello world");
		});

		it("tracks tool calls", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = createTracker({ transport });

			const model = createV3Model("gpt-4");
			model.doStream = mock(async () => {
				const stream = new ReadableStream({
					start(ctrl) {
						ctrl.enqueue({
							type: "tool-input-start",
							id: "tc-1",
							toolName: "get_weather",
						});
						ctrl.enqueue({
							type: "tool-input-delta",
							id: "tc-1",
							delta: '{"location":"NYC"}',
						});
						ctrl.enqueue({
							type: "finish",
							usage: v3Usage(20, 15),
							finishReason: { unified: "stop", raw: undefined },
							providerMetadata: {},
						});
						ctrl.close();
					},
				});
				return { stream, response: { modelId: "gpt-4" } };
			});

			const result = await track(model).doStream({
				prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
				tools: [{ name: "get_weather" }],
			});

			const reader = result.stream.getReader();
			while (!(await reader.read()).done) {}
			await new Promise((r) => setTimeout(r, 50));

			expect(calls[0].tools.callCount).toBe(1);
			expect(calls[0].tools.calledTools).toContain("get_weather");
		});
	});

	describe("tool calls", () => {
		it("extracts tool information", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = createTracker({ transport });

			const model = createV3Model("gpt-4");
			model.doGenerate = mock(async () => ({
				text: "test",
				usage: v3Usage(10, 5),
				content: [
					{ type: "text", text: "Checking weather" },
					{
						type: "tool-call",
						toolCallId: "tc-1",
						toolName: "get_weather",
						input: { location: "NYC" },
					},
				],
				response: { modelId: "gpt-4" },
				providerMetadata: {},
				finishReason: { unified: "stop", raw: undefined },
				warnings: [],
			}));

			await track(model).doGenerate({
				prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
				tools: [{ name: "get_weather" }, { name: "get_time" }],
			});

			await new Promise((r) => setTimeout(r, 10));
			expect(calls[0].tools.callCount).toBe(1);
			expect(calls[0].tools.calledTools).toContain("get_weather");
			expect(calls[0].tools.availableTools).toEqual([
				"get_weather",
				"get_time",
			]);
		});
	});

	describe("web search", () => {
		it("extracts count from Anthropic metadata", async () => {
			const { transport, calls } = createMockTransport();
			const { track } = createTracker({ transport });

			const model = createV3Model("claude-3-opus");
			model.provider = "anthropic";
			model.doGenerate = mock(async () => ({
				text: "test",
				usage: v3Usage(10, 5),
				content: [{ type: "text", text: "test" }],
				response: { modelId: "claude-3-opus" },
				providerMetadata: {
					anthropic: { server_tool_use: { web_search_requests: 3 } },
				},
				finishReason: { unified: "stop", raw: undefined },
				warnings: [],
			}));

			await track(model).doGenerate({
				prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
			});

			await new Promise((r) => setTimeout(r, 10));
			expect(calls[0].usage.webSearchCount).toBe(3);
		});
	});
});
