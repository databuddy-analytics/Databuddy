import type { DatabuddyAgentSlackContext } from "@databuddy/ai/agent";
import type { ApiKeyRow } from "@databuddy/api-keys/resolve";
import { setActiveSlackLog } from "@/lib/evlog-slack";
import { SLACK_COPY } from "@/slack/messages";

const DEFAULT_TIMEZONE = "UTC";

export type SlackAgentTrigger =
	| "app_mention"
	| "assistant"
	| "direct_message"
	| "thread_follow_up";

export interface SlackFollowUpMessage {
	messageTs?: string;
	text: string;
	userId?: string;
}

export interface SlackAgentRun {
	channelId: string;
	followUpMessages?: SlackFollowUpMessage[];
	messageTs?: string;
	slackContext?: DatabuddyAgentSlackContext | null;
	teamId?: string;
	text: string;
	threadTs?: string;
	trigger: SlackAgentTrigger;
	userId: string;
}

export interface SlackRunContext {
	apiKey: ApiKeyRow;
	organizationId: string;
	teamId: string;
}

export interface SlackRunContextResolver {
	resolve(run: SlackAgentRun): Promise<SlackRunContext | null>;
}

export interface SlackAgentStreamOptions {
	abortSignal?: AbortSignal;
}

export interface SlackAgentRunner {
	stream(
		run: SlackAgentRun,
		context: SlackRunContext,
		options?: SlackAgentStreamOptions
	): AsyncGenerator<string>;
}

export class DatabuddyAgentClient {
	readonly #contexts: SlackRunContextResolver;
	readonly #runner: SlackAgentRunner;

	constructor(
		contexts: SlackRunContextResolver,
		runner: SlackAgentRunner = new SharedDatabuddyAgentRunner()
	) {
		this.#contexts = contexts;
		this.#runner = runner;
	}

	async runToText(run: SlackAgentRun): Promise<string> {
		let text = "";
		for await (const chunk of this.stream(run)) {
			text += chunk;
		}
		return text.trim() || SLACK_COPY.noAnswer;
	}

	async *stream(
		run: SlackAgentRun,
		options?: SlackAgentStreamOptions
	): AsyncGenerator<string> {
		const context = await this.#contexts.resolve(run);
		if (!context) {
			yield getMissingSlackWorkspaceMessage();
			return;
		}
		yield* this.#runner.stream(run, context, options);
	}
}

class SharedDatabuddyAgentRunner implements SlackAgentRunner {
	async *stream(
		run: SlackAgentRun,
		context: SlackRunContext,
		options?: SlackAgentStreamOptions
	): AsyncGenerator<string> {
		const conversationId = createSlackConversationId(run);
		setActiveSlackLog({
			agent_chat_id: conversationId,
			agent_source: "slack",
			organization_id: context.organizationId,
			slack_agent_api_key_id: context.apiKey.id,
		});
		const { streamDatabuddyAgent } = await import("@databuddy/ai/agent");

		yield* streamDatabuddyAgent({
			abortSignal: options?.abortSignal,
			actor: {
				apiKey: context.apiKey,
				type: "api_key",
				userId: context.apiKey.userId,
			},
			conversationId,
			input: formatSlackAgentInput(run),
			memoryUserId: createSlackMemoryUserId(run),
			slackContext: run.slackContext,
			source: "slack",
			timezone: DEFAULT_TIMEZONE,
		});
	}
}

export function getMissingSlackWorkspaceMessage(): string {
	return SLACK_COPY.missingWorkspace;
}

export function createSlackConversationId(run: SlackAgentRun): string {
	return safeId(
		[
			"slack",
			run.teamId ?? "team",
			run.channelId,
			run.threadTs ?? run.messageTs ?? Date.now().toString(),
		].join("-")
	);
}

export function createSlackMemoryUserId(run: SlackAgentRun): string {
	return safeId(["slack", run.teamId ?? "team", run.userId].join("-"));
}

function escapePromptFrame(value: string): string {
	return value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatSlackAgentInput(run: SlackAgentRun): string {
	const followUps = run.followUpMessages ?? [];
	const context = formatSlackMessageContext(run);
	if (followUps.length === 0) {
		return [
			context,
			"<slack_latest_message>",
			`author: ${formatSlackUser(run.userId)}`,
			`author_memory_scope: ${createSlackMemoryUserId(run)}`,
			"text:",
			escapePromptFrame(run.text),
			"</slack_latest_message>",
		].join("\n");
	}

	const lines = followUps.map((followUp, index) => {
		const author = followUp.userId
			? formatSlackUser(followUp.userId)
			: "Slack user";
		const memoryScope = followUp.userId
			? createSlackMemoryUserId({ ...run, userId: followUp.userId })
			: "unknown";
		return [
			`<slack_follow_up index="${index + 1}">`,
			`author: ${author}`,
			`author_memory_scope: ${memoryScope}`,
			"text:",
			escapePromptFrame(followUp.text),
			"</slack_follow_up>",
		].join("\n");
	});

	return [
		context,
		"<slack_follow_ups>",
		"These messages arrived in the same Slack thread while you were already responding. Continue the conversation and answer all follow-ups in order.",
		"Each follow-up has its own author and memory scope. Attribute names/preferences/memories only to that follow-up's author.",
		...lines,
		"</slack_follow_ups>",
	].join("\n");
}

function formatSlackMessageContext(run: SlackAgentRun): string {
	const mentionedUsers = extractSlackMentionedUsers(run.text);
	const otherMentionedUsers = mentionedUsers.filter(
		(userId) => userId !== run.userId
	);
	const lines = [
		"<slack_message_context>",
		`current_speaker: ${formatSlackUser(run.userId)}`,
		`current_speaker_user_id: ${run.userId}`,
		`current_speaker_memory_scope: ${createSlackMemoryUserId(run)}`,
		`slack_team_id: ${run.teamId ?? "unknown"}`,
		`slack_channel_id: ${run.channelId}`,
		`slack_thread_ts: ${run.threadTs ?? run.messageTs ?? "unknown"}`,
		`slack_trigger: ${run.trigger}`,
		`mentioned_slack_users_in_latest_message: ${
			mentionedUsers.length > 0
				? mentionedUsers.map(formatSlackUser).join(", ")
				: "none"
		}`,
		`other_people_mentioned_in_latest_message: ${
			otherMentionedUsers.length > 0
				? otherMentionedUsers.map(formatSlackUser).join(", ")
				: "none"
		}`,
		"Rules: current_speaker is the person asking; memories are scoped to current_speaker_memory_scope; mentioned users are subjects/addressees, not the speaker.",
		"Rules: for thread follow-ups, use the current thread only when the latest message points at prior context; pull fresh analytics only when this exact message asks for fresh/current/live data or missing metrics.",
		"Rules: do not read recent channel messages unless the user asks about channel context outside this thread.",
		"Rules: Slack replies default to 1-3 short sentences; exact copy/rewrite requests get only the final copy with no preamble.",
		"</slack_message_context>",
	];
	return lines.join("\n");
}

function formatSlackUser(userId: string): string {
	return `<@${userId}>`;
}

function extractSlackMentionedUsers(text: string): string[] {
	const mentionedUsers: string[] = [];
	for (const token of text.split(" ")) {
		const start = token.indexOf("<@");
		if (start === -1) {
			continue;
		}
		const end = token.indexOf(">", start);
		if (end === -1) {
			continue;
		}
		const userId = token.slice(start + 2, end);
		if (userId && !mentionedUsers.includes(userId)) {
			mentionedUsers.push(userId);
		}
	}
	return mentionedUsers;
}

function safeId(value: string): string {
	return value
		.split("")
		.map((character) => (isSafeIdCharacter(character) ? character : "_"))
		.join("")
		.slice(0, 160);
}

function isSafeIdCharacter(character: string): boolean {
	return (
		(character >= "a" && character <= "z") ||
		(character >= "A" && character <= "Z") ||
		(character >= "0" && character <= "9") ||
		character === "_" ||
		character === "-"
	);
}
