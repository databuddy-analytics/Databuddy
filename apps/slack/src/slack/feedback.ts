import { getString, isRecord } from "@/lib/guards";
import {
	classifyAgentFeedbackSentiment,
	normalizeAgentFeedbackSignal,
	recordAgentFeedback,
} from "@databuddy/ai/agent/feedback";
import { createSlackEventLog, setSlackLog, toError } from "@/lib/evlog-slack";
import type { SlackInstallationServices } from "@/slack/installations";

export function resolveSlackFeedbackSignal(action: unknown): string | null {
	if (!isRecord(action)) {
		return null;
	}
	const raw =
		getString(action.value) ??
		getString(
			(action.selected_option as Record<string, unknown> | undefined)?.value
		);
	if (!raw) {
		return null;
	}
	const normalized = normalizeAgentFeedbackSignal(raw);
	return normalized.length > 0 ? normalized : null;
}

export async function handleSlackFeedbackAction({
	action,
	body,
	installations,
	logger,
	teamId,
}: {
	action: unknown;
	body: unknown;
	installations: Pick<SlackInstallationServices, "getTeamContext">;
	logger: SlackFeedbackLogger;
	teamId?: string;
}): Promise<void> {
	const signal = resolveSlackFeedbackSignal(action);
	if (!signal) {
		return;
	}

	const payload = isRecord(body) ? body : {};
	const container = isRecord(payload.container) ? payload.container : {};
	const user = isRecord(payload.user) ? payload.user : {};
	const team = isRecord(payload.team) ? payload.team : {};
	const resolvedTeamId = teamId ?? getString(team.id);
	const channelId = getString(container.channel_id);
	const messageTs = getString(container.message_ts);
	const actionTs = isRecord(action) ? getString(action.action_ts) : undefined;

	const sentiment = classifyAgentFeedbackSentiment(signal);
	const eventLog = createSlackEventLog({
		slack_channel_id: channelId,
		slack_event: "feedback_button",
		slack_feedback_reaction: signal,
		slack_feedback_sentiment: sentiment,
		slack_message_ts: messageTs,
		slack_team_id: resolvedTeamId,
		slack_user_id: getString(user.id),
	});

	let integrationId: string | undefined;
	let organizationId: string | undefined;
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
		logger.warn("Failed to resolve Slack feedback button context", err.message);
		eventLog.error(err, { error_step: "feedback_button_context" });
	} finally {
		const feedback = recordAgentFeedback({
			action: "added",
			integrationId,
			organizationId,
			responseId: messageTs,
			signal,
			source: "slack",
			sourceEventId: actionTs,
			targetId: channelId,
			userId: getString(user.id),
		});
		setSlackLog(eventLog, feedback.wideEvent);
		eventLog.emit();
	}
}

interface SlackFeedbackLogger {
	error(...args: unknown[]): void;
	warn(...args: unknown[]): void;
}
