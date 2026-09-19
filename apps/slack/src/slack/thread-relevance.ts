import {
	classifySlackThreadReplyRelevance,
	type DatabuddyAgentSlackMessage,
	type SlackThreadReplyRelevance,
} from "@databuddy/ai/agent";
import type { SlackAgentRun } from "@/agent/agent-client";

export interface SlackThreadReplyDecision {
	confidence: number;
	reason:
		| SlackThreadReplyRelevance["reason"]
		| "bot_mentioned"
		| "side_chatter"
		| "ambiguous";
	shouldReply: boolean;
	source: "fallback" | "model";
}

export async function shouldReplyToSlackThreadFollowUp(
	run: SlackAgentRun,
	context: {
		botUserId?: string;
		readThreadMessages?: () => Promise<DatabuddyAgentSlackMessage[]>;
	} = {}
): Promise<SlackThreadReplyDecision> {
	let threadMessages: DatabuddyAgentSlackMessage[] = [];
	try {
		threadMessages = (await context.readThreadMessages?.()) ?? [];
	} catch {
		// Missing Slack history must not prevent classifying the latest message.
	}
	const modelDecision = await classifySlackThreadReplyRelevance({
		botUserId: context.botUserId,
		currentUserId: run.userId,
		text: run.text,
		threadMessages,
	});

	if (modelDecision) {
		return { ...modelDecision, source: "model" };
	}

	const text = run.text.trim().toLowerCase();
	const mentioned = Boolean(
		context.botUserId && text.includes(`<@${context.botUserId.toLowerCase()}>`)
	);
	return {
		confidence: mentioned ? 0.65 : 0.5,
		reason: mentioned ? "bot_mentioned" : text ? "ambiguous" : "side_chatter",
		shouldReply: mentioned,
		source: "fallback",
	};
}
