import { expect, it } from "bun:test";
import { App, type Receiver } from "@slack/bolt";
import { createSlackEventDedupe } from "./event-dedupe";

const eventBody = (eventId = "EvTEST", teamId = "TTEST") => ({
	type: "event_callback",
	api_app_id: "ATEST",
	team_id: teamId,
	event_id: eventId,
	event: {
		type: "app_mention",
		user: "UTEST",
		channel: "CTEST",
		ts: "1700000000.000001",
		text: "<@UBOT> summarize traffic",
	},
});

function createApp() {
	const receiver: Receiver = {
		init: () => undefined,
		start: async () => undefined,
		stop: async () => undefined,
	};
	return new App({
		receiver,
		authorize: async () => ({
			botToken: "xoxb-test",
			botId: "BTEST",
			botUserId: "UBOT",
		}),
	});
}

it("handles a redelivered event only once across Bolt instances", async () => {
	let executions = 0;
	const seen = new Set<string>();
	const store = {
		set: async (key: string) => {
			if (seen.has(key)) {
				return null;
			}
			seen.add(key);
			return "OK" as const;
		},
	};
	const replicas = [createApp(), createApp()];
	for (const app of replicas) {
		app.use(createSlackEventDedupe(() => store));
		app.event("app_mention", async () => {
			executions++;
		});
	}
	await Promise.all(
		replicas.map((app) =>
			app.processEvent({ body: eventBody(), ack: async () => undefined })
		)
	);
	expect(executions).toBe(1);
	await replicas[1].processEvent({
		body: eventBody(),
		ack: async () => undefined,
		retryNum: 1,
	});
	expect(executions).toBe(1);
	for (const body of [eventBody("EvOTHER"), eventBody("EvTEST", "TOTHER")]) {
		await replicas[1].processEvent({ body, ack: async () => undefined });
	}
	expect(executions).toBe(3);
});

it("fails closed during an outage and keeps claims after handler failures", async () => {
	let unavailable = true;
	let executions = 0;
	let notifications = 0;
	let commands = 0;
	let stops = 0;
	let deletions = 0;
	const seen = new Set<string>();
	const errors: unknown[] = [];
	const app = createApp();
	app.error(async (error) => {
		errors.push(error);
	});
	app.use(async ({ client, next }) => {
		client.chat.postEphemeral = async () => {
			notifications++;
			return { ok: true };
		};
		await next();
	});
	app.use(
		createSlackEventDedupe(() => ({
			set: async (key) => {
				if (unavailable) {
					throw new Error("Redis unavailable");
				}
				if (seen.has(key)) {
					return null;
				}
				seen.add(key);
				return "OK";
			},
		}))
	);
	app.event("app_mention", async ({ event }) => {
		if (event.text === "<@UBOT> stop") {
			stops++;
			return;
		}
		executions++;
		throw new Error("Failure after an action was performed");
	});
	app.command("/databuddy-help", async ({ ack }) => {
		commands++;
		await ack();
	});
	app.event("message", async ({ event }) => {
		if (event.subtype === "message_deleted") {
			deletions++;
		}
	});
	const event = { body: eventBody(), ack: async () => undefined };
	await app.processEvent(event);
	expect(executions).toBe(0);
	expect(notifications).toBe(1);
	for (const botIdentity of [
		{ bot_id: "BOTHER" },
		{ bot_profile: { id: "BOTHER" } },
	]) {
		await app.processEvent({
			body: {
				...eventBody("EvBOT"),
				event: { ...eventBody().event, user: "UOTHERBOT", ...botIdentity },
			},
			ack: async () => undefined,
		});
	}
	expect(notifications).toBe(1);
	const stop = eventBody("EvSTOP");
	stop.event.text = "<@UBOT> stop";
	await app.processEvent({ body: stop, ack: async () => undefined });
	expect(stops).toBe(1);
	await app.processEvent({
		body: {
			...eventBody("EvUNADDRESSED"),
			event: { ...eventBody().event, type: "message", text: "Hi teammate" },
		},
		ack: async () => undefined,
	});
	expect(notifications).toBe(1);
	await app.processEvent({
		body: {
			...eventBody("EvDELETED"),
			event: {
				type: "message",
				channel: "CTEST",
				subtype: "message_deleted",
				deleted_ts: "1700000000.000001",
			},
		},
		ack: async () => undefined,
	});
	expect(deletions).toBe(1);
	await app.processEvent({
		body: {
			command: "/databuddy-help",
			channel_id: "CTEST",
			user_id: "UTEST",
			team_id: "TTEST",
			text: "",
		},
		ack: async () => undefined,
	});
	expect(commands).toBe(1);
	unavailable = false;
	await app.processEvent(event);
	await app.processEvent(event);
	expect(executions).toBe(1);
	expect(errors).toHaveLength(1);
});
