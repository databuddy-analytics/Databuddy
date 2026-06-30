import type {
	Logger,
	RespondArguments,
	SayArguments,
	SlackCommandMiddlewareArgs,
} from "@slack/bolt";
import type { WebClient } from "@slack/web-api";

export type SlackSlashCommand = SlackCommandMiddlewareArgs["command"];

export type SlackLogger = Pick<Logger, "error" | "warn">;

export type SlackSlashRespond = (
	message: RespondArguments & {
		response_type: "ephemeral";
		text: string;
	}
) => Promise<unknown>;

export interface SlackAgentClient {
	chat: Pick<
		WebClient["chat"],
		"appendStream" | "startStream" | "stopStream" | "update"
	>;
	conversations: Pick<
		WebClient["conversations"],
		"history" | "info" | "replies"
	>;
	reactions: Pick<WebClient["reactions"], "add">;
}

export type SlackSay = (
	message: SayArguments & {
		text: string;
		thread_ts?: string;
	}
) => Promise<unknown>;
