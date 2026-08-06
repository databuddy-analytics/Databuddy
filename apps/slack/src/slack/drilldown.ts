import type { SlackAgentRun } from "@/agent/agent-client";

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function parseDrilldownRun(
	body: unknown,
	action: unknown
): SlackAgentRun | null {
	const prompt = isRecord(action) ? getString(action.value) : undefined;
	if (!prompt) {
		return null;
	}

	const payload = isRecord(body) ? body : {};
	const user = isRecord(payload.user) ? payload.user : {};
	const team = isRecord(payload.team) ? payload.team : {};
	const channel = isRecord(payload.channel) ? payload.channel : {};
	const container = isRecord(payload.container) ? payload.container : {};
	const message = isRecord(payload.message) ? payload.message : {};

	const channelId = getString(channel.id) ?? getString(container.channel_id);
	const userId = getString(user.id);
	const messageTs = getString(message.ts) ?? getString(container.message_ts);
	const threadTs = getString(message.thread_ts) ?? messageTs;

	if (!(channelId && userId && threadTs)) {
		return null;
	}

	return {
		channelId,
		messageTs,
		teamId: getString(team.id),
		text: prompt,
		threadTs,
		trigger: "thread_follow_up",
		userId,
	};
}
