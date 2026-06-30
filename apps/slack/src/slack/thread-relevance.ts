import {
	classifySlackThreadReplyRelevance,
	type SlackThreadReplyMessage,
	type SlackThreadReplyRelevance,
} from "@databuddy/ai/agent";
import type { SlackAgentRun } from "@/agent/agent-client";

const MODEL_TIMEOUT_MS = 6000;

export type SlackThreadReplyDecisionSource = "fallback" | "model";

export interface SlackThreadReplyDecision {
	confidence: number;
	reason: SlackThreadReplyRelevance["reason"];
	shouldReply: boolean;
	source: SlackThreadReplyDecisionSource;
}

export interface SlackThreadReplyGateContext {
	botUserId?: string;
	readThreadMessages?: () => Promise<SlackThreadReplyMessage[]>;
}

export interface SlackThreadReplyGate {
	shouldReply(
		run: SlackAgentRun,
		context: SlackThreadReplyGateContext
	): Promise<SlackThreadReplyDecision>;
}

export const slackThreadReplyGate: SlackThreadReplyGate = {
	shouldReply: shouldReplyToSlackThreadFollowUp,
};

export async function shouldReplyToSlackThreadFollowUp(
	run: SlackAgentRun,
	context: SlackThreadReplyGateContext = {}
): Promise<SlackThreadReplyDecision> {
	const threadMessages = await readThreadMessages(context);
	const modelDecision = await classifySlackThreadReplyRelevance({
		botUserId: context.botUserId,
		currentUserId: run.userId,
		text: run.text,
		threadMessages,
		timeoutMs: MODEL_TIMEOUT_MS,
	});

	if (modelDecision) {
		return {
			confidence: modelDecision.confidence,
			reason: modelDecision.reason,
			shouldReply: modelDecision.shouldReply,
			source: "model",
		};
	}

	return getFallbackDecision(run.text, context.botUserId, threadMessages);
}

function getFallbackDecision(
	text: string,
	botUserId?: string,
	threadMessages?: SlackThreadReplyMessage[]
): SlackThreadReplyDecision {
	const normalized = normalizeText(text);

	if (!normalized) {
		return decision(false, "side_chatter", 0.5);
	}

	if (mentionsBot(normalized, botUserId)) {
		return decision(true, "bot_mentioned", 0.65);
	}

	if (getRecentBotMessage(threadMessages, botUserId)) {
		return decision(false, "ambiguous", 0.5);
	}

	return decision(false, "ambiguous", 0.5);
}

function decision(
	shouldReply: boolean,
	reason: SlackThreadReplyDecision["reason"],
	confidence: number
): SlackThreadReplyDecision {
	return {
		confidence,
		reason,
		shouldReply,
		source: "fallback",
	};
}

async function readThreadMessages(
	context: SlackThreadReplyGateContext
): Promise<SlackThreadReplyMessage[]> {
	try {
		return (await context.readThreadMessages?.()) ?? [];
	} catch {
		return [];
	}
}

function normalizeText(text: string): string {
	return text
		.toLowerCase()
		.replaceAll("\n", " ")
		.replaceAll("\r", " ")
		.replaceAll("\t", " ")
		.split(" ")
		.filter(Boolean)
		.join(" ")
		.trim();
}

function mentionsBot(text: string, botUserId?: string): boolean {
	return Boolean(botUserId && text.includes(`<@${botUserId.toLowerCase()}>`));
}

function getRecentBotMessage(
	messages: SlackThreadReplyMessage[] | undefined,
	botUserId?: string
): SlackThreadReplyMessage | null {
	if (!(botUserId && messages?.length)) {
		return null;
	}

	const normalizedBotUserId = botUserId.toLowerCase();
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message.userId?.toLowerCase() === normalizedBotUserId) {
			return {
				...message,
				text: normalizeText(message.text),
			};
		}
	}
	return null;
}
