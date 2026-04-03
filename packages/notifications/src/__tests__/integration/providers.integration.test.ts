import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { NotificationClient } from "../../client";
import { DiscordProvider } from "../../providers/discord";
import { EmailProvider } from "../../providers/email";
import { GoogleChatProvider } from "../../providers/google-chat";
import { SlackProvider } from "../../providers/slack";
import { TeamsProvider } from "../../providers/teams";
import { WebhookProvider } from "../../providers/webhook";
import type { EmailPayload, NotificationPayload } from "../../types";
import { WebhookReceiver } from "./webhook-receiver";

let receiver: WebhookReceiver;
let baseUrl: string;

const basePayload: NotificationPayload = {
	title: "Integration Test",
	message: "Testing real HTTP",
	priority: "high",
	metadata: { env: "test" },
};

beforeAll(async () => {
	receiver = new WebhookReceiver();
	const port = await receiver.start();
	baseUrl = `http://localhost:${port}`;
});

afterAll(() => {
	receiver.stop();
});

beforeEach(() => {
	receiver.clear();
});

describe("Integration: Slack", () => {
	test("sends correct HTTP request", async () => {
		const provider = new SlackProvider({ webhookUrl: baseUrl });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(true);
		const req = receiver.getLastRequest();
		expect(req).toBeDefined();
		expect(req!.method).toBe("POST");
		expect(req!.headers["content-type"]).toBe("application/json");
		const body = req!.body as { blocks: unknown[]; text: string };
		expect(body.text).toBe("Integration Test");
		expect(body.blocks).toBeArray();
	});
});

describe("Integration: Discord", () => {
	test("sends correct HTTP request with embeds", async () => {
		const provider = new DiscordProvider({ webhookUrl: baseUrl });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(true);
		const req = receiver.getLastRequest();
		const body = req!.body as { embeds: { title: string; color: number; fields: unknown[] }[] };
		expect(body.embeds).toHaveLength(1);
		expect(body.embeds[0].title).toBe("Integration Test");
		expect(body.embeds[0].color).toBe(0xf39c12);
		expect(body.embeds[0].fields).toBeArray();
	});
});

describe("Integration: Teams", () => {
	test("sends Adaptive Card", async () => {
		const provider = new TeamsProvider({ webhookUrl: baseUrl });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(true);
		const req = receiver.getLastRequest();
		const body = req!.body as { type: string; attachments: { contentType: string; content: { type: string } }[] };
		expect(body.type).toBe("message");
		expect(body.attachments[0].contentType).toBe("application/vnd.microsoft.card.adaptive");
		expect(body.attachments[0].content.type).toBe("AdaptiveCard");
	});
});

describe("Integration: Google Chat", () => {
	test("sends card format", async () => {
		const provider = new GoogleChatProvider({ webhookUrl: baseUrl });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(true);
		const req = receiver.getLastRequest();
		const body = req!.body as { cards: { header: { title: string }; sections: unknown[] }[] };
		expect(body.cards).toHaveLength(1);
		expect(body.cards[0].header.title).toBe("Integration Test");
		expect(body.cards[0].sections).toBeArray();
	});
});

describe("Integration: Webhook", () => {
	test("sends with custom method", async () => {
		const provider = new WebhookProvider({ url: baseUrl, method: "PUT" });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(true);
		const req = receiver.getLastRequest();
		expect(req!.method).toBe("PUT");
	});

	test("applies transformPayloadAction", async () => {
		const provider = new WebhookProvider({
			url: baseUrl,
			transformPayloadAction: (p) => ({ custom: p.title }),
		});
		await provider.send(basePayload);
		const req = receiver.getLastRequest();
		expect(req!.body).toEqual({ custom: "Integration Test" });
	});
});

describe("Integration: Email", () => {
	test("calls injected function with correct payload", async () => {
		const calls: EmailPayload[] = [];
		const provider = new EmailProvider({
			sendEmailAction: async (payload) => {
				calls.push(payload);
			},
			defaultTo: "test@example.com",
		});
		const result = await provider.send(basePayload);
		expect(result.success).toBe(true);
		expect(calls).toHaveLength(1);
		expect(calls[0].subject).toBe("Integration Test");
		expect(calls[0].to).toBe("test@example.com");
	});
});

describe("Integration: NotificationClient multi-channel", () => {
	test("sends to multiple channels in parallel", async () => {
		const client = new NotificationClient({
			slack: { webhookUrl: baseUrl },
			discord: { webhookUrl: baseUrl },
			defaultChannels: ["slack", "discord"],
		});
		const results = await client.send(basePayload);
		expect(results).toHaveLength(2);
		expect(results.every((r) => r.success)).toBe(true);
		expect(receiver.getRequests()).toHaveLength(2);
	});
});

describe("Integration: Retry over HTTP", () => {
	test("retries on 500 and succeeds on second attempt", async () => {
		receiver.failNext(1);
		const provider = new SlackProvider({
			webhookUrl: baseUrl,
			retries: 1,
			retryDelay: 10,
		});
		const result = await provider.send(basePayload);
		expect(result.success).toBe(true);
		expect(receiver.getRequests()).toHaveLength(2);
	});
});

describe("Integration: Timeout", () => {
	test("times out on slow response", async () => {
		receiver.setResponseDelay(500);
		const provider = new SlackProvider({
			webhookUrl: baseUrl,
			timeout: 50,
		});
		const result = await provider.send(basePayload);
		expect(result.success).toBe(false);
		expect(result.error).toContain("timed out");
	});
});
