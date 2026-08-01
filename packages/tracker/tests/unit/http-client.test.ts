import { afterEach, describe, expect, jest, mock, test } from "bun:test";
import { HttpClient, type HttpResult } from "../../src/core/client";
import { BaseTracker } from "../../src/core/tracker";
import { Databuddy as BrowserDatabuddy } from "../../src/index";

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

class UnloadTestTracker extends BrowserDatabuddy {
	protected override shouldSkipTracking(): boolean {
		return false;
	}

	flushForPageUnload(): void {
		(
			this as unknown as {
				handlePageUnload: () => void;
				hasSentExitBeacon: boolean;
			}
		).hasSentExitBeacon = true;
		(
			this as unknown as {
				handlePageUnload: () => void;
			}
		).handlePageUnload();
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
	} else {
		Reflect.deleteProperty(globalThis, "navigator");
	}
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

	test("uses acknowledged fetch for normal keepalive delivery", async () => {
		const sendBeacon = mock(() => true);
		Object.defineProperty(globalThis, "navigator", {
			configurable: true,
			value: { sendBeacon },
		});
		const fetchMock = mock(async () =>
			Response.json({ status: "accepted" }, { status: 202 })
		);
		globalThis.fetch = fetchMock as typeof fetch;
		const client = new HttpClient({ baseUrl: "https://example.com" });

		const result = await client.post(
			"https://example.com/events",
			{},
			{ keepalive: true }
		);

		expect(result).toMatchObject({ ok: true, status: 202, transport: "fetch" });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(sendBeacon).not.toHaveBeenCalled();
	});

	test("returns a retryable result when an HTTP request exceeds its deadline", async () => {
		jest.useFakeTimers();
		globalThis.fetch = mock(
			(_input: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener(
						"abort",
						() => {
							const error = new Error("Request aborted");
							error.name = "AbortError";
							reject(error);
						},
						{ once: true }
					);
				})
		) as typeof fetch;
		const client = new HttpClient({
			baseUrl: "https://example.com",
			maxRetries: 0,
			requestTimeoutMs: 20,
		});

		const delivery = client.post("https://example.com/events", {}, { keepalive: true });
		await flushMicrotasks();
		jest.advanceTimersByTime(20);
		await flushMicrotasks();

		await expect(delivery).resolves.toMatchObject({
			ok: false,
			code: "NETWORK_ERROR",
			message: "Request timed out after 20ms",
			retryable: true,
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
	test("flushes backlogs in endpoint-sized chunks without keepalive", async () => {
		jest.useFakeTimers();
		const tracker = new DeliveryTestTracker({ clientId: "site_example" });
		const send = mock(async () => ({
			ok: true as const,
			data: { status: "success" },
			status: 202,
			attempts: 1,
			transport: "fetch" as const,
		}));
		tracker.api.fetch = send;
		tracker.batchQueue.push(
			...Array.from({ length: 205 }, (_, index) => ({
				eventId: `event_${index}`,
				timestamp: index,
			}))
		);

		expect(await tracker.flushBatch()).toMatchObject({
			ok: true,
			count: 100,
		});
		expect(tracker.batchQueue).toHaveLength(105);
		expect(send.mock.calls[0]?.[1]).toHaveLength(100);
		expect(send.mock.calls[0]?.[2]).toEqual({ keepalive: false });

		await tracker.flushBatch();
		await tracker.flushBatch();
		expect(send.mock.calls.map((call) => call[1].length)).toEqual([100, 100, 5]);
		expect(tracker.batchQueue).toHaveLength(0);
	});

	test("drops only a rejected chunk and preserves the unsent backlog", async () => {
		jest.useFakeTimers();
		const tracker = new DeliveryTestTracker({ clientId: "site_example" });
		tracker.api.fetch = mock(async () => ({
			ok: false as const,
			code: "HTTP_ERROR" as const,
			message: "invalid batch",
			status: 400,
			retryable: false,
			attempts: 1,
			transport: "fetch" as const,
		}));
		tracker.batchQueue.push(
			...Array.from({ length: 101 }, (_, index) => ({
				eventId: `event_${index}`,
				timestamp: index,
			}))
		);

		expect(await tracker.flushBatch()).toMatchObject({
			ok: false,
			statusCode: 400,
			count: 100,
		});
		expect(tracker.batchQueue).toEqual([
			{ eventId: "event_100", timestamp: 100 },
		]);
	});

	test("beacons the analytics queue on unload in count and byte bounded chunks", () => {
		const tracker = new UnloadTestTracker({ clientId: "site_example" });
		const sendBeacon = mock(() => true);
		tracker.sendBeacon = sendBeacon;
		tracker.batchQueue.push(
			...Array.from({ length: 100 }, (_, index) => ({
				eventId: `small_${index}`,
				timestamp: index,
			})),
			{ eventId: "large_1", timestamp: 101, value: "x".repeat(40_000) },
			{ eventId: "large_2", timestamp: 102, value: "x".repeat(40_000) }
		);

		tracker.flushForPageUnload();

		expect(sendBeacon.mock.calls.map((call) => call[1])).toEqual([
			"/batch",
			"/batch",
			"/batch",
		]);
		expect(sendBeacon.mock.calls.map((call) => call[0].length)).toEqual([
			100, 1, 1,
		]);
		expect(tracker.batchQueue).toHaveLength(0);
	});

	test("reclaims an in-flight analytics chunk for the unload beacon", async () => {
		const tracker = new UnloadTestTracker({ clientId: "site_example" });
		const delivery = createDeferred<HttpResult<unknown>>();
		tracker.api.fetch = mock(() => delivery.promise);
		const sendBeacon = mock(() => true);
		tracker.sendBeacon = sendBeacon;
		await tracker.addToBatch({ eventId: "event_in_flight", timestamp: 1 });

		const flush = tracker.flushBatch();
		await flushMicrotasks();
		expect(tracker.batchQueue).toHaveLength(0);

		tracker.flushForPageUnload();

		expect(sendBeacon).toHaveBeenCalledWith(
			[{ eventId: "event_in_flight", timestamp: 1 }],
			"/batch"
		);
		expect(tracker.batchQueue).toHaveLength(0);

		delivery.resolve({
			ok: false,
			code: "REQUEST_ERROR",
			message: "Request aborted",
			status: null,
			retryable: false,
			attempts: 1,
			transport: "fetch",
		});
		await flush;
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
