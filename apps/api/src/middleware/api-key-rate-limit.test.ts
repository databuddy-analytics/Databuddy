import type { ApiKeyRow } from "@databuddy/api-keys/resolve";
import type { RateLimitResult } from "@databuddy/redis/rate-limit";
import { Elysia } from "elysia";
import { describe, expect, it, vi } from "vitest";
import {
	API_KEY_IN_FLIGHT_LIMIT,
	ApiKeyInFlightGate,
	type ApiKeyAdmissionDependencies,
	DEFAULT_API_KEY_RATE_LIMIT,
	enforceApiKeyInFlightLimit,
	enforceApiKeyRateLimit,
	getApiKeyRateLimitConfig,
	releaseApiKeyInFlight,
} from "./api-key-rate-limit";

function createApiKey(
	id: string,
	overrides: Partial<ApiKeyRow> = {}
): ApiKeyRow {
	const now = new Date("2026-08-01T00:00:00.000Z");
	return {
		createdAt: now,
		enabled: true,
		expiresAt: null,
		id,
		keyHash: `hash-${id}`,
		lastUsedAt: null,
		metadata: {},
		name: `Key ${id}`,
		organizationId: "org_test",
		prefix: "dbdy",
		rateLimitEnabled: true,
		rateLimitMax: 2,
		rateLimitTimeWindow: 60,
		revokedAt: null,
		scopes: ["write:links"],
		start: "dbdy_tes",
		type: "automation",
		updatedAt: now,
		userId: null,
		...overrides,
	};
}

function createDependencies(
	keys: Map<string, ApiKeyRow>,
	inFlightLimit = 1000
) {
	const counts = new Map<string, number>();
	const consume = vi.fn(
		async (
			identifier: string,
			limit: number,
			windowSeconds: number
		): Promise<RateLimitResult> => {
			const count = counts.get(identifier) ?? 0;
			const success = count < limit;
			const nextCount = success ? count + 1 : count;
			counts.set(identifier, nextCount);
			return {
				limit,
				remaining: Math.max(0, limit - nextCount),
				reset: Date.now() + windowSeconds * 1000,
				success,
			};
		}
	);
	const resolveApiKey = vi.fn(async (headers: Headers) =>
		keys.get(headers.get("x-api-key") ?? "") ?? null
	);
	const dependencies: ApiKeyAdmissionDependencies = {
		consume,
		inFlightGate: new ApiKeyInFlightGate(inFlightLimit),
		recordAdmissionOutcome: vi.fn(),
		resolveApiKey,
	};
	return {
		consume,
		dependencies,
		recordAdmissionOutcome: dependencies.recordAdmissionOutcome,
		resolveApiKey,
	};
}

function createLinksApp(
	dependencies: ApiKeyAdmissionDependencies,
	handleCreate: (request: Request) => unknown = () => ({ created: true })
) {
	let handlerCalls = 0;
	const resolvedApiKeys = new WeakMap<Request, ApiKeyRow | null>();
	const app = new Elysia()
		.onAfterResponse(({ request }) => {
			releaseApiKeyInFlight(request, dependencies.inFlightGate);
		})
		.onError(({ request }) => {
			releaseApiKeyInFlight(request, dependencies.inFlightGate);
		})
		.onBeforeHandle(({ request, set }) =>
			enforceApiKeyInFlightLimit(
				request,
				(name, value) => {
					set.headers[name] = value;
				},
				dependencies
			)
		)
		.onBeforeHandle(async ({ request }) => {
			resolvedApiKeys.set(
				request,
				await dependencies.resolveApiKey(request.headers)
			);
		})
		.onBeforeHandle(({ request, set }) =>
			enforceApiKeyRateLimit(
				request,
				(name, value) => {
					set.headers[name] = value;
				},
				{
					apiKey: resolvedApiKeys.has(request)
						? (resolvedApiKeys.get(request) ?? null)
						: undefined,
					dependencies,
				}
			)
		)
		.post("/links/create", ({ request }) => {
			handlerCalls += 1;
			return handleCreate(request);
		});

	return { app, getHandlerCalls: () => handlerCalls };
}

function waitForAfterResponse(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

async function waitUntil(predicate: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (predicate()) {
			return;
		}
		await Promise.resolve();
	}
	throw new Error("Condition was not reached");
}

function createLinkRequest(secret: string): Request {
	return new Request("https://api.example.com/links/create", {
		body: "{}",
		headers: {
			"content-type": "application/json",
			"x-api-key": secret,
		},
		method: "POST",
	});
}

describe("API key rate limit admission", () => {
	it("blocks excess /links/create requests per key before the route handler", async () => {
		const keyA = createApiKey("key-a");
		const keyB = createApiKey("key-b");
		const { consume, dependencies, recordAdmissionOutcome } =
			createDependencies(
			new Map([
				["dbdy_key_a", keyA],
				["dbdy_key_b", keyB],
			])
			);
		const { app, getHandlerCalls } = createLinksApp(dependencies);

		const first = await app.handle(createLinkRequest("dbdy_key_a"));
		const second = await app.handle(createLinkRequest("dbdy_key_a"));
		const rejected = await app.handle(createLinkRequest("dbdy_key_a"));
		const otherKey = await app.handle(createLinkRequest("dbdy_key_b"));

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(rejected.status).toBe(429);
		expect(rejected.headers.get("x-ratelimit-limit")).toBe("2");
		expect(rejected.headers.get("x-ratelimit-remaining")).toBe("0");
		expect(rejected.headers.get("retry-after")).toBe("60");
		expect(await rejected.json()).toMatchObject({
			code: "RATE_LIMITED",
			success: false,
		});
		expect(otherKey.status).toBe(200);
		expect(getHandlerCalls()).toBe(3);
		expect(consume).toHaveBeenNthCalledWith(1, "api-key:key-a", 2, 60);
		expect(consume).toHaveBeenNthCalledWith(4, "api-key:key-b", 2, 60);
		expect(recordAdmissionOutcome).toHaveBeenCalledExactlyOnceWith(
			"rolling_quota_rejected"
		);
	});

	it("disables the rolling quota without disabling the in-flight safety cap", async () => {
		const disabled = createApiKey("disabled", {
			rateLimitEnabled: false,
			rateLimitMax: 1,
			rateLimitTimeWindow: 60,
		});
		const { consume, dependencies } = createDependencies(
			new Map([["dbdy_disabled", disabled]]),
			1
		);
		let releaseFirst: (() => void) | undefined;
		const { app, getHandlerCalls } = createLinksApp(
			dependencies,
			() =>
				new Promise((resolve) => {
					releaseFirst = () => resolve({ created: true });
				})
		);

		const first = app.handle(createLinkRequest("dbdy_disabled"));
		await waitUntil(() => releaseFirst !== undefined);
		const concurrent = await app.handle(createLinkRequest("dbdy_disabled"));

		expect(concurrent.status).toBe(429);
		expect(concurrent.headers.get("retry-after")).toBe("1");
		expect(consume).not.toHaveBeenCalled();
		expect(getHandlerCalls()).toBe(1);

		releaseFirst?.();
		await first;
		await waitForAfterResponse();
	});

	it("does not gate requests without an API key", async () => {
		const { consume, dependencies } = createDependencies(new Map(), 1);
		const { app, getHandlerCalls } = createLinksApp(dependencies);

		const responses = await Promise.all([
			app.handle(createLinkRequest("missing-one")),
			app.handle(createLinkRequest("missing-two")),
			app.handle(createLinkRequest("missing-three")),
		]);

		expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
		expect(consume).not.toHaveBeenCalled();
		expect(getHandlerCalls()).toBe(3);
	});

	it("bounds enabled keys with null overrides at the safe default", async () => {
		const defaulted = createApiKey("defaulted", {
			rateLimitMax: null,
			rateLimitTimeWindow: null,
		});
		const { consume, dependencies } = createDependencies(
			new Map([["dbdy_defaulted", defaulted]])
		);
		const { app, getHandlerCalls } = createLinksApp(dependencies);

		for (let requestNumber = 0; requestNumber < 300; requestNumber += 1) {
			const response = await app.handle(createLinkRequest("dbdy_defaulted"));
			expect(response.status).toBe(200);
		}
		const rejected = await app.handle(createLinkRequest("dbdy_defaulted"));

		expect(rejected.status).toBe(429);
		expect(rejected.headers.get("x-ratelimit-limit")).toBe("300");
		expect(getHandlerCalls()).toBe(300);
		expect(consume).toHaveBeenLastCalledWith(
			"api-key:defaulted",
			DEFAULT_API_KEY_RATE_LIMIT.limit,
			DEFAULT_API_KEY_RATE_LIMIT.windowSeconds
		);
	});

	it("caps one key at 20 in flight before Redis and route work", async () => {
		const keyA = createApiKey("concurrent-a", {
			rateLimitMax: 300,
		});
		const keyB = createApiKey("concurrent-b", {
			rateLimitMax: 300,
		});
		const {
			consume,
			dependencies,
			recordAdmissionOutcome,
			resolveApiKey,
		} = createDependencies(
			new Map([
				["dbdy_concurrent_a", keyA],
				["dbdy_concurrent_b", keyB],
			]),
			API_KEY_IN_FLIGHT_LIMIT
		);
		let blockKeyA = true;
		const releaseHandlers: Array<() => void> = [];
		const { app, getHandlerCalls } = createLinksApp(
			dependencies,
			(request) => {
				if (
					blockKeyA &&
					request.headers.get("x-api-key") === "dbdy_concurrent_a"
				) {
					return new Promise((resolve) => {
						releaseHandlers.push(() => resolve({ created: true }));
					});
				}
				return { created: true };
			}
		);

		const pending = Array.from({ length: API_KEY_IN_FLIGHT_LIMIT }, () =>
			app.handle(createLinkRequest("dbdy_concurrent_a"))
		);
		await waitUntil(
			() => releaseHandlers.length === API_KEY_IN_FLIGHT_LIMIT
		);

		const rejected = await app.handle(
			createLinkRequest("dbdy_concurrent_a")
		);
		const otherKey = await app.handle(
			createLinkRequest("dbdy_concurrent_b")
		);

		expect(rejected.status).toBe(429);
		expect(rejected.headers.get("x-ratelimit-limit")).toBe("20");
		expect(rejected.headers.get("retry-after")).toBe("1");
		expect(otherKey.status).toBe(200);
		expect(consume).toHaveBeenCalledTimes(API_KEY_IN_FLIGHT_LIMIT + 1);
		expect(resolveApiKey).toHaveBeenCalledTimes(API_KEY_IN_FLIGHT_LIMIT + 1);
		expect(getHandlerCalls()).toBe(API_KEY_IN_FLIGHT_LIMIT + 1);
		expect(recordAdmissionOutcome).toHaveBeenCalledExactlyOnceWith(
			"in_flight_rejected"
		);

		for (const release of releaseHandlers) {
			release();
		}
		await Promise.all(pending);
		await waitForAfterResponse();

		blockKeyA = false;
		const admittedAfterRelease = await app.handle(
			createLinkRequest("dbdy_concurrent_a")
		);
		expect(admittedAfterRelease.status).toBe(200);
		expect(getHandlerCalls()).toBe(API_KEY_IN_FLIGHT_LIMIT + 2);
	});

	it("records Redis fail-open decisions while allowing the request", async () => {
		const key = createApiKey("degraded", { rateLimitMax: 300 });
		const degraded = createDependencies(
			new Map([["dbdy_degraded", key]])
		);
		degraded.dependencies.consume = vi.fn().mockResolvedValue({
			degraded: true,
			limit: 300,
			remaining: 299,
			reset: Date.now() + 60_000,
			success: true,
		});
		const { app, getHandlerCalls } = createLinksApp(degraded.dependencies);

		const response = await app.handle(createLinkRequest("dbdy_degraded"));

		expect(response.status).toBe(200);
		expect(getHandlerCalls()).toBe(1);
		expect(
			degraded.dependencies.recordAdmissionOutcome
		).toHaveBeenCalledExactlyOnceWith("redis_fail_open");
	});

	it("releases in-flight leases after early rate responses and errors", async () => {
		const key = createApiKey("release", { rateLimitMax: 300 });
		const quota = createDependencies(new Map([["dbdy_release", key]]), 1);
		quota.dependencies.consume = vi
			.fn()
			.mockResolvedValueOnce({
				limit: 300,
				remaining: 0,
				reset: Date.now() + 60_000,
				success: false,
			})
			.mockResolvedValue({
				limit: 300,
				remaining: 299,
				reset: Date.now() + 60_000,
				success: true,
			});
		const quotaApp = createLinksApp(quota.dependencies);

		const rateRejected = await quotaApp.app.handle(
			createLinkRequest("dbdy_release")
		);
		expect(rateRejected.status).toBe(429);
		await waitForAfterResponse();
		expect(
			(await quotaApp.app.handle(createLinkRequest("dbdy_release"))).status
		).toBe(200);

		const errors = createDependencies(new Map([["dbdy_release", key]]), 1);
		let throwNext = true;
		const errorApp = createLinksApp(errors.dependencies, () => {
			if (throwNext) {
				throwNext = false;
				throw new Error("route failure");
			}
			return { created: true };
		});

		const failed = await errorApp.app.handle(createLinkRequest("dbdy_release"));
		expect(failed.status).toBe(500);
		expect(
			(await errorApp.app.handle(createLinkRequest("dbdy_release"))).status
		).toBe(200);
	});

	it("uses safe defaults for enabled keys and lets either override win", () => {
		expect(
			getApiKeyRateLimitConfig(
				createApiKey("missing-max", { rateLimitMax: null })
			)
		).toEqual({
			limit: DEFAULT_API_KEY_RATE_LIMIT.limit,
			windowSeconds: 60,
		});
		expect(
			getApiKeyRateLimitConfig(
				createApiKey("missing-window", {
					rateLimitMax: 1200,
					rateLimitTimeWindow: null,
				})
			)
		).toEqual({
			limit: 1200,
			windowSeconds: DEFAULT_API_KEY_RATE_LIMIT.windowSeconds,
		});
		expect(
			getApiKeyRateLimitConfig(
				createApiKey("defaults", {
					rateLimitMax: null,
					rateLimitTimeWindow: null,
				})
			)
		).toEqual(DEFAULT_API_KEY_RATE_LIMIT);
		expect(getApiKeyRateLimitConfig(createApiKey("configured"))).toEqual({
			limit: 2,
			windowSeconds: 60,
		});
	});
});
