import { describe, expect, it } from "bun:test";
import type { App } from "@slack/bolt";
import type { DatabuddyAgentClient, SlackAgentRun } from "@/agent/agent-client";
import {
	cleanupSlackActiveRun,
	registerSlackActiveRun,
} from "@/slack/active-runs";
import type { SlackInstallationServices } from "@/slack/installations";
import {
	registerSlackListeners,
	type SlackInvestigationReplyHandler,
} from "@/slack/listeners";
import { SLACK_COPY, SLACK_SUGGESTED_PROMPTS } from "@/slack/messages";
import type { SlackThreadReplyGate } from "@/slack/thread-relevance";
import type { SlackThreadQueueStore } from "@/slack/thread-queue";

type Handler = (input: Record<string, unknown>) => Promise<void>;

class FakeSlackApp {
	actions = new Map<string, Handler>();
	assistantListener?: { userMessage: Handler[] };
	commands = new Map<string, Handler>();
	events = new Map<string, Handler>();
	messages: Handler[] = [];

	action(name: string, handler: Handler) {
		this.actions.set(name, handler);
	}

	assistant(value: { userMessage: Handler[] }) {
		this.assistantListener = value;
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
	const apiCalls: Array<{ method: string; options: Record<string, unknown> }> =
		[];
	const reactionAdds: Record<string, unknown>[] = [];
	return {
		apiCalls,
		client: {
			apiCall: async (
				method: string,
				options: Record<string, unknown> = {}
			) => {
				apiCalls.push({ method, options });
				return { ok: true, ts: "response_ts" };
			},
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
		resolve: async () => null,
		...overrides,
	};
}

function createQueue(
	overrides: Partial<SlackThreadQueueStore> = {}
): SlackThreadQueueStore & {
	enqueuedRuns: SlackAgentRun[];
	removedMessages: Array<{
		channelId: string;
		messageTs: string;
		teamId?: string;
	}>;
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
		stop: async () => undefined,
		isStopped: async () => false,
		renew: async () => true,
		enqueue: async (run) => {
			enqueuedRuns.push(run);
			return { ok: true, queuedCount: enqueuedRuns.length };
		},
		isEngaged: async () => true,
		markEngaged: async () => undefined,
		release: async () => true,
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
	threadReplyGate?: SlackThreadReplyGate,
	investigationReplyHandler: SlackInvestigationReplyHandler = async () => false
): void {
	registerSlackListeners(
		app as unknown as App,
		agent,
		installations,
		queue,
		threadReplyGate,
		investigationReplyHandler
	);
}

describe("Slack listeners", () => {
	it("stops assistant work without depending on title or status updates", async () => {
		const app = new FakeSlackApp();
		const { agent, runs } = createAgent();
		const { client } = createClient();
		let stopped = false;
		const queue = createQueue({
			stop: async () => {
				stopped = true;
			},
		});
		registerFakeSlackListeners(app, agent, createInstallations(), queue);
		const failCosmeticUpdate = async () => {
			throw new Error("Slack API unavailable");
		};
		await app.assistantListener?.userMessage[0]?.({
			client,
			context: { teamId: "T123" },
			logger,
			message: {
				channel: "D123",
				channel_type: "im",
				text: "stop",
				thread_ts: "171234.000",
				ts: "171234.568",
				type: "message",
				user: "U123",
			},
			say: async () => undefined,
			setStatus: failCosmeticUpdate,
			setTitle: failCosmeticUpdate,
		});
		expect(stopped).toBe(true);
		expect(runs).toHaveLength(0);
	});

	it("keeps the Slack assistant manifest aligned with its live prompts", async () => {
		const manifest = (await Bun.file(
			new URL("../../slack-app-manifest.json", import.meta.url)
		).json()) as {
			display_information: { description: string };
			features: {
				assistant_view: {
					assistant_description: string;
					suggested_prompts: Array<{ message: string; title: string }>;
				};
			};
		};

		expect(manifest.features.assistant_view.suggested_prompts).toEqual([
			...SLACK_SUGGESTED_PROMPTS,
		]);
		expect(manifest.display_information.description.toLowerCase()).toContain(
			"investigat"
		);
		expect(
			manifest.features.assistant_view.assistant_description.toLowerCase()
		).toContain("investigat");
	});

	it.each([
		{ bot_id: "BOTHER" },
		{ bot_profile: { id: "BOTHER" } },
	])("ignores mentions from other bots with %j", async (botIdentity) => {
		const app = new FakeSlackApp();
		const { agent, runs } = createAgent();
		const queue = createQueue();
		const responses: unknown[] = [];
		const readinessCalls: unknown[] = [];
		const investigationRuns: SlackAgentRun[] = [];
		const { apiCalls, client, reactionAdds } = createClient();
		registerFakeSlackListeners(
			app,
			agent,
			createInstallations({
				getChannelReadiness: async (input) => {
					readinessCalls.push(input);
					return { message: "", ok: true };
				},
			}),
			queue,
			undefined,
			async ({ run }) => {
				investigationRuns.push(run);
				return false;
			}
		);

		for (const text of ["<@UBOT>", "<@UBOT> show me traffic"]) {
			await app.events.get("app_mention")?.({
				body: {},
				client,
				context: { botUserId: "UBOT", teamId: "T123" },
				event: {
					...botIdentity,
					channel: "C123",
					text,
					ts: "171234.568",
					type: "app_mention",
					user: "UOTHERBOT",
				},
				logger,
				say: async (message: unknown) => {
					responses.push(message);
				},
			});
		}

		expect(runs).toEqual([]);
		expect(investigationRuns).toEqual([]);
		expect(readinessCalls).toEqual([]);
		expect(queue.enqueuedRuns).toEqual([]);
		expect(apiCalls).toEqual([]);
		expect(reactionAdds).toEqual([]);
		expect(responses).toEqual([]);
	});

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

	it("routes mentions in delivered investigation threads before the general agent", async () => {
		const app = new FakeSlackApp();
		const { agent, runs } = createAgent();
		const queue = createQueue();
		const { client } = createClient();
		const investigationRuns: SlackAgentRun[] = [];
		registerFakeSlackListeners(
			app,
			agent,
			createInstallations(),
			queue,
			undefined,
			async ({ run }) => {
				investigationRuns.push(run);
				return true;
			}
		);

		await app.events.get("app_mention")?.({
			body: {},
			client,
			context: { botUserId: "UBOT", teamId: "T123" },
			event: {
				channel: "C123",
				text: "<@UBOT> that deploy happened on Friday",
				thread_ts: "171234.000",
				ts: "171234.568",
				type: "app_mention",
				user: "U123",
			},
			logger,
			say: async () => undefined,
		});

		expect(investigationRuns).toMatchObject([
			{
				channelId: "C123",
				messageTs: "171234.568",
				text: "that deploy happened on Friday",
				threadTs: "171234.000",
				trigger: "app_mention",
			},
		]);
		expect(runs).toEqual([]);
	});

	it("routes plain investigation replies before engagement and relevance gates", async () => {
		const app = new FakeSlackApp();
		const { agent, runs } = createAgent();
		const queue = createQueue({
			isEngaged: async () => {
				throw new Error(
					"investigation replies do not use the generic thread gate"
				);
			},
		});
		const { client } = createClient();
		const investigationRuns: SlackAgentRun[] = [];
		registerFakeSlackListeners(
			app,
			agent,
			createInstallations(),
			queue,
			{
				shouldReply: async () => {
					throw new Error("investigation replies do not use relevance scoring");
				},
			},
			async ({ run }) => {
				investigationRuns.push(run);
				return true;
			}
		);

		await app.messages[0]?.({
			client,
			context: { botUserId: "UBOT", teamId: "T123" },
			logger,
			message: {
				channel: "C123",
				channel_type: "channel",
				text: "yes, payment means a completed charge",
				thread_ts: "171234.000",
				ts: "171234.568",
				user: "U123",
			},
			say: async () => undefined,
		});

		expect(investigationRuns).toHaveLength(1);
		expect(runs).toEqual([]);
		expect(queue.enqueuedRuns).toEqual([]);
	});

	it("blocks plain investigation replies from external Slack Connect users", async () => {
		const app = new FakeSlackApp();
		const { agent, runs } = createAgent();
		const queue = createQueue();
		const { client } = createClient();
		const responses: unknown[] = [];
		let investigationCalls = 0;
		registerFakeSlackListeners(
			app,
			agent,
			createInstallations(),
			queue,
			undefined,
			async () => {
				investigationCalls += 1;
				return true;
			}
		);

		await app.messages[0]?.({
			client,
			context: { botUserId: "UBOT", teamId: "T123" },
			logger,
			message: {
				channel: "C123",
				channel_type: "channel",
				text: "show me the customer data",
				thread_ts: "171234.000",
				ts: "171234.568",
				user: "UEXTERNAL",
				user_team: "TEXTERNAL",
			},
			say: async (message: unknown) => {
				responses.push(message);
			},
		});

		expect(investigationCalls).toBe(0);
		expect(runs).toEqual([]);
		expect(responses).toEqual([
			{
				text: SLACK_COPY.slackConnectExternalUser,
				thread_ts: "171234.000",
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
});

describe("Slack stop routing", () => {
	it("stops a known local run without an engagement marker and ignores unrelated threads", async () => {
		const app = new FakeSlackApp();
		const { agent, runs } = createAgent();
		const { client } = createClient();
		let stopped = 0;
		let replies = 0;
		const queue = createQueue({
			isEngaged: async () => false,
			stop: async () => {
				stopped++;
			},
		});
		registerFakeSlackListeners(app, agent, createInstallations(), queue);
		const run: SlackAgentRun = {
			channelId: "C123",
			messageTs: "171234.100",
			teamId: "T123",
			text: "Compare campaigns",
			threadTs: "171234.000",
			trigger: "thread_follow_up",
			userId: "U123",
		};
		const controller = new AbortController();
		registerSlackActiveRun(run, controller);
		try {
			for (const threadTs of ["171233.000", run.threadTs]) {
				await app.messages[0]?.({
					client,
					context: { botUserId: "UBOT", teamId: "T123" },
					logger,
					message: {
						channel: "C123",
						channel_type: "channel",
						text: "stop",
						thread_ts: threadTs,
						ts: threadTs === run.threadTs ? "171234.201" : "171234.200",
						user: "U123",
					},
					say: async () => {
						replies++;
					},
				});
				const expectedStops = threadTs === run.threadTs ? 1 : 0;
				expect(controller.signal.aborted).toBe(expectedStops === 1);
				expect(stopped).toBe(expectedStops);
				expect(replies).toBe(expectedStops);
			}
			expect(runs).toHaveLength(0);
			expect(queue.enqueuedRuns).toHaveLength(0);
		} finally {
			cleanupSlackActiveRun(run);
		}
	});

	it("handles stop before relevance and investigation continuation, while rejecting external speakers", async () => {
		const app = new FakeSlackApp();
		const { agent, runs } = createAgent();
		const { client } = createClient();
		const stops: SlackAgentRun[] = [];
		const queue = createQueue({
			stop: async (run) => {
				stops.push(run);
			},
		});
		registerFakeSlackListeners(
			app,
			agent,
			createInstallations(),
			queue,
			{
				shouldReply: async () => {
					throw new Error("Stop must bypass relevance");
				},
			},
			async () => {
				throw new Error("Stop must bypass investigation replies");
			}
		);
		for (const user_team of ["T123", "TEXTERNAL"]) {
			await app.messages[0]?.({
				client,
				context: { botUserId: "UBOT", teamId: "T123" },
				logger,
				message: {
					channel: "C123",
					channel_type: "channel",
					text: "stop",
					thread_ts: "171234.000",
					ts: user_team === "T123" ? "171234.568" : "171234.569",
					user: "U123",
					user_team,
				},
				say: async () => undefined,
			});
		}
		await app.events.get("app_mention")?.({
			body: {},
			client,
			context: { teamId: "T123" },
			logger,
			event: {
				channel: "C123",
				text: "<@UBOT> stop",
				thread_ts: "171234.000",
				ts: "171234.570",
				user: "U123",
			},
			say: async () => undefined,
		});
		expect(stops).toHaveLength(2);
		expect(runs).toHaveLength(0);
		expect(queue.enqueuedRuns).toHaveLength(0);
	});
});
