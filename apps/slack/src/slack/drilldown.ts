import { isRecord } from "@/lib/guards";
import type { SlackAgentRun } from "@/agent/agent-client";

interface SlackBlockAction {
	action_id?: string;
	action_ts?: string;
	value?: string;
}

interface SlackBlockActionsBody {
	channel?: { id?: string };
	container?: { channel_id?: string; message_ts?: string };
	message?: { thread_ts?: string; ts?: string };
	team?: { id?: string };
	user?: { id?: string; team_id?: string };
}

function getNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toBlockAction(action: unknown): SlackBlockAction {
	if (!isRecord(action)) {
		return {};
	}
	return {
		action_id: getNonEmptyString(action.action_id),
		action_ts: getNonEmptyString(action.action_ts),
		value: getNonEmptyString(action.value),
	};
}

function toBlockActionsBody(body: unknown): SlackBlockActionsBody {
	if (!isRecord(body)) {
		return {};
	}
	const user = isRecord(body.user) ? body.user : {};
	const team = isRecord(body.team) ? body.team : {};
	const channel = isRecord(body.channel) ? body.channel : {};
	const container = isRecord(body.container) ? body.container : {};
	const message = isRecord(body.message) ? body.message : {};
	return {
		channel: { id: getNonEmptyString(channel.id) },
		container: {
			channel_id: getNonEmptyString(container.channel_id),
			message_ts: getNonEmptyString(container.message_ts),
		},
		message: {
			thread_ts: getNonEmptyString(message.thread_ts),
			ts: getNonEmptyString(message.ts),
		},
		team: { id: getNonEmptyString(team.id) },
		user: {
			id: getNonEmptyString(user.id),
			team_id: getNonEmptyString(user.team_id),
		},
	};
}

export function isExternalSlackConnectClick(
	userTeamId: string | undefined,
	installedTeamId: string | undefined
): boolean {
	return Boolean(
		userTeamId && installedTeamId && userTeamId !== installedTeamId
	);
}

export function parseDrilldownRun(
	body: unknown,
	action: unknown,
	installedTeamId?: string
): SlackAgentRun | null {
	const blockAction = toBlockAction(action);
	const prompt = blockAction.value;
	if (!prompt) {
		return null;
	}

	const payload = toBlockActionsBody(body);
	const channelId = payload.channel?.id ?? payload.container?.channel_id;
	const userId = payload.user?.id;
	const messageTs = payload.message?.ts ?? payload.container?.message_ts;
	const threadTs = payload.message?.thread_ts ?? messageTs;

	if (!(channelId && userId && threadTs)) {
		return null;
	}

	if (isExternalSlackConnectClick(payload.user?.team_id, installedTeamId)) {
		return null;
	}

	return {
		channelId,
		messageTs,
		requestTs: blockAction.action_ts ?? String(Date.now() / 1000),
		teamId: installedTeamId ?? payload.team?.id,
		text: prompt,
		threadTs,
		trigger: "thread_follow_up",
		userId,
	};
}
