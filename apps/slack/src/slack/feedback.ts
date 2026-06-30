import {
	classifyAgentFeedbackSentiment,
	normalizeAgentFeedbackSignal,
	recordAgentFeedback,
	type AgentFeedbackSentiment,
} from "@databuddy/ai/agent/feedback";
import type { types } from "@slack/bolt";
import { createSlackEventLog, setSlackLog, toError } from "@/lib/evlog-slack";
import type { SlackInstallationServices } from "@/slack/installations";
import { SLACK_COPY } from "@/slack/messages";

export type SlackFeedbackAction = "added" | "removed";
export type SlackFeedbackSentiment = AgentFeedbackSentiment;

type SlackReactionEvent = types.ReactionAddedEvent | types.ReactionRemovedEvent;

interface SlackReactionEventLike {
	eventTs?: SlackReactionEvent["event_ts"];
	item?: SlackReactionEvent["item"];
	itemUser?: SlackReactionEvent["item_user"];
	reaction?: SlackReactionEvent["reaction"];
	team?: string;
	user?: SlackReactionEvent["user"];
}

interface SlackFeedbackLogger {
	error(...args: unknown[]): void;
	warn(...args: unknown[]): void;
}

export async function logSlackReactionFeedback({
	action,
	botUserId,
	event,
	installations,
	logger,
	teamId,
}: {
	action: SlackFeedbackAction;
	botUserId?: string;
	event: unknown;
	installations: Pick<SlackInstallationServices, "getTeamContext">;
	logger: SlackFeedbackLogger;
	teamId?: string;
}): Promise<void> {
	const reactionEvent = toSlackReactionEvent(event);
	if (
		!reactionEvent?.reaction ||
		reactionEvent.item?.type !== "message" ||
		!reactionEvent.item.channel ||
		!reactionEvent.item.ts
	) {
		return;
	}

	if (reactionEvent.user && botUserId && reactionEvent.user === botUserId) {
		return;
	}

	if (
		reactionEvent.itemUser &&
		botUserId &&
		reactionEvent.itemUser !== botUserId
	) {
		return;
	}

	const normalizedReaction = normalizeAgentFeedbackSignal(
		reactionEvent.reaction
	);
	if (
		action === "added" &&
		normalizedReaction ===
			normalizeAgentFeedbackSignal(SLACK_COPY.processingReaction)
	) {
		return;
	}

	const resolvedTeamId = teamId ?? reactionEvent.team;
	const sentiment = classifySlackReactionSentiment(normalizedReaction);
	let integrationId: string | undefined;
	let organizationId: string | undefined;
	const eventLog = createSlackEventLog({
		slack_channel_id: reactionEvent.item.channel,
		slack_event: "feedback_reaction",
		slack_event_ts: reactionEvent.eventTs,
		slack_feedback_action: action,
		slack_feedback_explicit: sentiment !== "neutral",
		slack_feedback_reaction: normalizedReaction,
		slack_feedback_sentiment: sentiment,
		slack_message_ts: reactionEvent.item.ts,
		slack_team_id: resolvedTeamId,
		slack_user_id: reactionEvent.user,
	});

	try {
		const teamContext = await installations.getTeamContext(resolvedTeamId);
		integrationId = teamContext?.integrationId;
		organizationId = teamContext?.organizationId;
		setSlackLog(eventLog, {
			slack_integration_id: integrationId,
			slack_organization_id: organizationId,
		});
	} catch (error) {
		const err = toError(error);
		logger.warn("Failed to resolve Slack feedback context", err.message);
		eventLog.error(err, { error_step: "feedback_context" });
	} finally {
		const feedback = recordAgentFeedback({
			action,
			integrationId,
			organizationId,
			responseId: reactionEvent.item.ts,
			signal: normalizedReaction,
			source: "slack",
			sourceEventId: reactionEvent.eventTs,
			targetId: reactionEvent.item.channel,
			userId: reactionEvent.user,
		});
		setSlackLog(eventLog, feedback.wideEvent);
		eventLog.emit();
	}
}

export function classifySlackReactionSentiment(
	reaction: string
): SlackFeedbackSentiment {
	return classifyAgentFeedbackSentiment(reaction);
}

function toSlackReactionEvent(event: unknown): SlackReactionEventLike | null {
	if (!isRecord(event)) {
		return null;
	}
	const item = toSlackReactionMessageItem(event.item);
	return {
		eventTs: getString(event.event_ts),
		item,
		itemUser: getString(event.item_user),
		reaction: getString(event.reaction),
		team: getString(event.team),
		user: getString(event.user),
	};
}

function toSlackReactionMessageItem(
	item: unknown
): SlackReactionEvent["item"] | undefined {
	if (!isRecord(item)) {
		return;
	}
	const channel = getString(item.channel);
	const ts = getString(item.ts);
	return item.type === "message" && channel && ts
		? { channel, ts, type: "message" }
		: undefined;
}

function getString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
