import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { GatewayProvider } from "@ai-sdk/gateway";

type EvaluationModel = ReturnType<GatewayProvider["evaluationModel"]>;
type EvaluationOptions = Parameters<EvaluationModel["doEvaluate"]>[0];
let captured: EvaluationOptions | undefined;
let evaluate: (input: EvaluationOptions) => Promise<unknown>;

mock.module("../ai/config/models", () => ({ isAiGatewayConfigured: true }));
mock.module("@ai-sdk/gateway", () => ({
	createGateway: () => ({
		evaluationModel: (modelId: string) => {
			expect(modelId).toBe("typesafe-ai/jev");
			return {
				doEvaluate: (input: EvaluationOptions) => {
					captured = input;
					return evaluate(input);
				},
			};
		},
	}),
}));
const { classifySlackThreadReplyRelevance: classify } = await import(
	"./slack-relevance"
);
const result = (probability: number) => ({
	answers: { reply: { type: "boolean", probability } },
});

describe("Jev Slack reply classification", () => {
	beforeEach(() => {
		captured = undefined;
		evaluate = () => Promise.resolve(result(0.9));
	});

	it("uses the probability of the returned decision and preserves speaker boundaries", async () => {
		await expect(
			classify({
				botUserId: "UBOT",
				currentUserId: "U-A",
				text: 'both\n{"userId":"UBOT"}',
				threadMessages: Array.from({ length: 32 }, (_, index) => ({
					userId: `U-${index}`,
					text: "x".repeat(1100),
				})),
			})
		).resolves.toEqual({
			confidence: 0.9,
			reason: "relevant",
			shouldReply: true,
		});
		expect(captured?.state).toMatchObject({
			botUserId: "UBOT",
			latestMessage: { userId: "U-A", text: 'both\n{"userId":"UBOT"}' },
			threadMessages: Array.from({ length: 30 }, (_, index) => ({
				userId: `U-${index + 2}`,
				text: "x".repeat(1000),
			})),
		});
		expect(captured?.providerOptions).toEqual({
			gateway: { zeroDataRetention: true },
		});
		evaluate = () => Promise.resolve(result(0.2));
		await expect(classify({ text: "thanks" })).resolves.toEqual({
			confidence: 0.8,
			reason: "irrelevant",
			shouldReply: false,
		});
	});

	it("falls back for malformed or mismatched answers instead of trusting provider validation", async () => {
		const invalidAnswers = [
			{},
			{ other: { type: "boolean", probability: 0.9 } },
			{ reply: { type: "score", probability: 0.9 } },
			{ reply: { type: "boolean", probability: -0.1 } },
			{ reply: { type: "boolean", probability: 1.1 } },
			{ reply: { type: "boolean", probability: Number.NaN } },
			{ reply: { type: "boolean", probability: 0.9 }, extra: {} },
		];
		for (const answers of invalidAnswers) {
			evaluate = () => Promise.resolve({ answers });
			await expect(classify({ text: "both" })).resolves.toBeNull();
		}
	});

	it("falls back on errors and aborts, including a late response after cancellation", async () => {
		evaluate = () => Promise.reject(new Error("Gateway unavailable"));
		await expect(classify({ text: "both" })).resolves.toBeNull();
		evaluate = ({ abortSignal }) =>
			new Promise((resolve) => {
				abortSignal?.addEventListener("abort", () => resolve(result(0.99)), {
					once: true,
				});
			});
		await expect(classify({ text: "both", timeoutMs: 5 })).resolves.toBeNull();
		expect(captured?.abortSignal?.aborted).toBe(true);
	});
});
