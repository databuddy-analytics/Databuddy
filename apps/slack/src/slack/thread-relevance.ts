import {
	classifySlackThreadReplyRelevance,
	type SlackThreadReplyMessage,
	type SlackThreadReplyRelevance,
} from "@databuddy/ai/agent";
import type { SlackAgentRun } from "@/agent/agent-client";

const MODEL_TIMEOUT_MS = 6000;

type SlackThreadReplyDecisionSource = "fallback" | "model";

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

	return getFallbackDecision(run.text, context.botUserId);
}

function getFallbackDecision(
	text: string,
	botUserId?: string
): SlackThreadReplyDecision {
	const normalized = text.trim().toLowerCase();

	if (!normalized) {
		return decision(false, "side_chatter", 0.5);
	}

	if (mentionsBot(normalized, botUserId)) {
		return decision(true, "bot_mentioned", 0.65);
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

function mentionsBot(text: string, botUserId?: string): boolean {
	return Boolean(botUserId && text.includes(`<@${botUserId.toLowerCase()}>`));
}
