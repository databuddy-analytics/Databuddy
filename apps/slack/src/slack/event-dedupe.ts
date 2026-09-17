import { getRedisCache } from "@databuddy/redis";
import type { AnyMiddlewareArgs, Middleware } from "@slack/bolt";
import { getString, isRecord } from "@/lib/guards";
import { SLACK_COPY } from "@/slack/messages";
import { stripLeadingMention } from "@/slack/message-routing";

interface EventStore {
	set(
		key: string,
		value: string,
		mode: "EX",
		seconds: number,
		condition: "NX"
	): Promise<"OK" | null>;
}

// Cover Slack's optional hourly redeliveries for 24 hours, with a margin.
const EVENT_TTL_SECONDS = 25 * 60 * 60;

export function createSlackEventDedupe(
	getStore: () => EventStore = getRedisCache
): Middleware<AnyMiddlewareArgs> {
	return async ({ body, client, logger, next }) => {
		if (!("event_id" in body) || typeof body.event_id !== "string") {
			await next();
			return;
		}
		const event = isRecord(body.event) ? body.event : {};
		const text = getString(event.text) ?? "";
		// Cancellation is idempotent and must reach the local run even if Redis is down.
		if (
			event.subtype === "message_deleted" ||
			stripLeadingMention(text).trim().toLowerCase() === "stop"
		) {
			await next();
			return;
		}

		let claimed: "OK" | null;
		try {
			claimed = await getStore().set(
				`slack:event:${body.api_app_id}:${body.team_id}:${body.event_id}`,
				"1",
				"EX",
				EVENT_TTL_SECONDS,
				"NX"
			);
		} catch (error) {
			logger.error("Failed to coordinate Slack event delivery", error);
			const channel = getString(event.channel);
			const user = getString(event.user);
			const directlyAddressed =
				event.type === "app_mention" || event.channel_type === "im";
			if (
				directlyAddressed &&
				channel &&
				user &&
				!event.bot_id &&
				!event.subtype &&
				text
			) {
				await client.chat
					.postEphemeral({
						channel,
						user,
						text: SLACK_COPY.agentFailure,
						thread_ts: getString(event.thread_ts),
					})
					.catch((noticeError) =>
						logger.warn("Failed to report Slack delivery failure", noticeError)
					);
			}
			return;
		}

		// Retain the claim on errors: a handler may already have performed an action.
		if (claimed === "OK") {
			await next();
		}
	};
}
