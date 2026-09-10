import { describe, expect, it } from "bun:test";
import {
	APICallError,
	type LanguageModelV3GenerateResult,
} from "@ai-sdk/provider";
import { type ModelMessage, stepCountIs, tool } from "ai";
import { MockLanguageModelV3, convertArrayToReadableStream } from "ai/test";
import { z } from "zod";
import { conversationModelOptions } from "../config/conversation-model";
import { modelNames } from "../config/models";
import { createConversationAgent } from "./conversation";
import type { AgentConfig } from "./types";

const usage = {
	inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
	outputTokens: { total: 2, text: 2, reasoning: 0 },
};

function answer(text = "Synthetic answer."): LanguageModelV3GenerateResult {
	return {
		content: [{ type: "text", text }],
		finishReason: { unified: "stop", raw: "stop" },
		usage,
		warnings: [],
	};
}

function retryableError() {
	return new APICallError({
		message: "Synthetic provider unavailable",
		url: "https://provider.example.com/generate",
		requestBodyValues: {},
		statusCode: 503,
		isRetryable: true,
		responseHeaders: { "retry-after-ms": "0" },
	});
}

function configFor(
	model: MockLanguageModelV3,
	overrides: Partial<AgentConfig> = {}
): AgentConfig {
	return {
		model,
		system: { role: "system", content: "Use only synthetic test tools." },
		tools: {},
		stopWhen: stepCountIs(2),
		...overrides,
	};
}

describe("shared conversation execution", () => {
	it("passes resolved OpenAI effort to the actual provider call without Anthropic cache hints", async () => {
		const model = new MockLanguageModelV3({
			modelId: modelNames.balanced,
			doGenerate: answer(),
		});
		const options = conversationModelOptions(model.modelId, "high");
		const agent = createConversationAgent(
			configFor(model, {
				temperature: options.temperature,
				providerOptions: options.providerOptions,
				system: {
					role: "system",
					content: "Synthetic system instruction.",
					providerOptions: options.systemProviderOptions,
				},
			})
		);

		expect(
			(await agent.generate({ prompt: "Read the synthetic metric." })).text
		).toBe("Synthetic answer.");
		expect(model.doGenerateCalls).toHaveLength(1);
		const call = model.doGenerateCalls[0];
		expect(call?.providerOptions?.openai).toEqual({ reasoningEffort: "high" });
		expect(call?.providerOptions?.anthropic).toBeUndefined();
		expect(call?.temperature).toBeUndefined();
		expect(
			call?.prompt.some((message) => message.providerOptions?.anthropic)
		).toBe(false);
	});

	it("retries a failed model continuation without repeating its completed mutation, preserving scope and callbacks", async () => {
		const context = { organizationId: "org-synthetic", mutationMode: "allow" };
		const effects: string[] = [];
		const events: string[] = [];
		let continuations = 0;
		const model = new MockLanguageModelV3({
			modelId: modelNames.balanced,
			doGenerate: async (call) => {
				const toolResults = call.prompt
					.filter((message) => message.role === "tool")
					.flatMap((message) => message.content);
				if (toolResults.length === 0) {
					return {
						content: [
							{
								type: "tool-call",
								toolCallId: "approved-mutation",
								toolName: "apply_change",
								input: '{"name":"synthetic-change"}',
							},
						],
						finishReason: { unified: "tool-calls", raw: "tool_calls" },
						usage,
						warnings: [],
					};
				}
				expect(toolResults).toHaveLength(1);
				expect(toolResults[0]?.type).toBe("tool-result");
				continuations += 1;
				if (continuations <= 3) {
					throw retryableError();
				}
				return answer("Applied the synthetic change once.");
			},
		});
		const agent = createConversationAgent(
			configFor(model, {
				experimental_context: context,
				activeTools: ["apply_change"],
				tools: {
					apply_change: tool({
						inputSchema: z.object({ name: z.string() }),
						execute: ({ name }, options) => {
							expect(options.experimental_context).toBe(context);
							effects.push(name);
							events.push("mutation");
							return { applied: true, name };
						},
					}),
					hidden_tool: tool({
						inputSchema: z.object({}),
						execute: () => ({ hidden: true }),
					}),
				},
			}),
			{
				onStepFinish: async (step) => {
					events.push(step.toolCalls.length ? "step:tool" : "step:text");
				},
			}
		);

		const result = await agent.generate({ prompt: "Apply synthetic-change." });
		expect(result.text).toBe("Applied the synthetic change once.");
		expect(continuations).toBe(4);
		expect(model.doGenerateCalls).toHaveLength(5);
		expect(effects).toEqual(["synthetic-change"]);
		expect(events).toEqual(["mutation", "step:tool", "step:text"]);
		expect(result.steps).toHaveLength(2);
		for (const call of model.doGenerateCalls) {
			expect(call.tools?.map((entry) => entry.name)).toEqual(["apply_change"]);
		}
	});

	it("bounds retryable failures and does not retry permanent errors or cancellation", async () => {
		const failures = [
			{ error: retryableError(), attempts: 4 },
			{
				error: new APICallError({
					message: "Synthetic invalid request",
					url: "https://provider.example.com/generate",
					requestBodyValues: {},
					statusCode: 400,
					isRetryable: false,
				}),
				attempts: 1,
			},
			{
				error: new DOMException("Synthetic cancellation", "AbortError"),
				attempts: 1,
			},
		];
		for (const { error, attempts } of failures) {
			const model = new MockLanguageModelV3({
				doGenerate: async () => {
					throw error;
				},
			});
			await expect(
				createConversationAgent(configFor(model)).generate({
					prompt: "Synthetic request.",
				})
			).rejects.toBeDefined();
			expect(model.doGenerateCalls).toHaveLength(attempts);
		}
	});

	it("honors the supplied stopping condition after executing one tool", async () => {
		let executions = 0;
		const model = new MockLanguageModelV3({
			doGenerate: async () => ({
				content: [
					{
						type: "tool-call",
						toolCallId: "read-once",
						toolName: "read",
						input: "{}",
					},
				],
				finishReason: { unified: "tool-calls", raw: "tool_calls" },
				usage,
				warnings: [],
			}),
		});
		const agent = createConversationAgent(
			configFor(model, {
				stopWhen: stepCountIs(1),
				tools: {
					read: tool({
						inputSchema: z.object({}),
						execute: () => {
							executions += 1;
							return { value: 1 };
						},
					}),
				},
			})
		);
		const result = await agent.generate({ prompt: "Read once." });
		expect(result.steps).toHaveLength(1);
		expect(model.doGenerateCalls).toHaveLength(1);
		expect(executions).toBe(1);
	});

	it("applies Anthropic user-message cache hints during streaming without mutating history or replacing existing hints", async () => {
		for (const existing of [
			undefined,
			{ anthropic: { cacheControl: { type: "ephemeral", ttl: "5m" } } },
		]) {
			const model = new MockLanguageModelV3({
				modelId: "anthropic/claude-sonnet-4.6",
				doStream: async () => ({
					stream: convertArrayToReadableStream([
						{ type: "text-start", id: "answer" },
						{ type: "text-delta", id: "answer", delta: "Synthetic stream." },
						{ type: "text-end", id: "answer" },
						{
							type: "finish",
							finishReason: { unified: "stop", raw: "stop" },
							usage,
						},
					]),
				}),
			});
			const messages: ModelMessage[] = [
				{
					role: "user",
					content: "Read the synthetic metric.",
					...(existing ? { providerOptions: existing } : {}),
				},
			];
			const before = JSON.stringify(messages);
			const agent = createConversationAgent(configFor(model));
			const result = await agent.stream({ messages });
			expect(await result.text).toBe("Synthetic stream.");
			expect(model.doStreamCalls).toHaveLength(1);
			const user = model.doStreamCalls[0]?.prompt.find(
				(message) => message.role === "user"
			);
			expect(user?.providerOptions?.anthropic).toEqual({
				cacheControl: { type: "ephemeral", ttl: existing ? "5m" : "1h" },
			});
			expect(JSON.stringify(messages)).toBe(before);
		}
	});
});
