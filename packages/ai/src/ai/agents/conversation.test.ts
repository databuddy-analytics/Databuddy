import { describe, expect, it, mock } from "bun:test";
import {
	APICallError,
	type LanguageModelV3GenerateResult,
	type LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import {
	convertToModelMessages,
	isToolUIPart,
	type ModelMessage,
	pruneMessages,
	safeValidateUIMessages,
	stepCountIs,
	tool,
	type ToolSet,
	type UIMessage,
} from "ai";
import { MockLanguageModelV3, convertArrayToReadableStream } from "ai/test";
import { z } from "zod";
import { conversationModelOptions } from "../config/conversation-model";
import { modelNames } from "../config/models";
import { createGoalTools } from "../tools/goals";
import {
	claimToolApprovals,
	createConversationAgent,
	settleStaleToolApprovals,
} from "./conversation";
import { MAX_AGENT_STEPS, stopAtMaxSteps } from "./stop-conditions";
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

	it("disables tools on the last allowed step so a capped run still answers", async () => {
		let toolCalls = 0;
		const model = new MockLanguageModelV3({
			modelId: modelNames.balanced,
			doGenerate: async (call) => {
				if (call.toolChoice?.type === "none") {
					return answer("Answer from the evidence gathered so far.");
				}
				toolCalls += 1;
				return {
					content: [
						{
							type: "tool-call",
							toolCallId: `lookup-${toolCalls}`,
							toolName: "lookup",
							input: "{}",
						},
					],
					finishReason: { unified: "tool-calls", raw: "tool_calls" },
					usage,
					warnings: [],
				};
			},
		});
		const agent = createConversationAgent(
			configFor(model, {
				stopWhen: stopAtMaxSteps,
				tools: {
					lookup: tool({
						inputSchema: z.object({}),
						execute: () => ({ rows: 1 }),
					}),
				},
			})
		);

		const result = await agent.generate({ prompt: "Audit everything." });
		expect(result.text).toBe("Answer from the evidence gathered so far.");
		expect(result.steps).toHaveLength(MAX_AGENT_STEPS);
		expect(toolCalls).toBe(MAX_AGENT_STEPS - 1);
		expect(model.doGenerateCalls.map((call) => call.toolChoice?.type)).toEqual([
			...new Array<"auto">(MAX_AGENT_STEPS - 1).fill("auto"),
			"none",
		]);
	});
});

describe("human approval for writes", () => {
	const goal = {
		websiteId: "site-synthetic",
		type: "PAGE_VIEW",
		target: "/signup",
		name: "Signup",
		confirmed: true,
	};
	const confirmation: UIMessage = {
		id: "user-1",
		role: "user",
		parts: [{ type: "text", text: "Yes, create it" }],
	};
	const createGoal: LanguageModelV3StreamPart[] = [
		{
			type: "tool-call",
			toolCallId: "call-goal",
			toolName: "create_goal",
			input: JSON.stringify(goal),
		},
		{
			type: "finish",
			finishReason: { unified: "tool-calls", raw: "tool_calls" },
			usage,
		},
	];
	const reply: LanguageModelV3StreamPart[] = [
		{ type: "text-start", id: "reply" },
		{ type: "text-delta", id: "reply", delta: "Done." },
		{ type: "text-end", id: "reply" },
		{ type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
	];

	function setup() {
		const execute = mock(async (_input: unknown) => ({ success: true }));
		const tools: ToolSet = {
			create_goal: { ...createGoalTools().create_goal, execute },
		};
		const model = new MockLanguageModelV3({
			modelId: modelNames.balanced,
			doStream: async ({ prompt }) => ({
				stream: convertArrayToReadableStream(
					prompt.some((message) => message.role === "tool") ? reply : createGoal
				),
			}),
		});
		const agent = createConversationAgent(configFor(model, { tools }));
		const claimed = new Set<string>();
		const claim = async (approvalId: string) => {
			if (claimed.has(approvalId)) {
				return false;
			}
			claimed.add(approvalId);
			return true;
		};

		async function send(messages: UIMessage[]) {
			const validation = await safeValidateUIMessages({ messages, tools });
			if (!validation.success) {
				throw validation.error;
			}
			const chatMessages = await claimToolApprovals(
				settleStaleToolApprovals(validation.data),
				claim
			);
			const result = await agent.stream({
				messages: pruneMessages({
					messages: await convertToModelMessages(chatMessages, {
						tools,
						ignoreIncompleteToolCalls: true,
					}),
					reasoning: "before-last-message",
					toolCalls: "before-last-2-messages",
					emptyMessages: "remove",
				}),
			});
			let persisted: UIMessage[] = [];
			const chunks: string[] = [];
			for await (const chunk of result.toUIMessageStream({
				originalMessages: chatMessages,
				generateMessageId: () => "assistant-1",
				onFinish: ({ messages: finished }) => {
					persisted = finished;
				},
			})) {
				chunks.push(chunk.type);
			}
			const assistant = persisted.at(-1);
			if (!assistant) {
				throw new Error("The response was not persisted");
			}
			return {
				assistant,
				chunks,
				part: assistant.parts.find(isToolUIPart),
			};
		}

		return { execute, model, send };
	}

	function answer(message: UIMessage, approved: boolean): UIMessage {
		return {
			...message,
			parts: message.parts.map((part) =>
				isToolUIPart(part) && part.state === "approval-requested"
					? {
							...part,
							state: "approval-responded",
							approval: { id: part.approval.id, approved },
						}
					: part
			),
		};
	}

	it("holds a confirmed write for approval instead of executing it", async () => {
		const { execute, send } = setup();
		const { chunks, part } = await send([confirmation]);

		expect(execute).not.toHaveBeenCalled();
		expect(chunks).toContain("tool-approval-request");
		expect(part).toMatchObject({
			type: "tool-create_goal",
			state: "approval-requested",
			input: goal,
		});
	});

	it.each([
		{ decision: "approved", approved: true, state: "output-available" },
		{ decision: "denied", approved: false, state: "output-denied" },
	] as const)("executes the held write exactly once only when approved ($decision)", async ({
		approved,
		state,
	}) => {
		const { execute, send } = setup();
		const requested = await send([confirmation]);
		const { chunks, part } = await send([
			confirmation,
			answer(requested.assistant, approved),
		]);

		expect(chunks).not.toContain("error");
		expect(execute.mock.calls.map(([input]) => input)).toEqual(
			approved ? [goal] : []
		);
		expect(part).toMatchObject({ state, approval: { approved } });
	});

	it("runs an approved write once when the same approval arrives twice", async () => {
		const { execute, send } = setup();
		const requested = await send([confirmation]);
		const approved = answer(requested.assistant, true);
		await send([confirmation, approved]);
		const { part } = await send([confirmation, approved]);

		expect(execute.mock.calls.map(([input]) => input)).toEqual([goal]);
		expect(part).toMatchObject({
			state: "output-denied",
			approval: { approved: false },
		});
	});

	it.each([
		{ request: "unanswered", approved: undefined },
		{ request: "approved but unrecorded", approved: true },
	] as const)("closes an $request request when the user sends a new message", async ({
		approved,
	}) => {
		const { execute, model, send } = setup();
		const requested = await send([confirmation]);
		const { chunks } = await send([
			confirmation,
			approved === undefined
				? requested.assistant
				: answer(requested.assistant, approved),
			{
				id: "user-2",
				role: "user",
				parts: [{ type: "text", text: "Call it Signups instead" }],
			},
		]);

		expect(chunks).not.toContain("error");
		expect(execute).not.toHaveBeenCalled();
		expect(
			model.doStreamCalls
				.at(-1)
				?.prompt.flatMap((message) =>
					message.role === "tool" ? message.content : []
				)
		).toEqual([
			expect.objectContaining({ type: "tool-result", toolCallId: "call-goal" }),
		]);
	});
});
