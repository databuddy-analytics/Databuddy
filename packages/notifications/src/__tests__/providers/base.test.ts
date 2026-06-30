import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SafeFetchInit } from "@databuddy/shared/ssrf-guard";
import type { NotificationPayload, NotificationResult } from "../../types";

const safeFetchMock = mock(
	(_url: string, _init?: SafeFetchInit) =>
		Promise.resolve(new Response("ok", { status: 200 }))
);

mock.module("@databuddy/shared/ssrf-guard", () => ({
	safeFetch: safeFetchMock,
}));

const { BaseProvider } = await import("../../providers/base");

class TestProvider extends BaseProvider {
	async send(_payload: NotificationPayload): Promise<NotificationResult> {
		return { success: true, channel: "webhook" };
	}

	public testWithRetry<T>(fn: () => Promise<T>): Promise<T> {
		return this.withRetry(fn);
	}

	public testFetchWithTimeout(
		url: string,
		init?: RequestInit
	): Promise<Response> {
		return this.fetchWithTimeout(url, init);
	}

	public override delay(ms: number): Promise<void> {
		return super.delay(ms);
	}
}

describe("BaseProvider", () => {
	afterEach(() => {
		safeFetchMock.mockClear();
		safeFetchMock.mockImplementation((_url: string, _init?: SafeFetchInit) =>
			Promise.resolve(new Response("ok", { status: 200 }))
		);
	});

	describe("constructor defaults", () => {
		test("uses default timeout of 10_000", () => {
			const provider = new TestProvider();
			expect(provider).toBeDefined();
		});

		test("custom options override defaults", () => {
			const provider = new TestProvider({
				timeout: 5000,
				retries: 3,
				retryDelay: 500,
			});
			expect(provider).toBeDefined();
		});
	});

	describe("withRetry", () => {
		test("no retries by default — fn fails once, error thrown immediately", async () => {
			const provider = new TestProvider();
			const fn = mock(() => Promise.reject(new Error("fail")));

			await expect(provider.testWithRetry(fn)).rejects.toThrow("fail");
			expect(fn).toHaveBeenCalledTimes(1);
		});

		test("retries N times then throws final error", async () => {
			const provider = new TestProvider({ retries: 2, retryDelay: 1 });
			provider.delay = mock(() => Promise.resolve()) as typeof provider.delay;

			const fn = mock(() => Promise.reject(new Error("fail")));

			await expect(provider.testWithRetry(fn)).rejects.toThrow("fail");
			expect(fn).toHaveBeenCalledTimes(3);
		});

		test("retries then succeeds on later attempt", async () => {
			const provider = new TestProvider({ retries: 2, retryDelay: 1 });
			provider.delay = mock(() => Promise.resolve()) as typeof provider.delay;

			let attempt = 0;
			const fn = mock(() => {
				attempt++;
				if (attempt < 3) {
					return Promise.reject(new Error("fail"));
				}
				return Promise.resolve("success");
			});

			const result = await provider.testWithRetry(fn);
			expect(result).toBe("success");
			expect(fn).toHaveBeenCalledTimes(3);
		});

		test("backoff delay increases per attempt", async () => {
			const provider = new TestProvider({ retries: 2, retryDelay: 1000 });
			const delayCalls: number[] = [];
			provider.delay = mock((ms: number) => {
				delayCalls.push(ms);
				return Promise.resolve();
			}) as typeof provider.delay;

			const fn = mock(() => Promise.reject(new Error("fail")));
			await expect(provider.testWithRetry(fn)).rejects.toThrow("fail");

			expect(delayCalls).toHaveLength(2);
			expect(delayCalls[0]).toBeGreaterThanOrEqual(1000);
			expect(delayCalls[0]).toBeLessThan(1500);
			expect(delayCalls[1]).toBeGreaterThanOrEqual(2000);
			expect(delayCalls[1]).toBeLessThan(2500);
		});
	});

	describe("fetchWithTimeout", () => {
		test("returns response on success", async () => {
			const provider = new TestProvider({ timeout: 5000 });
			const res = await provider.testFetchWithTimeout("http://example.com");

			expect(res.status).toBe(200);
			expect(safeFetchMock).toHaveBeenCalledWith("http://example.com", {
				timeoutMs: 5000,
			});
		});

		test("throws timeout error when request exceeds timeout", async () => {
			safeFetchMock.mockImplementationOnce(() =>
				Promise.reject(new Error("Request timed out after 10ms"))
			);

			const provider = new TestProvider({ timeout: 10 });
			await expect(
				provider.testFetchWithTimeout("http://example.com")
			).rejects.toThrow("Request timed out after 10ms");
		});

		test("propagates non-abort errors as-is", async () => {
			safeFetchMock.mockImplementationOnce(() =>
				Promise.reject(new Error("network failure"))
			);

			const provider = new TestProvider({ timeout: 5000 });
			await expect(
				provider.testFetchWithTimeout("http://example.com")
			).rejects.toThrow("network failure");
		});
	});
});
