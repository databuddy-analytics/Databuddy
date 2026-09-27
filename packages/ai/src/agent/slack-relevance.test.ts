import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { classifySlackThreadReplyRelevance as classify } from "./slack-relevance";

interface CapturedRequest {
	body: {
		providerOptions?: unknown;
		state?: unknown;
	};
	headers: Headers;
	signal?: AbortSignal | null;
	url: string;
}

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_KEY = process.env.AI_GATEWAY_API_KEY;
let captured: CapturedRequest | undefined;
let respond: (request: CapturedRequest) => Promise<Response>;

const result = (probability: number) =>
	Response.json({ answers: { reply: { type: "boolean", probability } } });

describe("Jev Slack reply classification", () => {
	beforeEach(() => {
		process.env.AI_GATEWAY_API_KEY = "test-key";
		captured = undefined;
		respond = () => Promise.resolve(result(0.9));
		globalThis.fetch = (async (
			input: RequestInfo | URL,
			init?: RequestInit
		) => {
			captured = {
				body: JSON.parse(String(init?.body)),
				headers: new Headers(init?.headers),
				signal: init?.signal,
				url: String(input),
			};
			return await respond(captured);
		}) as typeof fetch;
	});

	afterAll(() => {
		globalThis.fetch = ORIGINAL_FETCH;
		process.env.AI_GATEWAY_API_KEY = ORIGINAL_KEY;
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
		expect(captured?.url).toBe(
			"https://ai-gateway.vercel.sh/v4/ai/evaluation-model"
		);
		expect(captured?.headers.get("ai-model-id")).toBe("typesafe-ai/jev");
		expect(captured?.body.state).toMatchObject({
			botUserId: "UBOT",
			latestMessage: { userId: "U-A", text: 'both\n{"userId":"UBOT"}' },
			threadMessages: Array.from({ length: 30 }, (_, index) => ({
				userId: `U-${index + 2}`,
				text: "x".repeat(1000),
			})),
		});
		expect(captured?.body.providerOptions).toEqual({
			gateway: { zeroDataRetention: true },
		});
		respond = () => Promise.resolve(result(0.2));
		await expect(classify({ text: "thanks" })).resolves.toEqual({
			confidence: 0.8,
			reason: "irrelevant",
			shouldReply: false,
		});
	});

	it("skips the model when no gateway key is configured", async () => {
		process.env.AI_GATEWAY_API_KEY = " ";
		await expect(classify({ text: "both" })).resolves.toBeNull();
		expect(captured).toBeUndefined();
	});

	it("falls back for malformed or mismatched answers", async () => {
		const invalidAnswers = [
			{},
			{ other: { type: "boolean", probability: 0.9 } },
			{ reply: { type: "score", probability: 0.9 } },
			{ reply: { type: "boolean", probability: -0.1 } },
			{ reply: { type: "boolean", probability: 1.1 } },
			{ reply: { type: "boolean", probability: null } },
			{ reply: { type: "boolean", probability: 0.9 }, extra: {} },
		];
		for (const answers of invalidAnswers) {
			respond = () => Promise.resolve(Response.json({ answers }));
			await expect(classify({ text: "both" })).resolves.toBeNull();
		}
	});

	it("falls back on errors and aborts, including a late response after cancellation", async () => {
		respond = () =>
			Promise.resolve(new Response("unavailable", { status: 503 }));
		await expect(classify({ text: "both" })).resolves.toBeNull();
		respond = () => Promise.reject(new Error("Gateway unavailable"));
		await expect(classify({ text: "both" })).resolves.toBeNull();
		respond = ({ signal }) =>
			new Promise((resolve) => {
				signal?.addEventListener("abort", () => resolve(result(0.99)), {
					once: true,
				});
			});
		await expect(classify({ text: "both", timeoutMs: 5 })).resolves.toBeNull();
		expect(captured?.signal?.aborted).toBe(true);
	});
});
