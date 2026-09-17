import { describe, expect, it } from "bun:test";
import type { DatabuddyAgentClient, SlackAgentRun } from "@/agent/agent-client";
import { abortAllSlackActiveRuns } from "@/slack/active-runs";
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
		stop: async () => undefined,
		isStopped: async () => false,
		renew: async () => true,
		enqueue: async (run: SlackAgentRun): Promise<SlackFollowUpQueueResult> => {
			enqueuedRuns.push(run);
			return { ok: true, queuedCount: enqueuedRuns.length };
		},
		isEngaged: async () => true,
		markEngaged: async () => undefined,
		release: async () => {
			queue.releaseCount += 1;
			return true;
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

describe("Slack response control", () => {
	it("continues past four responses and drains an arrival during final handoff", async () => {
		const { agent, runs } = createAgent();
		const { client } = createClient();
		let batches = 0;
		let lateArrival = false;
		const queue = createQueue({
			drain: async () => {
				if (batches < 5 || lateArrival) {
					batches++;
					lateArrival = false;
					return [
						{
							messageTs: `171235.${batches}`,
							text: `follow-up ${batches}`,
							userId: batches % 2 ? "A" : "B",
						},
					];
				}
				return [];
			},
			release: async (_run, whenEmpty) => {
				if (whenEmpty && batches === 5) {
					lateArrival = true;
					return false;
				}
				return true;
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
		expect(runs).toHaveLength(7);
		expect(runs.slice(1).map((run) => run.userId)).toEqual([
			"A",
			"B",
			"A",
			"B",
			"A",
			"B",
		]);
		expect(runs.at(-1)?.text).toBe("follow-up 6");
	});

	it("surfaces coordination failure without running the model", async () => {
		const { agent, runs } = createAgent();
		const { client } = createClient();
		const replies: unknown[] = [];
		const queue = createQueue({
			tryAcquire: async () => {
				throw new Error("Redis down");
			},
		});
		await handleAgentRun({
			agent,
			client,
			logger,
			run: createRun(),
			say: async (message) => {
				replies.push(message);
				return { ok: true };
			},
			threadQueue: queue,
		});
		expect(runs).toHaveLength(0);
		expect(replies).toMatchObject([
			{ text: expect.stringContaining("couldn't safely process") },
		]);
	});

	it("interrupts a stalled model when another replica records stop", async () => {
		const { client } = createClient();
		let stopped = false;
		let signal: AbortSignal | undefined;
		const queue = createQueue({ isStopped: async () => stopped });
		const agent: Pick<DatabuddyAgentClient, "stream"> = {
			async *stream(_run, options) {
				signal = options?.abortSignal;
				stopped = true;
				await new Promise<void>((_resolve, reject) => {
					signal?.addEventListener(
						"abort",
						() => reject(new DOMException("Stopped", "AbortError")),
						{ once: true }
					);
				});
				yield "should never be sent";
			},
		};
		await handleAgentRun({
			agent,
			client,
			logger,
			run: createRun(),
			say,
			threadQueue: queue,
		});
		expect(signal?.aborted).toBe(true);
		expect(signal?.reason).toBe("stop");
	});

	it("treats stop as a control message without queueing or calling the model", async () => {
		const { agent, runs } = createAgent();
		const { client } = createClient();
		let stopRun: SlackAgentRun | undefined;
		const queue = createQueue({
			stop: async (run) => {
				stopRun = run;
			},
		});
		await handleAgentRun({
			agent,
			client,
			logger,
			run: createRun({ text: " STOP " }),
			say,
			threadQueue: queue,
		});
		expect(stopRun?.text).toBe(" STOP ");
		expect(runs).toHaveLength(0);
		expect(queue.enqueuedRuns).toHaveLength(0);
	});
});

it("processes a newer request queued while the stopped response is cleaning up", async () => {
	const { client } = createClient();
	const runs: SlackAgentRun[] = [];
	let pending: SlackAgentRun | undefined;
	let locked = false;
	let stoppedAt = 0;
	let started!: () => void;
	let finishCleanup!: () => void;
	const began = new Promise<void>((resolve) => {
		started = resolve;
	});
	const cleanup = new Promise<void>((resolve) => {
		finishCleanup = resolve;
	});
	const queue = createQueue({
		tryAcquire: async () => {
			if (locked) return false;
			locked = true;
			return true;
		},
		enqueue: async (run) => {
			pending = run;
			return { ok: true };
		},
		drain: async () => {
			const item = pending;
			pending = undefined;
			return item
				? [{ text: item.text, messageTs: item.messageTs, userId: item.userId }]
				: [];
		},
		release: async (_run, whenEmpty) => {
			if (whenEmpty && pending) return false;
			locked = false;
			return true;
		},
		stop: async (run) => {
			stoppedAt = Number(run.messageTs);
		},
		isStopped: async (run) => Number(run.messageTs) <= stoppedAt,
	});
	const agent: Pick<DatabuddyAgentClient, "stream"> = {
		async *stream(run, options) {
			runs.push(run);
			if (run.text === "initial") {
				started();
				await new Promise<void>((resolve) =>
					options?.abortSignal?.addEventListener("abort", () => resolve(), {
						once: true,
					})
				);
				await cleanup;
				throw new DOMException("Stopped", "AbortError");
			}
			yield "Done";
		},
	};
	const invoke = (run: SlackAgentRun) =>
		handleAgentRun({ agent, client, logger, run, say, threadQueue: queue });
	const active = invoke(
		createRun({ text: "initial", messageTs: "171234.100" })
	);
	await began;
	await invoke(createRun({ text: "stop", messageTs: "171234.200" }));
	await invoke(createRun({ text: "new question", messageTs: "171234.300" }));
	finishCleanup();
	await active;
	expect(runs.map((run) => run.text)).toEqual(["initial", "new question"]);
	expect(pending).toBeUndefined();
	expect(locked).toBe(false);
});

it("does not start queued work after shutdown interrupts a response", async () => {
	const { client } = createClient();
	const runs: SlackAgentRun[] = [];
	const queue = createQueue({
		drain: async () => [
			{ text: "must not start", userId: "A", messageTs: "171235.000" },
		],
	});
	const agent: Pick<DatabuddyAgentClient, "stream"> = {
		async *stream(run) {
			runs.push(run);
			abortAllSlackActiveRuns("shutdown");
			throw new DOMException("Shutdown", "AbortError");
			yield "unreachable";
		},
	};
	await handleAgentRun({
		agent,
		client,
		logger,
		run: createRun(),
		say,
		threadQueue: queue,
	});
	expect(runs).toHaveLength(1);
});
