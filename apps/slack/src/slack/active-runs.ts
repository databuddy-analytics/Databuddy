import type { SlackAgentRun } from "@/agent/agent-client";

interface SlackMessageRef {
	channelId: string;
	messageTs: string;
	teamId?: string;
}

const activeRuns = new Map<string, AbortController>();

function runKey(ref: SlackMessageRef): string {
	return [ref.teamId ?? "team", ref.channelId, ref.messageTs].join(":");
}

export function registerSlackActiveRun(
	run: SlackAgentRun
): AbortController | null {
	if (!run.messageTs) {
		return null;
	}

	const key = runKey({
		channelId: run.channelId,
		messageTs: run.messageTs,
		teamId: run.teamId,
	});
	activeRuns.get(key)?.abort();

	const controller = new AbortController();
	activeRuns.set(key, controller);
	return controller;
}

export function abortSlackActiveRun(ref: SlackMessageRef): boolean {
	const keys = [
		runKey(ref),
		ref.teamId
			? runKey({
					channelId: ref.channelId,
					messageTs: ref.messageTs,
				})
			: null,
	].filter((key): key is string => key !== null);

	for (const key of keys) {
		const controller = activeRuns.get(key);
		if (!controller) {
			continue;
		}
		controller.abort();
		activeRuns.delete(key);
		return true;
	}

	return false;
}

export function cleanupSlackActiveRun(run: SlackAgentRun): void {
	if (!run.messageTs) {
		return;
	}

	activeRuns.delete(
		runKey({
			channelId: run.channelId,
			messageTs: run.messageTs,
			teamId: run.teamId,
		})
	);
}
