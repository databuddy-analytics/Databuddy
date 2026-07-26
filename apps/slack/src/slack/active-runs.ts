import type { SlackAgentRun } from "@/agent/agent-client";

interface SlackMessageRef {
	channelId: string;
	messageTs: string;
	teamId?: string;
}

const activeRuns = new Map<string, AbortController>();
const inflightRuns = new Set<Promise<unknown>>();

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

export function trackSlackRunPromise(promise: Promise<unknown>): void {
	inflightRuns.add(promise);
	promise
		.catch(() => {})
		.finally(() => {
			inflightRuns.delete(promise);
		});
}

export function abortAllSlackActiveRuns(reason: string): number {
	let aborted = 0;
	for (const controller of activeRuns.values()) {
		controller.abort(reason);
		aborted++;
	}
	activeRuns.clear();
	return aborted;
}

export async function waitForSlackActiveRuns(timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (inflightRuns.size > 0) {
		const remaining = deadline - Date.now();
		if (remaining <= 0) {
			return;
		}
		await Promise.race([
			Promise.allSettled([...inflightRuns]),
			new Promise((resolve) => setTimeout(resolve, remaining)),
		]);
	}
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
