import { afterEach, describe, expect, it, jest, mock } from "bun:test";
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
	handler: (
		callNumber: number,
		init?: RequestInit
	) => Response | Promise<Response>
): FetchCall[] {
	const calls: FetchCall[] = [];

	globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
		calls.push({
			url: typeof input === "string" ? input : input.toString(),
			body: parseBody(init?.body),
		});
		return handler(calls.length, init);
	}) as typeof fetch;

	return calls;
}

afterEach(() => {
	if (jest.isFakeTimers()) {
		jest.clearAllTimers();
		jest.useRealTimers();
	}
	globalThis.fetch = originalFetch;
});

async function flushMicrotasks(): Promise<void> {
	for (let index = 0; index < 20; index += 1) {
		await Promise.resolve();
	}
}

function createDeferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T) => void;
} {
	let resolvePromise: (value: T) => void = () => {
		throw new Error("Deferred promise was not initialized");
	};
	const promise = new Promise<T>((resolve) => {
		resolvePromise = resolve;
	});
	return { promise, resolve: resolvePromise };
}

function stalledResponse(
	signal: AbortSignal | null | undefined,
	status = 200
): Response {
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			if (signal?.aborted) {
				controller.error(signal.reason);
				return;
			}

			signal?.addEventListener(
				"abort",
				() => controller.error(signal.reason),
				{ once: true }
			);
		},
	});
	return new Response(body, {
		status,
		statusText: status >= 500 ? "Service Unavailable" : "OK",
		headers: { "Content-Type": "application/json" },
	});
}

describe("Databuddy Node client", () => {
	it("rejects blank API keys after trimming", () => {
		expect(() => new Databuddy({ apiKey: "   " })).toThrow("apiKey");
	});

	it("returns a failed flush result when track reaches the batch threshold", async () => {
		jest.useFakeTimers();
		mockFetch(() => new Response("nope", { status: 500, statusText: "Server Error" }));

		const client = new Databuddy({ apiKey: "dbdy_test", batchSize: 1 });

		const result = await client.track({
			name: "signup",
			websiteId: "site_1",
		});

		expect(result.success).toBe(false);
		expect(result.error).toBe("HTTP 500: Server Error");
		expect(result.retryable).toBe(true);
		expect(result.statusCode).toBe(500);
	});

	it("surfaces structured server recovery details", async () => {
		mockFetch(() =>
			Response.json(
				{
					error: "Website lookup temporarily unavailable",
					code: "basket.WEBSITE_LOOKUP_UNAVAILABLE",
					why: "The configuration store could not be reached.",
					fix: "Retry the same request.",
					retryable: true,
					requestId: "req_example",
				},
				{ status: 503 }
			)
		);
		const client = new Databuddy({
			apiKey: "dbdy_test",
			enableBatching: false,
		});

		const result = await client.track({ name: "signup", websiteId: "site_1" });

		expect(result).toMatchObject({
			success: false,
			error: "Website lookup temporarily unavailable",
			code: "basket.WEBSITE_LOOKUP_UNAVAILABLE",
			statusCode: 503,
			retryable: true,
			requestId: "req_example",
			fix: "Retry the same request.",
		});
	});

	it("keeps retryable flush failures queued for a later flush", async () => {
		const calls = mockFetch((callNumber) =>
			callNumber === 1
				? Response.json(
						{
							error: "Temporarily unavailable",
							retryable: true,
						},
						{ status: 503 }
					)
				: jsonResponse({ status: "success", processed: 1 })
		);
		const client = new Databuddy({ apiKey: "dbdy_test", batchSize: 1 });

		const first = await client.track({
			name: "signup",
			websiteId: "site_1",
		});
		const retried = await client.flush();

		expect(first.success).toBe(false);
		expect(retried).toMatchObject({
			success: true,
			delivery: "delivered",
			processed: 1,
		});
		expect(calls).toHaveLength(2);
		expect(calls[1]?.body).toEqual(calls[0]?.body);
		const firstPayload = calls[0]?.body;
		expect(Array.isArray(firstPayload)).toBe(true);
		if (!Array.isArray(firstPayload)) {
			throw new Error("Expected batch body");
		}
		expect(firstPayload[0]).toMatchObject({
			eventId: expect.any(String),
			timestamp: expect.any(Number),
		});
	});

	it("flushes an internal backlog in batches of at most 100", async () => {
		const firstRequest = createDeferred<Response>();
		const calls = mockFetch((callNumber) => {
			if (callNumber === 1) {
				return firstRequest.promise;
			}
			const body = calls[callNumber - 1]?.body;
			return jsonResponse({
				status: "success",
				processed: Array.isArray(body) ? body.length : 1,
			});
		});
		const client = new Databuddy({
			apiKey: "dbdy_test",
			batchSize: 1,
			batchTimeout: 60_000,
		});

		const firstDelivery = client.track({
			name: "event_0",
			websiteId: "site_1",
		});
		await flushMicrotasks();
		const queuedDeliveries = Array.from({ length: 150 }, (_, index) =>
			client.track({
				name: `event_${index + 1}`,
				websiteId: "site_1",
			})
		);
		await flushMicrotasks();
		expect(calls).toHaveLength(1);

		firstRequest.resolve(jsonResponse({ status: "success", processed: 1 }));
		expect(await firstDelivery).toMatchObject({
			success: true,
			processed: 151,
		});
		await Promise.all(queuedDeliveries);
		expect(await client.flush()).toMatchObject({
			success: true,
			delivery: "skipped",
			processed: 0,
		});

		expect(calls.map((call) => (call.body as unknown[]).length)).toEqual([
			1, 100, 50,
		]);
	});

	it("drains events queued during an active flush before joined callers resolve", async () => {
		const firstResponse = createDeferred<Response>();
		const secondResponse = createDeferred<Response>();
		const calls = mockFetch((callNumber) =>
			callNumber === 1 ? firstResponse.promise : secondResponse.promise
		);
		const client = new Databuddy({
			apiKey: "dbdy_test",
			batchSize: 1,
			batchTimeout: 60_000,
		});

		const firstDelivery = client.track({
			name: "first",
			websiteId: "site_1",
		});
		await flushMicrotasks();
		expect(calls).toHaveLength(1);

		let secondSettled = false;
		const secondDelivery = client
			.track({ name: "second", websiteId: "site_1" })
			.finally(() => {
				secondSettled = true;
			});
		await flushMicrotasks();
		expect(calls).toHaveLength(1);
		expect(secondSettled).toBe(false);

		firstResponse.resolve(jsonResponse({ status: "success", processed: 1 }));
		await flushMicrotasks();
		expect(calls).toHaveLength(2);
		expect(secondSettled).toBe(false);

		secondResponse.resolve(jsonResponse({ status: "success", processed: 1 }));
		expect(await firstDelivery).toMatchObject({
			success: true,
			delivery: "delivered",
			processed: 2,
		});
		expect(await secondDelivery).toMatchObject({
			success: true,
			delivery: "delivered",
			processed: 2,
		});
		expect(calls.map((call) => call.body)).toEqual([
			[expect.objectContaining({ name: "first" })],
			[expect.objectContaining({ name: "second" })],
		]);
		expect(await client.flush()).toMatchObject({
			success: true,
			delivery: "skipped",
			processed: 0,
		});
	});

	it("bounds blackholed batch requests and keeps them retryable", async () => {
		globalThis.fetch = mock(
			(_input: string | URL | Request, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener(
						"abort",
						() => reject(init.signal?.reason),
						{ once: true }
					);
				})
		) as typeof fetch;
		const client = new Databuddy({
			apiKey: "dbdy_test",
			batchSize: 1,
			requestTimeoutMs: 20,
		});

		const result = await client.track({
			name: "blackholed",
			websiteId: "site_1",
		});

		expect(result).toMatchObject({
			success: false,
			code: "NETWORK_ERROR",
			retryable: true,
			error: "Request timed out after 20ms",
		});
	});

	it("keeps the deadline active while reading an unbatched response body", async () => {
		jest.useFakeTimers();
		mockFetch((_callNumber, init) => stalledResponse(init?.signal));
		const client = new Databuddy({
			apiKey: "dbdy_test",
			enableBatching: false,
			requestTimeoutMs: 20,
		});

		const delivery = client.track({
			name: "stalled_body",
			websiteId: "site_1",
		});
		await flushMicrotasks();
		jest.advanceTimersByTime(20);

		expect(await delivery).toMatchObject({
			success: false,
			code: "NETWORK_ERROR",
			retryable: true,
			error: "Request timed out after 20ms",
		});
	});

	it("keeps the deadline active while reading a batch response body", async () => {
		jest.useFakeTimers();
		mockFetch((_callNumber, init) => stalledResponse(init?.signal));
		const client = new Databuddy({
			apiKey: "dbdy_test",
			batchSize: 1,
			requestTimeoutMs: 20,
		});

		const delivery = client.track({
			name: "stalled_batch_body",
			websiteId: "site_1",
		});
		await flushMicrotasks();
		jest.advanceTimersByTime(20);

		expect(await delivery).toMatchObject({
			success: false,
			code: "NETWORK_ERROR",
			retryable: true,
			error: "Request timed out after 20ms",
		});
	});

	it("keeps the deadline active while reading an error response body", async () => {
		jest.useFakeTimers();
		mockFetch((_callNumber, init) => stalledResponse(init?.signal, 503));
		const client = new Databuddy({
			apiKey: "dbdy_test",
			enableBatching: false,
			requestTimeoutMs: 20,
		});

		const delivery = client.track({
			name: "stalled_error_body",
			websiteId: "site_1",
		});
		await flushMicrotasks();
		jest.advanceTimersByTime(20);

		expect(await delivery).toMatchObject({
			success: false,
			code: "NETWORK_ERROR",
			retryable: true,
			error: "Request timed out after 20ms",
		});
	});

	it("applies middleware once and preserves its identity across queued retries", async () => {
		const calls = mockFetch((callNumber) =>
			callNumber === 1
				? Response.json({ error: "Temporarily unavailable" }, { status: 503 })
				: jsonResponse({ status: "success", processed: 1 })
		);
		let middlewareCalls = 0;
		const client = new Databuddy({
			apiKey: "dbdy_test",
			batchSize: 1,
			middleware: [
				(event) => ({
					...event,
					eventId: `middleware_${++middlewareCalls}`,
				}),
			],
		});

		expect(
			await client.track({ name: "signup", websiteId: "site_1" })
		).toMatchObject({ success: false, retryable: true });
		expect(await client.flush()).toMatchObject({ success: true });

		expect(middlewareCalls).toBe(1);
		expect(calls[1]?.body).toEqual(calls[0]?.body);
	});

	it("preserves generated identity when the same public batch is retried", async () => {
		const calls = mockFetch((callNumber) =>
			callNumber === 1
				? Response.json({ error: "Temporarily unavailable" }, { status: 503 })
				: jsonResponse({ status: "success", processed: 1 })
		);
		const client = new Databuddy({ apiKey: "dbdy_test" });
		const event: BatchEventInput = {
			type: "custom",
			name: "webhook_received",
			websiteId: "site_1",
		};

		expect(await client.batch([event])).toMatchObject({
			success: false,
			retryable: true,
		});
		expect(await client.batch([event])).toMatchObject({ success: true });

		expect(calls[1]?.body).toEqual(calls[0]?.body);
		expect(calls[0]?.body).toEqual([
			expect.objectContaining({
				eventId: expect.any(String),
				timestamp: expect.any(Number),
			}),
		]);
	});

	it("automatically retries queued failures with capped exponential backoff", async () => {
		jest.useFakeTimers();
		const calls = mockFetch((callNumber) =>
			callNumber < 10
				? Response.json({ error: "Temporarily unavailable" }, { status: 503 })
				: jsonResponse({ status: "success", processed: 1 })
		);
		const client = new Databuddy({
			apiKey: "dbdy_test",
			batchSize: 1,
			batchTimeout: 1,
		});

		const first = await client.track({
			name: "signup",
			websiteId: "site_1",
		});
		expect(first).toMatchObject({ success: false, retryable: true });

		const delays = [250, 500, 1000, 2000, 4000, 8000, 16_000, 30_000, 30_000];
		for (const [index, delay] of delays.entries()) {
			jest.advanceTimersByTime(delay - 1);
			await flushMicrotasks();
			expect(calls).toHaveLength(index + 1);

			jest.advanceTimersByTime(1);
			await flushMicrotasks();
			expect(calls).toHaveLength(index + 2);
		}

		expect(await client.flush()).toMatchObject({
			success: true,
			delivery: "skipped",
			processed: 0,
		});
	});

	it("reports queued events separately from delivered events", async () => {
		mockFetch(() => jsonResponse({ status: "success", processed: 1 }));
		const client = new Databuddy({ apiKey: "dbdy_test", batchSize: 10 });

		const result = await client.track({
			name: "signup",
			websiteId: "site_1",
		});

		expect(result).toEqual({ success: true, delivery: "queued" });
		await client.flush();
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
		expect(calls[0]?.body).toMatchObject({
			eventId: "evt_1",
			timestamp: expect.any(Number),
		});
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

describe("identify", () => {
	it("sends profileId, anonymousId, traits, and websiteId to /identify", async () => {
		const calls = mockFetch(() =>
			jsonResponse({ status: "success", type: "identify" })
		);
		const client = new Databuddy({ apiKey: "dbdy_test", websiteId: "site_1" });

		const result = await client.identify({
			profileId: " user_42 ",
			anonymousId: "anon_abc",
			traits: { email: "jo@acme.com", plan: "pro" },
		});

		expect(result.success).toBe(true);
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toContain("/identify");
		expect(calls[0].body).toEqual({
			profileId: "user_42",
			anonymousId: "anon_abc",
			traits: { email: "jo@acme.com", plan: "pro" },
			websiteId: "site_1",
		});
	});

	it("prefers per-call websiteId over the config default", async () => {
		const calls = mockFetch(() =>
			jsonResponse({ status: "success", type: "identify" })
		);
		const client = new Databuddy({ apiKey: "dbdy_test", websiteId: "site_1" });

		await client.identify({ profileId: "user_42", websiteId: "site_2" });

		expect((calls[0].body as { websiteId: string }).websiteId).toBe("site_2");
	});

	it("fails without a websiteId and sends nothing", async () => {
		const calls = mockFetch(() => jsonResponse({ status: "success" }));
		const client = new Databuddy({ apiKey: "dbdy_test" });

		const result = await client.identify({ profileId: "user_42" });

		expect(result.success).toBe(false);
		expect(result.error).toContain("websiteId");
		expect(calls).toHaveLength(0);
	});

	it("fails without a profileId and sends nothing", async () => {
		const calls = mockFetch(() => jsonResponse({ status: "success" }));
		const client = new Databuddy({ apiKey: "dbdy_test", websiteId: "site_1" });

		const result = await client.identify({ profileId: "" });

		expect(result.success).toBe(false);
		expect(result.error).toContain("profileId");
		expect(calls).toHaveLength(0);
	});

	it("surfaces HTTP errors", async () => {
		mockFetch(
			() => new Response("denied", { status: 403, statusText: "Forbidden" })
		);
		const client = new Databuddy({ apiKey: "dbdy_test", websiteId: "site_1" });

		const result = await client.identify({ profileId: "user_42" });

		expect(result.success).toBe(false);
		expect(result.error).toContain("403");
	});

	it("keeps the deadline active while consuming the response body", async () => {
		jest.useFakeTimers();
		mockFetch((_callNumber, init) => stalledResponse(init?.signal));
		const client = new Databuddy({
			apiKey: "dbdy_test",
			websiteId: "site_1",
			requestTimeoutMs: 20,
		});

		const delivery = client.identify({ profileId: "user_42" });
		await flushMicrotasks();
		jest.advanceTimersByTime(20);

		expect(await delivery).toMatchObject({
			success: false,
			code: "NETWORK_ERROR",
			retryable: true,
			error: "Request timed out after 20ms",
		});
	});
});
