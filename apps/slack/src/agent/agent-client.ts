import type {
	DatabuddyAgentSlackContext,
	DatabuddyAgentToolTrace,
} from "@databuddy/ai/agent";
import type { ApiKeyRow } from "@databuddy/api-keys/resolve";
import { db, eq } from "@databuddy/db";
import { insightGenerationConfigs } from "@databuddy/db/schema";
import { cacheable } from "@databuddy/redis";
import { setActiveSlackLog } from "@/lib/evlog-slack";
import { SLACK_COPY } from "@/slack/messages";

type SlackAgentTrigger =
	| "app_mention"
	| "assistant"
	| "direct_message"
	| "thread_follow_up";

export interface SlackFollowUpMessage {
	messageTs?: string;
	requestTs?: string;
	text: string;
	userId?: string;
}

export interface SlackAgentRun {
	channelId: string;
	followUpMessages?: SlackFollowUpMessage[];
	messageTs?: string;
	requestTs?: string;
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
	onToolEvent?: (toolNames: string[]) => void;
	onToolTrace?: (trace: DatabuddyAgentToolTrace[]) => void;
}

// Slack streams keep the "thinking" indicator open, and Slack imposes no stream
// duration limit, so allow multi-site/complex analytics runs well past the 45s
// default before the outer 4-minute response timeout in run-handler steps in.
const SLACK_AGENT_TIMEOUT_MS = 120_000;
const ORGANIZATION_TIMEZONE_CACHE_TTL_SEC = 300;
const PROMPT_FRAME_ANGLE = /<(?![@#!]|https?:|mailto:)/g;

const getOrganizationTimezone = cacheable(
	(organizationId: string) =>
		db
			.select({ timezone: insightGenerationConfigs.timezone })
			.from(insightGenerationConfigs)
			.where(eq(insightGenerationConfigs.organizationId, organizationId))
			.limit(1)
			.then(([config]) => config?.timezone ?? "UTC"),
	{
		expireInSec: ORGANIZATION_TIMEZONE_CACHE_TTL_SEC,
		prefix: "slack-organization-timezone",
	}
);

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
		const [{ streamDatabuddyAgent }, timezone] = await Promise.all([
			import("@databuddy/ai/agent"),
			getOrganizationTimezone(context.organizationId),
		]);

		yield* streamDatabuddyAgent({
			abortSignal: options?.abortSignal,
			actor: {
				apiKey: context.apiKey,
				type: "api_key",
				userId: context.apiKey.userId,
			},
			conversationId,
			historyInput: `${formatSlackUser(run.userId)}: ${run.text}`,
			input: formatSlackAgentInput(run),
			memoryUserId: createSlackMemoryUserId(run),
			mutationMode: "dry-run",
			onToolEvent: options?.onToolEvent,
			onToolTrace: options?.onToolTrace,
			slackContext: run.slackContext,
			source: "slack",
			timeoutMs: SLACK_AGENT_TIMEOUT_MS,
			timezone,
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

function createSlackMemoryUserId(run: SlackAgentRun): string {
	return safeId(["slack", run.teamId ?? "team", run.userId].join("-"));
}

function escapePromptFrame(value: string): string {
	return value.replace(PROMPT_FRAME_ANGLE, "&lt;");
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
			"text:",
			escapePromptFrame(run.text),
			"</slack_latest_message>",
		].join("\n");
	}

	const lines = followUps.map((followUp, index) => {
		const author = followUp.userId
			? formatSlackUser(followUp.userId)
			: "Slack user";
		return [
			`<slack_follow_up index="${index + 1}">`,
			`author: ${author}`,
			"text:",
			escapePromptFrame(followUp.text),
			"</slack_follow_up>",
		].join("\n");
	});

	return [
		context,
		"<slack_follow_ups>",
		"These messages arrived in the same Slack thread while you were already responding. Continue the conversation and answer all follow-ups in order.",
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
