import { afterEach, describe, expect, jest, mock, test } from "bun:test";
import { HttpClient } from "../../src/core/client";
import { BaseTracker } from "../../src/core/tracker";

const originalFetch = globalThis.fetch;

class DeliveryTestTracker extends BaseTracker {
	protected override shouldSkipTracking(): boolean {
		return false;
	}
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

describe("HttpClient", () => {
	test("returns a typed success outcome", async () => {
		globalThis.fetch = mock(async () =>
			Response.json({ status: "success" }, { status: 202 })
		) as typeof fetch;
		const client = new HttpClient({ baseUrl: "https://example.com" });

		const result = await client.post<{ status: string }>(
			"https://example.com/events",
			{},
			{ keepalive: false }
		);

		expect(result).toEqual({
			ok: true,
			data: { status: "success" },
			status: 202,
			attempts: 1,
			transport: "fetch",
		});
	});

	test("retries retryable HTTP failures and keeps the server message", async () => {
		const fetchMock = mock(async () =>
			Response.json(
				{ error: "Website lookup temporarily unavailable" },
				{ status: 503 }
			)
		);
		globalThis.fetch = fetchMock as typeof fetch;
		const client = new HttpClient({
			baseUrl: "https://example.com",
			maxRetries: 1,
			initialRetryDelay: 0,
		});

		const result = await client.post(
			"https://example.com/events",
			{},
			{ keepalive: false }
		);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result).toMatchObject({
			ok: false,
			code: "HTTP_ERROR",
			message: "Website lookup temporarily unavailable",
			status: 503,
			retryable: true,
			attempts: 2,
		});
	});

	test("does not retry a permanent client error", async () => {
		const fetchMock = mock(async () =>
			Response.json({ error: "Invalid client ID" }, { status: 400 })
		);
		globalThis.fetch = fetchMock as typeof fetch;
		const client = new HttpClient({
			baseUrl: "https://example.com",
			maxRetries: 3,
		});

		const result = await client.post(
			"https://example.com/events",
			{},
			{ keepalive: false }
		);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({
			ok: false,
			status: 400,
			retryable: false,
		});
	});
});

describe("BaseTracker delivery outcomes", () => {
	test("keeps a retryable failed batch queued", async () => {
		jest.useFakeTimers();
		const tracker = new DeliveryTestTracker({ clientId: "site_example" });
		tracker.api.fetch = mock(async () => ({
			ok: false as const,
			code: "NETWORK_ERROR" as const,
			message: "offline",
			status: null,
			retryable: true,
			attempts: 4,
			transport: "fetch" as const,
		}));
		await tracker.addToBatch({ eventId: "event_1", timestamp: 1 });

		const result = await tracker.flushBatch();

		expect(result).toMatchObject({
			ok: false,
			status: "failed",
			retryable: true,
			count: 1,
		});
		expect(tracker.batchQueue).toHaveLength(1);
	});

	test("automatically retries queues with capped exponential backoff", async () => {
		jest.useFakeTimers();
		const tracker = new DeliveryTestTracker({
			clientId: "site_example",
			initialRetryDelay: 1,
		});
		const send = mock(async () =>
			send.mock.calls.length < 10
				? {
						ok: false as const,
						code: "NETWORK_ERROR" as const,
						message: "offline",
						status: null,
						retryable: true,
						attempts: 4,
						transport: "fetch" as const,
					}
				: {
						ok: true as const,
						data: { status: "success" },
						status: 202,
						attempts: 1,
						transport: "fetch" as const,
					}
		);
		tracker.api.fetch = send;
		await tracker.addToBatch({ eventId: "event_1", timestamp: 1 });

		const first = await tracker.flushBatch();
		expect(first).toMatchObject({ ok: false, retryable: true });

		const delays = [250, 500, 1000, 2000, 4000, 8000, 16_000, 30_000, 30_000];
		for (const [index, delay] of delays.entries()) {
			jest.advanceTimersByTime(delay - 1);
			await flushMicrotasks();
			expect(send).toHaveBeenCalledTimes(index + 1);

			jest.advanceTimersByTime(1);
			await flushMicrotasks();
			expect(send).toHaveBeenCalledTimes(index + 2);
		}

		expect(tracker.batchQueue).toHaveLength(0);
		expect(await tracker.flushBatch()).toMatchObject({
			ok: true,
			status: "skipped",
		});
	});

	test("treats trackPerformance as a compatibility alias", () => {
		const tracker = new BaseTracker({
			clientId: "site_example",
			trackPerformance: true,
		});

		expect(tracker.options.trackWebVitals).toBe(true);
	});
});
