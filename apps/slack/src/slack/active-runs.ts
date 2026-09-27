import type { SlackAgentRun } from "@/agent/agent-client";

interface SlackMessageRef {
	channelId: string;
	messageTs: string;
	teamId?: string;
}

const activeRuns = new Map<
	string,
	{
		controller: AbortController;
		shutdownController: AbortController;
		threadKey: string;
		requestTs: string;
	}
>();
const inflightRuns = new Set<Promise<unknown>>();

function runKey(ref: SlackMessageRef): string {
	return [ref.teamId ?? "team", ref.channelId, ref.messageTs].join(":");
}

export function registerSlackActiveRun(
	run: SlackAgentRun,
	controller = new AbortController(),
	shutdownController = controller
): AbortController | null {
	if (!run.messageTs) {
		return null;
	}

	const key = runKey({
		channelId: run.channelId,
		messageTs: run.messageTs,
		teamId: run.teamId,
	});
	activeRuns.get(key)?.controller.abort();

	activeRuns.set(key, {
		controller,
		requestTs: run.requestTs ?? run.messageTs,
		shutdownController,
		threadKey: runKey({ ...run, messageTs: run.threadTs ?? run.messageTs }),
	});
	return controller;
}

export function abortSlackThreadRun(run: SlackAgentRun): boolean {
	const key = runKey({
		...run,
		messageTs: run.threadTs ?? run.messageTs ?? "thread",
	});
	let aborted = false;
	for (const active of activeRuns.values()) {
		if (
			active.threadKey === key &&
			Number(active.requestTs) <= Number(run.requestTs ?? run.messageTs ?? 0)
		) {
			active.controller.abort("stop");
			aborted = true;
		}
	}
	return aborted;
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
		const active = activeRuns.get(key);
		if (!active) {
			continue;
		}
		active.controller.abort();
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
	for (const { controller, shutdownController } of activeRuns.values()) {
		controller.abort(reason);
		shutdownController.abort(reason);
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
