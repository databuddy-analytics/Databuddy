import { describe, expect, it } from "bun:test";
import type { DatabuddyAgentClient, SlackAgentRun } from "@/agent/agent-client";
import { handleAgentRun } from "@/slack/run-handler";
import type { SlackAgentClient, SlackSay } from "@/slack/types";
import type {
	SlackFollowUpQueueResult,
	SlackThreadQueueStore,
} from "@/slack/thread-queue";

function createClient() {
	const chatCalls: Array<{ method: string; options: unknown }> = [];
	const reactionAdds: unknown[] = [];

	const client: SlackAgentClient = {
		chat: {
			appendStream: async (options) => {
				chatCalls.push({
					method: "chat.appendStream",
					options,
				});
				return { ok: true };
			},
			startStream: async (options) => {
				chatCalls.push({
					method: "chat.startStream",
					options,
				});
				return { ok: true, ts: "response_ts" };
			},
			stopStream: async (options) => {
				chatCalls.push({
					method: "chat.stopStream",
					options,
				});
				return { ok: true };
			},
		},
		conversations: {
			history: async () => ({ ok: true, messages: [] }),
			info: async () => ({ ok: true, channel: {} }),
			replies: async () => ({ ok: true, messages: [] }),
		},
		reactions: {
			add: async (options) => {
				reactionAdds.push(options);
				return { ok: true };
			},
		},
	};

	return { chatCalls, client, reactionAdds };
}

function createAgent() {
	const runs: SlackAgentRun[] = [];
	const agent: Pick<DatabuddyAgentClient, "stream"> = {
		async *stream(run: SlackAgentRun) {
			runs.push(run);
			yield "Done";
		},
	};

	return { agent, runs };
}

function createQueue(
	overrides: Partial<SlackThreadQueueStore> = {}
): SlackThreadQueueStore & {
	enqueuedRuns: SlackAgentRun[];
	releaseCount: number;
} {
	const enqueuedRuns: SlackAgentRun[] = [];
	const queue = {
		enqueuedRuns,
		releaseCount: 0,
		drain: async () => [],
		enqueue: async (run: SlackAgentRun): Promise<SlackFollowUpQueueResult> => {
			enqueuedRuns.push(run);
			return { ok: true, queuedCount: enqueuedRuns.length };
		},
		isEngaged: async () => true,
		markEngaged: async () => undefined,
		release: async () => {
			queue.releaseCount += 1;
		},
		removeDeletedFollowUp: async () => false,
		tryAcquire: async () => true,
		...overrides,
	};

	return queue;
}

const logger = {
	error: () => undefined,
	warn: () => undefined,
};

const say: SlackSay = async () => ({ ok: true, ts: "say_ts" });

function createRun(overrides: Partial<SlackAgentRun> = {}): SlackAgentRun {
	return {
		channelId: "C123",
		messageTs: "171234.568",
		teamId: "T123",
		text: "also compare campaigns",
		threadTs: "171234.000",
		trigger: "thread_follow_up",
		userId: "U123",
		...overrides,
	};
}

describe("Slack agent run handler", () => {
	it("queues behind an active thread without adding a processing reaction", async () => {
		const { agent, runs } = createAgent();
		const { chatCalls, client, reactionAdds } = createClient();
		const queue = createQueue({ tryAcquire: async () => false });

		await handleAgentRun({
			agent,
			client,
			logger,
			run: createRun(),
			say,
			threadQueue: queue,
		});

		expect(runs).toEqual([]);
		expect(queue.enqueuedRuns).toHaveLength(1);
		expect(reactionAdds).toEqual([]);
		expect(chatCalls).toEqual([]);
	});

	it("takes over queued follow-ups when the prior owner releases during handoff", async () => {
		const { agent, runs } = createAgent();
		const { chatCalls, client, reactionAdds } = createClient();
		let acquireAttempts = 0;
		let drained = false;
		const queue = createQueue({
			drain: async () => {
				if (drained) {
					return [];
				}
				drained = true;
				return [
					{
						messageTs: "171234.999",
						text: "can you answer this now?",
						userId: "U999",
					},
				];
			},
			tryAcquire: async () => {
				acquireAttempts += 1;
				return acquireAttempts > 1;
			},
		});

		await handleAgentRun({
			agent,
			client,
			logger,
			run: createRun(),
			say,
			threadQueue: queue,
		});

		expect(queue.enqueuedRuns).toHaveLength(1);
		expect(runs).toMatchObject([
			{
				messageTs: "171234.999",
				text: "can you answer this now?",
				trigger: "thread_follow_up",
				userId: "U999",
			},
		]);
		expect(reactionAdds).toMatchObject([{ timestamp: "171234.999" }]);
		expect(chatCalls.map((call) => call.method)).toContain("chat.startStream");
		expect(queue.releaseCount).toBe(1);
	});
});
