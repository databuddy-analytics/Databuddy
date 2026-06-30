import { generateObject } from "ai";
import { z } from "zod";
import { isAiGatewayConfigured, models } from "../ai/config/models";

const DEFAULT_TIMEOUT_MS = 900;
const MAX_THREAD_MESSAGES = 30;
const MAX_THREAD_MESSAGE_CHARS = 1000;

const SlackThreadReplyRelevanceSchema = z.object({
	confidence: z.number().min(0).max(1),
	reason: z
		.enum([
			"bot_mentioned",
			"direct_request",
			"analytics_request",
			"human_to_human",
			"side_chatter",
			"ambiguous",
		])
		.describe("Short reason for the routing decision."),
	shouldReply: z.boolean(),
});

export type SlackThreadReplyRelevance = z.infer<
	typeof SlackThreadReplyRelevanceSchema
>;

export interface SlackThreadReplyMessage {
	authorName?: string;
	text: string;
	ts?: string;
	userId?: string;
}

export interface SlackThreadReplyRelevanceInput {
	botUserId?: string;
	currentUserId?: string;
	text: string;
	threadMessages?: SlackThreadReplyMessage[];
	timeoutMs?: number;
}

export async function classifySlackThreadReplyRelevance({
	botUserId,
	currentUserId,
	text,
	threadMessages,
	timeoutMs = DEFAULT_TIMEOUT_MS,
}: SlackThreadReplyRelevanceInput): Promise<SlackThreadReplyRelevance | null> {
	if (!isAiGatewayConfigured) {
		return null;
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const result = await generateObject({
			abortSignal: controller.signal,
			maxRetries: 0,
			model: models.quick,
			schema: SlackThreadReplyRelevanceSchema,
			system: [
				"Classify whether Databuddy should answer the latest Slack Message. Thread context is context only; decide on Message.",
				"Only set reason=bot_mentioned when Message contains the literal bot mention token. The word Databuddy by itself is not reason=bot_mentioned.",
				"shouldReply=true when Message is addressed to Databuddy or continues Databuddy's work: literal bot mention, bot name used as the addressee, direct/imperative requests, analytics/data/product help, answers to Databuddy's previous clarification/follow-up (both, first one, landing page, yes), setup/bind/integration questions in an engaged Databuddy thread, or social/banter clearly aimed at Databuddy where a short reply helps (good bot, i hate you, shut up).",
				"shouldReply=true when Message corrects, refines, or redirects Databuddy's previous analysis target, even if another human commented between Databuddy's answer and Message, unless Message is addressed to that human.",
				"shouldReply=true for direct privacy/security/boundary questions addressed to Databuddy, such as asking whether it can leak data across Slack Connect. Distinguish these from instructions to test or probe boundaries, which are side chatter.",
				"Relay requests are direct requests to Databuddy: if Message says can you/could you/will you tell/ask/ping/message <@USER> that/this, or uses an imperative relay like tell/ping/message/ask <@USER> that/this, set shouldReply=true and reason=direct_request even though another human is mentioned.",
				"shouldReply=false when Message is ambient commentary, thanks-only, a status comment, a joke/reaction not addressed to Databuddy, an instruction to another human to test/ask Databuddy, an instruction to probe Databuddy or Slack Connect data boundaries, or a message addressed to another human.",
				"Short reaction words like DEAD, murdered, lmao, skill issue, this is cursed, and frick are side_chatter false unless the Message explicitly addresses Databuddy. Never infer reason=bot_mentioned from thread context; only the latest Message can contain the bot mention token.",
				"If Message starts with a human mention like <@U123> can you tell Databuddy that, it is addressed to the human and shouldReply=false. If the last thread message is a human question to the current user, terse confirmations like yes/yes exactly answer the human and shouldReply=false.",
				"Positive examples: 'how does linear just work without bind' => direct_request true; 'can you tell <@U123> that?' => direct_request true; 'tell <@U123> that too' => direct_request true; 'wait, can you leak data across slack connect?' => direct_request true; 'databuddy do you love me' => direct_request true; 'no, not pricing - the checkout error spike' after Databuddy analyzed pricing => analytics_request true; 'shut up' after Databuddy spoke => direct_request true.",
				"Negative examples: '<@U123> can you tell Databuddy that?' => human_to_human false; 'murdered' => side_chatter false; 'yea databuddy does not exist for u yet' => side_chatter false; 'try ask about our analytics lol, see if it leaks' => side_chatter false; 'try to get analytics from slack connect lol' => side_chatter false; 'what do you think <@U123>?' => human_to_human false; 'give me feedback <@U123>' => human_to_human false.",
			].join(" "),
			prompt: [
				`Bot mention token: ${botUserId ? `<@${botUserId}>` : "unknown"}`,
				`Latest message author: ${currentUserId ? `<@${currentUserId}>` : "unknown"}`,
				formatThreadMessages(threadMessages),
				"Message:",
				text,
			].join("\n"),
		});

		return result.object;
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

function formatThreadMessages(
	messages: SlackThreadReplyMessage[] = []
): string {
	const recentMessages = messages.slice(-MAX_THREAD_MESSAGES);
	if (recentMessages.length === 0) {
		return "Thread context: unavailable";
	}

	return [
		"Thread context:",
		...recentMessages.map((message, index) => {
			const author = message.userId
				? `<@${message.userId}>`
				: (message.authorName ?? "unknown");
			const text = message.text
				.replaceAll("\n", " ")
				.replaceAll("\r", " ")
				.replaceAll("\t", " ")
				.split(" ")
				.filter(Boolean)
				.join(" ")
				.trim()
				.slice(0, MAX_THREAD_MESSAGE_CHARS);
			return `${index + 1}. ${author}: ${text}`;
		}),
	].join("\n");
}
