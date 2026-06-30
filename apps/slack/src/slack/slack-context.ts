import type {
	DatabuddyAgentSlackContext,
	DatabuddyAgentSlackMessage,
} from "@databuddy/ai/agent";
import type { SlackAgentRun } from "@/agent/agent-client";
import type { SlackAgentClient } from "@/slack/types";

const DEFAULT_CHANNEL_HISTORY_LIMIT = 20;
const MAX_SLACK_CONTEXT_MESSAGES = 50;

type SlackContextClient = Pick<SlackAgentClient, "conversations">;

export function createSlackConversationContext(
	client: SlackContextClient,
	run: SlackAgentRun
): DatabuddyAgentSlackContext | null {
	const threadTs = run.threadTs ?? run.messageTs;
	if (!threadTs) {
		return null;
	}

	return {
		readCurrentThread: async () => {
			const result = await client.conversations.replies({
				channel: run.channelId,
				inclusive: true,
				limit: MAX_SLACK_CONTEXT_MESSAGES,
				ts: threadTs,
			});

			return {
				channelId: run.channelId,
				hasMore: getBoolean(result, "has_more"),
				messages: mapSlackApiMessages(result),
				threadTs,
			};
		},
		readRecentChannelMessages: async ({ limit }) => {
			const result = await client.conversations.history({
				channel: run.channelId,
				limit: clampSlackMessageLimit(limit),
			});

			return {
				channelId: run.channelId,
				hasMore: getBoolean(result, "has_more"),
				messages: mapSlackApiMessages(result),
			};
		},
	};
}

function clampSlackMessageLimit(limit: number | undefined): number {
	if (typeof limit !== "number" || !Number.isFinite(limit)) {
		return DEFAULT_CHANNEL_HISTORY_LIMIT;
	}
	return Math.max(1, Math.min(MAX_SLACK_CONTEXT_MESSAGES, Math.floor(limit)));
}

function mapSlackApiMessages(result: unknown): DatabuddyAgentSlackMessage[] {
	if (!(isRecord(result) && Array.isArray(result.messages))) {
		return [];
	}

	return result.messages
		.map((message): DatabuddyAgentSlackMessage | null => {
			if (!isRecord(message)) {
				return null;
			}

			const text = getString(message.text)?.trim();
			const mapped: DatabuddyAgentSlackMessage = {
				text: text || "(non-text Slack message)",
			};
			const authorName = getString(message.username);
			const threadTs = getString(message.thread_ts);
			const ts = getString(message.ts);
			const userId = getString(message.user);
			if (authorName) {
				mapped.authorName = authorName;
			}
			if (threadTs) {
				mapped.threadTs = threadTs;
			}
			if (ts) {
				mapped.ts = ts;
			}
			if (userId) {
				mapped.userId = userId;
			}
			return mapped;
		})
		.filter(
			(message): message is DatabuddyAgentSlackMessage => message !== null
		);
}

function getBoolean(value: unknown, key: string): boolean | undefined {
	return isRecord(value) && typeof value[key] === "boolean"
		? value[key]
		: undefined;
}

function getString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
