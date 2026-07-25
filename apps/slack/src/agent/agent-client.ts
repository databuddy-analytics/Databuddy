import type { DatabuddyAgentSlackContext } from "@databuddy/ai/agent";
import type { ApiKeyRow } from "@databuddy/api-keys/resolve";
import { setActiveSlackLog } from "@/lib/evlog-slack";
import { SLACK_COPY } from "@/slack/messages";

type SlackAgentTrigger =
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

	async *stream(
		run: SlackAgentRun,
		options?: SlackAgentStreamOptions
	): AsyncGenerator<string> {
		const context = await this.#contexts.resolve(run);
		if (!context) {
			yield SLACK_COPY.missingWorkspace;
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
			timezone: "UTC",
		});
	}
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
	const context = [
		"<slack_context>",
		`slack_channel_id: ${run.channelId}`,
		"The message author is the speaker; @mentions in the text are other people.",
		"</slack_context>",
	].join("\n");
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

function formatSlackUser(userId: string): string {
	return `<@${userId}>`;
}

function safeId(value: string): string {
	return value.replaceAll(/[^a-zA-Z0-9_-]/g, "_").slice(0, 160);
}
