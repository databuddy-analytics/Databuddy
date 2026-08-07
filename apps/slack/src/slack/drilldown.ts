import type { SlackAgentRun } from "@/agent/agent-client";

interface SlackBlockAction {
	action_id?: string;
	value?: string;
}

interface SlackBlockActionsBody {
	channel?: { id?: string };
	container?: { channel_id?: string; message_ts?: string };
	message?: { thread_ts?: string; ts?: string };
	team?: { id?: string };
	user?: { id?: string; team_id?: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toBlockAction(action: unknown): SlackBlockAction {
	if (!isRecord(action)) {
		return {};
	}
	return {
		action_id: getString(action.action_id),
		value: getString(action.value),
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
		channel: { id: getString(channel.id) },
		container: {
			channel_id: getString(container.channel_id),
			message_ts: getString(container.message_ts),
		},
		message: {
			thread_ts: getString(message.thread_ts),
			ts: getString(message.ts),
		},
		team: { id: getString(team.id) },
		user: { id: getString(user.id), team_id: getString(user.team_id) },
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
	const prompt = toBlockAction(action).value;
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
		teamId: installedTeamId ?? payload.team?.id,
		text: prompt,
		threadTs,
		trigger: "thread_follow_up",
		userId,
	};
}
