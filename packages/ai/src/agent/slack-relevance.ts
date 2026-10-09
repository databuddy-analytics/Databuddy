import { z } from "zod";
import { SLACK_REPLY_RELEVANCE_INSTRUCTIONS } from "../ai/prompts/analytics";
import type { DatabuddyAgentSlackMessage } from "../ai/mcp/slack-context";

const RELEVANCE_ENDPOINT =
	"https://ai-gateway.vercel.sh/v4/ai/evaluation-model";
const DEFAULT_TIMEOUT_MS = 2000;
const MAX_THREAD_MESSAGES = 30;
const MAX_THREAD_MESSAGE_CHARS = 1000;
const REPLY_THRESHOLD = 0.5;

const ReplyEvaluationSchema = z.object({
	answers: z.strictObject({
		reply: z.object({
			type: z.literal("boolean"),
			probability: z.number().min(0).max(1),
		}),
	}),
});

export interface SlackThreadReplyRelevance {
	confidence: number;
	reason: "relevant" | "irrelevant";
	shouldReply: boolean;
}

export interface SlackThreadReplyRelevanceInput {
	botUserId?: string;
	currentUserId?: string;
	text: string;
	threadMessages?: DatabuddyAgentSlackMessage[];
	timeoutMs?: number;
}

export async function classifySlackThreadReplyRelevance({
	botUserId,
	currentUserId,
	text,
	threadMessages = [],
	timeoutMs = DEFAULT_TIMEOUT_MS,
}: SlackThreadReplyRelevanceInput): Promise<SlackThreadReplyRelevance | null> {
	const apiKey = (process.env.AI_GATEWAY_API_KEY ?? "").trim();
	if (!apiKey) {
		return null;
	}

	const signal = AbortSignal.timeout(timeoutMs);

	try {
		const body = JSON.stringify({
			providerOptions: { gateway: { zeroDataRetention: true } },
			questions: {
				reply: {
					type: "boolean",
					instructions: SLACK_REPLY_RELEVANCE_INSTRUCTIONS,
				},
			},
			state: {
				botUserId: botUserId ?? null,
				latestMessage: { userId: currentUserId ?? null, text },
				threadMessages: threadMessages
					.slice(-MAX_THREAD_MESSAGES)
					.map((message) => ({
						userId: message.userId ?? null,
						authorName: message.authorName ?? null,
						text: message.text.slice(0, MAX_THREAD_MESSAGE_CHARS),
					})),
			},
		});
		const response = await fetch(RELEVANCE_ENDPOINT, {
			method: "POST",
			signal,
			headers: {
				authorization: `Bearer ${apiKey}`,
				"content-type": "application/json",
				"ai-evaluation-model-specification-version": "4",
				"ai-gateway-auth-method": "api-key",
				"ai-gateway-protocol-version": "0.0.1",
				"ai-model-id": "typesafe-ai/jev",
			},
			body,
		});
		if (!response.ok) {
			return null;
		}
		const parsed = ReplyEvaluationSchema.safeParse(await response.json());
		signal.throwIfAborted();
		if (!parsed.success) {
			return null;
		}

		const probability = parsed.data.answers.reply.probability;
		const shouldReply = probability >= REPLY_THRESHOLD;
		return {
			confidence: shouldReply ? probability : 1 - probability,
			reason: shouldReply ? "relevant" : "irrelevant",
			shouldReply,
		};
	} catch {
		return null;
	}
}
