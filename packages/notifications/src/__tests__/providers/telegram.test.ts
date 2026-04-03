import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { TelegramProvider } from "../../providers/telegram";
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

const basePayload: NotificationPayload = {
	title: "Test Alert",
	message: "Something happened",
};

describe("TelegramProvider", () => {
	test("posts to correct Telegram Bot API URL", async () => {
		const provider = new TelegramProvider({ botToken: "123:ABC", chatId: "456" });
		await provider.send(basePayload);
		expect(fetchCalls).toHaveLength(1);
		expect(fetchCalls[0].url).toBe("https://api.telegram.org/bot123:ABC/sendMessage");
	});

	test("sends HTML-formatted text with title in bold", async () => {
		const provider = new TelegramProvider({ botToken: "123:ABC", chatId: "456" });
		await provider.send(basePayload);
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.chat_id).toBe("456");
		expect(body.parse_mode).toBe("HTML");
		expect(body.text).toContain("<b>Test Alert</b>");
		expect(body.text).toContain("Something happened");
	});

	test("adds emoji prefix for urgent priority", async () => {
		const provider = new TelegramProvider({ botToken: "123:ABC", chatId: "456" });
		await provider.send({ ...basePayload, priority: "urgent" });
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.text).toContain("🔴 URGENT");
	});

	test("adds emoji prefix for high priority", async () => {
		const provider = new TelegramProvider({ botToken: "123:ABC", chatId: "456" });
		await provider.send({ ...basePayload, priority: "high" });
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.text).toContain("🟠 HIGH");
	});

	test("no emoji prefix for normal priority", async () => {
		const provider = new TelegramProvider({ botToken: "123:ABC", chatId: "456" });
		await provider.send({ ...basePayload, priority: "normal" });
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.text).not.toContain("🔴");
		expect(body.text).not.toContain("🟠");
		expect(body.text).not.toContain("🔵");
	});

	test("renders metadata as bold key-value pairs", async () => {
		const provider = new TelegramProvider({ botToken: "123:ABC", chatId: "456" });
		await provider.send({
			...basePayload,
			metadata: { region: "us-east-1" },
		});
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.text).toContain("<b>region:</b> us-east-1");
	});

	test("escapes HTML in title and message", async () => {
		const provider = new TelegramProvider({ botToken: "123:ABC", chatId: "456" });
		await provider.send({
			title: "Alert <critical>",
			message: "Value > threshold & rising",
		});
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.text).toContain("&lt;critical&gt;");
		expect(body.text).toContain("&gt; threshold &amp; rising");
	});

	test("disables web page preview", async () => {
		const provider = new TelegramProvider({ botToken: "123:ABC", chatId: "456" });
		await provider.send(basePayload);
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.disable_web_page_preview).toBe(true);
	});

	test("returns success result on 200", async () => {
		const provider = new TelegramProvider({ botToken: "123:ABC", chatId: "456" });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(true);
		expect(result.channel).toBe("telegram");
	});

	test("returns error on non-ok response", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response("error", { status: 403, statusText: "Forbidden" }))
		) as typeof fetch;
		const provider = new TelegramProvider({ botToken: "123:ABC", chatId: "456" });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(false);
		expect(result.error).toContain("403");
	});

	test("returns error when botToken or chatId missing", async () => {
		const provider = new TelegramProvider({ botToken: "", chatId: "" });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(false);
		expect(result.error).toContain("required");
		expect(fetchCalls).toHaveLength(0);
	});
});
