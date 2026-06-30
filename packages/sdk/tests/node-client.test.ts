import { afterEach, describe, expect, it, mock } from "bun:test";
import { Databuddy } from "../src/node/index";
import type { BatchEventInput } from "../src/node/types";

interface FetchCall {
	body: unknown;
	url: string;
}

const originalFetch = globalThis.fetch;

function jsonResponse(data: unknown): Response {
	return new Response(JSON.stringify(data), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

function parseBody(body: BodyInit | null | undefined): unknown {
	if (typeof body !== "string") {
		return body ?? null;
	}
	return JSON.parse(body);
}

function mockFetch(
	handler: (callNumber: number) => Response | Promise<Response>
): FetchCall[] {
	const calls: FetchCall[] = [];

	globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
		calls.push({
			url: typeof input === "string" ? input : input.toString(),
			body: parseBody(init?.body),
		});
		return handler(calls.length);
	}) as typeof fetch;

	return calls;
}

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("Databuddy Node client", () => {
	it("rejects blank API keys after trimming", () => {
		expect(() => new Databuddy({ apiKey: "   " })).toThrow("apiKey");
	});

	it("returns a failed flush result when track reaches the batch threshold", async () => {
		mockFetch(() => new Response("nope", { status: 500, statusText: "Server Error" }));

		const client = new Databuddy({ apiKey: "dbdy_test", batchSize: 1 });

		const result = await client.track({
			name: "signup",
			websiteId: "site_1",
		});

		expect(result.success).toBe(false);
		expect(result.error).toBe("HTTP 500: Server Error");
	});

	it("does not poison deduplication when an unbatched send fails", async () => {
		const calls = mockFetch((callNumber) =>
			callNumber === 1
				? new Response("nope", { status: 500, statusText: "Server Error" })
				: jsonResponse({ status: "success", eventId: "evt_1" })
		);
		const client = new Databuddy({
			apiKey: "dbdy_test",
			enableBatching: false,
		});

		const first = await client.track({
			name: "signup",
			eventId: "evt_1",
			websiteId: "site_1",
		});
		const second = await client.track({
			name: "signup",
			eventId: "evt_1",
			websiteId: "site_1",
		});

		expect(first.success).toBe(false);
		expect(second.success).toBe(true);
		expect(calls).toHaveLength(2);
		expect(client.getDeduplicationCacheSize()).toBe(1);
	});

	it("includes configured visitor anonymization in event payloads", async () => {
		const calls = mockFetch(() =>
			jsonResponse({ status: "success", eventId: "evt_1" })
		);
		const client = new Databuddy({
			apiKey: "dbdy_test",
			anonymizeVisitorIds: false,
			enableBatching: false,
		});

		const result = await client.track({
			name: "signup",
			anonymousId: "anon_123",
			websiteId: "site_1",
		});

		expect(result.success).toBe(true);
		expect(calls[0]?.body).toEqual(
			expect.objectContaining({
				name: "signup",
				anonymousId: "anon_123",
				anonymizeVisitorIds: false,
			})
		);
	});

	it("passes auto visitor anonymization mode through event payloads", async () => {
		const calls = mockFetch(() =>
			jsonResponse({ status: "success", eventId: "evt_1" })
		);
		const client = new Databuddy({
			apiKey: "dbdy_test",
			anonymizeVisitorIds: "auto",
			enableBatching: false,
		});

		const result = await client.track({
			name: "signup",
			anonymousId: "anon_123",
			websiteId: "site_1",
		});

		expect(result.success).toBe(true);
		expect(calls[0]?.body).toEqual(
			expect.objectContaining({
				name: "signup",
				anonymousId: "anon_123",
				anonymizeVisitorIds: "auto",
			})
		);
	});

	it("deduplicates queued events before a successful flush", async () => {
		const calls = mockFetch(() => jsonResponse({ status: "success", count: 1 }));
		const client = new Databuddy({ apiKey: "dbdy_test", batchSize: 10 });

		await client.track({
			name: "job_done",
			eventId: "evt_queued",
			websiteId: "site_1",
		});
		await client.track({
			name: "job_done",
			eventId: "evt_queued",
			websiteId: "site_1",
		});

		const result = await client.flush();
		const body = calls[0]?.body;

		expect(result.success).toBe(true);
		expect(calls).toHaveLength(1);
		expect(Array.isArray(body)).toBe(true);
		if (!Array.isArray(body)) {
			throw new Error("Expected batch body");
		}
		expect(body).toHaveLength(1);
		expect(client.getDeduplicationCacheSize()).toBe(1);
	});

	it("does not poison deduplication when a public batch call fails", async () => {
		const calls = mockFetch((callNumber) =>
			callNumber === 1
				? new Response("nope", { status: 500, statusText: "Server Error" })
				: jsonResponse({ status: "success", count: 1 })
		);
		const client = new Databuddy({ apiKey: "dbdy_test" });
		const event: BatchEventInput = {
			type: "custom",
			name: "webhook_received",
			eventId: "evt_batch",
			websiteId: "site_1",
		};

		const first = await client.batch([event]);
		const second = await client.batch([event]);

		expect(first.success).toBe(false);
		expect(second.success).toBe(true);
		expect(calls).toHaveLength(2);
		expect(client.getDeduplicationCacheSize()).toBe(1);
	});

	it("does not throw when debug logging receives unserializable data", () => {
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		const client = new Databuddy({ apiKey: "dbdy_test", debug: true });

		expect(() => client.setGlobalProperties(circular)).not.toThrow();
	});
});
