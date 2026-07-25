import { getSlackApiErrorCode } from "@/lib/evlog-slack";
import type { SlackAgentClient } from "@/slack/types";

type SlackChannelPolicyReason =
	| "internal"
	| "slack_connect"
	| "missing_scope"
	| "lookup_failed";

export interface SlackChannelMentionPolicy {
	autoBind: boolean;
	errorCode?: string;
	isExtShared?: boolean;
	reason: SlackChannelPolicyReason;
}

interface SlackPolicyLogger {
	warn(...args: unknown[]): void;
}

export async function getSlackChannelMentionPolicy({
	channelId,
	client,
	logger,
}: {
	channelId: string;
	client: Pick<SlackAgentClient, "conversations">;
	logger: SlackPolicyLogger;
}): Promise<SlackChannelMentionPolicy> {
	try {
		const result = await client.conversations.info({
			channel: channelId,
		});

		const channel = isRecord(result) ? result.channel : null;
		if (!isRecord(channel)) {
			return {
				autoBind: false,
				reason: "lookup_failed",
			};
		}

		const isExtShared =
			channel.is_ext_shared === true || channel.is_pending_ext_shared === true;

		return {
			autoBind: true,
			isExtShared,
			reason: isExtShared ? "slack_connect" : "internal",
		};
	} catch (error) {
		const code = getSlackApiErrorCode(error) ?? "unknown";
		logger.warn("Failed to inspect Slack channel before auto-bind", code);
		return {
			autoBind: false,
			errorCode: code,
			reason: code === "missing_scope" ? "missing_scope" : "lookup_failed",
		};
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
