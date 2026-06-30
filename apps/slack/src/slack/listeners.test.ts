import { describe, expect, it } from "bun:test";
import type { App } from "@slack/bolt";
import type { DatabuddyAgentClient, SlackAgentRun } from "@/agent/agent-client";
import type { SlackInstallationServices } from "@/slack/installations";
import { registerSlackListeners } from "@/slack/listeners";
import { SLACK_COPY } from "@/slack/messages";
import type { SlackThreadReplyGate } from "@/slack/thread-relevance";
import type {
	SlackFollowUpQueueResult,
	SlackThreadQueueStore,
} from "@/slack/thread-queue";

type Handler = (input: Record<string, unknown>) => Promise<void>;

class FakeSlackApp {
	commands = new Map<string, Handler>();
	events = new Map<string, Handler>();
	messages: Handler[] = [];

	assistant(value: unknown) {
		this.events.set("assistant", value as Handler);
	}

	command(name: string, handler: Handler) {
		this.commands.set(name, handler);
	}

	event(name: string, handler: Handler) {
		this.events.set(name, handler);
	}

	message(handler: Handler) {
		this.messages.push(handler);
	}
}

function createClient({
	channelInfo = async () => ({
		ok: true,
		channel: { is_ext_shared: false },
	}),
}: {
	channelInfo?: (
		options: Record<string, unknown>
	) => Promise<Record<string, unknown>>;
} = {}) {
	const apiCalls: Array<{ method: string; options: Record<string, unknown> }> = [];
	const reactionAdds: Record<string, unknown>[] = [];
	return {
		apiCalls,
		client: {
			chat: {
				appendStream: async (options: Record<string, unknown>) => {
					apiCalls.push({ method: "chat.appendStream", options });
					return { ok: true };
				},
				startStream: async (options: Record<string, unknown>) => {
					apiCalls.push({ method: "chat.startStream", options });
					return { ok: true, ts: "response_ts" };
				},
				stopStream: async (options: Record<string, unknown>) => {
					apiCalls.push({ method: "chat.stopStream", options });
					return { ok: true };
				},
			},
			conversations: {
				history: async (options: Record<string, unknown>) => {
					apiCalls.push({ method: "conversations.history", options });
					return { ok: true, messages: [] };
				},
				info: async (options: Record<string, unknown>) => {
					apiCalls.push({ method: "conversations.info", options });
					return channelInfo(options);
				},
				replies: async (options: Record<string, unknown>) => {
					apiCalls.push({ method: "conversations.replies", options });
					return { ok: true, messages: [] };
				},
			},
			reactions: {
				add: async (options: Record<string, unknown>) => {
					reactionAdds.push(options);
				},
			},
		},
		reactionAdds,
	};
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

function createInstallations(
	overrides: Partial<SlackInstallationServices> = {}
): SlackInstallationServices {
	return {
		bindChannel: async () => ({ message: SLACK_COPY.bindSuccess, ok: true }),
		getChannelReadiness: async () => ({ message: "", ok: true }),
		getTeamContext: async () => ({
			integrationId: "int_123",
			organizationId: "org_123",
		}),
		...overrides,
	};
}

function createQueue(
	overrides: Partial<SlackThreadQueueStore> = {}
): SlackThreadQueueStore & {
	enqueuedRuns: SlackAgentRun[];
	removedMessages: Array<{ channelId: string; messageTs: string; teamId?: string }>;
} {
	const enqueuedRuns: SlackAgentRun[] = [];
	const removedMessages: Array<{
		channelId: string;
		messageTs: string;
		teamId?: string;
	}> = [];

	return {
		enqueuedRuns,
		removedMessages,
		drain: async () => [],
		enqueue: async (run) => {
			enqueuedRuns.push(run);
			return { ok: true, queuedCount: enqueuedRuns.length };
		},
		isEngaged: async () => true,
		markEngaged: async () => undefined,
		release: async () => undefined,
		removeDeletedFollowUp: async (ref) => {
			removedMessages.push(ref);
			return true;
		},
		tryAcquire: async () => true,
		...overrides,
	};
}

const logger = {
	error: () => undefined,
	warn: () => undefined,
};

function registerFakeSlackListeners(
	app: FakeSlackApp,
	agent: Pick<DatabuddyAgentClient, "stream">,
	installations: SlackInstallationServices,
	queue: SlackThreadQueueStore,
	threadReplyGate?: SlackThreadReplyGate
): void {
	registerSlackListeners(
		app as unknown as App,
		agent,
		installations,
		queue,
		threadReplyGate
	);
}

describe("Slack listeners", () => {
	it("auto-connects Slack Connect mentions from the installed workspace", async () => {
		const app = new FakeSlackApp();
		const { agent, runs } = createAgent();
		const queue = createQueue();
		const readinessCalls: unknown[] = [];
		const { client } = createClient({
			channelInfo: async () => ({
				channel: { is_ext_shared: true, name: "partner-launch" },
				ok: true,
			}),
		});
		registerFakeSlackListeners(
			app,
			agent,
			createInstallations({
				getChannelReadiness: async (input) => {
					readinessCalls.push(input);
					return { autoBound: true, message: "", ok: true };
				},
			}),
			queue
		);

		await app.events.get("app_mention")?.({
			body: { is_ext_shared_channel: true },
			client,
			context: { botUserId: "UBOT", teamId: "T123" },
			event: {
				channel: "C123",
				event_ts: "171234.568",
				text: "<@UBOT> can you answer that for me",
				ts: "171234.568",
				type: "app_mention",
				user: "U123",
				user_team: "T123",
			},
			logger,
			say: async () => undefined,
		});

		expect(readinessCalls).toMatchObject([
			{ autoBind: true, channelId: "C123", teamId: "T123" },
		]);
		expect(runs).toMatchObject([
			{
				channelId: "C123",
				text: "can you answer that for me",
				trigger: "app_mention",
			},
		]);
	});

	it("explains Slack Connect workspace ownership for external mentions", async () => {
		const app = new FakeSlackApp();
		const { agent, runs } = createAgent();
		const queue = createQueue();
		const responses: unknown[] = [];
		const readinessCalls: unknown[] = [];
		const { client, reactionAdds } = createClient({
			channelInfo: async () => ({
				channel: { is_ext_shared: true, name: "partner-launch" },
				ok: true,
			}),
		});
		registerFakeSlackListeners(
			app,
			agent,
			createInstallations({
				getChannelReadiness: async (input) => {
					readinessCalls.push(input);
					return { message: "", ok: true };
				},
			}),
			queue
		);

		await app.events.get("app_mention")?.({
			body: { is_ext_shared_channel: true },
			client,
			context: { botUserId: "UBOT", teamId: "T123" },
			event: {
				channel: "C123",
				event_ts: "171234.568",
				text: "<@UBOT> can you answer that for me",
				ts: "171234.568",
				type: "app_mention",
				user: "UEXT",
				user_team: "T_EXT",
			},
			logger,
			say: async (message: unknown) => {
				responses.push(message);
			},
		});

		expect(readinessCalls).toEqual([]);
		expect(runs).toEqual([]);
		expect(queue.enqueuedRuns).toEqual([]);
		expect(reactionAdds).toEqual([]);
		expect(responses).toEqual([
			{
				text: SLACK_COPY.slackConnectExternalUser,
				thread_ts: "171234.568",
			},
		]);
	});

	it("ignores channel thread replies that Databuddy has not joined", async () => {
		const app = new FakeSlackApp();
		const { agent, runs } = createAgent();
		const queue = createQueue({ isEngaged: async () => false });
		const { client } = createClient();
		registerFakeSlackListeners(app, agent, createInstallations(), queue);

		await app.messages[0]?.({
			client,
			context: { teamId: "T123" },
			logger,
			message: {
				channel: "C123",
				channel_type: "channel",
				text: "also compare campaigns",
				thread_ts: "171234.000",
				ts: "171234.568",
				user: "U123",
			},
			say: async () => undefined,
		});

		expect(runs).toEqual([]);
		expect(queue.enqueuedRuns).toEqual([]);
	});

	it("lets app_mention handle threaded messages that mention Databuddy", async () => {
		const app = new FakeSlackApp();
		const { agent, runs } = createAgent();
		const queue = createQueue();
		const { client } = createClient();
		const threadReplyGate: SlackThreadReplyGate = {
			shouldReply: async () => {
				throw new Error("message event should not reach the thread reply gate");
			},
		};
		registerFakeSlackListeners(
			app,
			agent,
			createInstallations(),
			queue,
			threadReplyGate
		);

		await app.messages[0]?.({
			client,
			context: { botUserId: "UBOT", teamId: "T123" },
			logger,
			message: {
				channel: "C123",
				channel_type: "channel",
				client_msg_id: "client-message-id",
				text: "whats up <@UBOT>",
				thread_ts: "171234.000",
				ts: "171234.568",
				user: "U123",
			},
			say: async () => undefined,
		});

		expect(runs).toEqual([]);
		expect(queue.enqueuedRuns).toEqual([]);
	});

	it("queues engaged thread follow-ups when another response is active", async () => {
		const app = new FakeSlackApp();
		const { agent, runs } = createAgent();
		const queue = createQueue({ tryAcquire: async () => false });
		const { client } = createClient();
		const threadReplyGate: SlackThreadReplyGate = {
			shouldReply: async () => ({
				confidence: 0.9,
				reason: "direct_request",
				shouldReply: true,
				source: "model",
			}),
		};
		registerFakeSlackListeners(
			app,
			agent,
			createInstallations(),
			queue,
			threadReplyGate
		);

		await app.messages[0]?.({
			client,
			context: { teamId: "T123" },
			logger,
			message: {
				channel: "C123",
				channel_type: "channel",
				text: "also compare campaigns",
				thread_ts: "171234.000",
				ts: "171234.568",
				user: "U123",
			},
			say: async () => undefined,
		});

		expect(runs).toEqual([]);
		expect(queue.enqueuedRuns).toMatchObject([
			{
				channelId: "C123",
				messageTs: "171234.568",
				text: "also compare campaigns",
				threadTs: "171234.000",
				trigger: "thread_follow_up",
			},
		]);
	});

	it("ignores engaged thread side chatter before running or queueing the agent", async () => {
		const app = new FakeSlackApp();
		const { agent, runs } = createAgent();
		const queue = createQueue({ tryAcquire: async () => false });
		const { client, reactionAdds } = createClient();
		const threadReplyGate: SlackThreadReplyGate = {
			shouldReply: async () => ({
				confidence: 0.95,
				reason: "side_chatter",
				shouldReply: false,
				source: "model",
			}),
		};
		registerFakeSlackListeners(
			app,
			agent,
			createInstallations(),
			queue,
			threadReplyGate
		);

		await app.messages[0]?.({
			client,
			context: { botUserId: "UBOT", teamId: "T123" },
			logger,
			message: {
				channel: "C123",
				channel_type: "channel",
				text: "He just call u",
				thread_ts: "171234.000",
				ts: "171234.568",
				user: "U123",
			},
			say: async () => undefined,
		});

		expect(runs).toEqual([]);
		expect(queue.enqueuedRuns).toEqual([]);
		expect(reactionAdds).toEqual([]);
	});

	it("removes queued follow-ups when Slack sends a message_deleted event", async () => {
		const app = new FakeSlackApp();
		const { agent } = createAgent();
		const queue = createQueue();
		const { client } = createClient();
		registerFakeSlackListeners(app, agent, createInstallations(), queue);

		await app.messages[0]?.({
			client,
			context: { teamId: "T123" },
			logger,
			message: {
				channel: "C123",
				deleted_ts: "171234.568",
				subtype: "message_deleted",
				ts: "171234.999",
			},
			say: async () => undefined,
		});

		expect(queue.removedMessages).toEqual([
			{ channelId: "C123", messageTs: "171234.568", teamId: "T123" },
		]);
	});

	it("responds to the help slash command", async () => {
		const app = new FakeSlackApp();
		const { agent } = createAgent();
		const queue = createQueue();
		const responses: unknown[] = [];
		registerFakeSlackListeners(app, agent, createInstallations(), queue);

		await app.commands.get("/databuddy-help")?.({
			ack: async () => undefined,
			respond: async (message: unknown) => {
				responses.push(message);
			},
		});

		expect(responses).toEqual([
			{ response_type: "ephemeral", text: SLACK_COPY.help },
		]);
	});
});
