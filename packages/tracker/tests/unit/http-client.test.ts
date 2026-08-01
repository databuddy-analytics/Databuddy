import { afterEach, describe, expect, jest, mock, test } from "bun:test";
import { HttpClient, type HttpResult } from "../../src/core/client";
import { BaseTracker } from "../../src/core/tracker";

const originalFetch = globalThis.fetch;
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

class DeliveryTestTracker extends BaseTracker {
	private deliveryBlocked = false;

	protected override shouldSkipTracking(): boolean {
		return this.deliveryBlocked;
	}

	optOutForTest(): void {
		this.deliveryBlocked = true;
		this.cancelPendingDelivery();
	}

	optInForTest(): void {
		this.deliveryBlocked = false;
	}
}

afterEach(() => {
	if (jest.isFakeTimers()) {
		jest.clearAllTimers();
		jest.useRealTimers();
	}
	globalThis.fetch = originalFetch;
	if (originalNavigator) {
		Object.defineProperty(globalThis, "navigator", originalNavigator);
		return;
	}
	Reflect.deleteProperty(globalThis, "navigator");
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

	test("aborts an in-flight HTTP request", async () => {
		let requestSignal: AbortSignal | null = null;
		const fetchMock = mock(
			(_input: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					requestSignal = init?.signal ?? null;
					requestSignal?.addEventListener(
						"abort",
						() => {
							const error = new Error("Request aborted");
							error.name = "AbortError";
							reject(error);
						},
						{ once: true }
					);
				})
		);
		globalThis.fetch = fetchMock as typeof fetch;
		const client = new HttpClient({ baseUrl: "https://example.com" });

		const delivery = client.post(
			"https://example.com/events",
			{},
			{ keepalive: false }
		);
		await flushMicrotasks();
		client.cancelPendingRequests();

		expect(requestSignal?.aborted).toBe(true);
		expect(await delivery).toMatchObject({
			ok: false,
			code: "REQUEST_ERROR",
			message: "Request aborted",
			retryable: false,
			attempts: 1,
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test("cancels an active retry delay without another HTTP attempt", async () => {
		jest.useFakeTimers();
		const fetchMock = mock(async () =>
			Response.json({ error: "Temporarily unavailable" }, { status: 503 })
		);
		globalThis.fetch = fetchMock as typeof fetch;
		const client = new HttpClient({
			baseUrl: "https://example.com",
			maxRetries: 3,
			initialRetryDelay: 1000,
		});

		const delivery = client.post(
			"https://example.com/events",
			{},
			{ keepalive: false }
		);
		await flushMicrotasks();
		expect(fetchMock).toHaveBeenCalledTimes(1);

		client.cancelPendingRequests();
		const result = await delivery;
		jest.advanceTimersByTime(30_000);
		await flushMicrotasks();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({
			ok: false,
			code: "REQUEST_ERROR",
			message: "Request aborted",
			retryable: false,
			attempts: 1,
		});
	});
});

describe("BaseTracker delivery outcomes", () => {
	test("requeues a retryable batch despite an accepted Beacon", async () => {
		jest.useFakeTimers();
		const sendBeacon = mock(() => true);
		Object.defineProperty(globalThis, "navigator", {
			configurable: true,
			value: { sendBeacon },
		});
		const fetchMock = mock(async () =>
			Response.json({ error: "Temporarily unavailable" }, { status: 503 })
		);
		globalThis.fetch = fetchMock as typeof fetch;
		const tracker = new DeliveryTestTracker({
			clientId: "site_example",
			enableRetries: false,
		});
		const event = { eventId: "event_1", timestamp: 1 };
		await tracker.addToBatch(event);

		const result = await tracker.flushBatch();

		expect(sendBeacon).not.toHaveBeenCalled();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({
			ok: false,
			status: "failed",
			retryable: true,
		});
		expect(tracker.batchQueue).toEqual([event]);
	});

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

	test("does not requeue a stale flush across a quick opt-out and opt-in", async () => {
		jest.useFakeTimers();
		const tracker = new DeliveryTestTracker({ clientId: "site_example" });
		const firstRequest = createDeferred<HttpResult<unknown>>();
		const secondRequest = createDeferred<HttpResult<unknown>>();
		const success: HttpResult<unknown> = {
			ok: true,
			data: { status: "success" },
			status: 202,
			attempts: 1,
			transport: "fetch",
		};
		const retryableFailure: HttpResult<unknown> = {
			ok: false,
			code: "NETWORK_ERROR",
			message: "offline",
			status: null,
			retryable: true,
			attempts: 1,
			transport: "fetch",
		};
		const send = mock(() => {
			if (send.mock.calls.length === 1) {
				return firstRequest.promise;
			}
			if (send.mock.calls.length === 2) {
				return secondRequest.promise;
			}
			return Promise.resolve(success);
		});
		tracker.api.fetch = send;

		await tracker.addToBatch({ eventId: "before_opt_out", timestamp: 1 });
		const staleFlush = tracker.flushBatch();
		await flushMicrotasks();
		expect(send).toHaveBeenCalledTimes(1);

		tracker.optOutForTest();
		tracker.optInForTest();
		await tracker.addToBatch({ eventId: "after_opt_in", timestamp: 2 });
		const currentFlush = tracker.flushBatch();
		await flushMicrotasks();
		expect(send).toHaveBeenCalledTimes(2);

		firstRequest.resolve(retryableFailure);
		await staleFlush;
		expect(tracker.batchQueue).toHaveLength(0);

		await tracker.addToBatch({ eventId: "while_current_flush_runs", timestamp: 3 });
		expect(await tracker.flushBatch()).toEqual({
			ok: true,
			status: "queued",
			count: 1,
		});
		expect(send).toHaveBeenCalledTimes(2);

		secondRequest.resolve(success);
		await currentFlush;
		expect(tracker.batchQueue).toEqual([
			{ eventId: "while_current_flush_runs", timestamp: 3 },
		]);
		expect(await tracker.flushBatch()).toMatchObject({
			ok: true,
			status: "delivered",
			count: 1,
		});
		expect(send).toHaveBeenCalledTimes(3);
	});

	test("treats trackPerformance as a compatibility alias", () => {
		const tracker = new BaseTracker({
			clientId: "site_example",
			trackPerformance: true,
		});

		expect(tracker.options.trackWebVitals).toBe(true);
	});
});
