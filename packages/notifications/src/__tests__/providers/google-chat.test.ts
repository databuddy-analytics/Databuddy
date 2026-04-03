import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { GoogleChatProvider } from "../../providers/google-chat";
import type { NotificationPayload } from "../../types";

const originalFetch = globalThis.fetch;
let fetchCalls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
	fetchCalls = [];
	globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
		fetchCalls.push({ url: String(url), init: init! });
		return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const WEBHOOK_URL = "https://chat.googleapis.com/v1/spaces/test/messages";

const basePayload: NotificationPayload = {
	title: "Test Alert",
	message: "Something happened",
};

describe("GoogleChatProvider", () => {
	test("posts to configured webhook URL", async () => {
		const provider = new GoogleChatProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);
		expect(fetchCalls).toHaveLength(1);
		expect(fetchCalls[0].url).toBe(WEBHOOK_URL);
	});

	test("sends POST with application/json content-type", async () => {
		const provider = new GoogleChatProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);
		expect(fetchCalls[0].init.method).toBe("POST");
		const headers = fetchCalls[0].init.headers as Record<string, string>;
		expect(headers["Content-Type"]).toBe("application/json");
	});

	test("formats payload with cards array containing header", async () => {
		const provider = new GoogleChatProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.cards).toBeArray();
		expect(body.cards).toHaveLength(1);
		expect(body.cards[0].header.title).toBe("Test Alert");
	});

	test("card section contains message as textParagraph", async () => {
		const provider = new GoogleChatProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);
		const body = JSON.parse(fetchCalls[0].init.body as string);
		const widgets = body.cards[0].sections[0].widgets;
		expect(widgets[0]).toMatchObject({
			textParagraph: { text: "Something happened" },
		});
	});

	test("adds priority subtitle for non-normal priority", async () => {
		const provider = new GoogleChatProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({ ...basePayload, priority: "urgent" });
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.cards[0].header.subtitle).toContain("URGENT");
	});

	test("omits priority subtitle for normal priority", async () => {
		const provider = new GoogleChatProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({ ...basePayload, priority: "normal" });
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.cards[0].header.subtitle).toBeUndefined();
	});

	test("renders metadata as keyValue widgets", async () => {
		const provider = new GoogleChatProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({
			...basePayload,
			metadata: { region: "us-east-1", status: "critical" },
		});
		const body = JSON.parse(fetchCalls[0].init.body as string);
		const widgets = body.cards[0].sections[0].widgets;
		const keyValueWidgets = widgets.filter((w: { keyValue?: unknown }) => w.keyValue);
		expect(keyValueWidgets).toHaveLength(2);
		expect(keyValueWidgets).toEqual(
			expect.arrayContaining([
				{ keyValue: { topLabel: "region", content: "us-east-1" } },
				{ keyValue: { topLabel: "status", content: "critical" } },
			])
		);
	});

	test("returns success result on 200", async () => {
		const provider = new GoogleChatProvider({ webhookUrl: WEBHOOK_URL });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(true);
		expect(result.channel).toBe("google-chat");
	});

	test("returns error on non-ok response", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response("error", { status: 500, statusText: "Internal Server Error" }))
		) as typeof fetch;
		const provider = new GoogleChatProvider({ webhookUrl: WEBHOOK_URL });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(false);
		expect(result.error).toContain("500");
	});

	test("returns error when webhook URL is empty", async () => {
		const provider = new GoogleChatProvider({ webhookUrl: "" });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(false);
		expect(result.error).toContain("not configured");
		expect(fetchCalls).toHaveLength(0);
	});
});
