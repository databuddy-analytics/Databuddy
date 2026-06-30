import { tool, type ToolSet } from "ai";
import { z } from "zod";

export interface DatabuddyAgentSlackMessage {
	authorName?: string;
	text: string;
	threadTs?: string;
	ts?: string;
	userId?: string;
}

export interface DatabuddyAgentSlackThreadResult {
	channelId: string;
	hasMore?: boolean;
	messages: DatabuddyAgentSlackMessage[];
	threadTs: string;
}

export interface DatabuddyAgentSlackChannelHistoryResult {
	channelId: string;
	hasMore?: boolean;
	messages: DatabuddyAgentSlackMessage[];
}

export interface DatabuddyAgentSlackContext {
	readCurrentThread?: () => Promise<DatabuddyAgentSlackThreadResult>;
	readRecentChannelMessages?: (input: {
		limit?: number;
	}) => Promise<DatabuddyAgentSlackChannelHistoryResult>;
}

export function createSlackConversationTools(
	slackContext?: DatabuddyAgentSlackContext | null
): ToolSet {
	const tools: ToolSet = {};
	const readCurrentThread = slackContext?.readCurrentThread;
	const readRecentChannelMessages = slackContext?.readRecentChannelMessages;

	if (readCurrentThread) {
		tools.slack_read_current_thread = tool({
			description:
				"Read the current Slack thread. Use when the user refers to this thread, above, previous replies, decisions, discussion, context, or asks to summarize/answer based on Slack conversation context.",
			strict: true,
			inputSchema: z.object({}),
			execute: async () => readCurrentThread(),
		});
	}

	if (readRecentChannelMessages) {
		tools.slack_read_recent_channel_messages = tool({
			description:
				"Read recent messages from the current Slack channel only. Use sparingly for recent channel context, not broad workspace search. Prefer slack_read_current_thread when the user asks about the current thread.",
			strict: true,
			inputSchema: z.object({
				limit: z.number().int().min(1).max(50).optional(),
			}),
			execute: async ({ limit }) => readRecentChannelMessages({ limit }),
		});
	}

	return tools;
}
