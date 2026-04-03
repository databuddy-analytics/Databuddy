import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { WebhookProvider } from "../../providers/webhook";
import type { NotificationPayload } from "../../types";

const originalFetch = globalThis.fetch;
let fetchCalls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
	fetchCalls = [];
	globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
		fetchCalls.push({ url: String(url), init: init! });
		return Promise.resolve(
			new Response(JSON.stringify({ received: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			})
		);
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const WEBHOOK_URL = "https://api.example.com/webhook";

const basePayload: NotificationPayload = {
	title: "Test Alert",
	message: "Something happened",
};

describe("WebhookProvider", () => {
	test("posts to configured URL", async () => {
		const provider = new WebhookProvider({ url: WEBHOOK_URL });
		await provider.send(basePayload);
		expect(fetchCalls).toHaveLength(1);
		expect(fetchCalls[0].url).toBe(WEBHOOK_URL);
	});

	test("defaults to POST method", async () => {
		const provider = new WebhookProvider({ url: WEBHOOK_URL });
		await provider.send(basePayload);
		expect(fetchCalls[0].init.method).toBe("POST");
	});

	test("uses configured HTTP method", async () => {
		const provider = new WebhookProvider({ url: WEBHOOK_URL, method: "PUT" });
		await provider.send(basePayload);
		expect(fetchCalls[0].init.method).toBe("PUT");
	});

	test("sends raw NotificationPayload as body by default", async () => {
		const provider = new WebhookProvider({ url: WEBHOOK_URL });
		await provider.send(basePayload);
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body).toMatchObject({
			title: "Test Alert",
			message: "Something happened",
		});
	});

	test("applies transformPayloadAction to body", async () => {
		const provider = new WebhookProvider({
			url: WEBHOOK_URL,
			transformPayloadAction: (p) => ({ text: `${p.title}: ${p.message}` }),
		});
		await provider.send(basePayload);
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body).toEqual({ text: "Test Alert: Something happened" });
	});

	test("includes custom headers", async () => {
		const provider = new WebhookProvider({
			url: WEBHOOK_URL,
			headers: { Authorization: "Bearer token123" },
		});
		await provider.send(basePayload);
		const headers = fetchCalls[0].init.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer token123");
		expect(headers["Content-Type"]).toBe("application/json");
	});

	test("omits body for GET method", async () => {
		const provider = new WebhookProvider({ url: WEBHOOK_URL, method: "GET" });
		await provider.send(basePayload);
		expect(fetchCalls[0].init.body).toBeUndefined();
	});

	test("returns success with parsed JSON response", async () => {
		const provider = new WebhookProvider({ url: WEBHOOK_URL });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(true);
		expect(result.channel).toBe("webhook");
		expect((result.response as { data: unknown }).data).toEqual({ received: true });
	});

	test("returns error on non-ok response", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response("bad", { status: 422, statusText: "Unprocessable Entity" }))
		) as typeof fetch;
		const provider = new WebhookProvider({ url: WEBHOOK_URL });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(false);
		expect(result.error).toContain("422");
	});

	test("returns error when URL is empty", async () => {
		const provider = new WebhookProvider({ url: "" });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(false);
		expect(result.error).toContain("not configured");
		expect(fetchCalls).toHaveLength(0);
	});
});
