import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { SlackProvider } from "../../providers/slack";
import type { NotificationPayload } from "../../types";

const originalFetch = globalThis.fetch;
let fetchCalls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
	fetchCalls = [];
	globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
		fetchCalls.push({ url: String(url), init: init! });
		return Promise.resolve(new Response("ok", { status: 200 }));
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const WEBHOOK_URL = "https://hooks.slack.com/test";

const basePayload: NotificationPayload = {
	title: "Test Alert",
	message: "Something happened",
};

describe("SlackProvider", () => {
	test("posts to configured webhook URL", async () => {
		const provider = new SlackProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);
		expect(fetchCalls).toHaveLength(1);
		expect(fetchCalls[0].url).toBe(WEBHOOK_URL);
	});

	test("sends POST with application/json content-type", async () => {
		const provider = new SlackProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);
		expect(fetchCalls[0].init.method).toBe("POST");
		const headers = fetchCalls[0].init.headers as Record<string, string>;
		expect(headers["Content-Type"]).toBe("application/json");
	});

	test("formats payload with header and section blocks", async () => {
		const provider = new SlackProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.text).toBe("Test Alert");
		expect(body.blocks).toBeArray();
		expect(body.blocks[0]).toMatchObject({
			type: "header",
			text: { type: "plain_text", text: "Test Alert" },
		});
		expect(body.blocks[1]).toMatchObject({
			type: "section",
			text: { type: "mrkdwn", text: "Something happened" },
		});
	});

	test("renders metadata as section fields", async () => {
		const provider = new SlackProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({
			...basePayload,
			metadata: { foo: "bar", count: 42 },
		});
		const body = JSON.parse(fetchCalls[0].init.body as string);
		const metadataBlock = body.blocks.find(
			(b: { type: string; fields?: unknown[] }) => b.type === "section" && b.fields
		);
		expect(metadataBlock).toBeDefined();
		expect(metadataBlock.fields).toEqual(
			expect.arrayContaining([
				{ type: "mrkdwn", text: "*foo*\nbar" },
				{ type: "mrkdwn", text: "*count*\n42" },
			])
		);
	});

	test("adds priority context block for non-normal priority", async () => {
		const provider = new SlackProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({ ...basePayload, priority: "urgent" });
		const body = JSON.parse(fetchCalls[0].init.body as string);
		const contextBlock = body.blocks.find((b: { type: string }) => b.type === "context");
		expect(contextBlock).toBeDefined();
		expect(contextBlock.elements[0].text).toContain("URGENT");
	});

	test("omits priority context block for normal priority", async () => {
		const provider = new SlackProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({ ...basePayload, priority: "normal" });
		const body = JSON.parse(fetchCalls[0].init.body as string);
		const contextBlock = body.blocks.find((b: { type: string }) => b.type === "context");
		expect(contextBlock).toBeUndefined();
	});

	test("includes optional config in payload", async () => {
		const provider = new SlackProvider({
			webhookUrl: WEBHOOK_URL,
			channel: "#alerts",
			username: "AlertBot",
			iconEmoji: ":warning:",
		});
		await provider.send(basePayload);
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.channel).toBe("#alerts");
		expect(body.username).toBe("AlertBot");
		expect(body.icon_emoji).toBe(":warning:");
	});

	test("returns success result on 200", async () => {
		const provider = new SlackProvider({ webhookUrl: WEBHOOK_URL });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(true);
		expect(result.channel).toBe("slack");
	});

	test("returns error on non-ok response", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response("error", { status: 500, statusText: "Internal Server Error" }))
		) as typeof fetch;
		const provider = new SlackProvider({ webhookUrl: WEBHOOK_URL });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(false);
		expect(result.channel).toBe("slack");
		expect(result.error).toContain("500");
	});

	test("returns error when webhook URL is empty", async () => {
		const provider = new SlackProvider({ webhookUrl: "" });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(false);
		expect(result.error).toContain("not configured");
		expect(fetchCalls).toHaveLength(0);
	});
});
