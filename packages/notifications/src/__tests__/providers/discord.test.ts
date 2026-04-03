import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { DiscordProvider } from "../../providers/discord";
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

const WEBHOOK_URL = "https://discord.com/api/webhooks/test";

const basePayload: NotificationPayload = {
	title: "Test Alert",
	message: "Something happened",
};

describe("DiscordProvider", () => {
	test("posts to configured webhook URL", async () => {
		const provider = new DiscordProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);
		expect(fetchCalls).toHaveLength(1);
		expect(fetchCalls[0].url).toBe(WEBHOOK_URL);
	});

	test("sends POST with application/json content-type", async () => {
		const provider = new DiscordProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);
		expect(fetchCalls[0].init.method).toBe("POST");
		const headers = fetchCalls[0].init.headers as Record<string, string>;
		expect(headers["Content-Type"]).toBe("application/json");
	});

	test("formats payload with embed containing title, description, and timestamp", async () => {
		const provider = new DiscordProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.embeds).toBeArray();
		expect(body.embeds).toHaveLength(1);
		expect(body.embeds[0].title).toBe("Test Alert");
		expect(body.embeds[0].description).toBe("Something happened");
		expect(body.embeds[0].timestamp).toBeDefined();
	});

	test("sets embed color based on priority", async () => {
		const provider = new DiscordProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({ ...basePayload, priority: "urgent" });
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.embeds[0].color).toBe(0xe74c3c);
	});

	test("uses green color for normal priority", async () => {
		const provider = new DiscordProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({ ...basePayload, priority: "normal" });
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.embeds[0].color).toBe(0x57f287);
	});

	test("defaults to normal (green) when priority is omitted", async () => {
		const provider = new DiscordProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.embeds[0].color).toBe(0x57f287);
	});

	test("renders metadata as embed fields", async () => {
		const provider = new DiscordProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({
			...basePayload,
			metadata: { foo: "bar", count: 42 },
		});
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.embeds[0].fields).toEqual(
			expect.arrayContaining([
				{ name: "foo", value: "bar", inline: true },
				{ name: "count", value: "42", inline: true },
			])
		);
	});

	test("includes optional config in payload", async () => {
		const provider = new DiscordProvider({
			webhookUrl: WEBHOOK_URL,
			username: "AlertBot",
			avatarUrl: "https://example.com/avatar.png",
		});
		await provider.send(basePayload);
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.username).toBe("AlertBot");
		expect(body.avatar_url).toBe("https://example.com/avatar.png");
	});

	test("returns success result on 200", async () => {
		const provider = new DiscordProvider({ webhookUrl: WEBHOOK_URL });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(true);
		expect(result.channel).toBe("discord");
	});

	test("returns error on non-ok response", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response("error", { status: 429, statusText: "Too Many Requests" }))
		) as typeof fetch;
		const provider = new DiscordProvider({ webhookUrl: WEBHOOK_URL });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(false);
		expect(result.channel).toBe("discord");
		expect(result.error).toContain("429");
	});

	test("returns error when webhook URL is empty", async () => {
		const provider = new DiscordProvider({ webhookUrl: "" });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(false);
		expect(result.error).toContain("not configured");
		expect(fetchCalls).toHaveLength(0);
	});
});
