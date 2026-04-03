import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	sendSlackWebhook,
	sendDiscordWebhook,
	sendEmail,
	sendWebhook,
	sendTeamsWebhook,
	sendTelegramMessage,
	sendGoogleChatWebhook,
} from "../helpers";
import type { NotificationPayload } from "../types";

const originalFetch = globalThis.fetch;
let fetchCalls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
	fetchCalls = [];
	globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
		fetchCalls.push({ url: String(url), init: init! });
		return Promise.resolve(
			new Response(JSON.stringify({ ok: true }), { status: 200 })
		);
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const basePayload: NotificationPayload = {
	title: "Test Alert",
	message: "Something happened",
};

describe("sendSlackWebhook", () => {
	test("sends to correct URL and returns success", async () => {
		const result = await sendSlackWebhook("https://slack.test", basePayload);
		expect(result.success).toBe(true);
		expect(result.channel).toBe("slack");
		expect(fetchCalls[0].url).toBe("https://slack.test");
	});

	test("passes options through to provider", async () => {
		await sendSlackWebhook("https://slack.test", basePayload, {
			channel: "#alerts",
			username: "Bot",
			iconEmoji: ":robot:",
		});
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.channel).toBe("#alerts");
		expect(body.username).toBe("Bot");
		expect(body.icon_emoji).toBe(":robot:");
	});
});

describe("sendDiscordWebhook", () => {
	test("sends to correct URL and returns success", async () => {
		const result = await sendDiscordWebhook("https://discord.test", basePayload);
		expect(result.success).toBe(true);
		expect(result.channel).toBe("discord");
		expect(fetchCalls[0].url).toBe("https://discord.test");
	});
});

describe("sendEmail", () => {
	test("calls sendEmailAction with payload including to", async () => {
		const sendEmailAction = mock(async () => ({ id: "msg_1" }));
		const result = await sendEmail(
			sendEmailAction,
			{ ...basePayload, to: "user@test.com" },
		);
		expect(result.success).toBe(true);
		expect(result.channel).toBe("email");
		expect(sendEmailAction).toHaveBeenCalledTimes(1);
	});
});

describe("sendWebhook", () => {
	test("sends to correct URL and returns success", async () => {
		const result = await sendWebhook("https://webhook.test", basePayload);
		expect(result.success).toBe(true);
		expect(result.channel).toBe("webhook");
		expect(fetchCalls[0].url).toBe("https://webhook.test");
	});

	test("applies transformPayloadAction", async () => {
		await sendWebhook("https://webhook.test", basePayload, {
			transformPayloadAction: (p) => ({ custom: p.title }),
		});
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body).toEqual({ custom: "Test Alert" });
	});
});

describe("sendTeamsWebhook", () => {
	test("sends to correct URL and returns success", async () => {
		const result = await sendTeamsWebhook("https://teams.test", basePayload);
		expect(result.success).toBe(true);
		expect(result.channel).toBe("teams");
		expect(fetchCalls[0].url).toBe("https://teams.test");
	});
});

describe("sendTelegramMessage", () => {
	test("sends to Telegram Bot API with correct token and chatId", async () => {
		const result = await sendTelegramMessage("123:ABC", "456", basePayload);
		expect(result.success).toBe(true);
		expect(result.channel).toBe("telegram");
		expect(fetchCalls[0].url).toBe("https://api.telegram.org/bot123:ABC/sendMessage");
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.chat_id).toBe("456");
	});
});

describe("sendGoogleChatWebhook", () => {
	test("sends to correct URL and returns success", async () => {
		const result = await sendGoogleChatWebhook("https://chat.test", basePayload);
		expect(result.success).toBe(true);
		expect(result.channel).toBe("google-chat");
		expect(fetchCalls[0].url).toBe("https://chat.test");
	});
});
