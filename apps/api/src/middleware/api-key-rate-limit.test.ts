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
		.onBeforeHandle(({ request, set }) =>
			enforceApiKeyRateLimit(
				request,
				(name, value) => {
					set.headers[name] = value;
				},
				{
					dependencies,
				}
			)
		)
		.get("/links/create", ({ request }) => {
			handlerCalls += 1;
			return handleCreate(request);
		})
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

function createHeadRequest(secret: string): Request {
	return new Request("https://api.example.com/links/create", {
		headers: { "x-api-key": secret },
		method: "HEAD",
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
		expect(recordAdmissionOutcome).toHaveBeenCalledTimes(1);
		expect(recordAdmissionOutcome).toHaveBeenCalledWith(
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

	it("keeps plan-default keys on the paid-safe distributed quota", async () => {
		const planDefault = createApiKey("plan-default", {
			rateLimitMax: null,
			rateLimitTimeWindow: null,
		});
		const { consume, dependencies } = createDependencies(
			new Map([["dbdy_plan_default", planDefault]])
		);
		const { app, getHandlerCalls } = createLinksApp(dependencies);

		const response = await app.handle(
			createLinkRequest("dbdy_plan_default")
		);

		expect(response.status).toBe(200);
		expect(consume).toHaveBeenCalledWith(
			"api-key:plan-default",
			DEFAULT_API_KEY_RATE_LIMIT.limit,
			DEFAULT_API_KEY_RATE_LIMIT.windowSeconds
		);
		expect(getHandlerCalls()).toBe(1);
	});

	it("admits, limits, and releases HEAD requests", async () => {
		const key = createApiKey("head", { rateLimitMax: 300 });
		const { consume, dependencies } = createDependencies(
			new Map([["dbdy_head_key", key]]),
			1
		);
		const setHeader = vi.fn();
		const first = createHeadRequest("dbdy_head_key");
		const concurrent = createHeadRequest("dbdy_head_key");

		expect(
			enforceApiKeyInFlightLimit(first, setHeader, dependencies)
		).toBeUndefined();
		expect(
			await enforceApiKeyRateLimit(first, setHeader, { dependencies })
		).toBeUndefined();

		const rejected = enforceApiKeyInFlightLimit(
			concurrent,
			setHeader,
			dependencies
		);
		expect(rejected?.status).toBe(429);
		expect(rejected?.headers.get("retry-after")).toBe("1");
		expect(consume).toHaveBeenCalledTimes(1);

		releaseApiKeyInFlight(first, dependencies.inFlightGate);

		const retried = createHeadRequest("dbdy_head_key");
		expect(
			enforceApiKeyInFlightLimit(retried, setHeader, dependencies)
		).toBeUndefined();
		expect(
			await enforceApiKeyRateLimit(retried, setHeader, { dependencies })
		).toBeUndefined();
		expect(consume).toHaveBeenCalledTimes(2);
		releaseApiKeyInFlight(retried, dependencies.inFlightGate);
	});

	it("applies admission when Elysia dispatches HEAD to a GET handler", async () => {
		const key = createApiKey("head-route", { rateLimitMax: 300 });
		const { consume, dependencies } = createDependencies(
			new Map([["dbdy_head_route", key]])
		);
		const { app, getHandlerCalls } = createLinksApp(dependencies);

		const response = await app.handle(createHeadRequest("dbdy_head_route"));

		expect(response.status).toBe(200);
		expect(consume).toHaveBeenCalledWith("api-key:head-route", 300, 60);
		expect(getHandlerCalls()).toBe(1);
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
		expect(recordAdmissionOutcome).toHaveBeenCalledTimes(1);
		expect(recordAdmissionOutcome).toHaveBeenCalledWith(
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
		expect(degraded.dependencies.recordAdmissionOutcome).toHaveBeenCalledTimes(
			1
		);
		expect(degraded.dependencies.recordAdmissionOutcome).toHaveBeenCalledWith(
			"redis_fail_open"
		);
	});

	it.each([
		[
			"pool acquisition timeout",
			Object.assign(new Error("Connection terminated due to timeout"), {
				code: "ETIMEDOUT",
			}),
		],
		[
			"PostgreSQL statement timeout",
			Object.assign(
				new Error("canceling statement due to statement timeout"),
				{ code: "57014" }
			),
		],
	])("releases the in-flight lease after %s", async (_case, error) => {
		const key = createApiKey("resolution-timeout", { rateLimitMax: 300 });
		const timeout = createDependencies(
			new Map([["dbdy_resolution_timeout", key]]),
			1
		);
		timeout.dependencies.resolveApiKey = vi
			.fn()
			.mockRejectedValueOnce(error)
			.mockResolvedValue(key);
		const { app, getHandlerCalls } = createLinksApp(timeout.dependencies);

		const failed = await app.handle(
			createLinkRequest("dbdy_resolution_timeout")
		);
		expect(failed.status).toBe(503);
		expect(failed.headers.get("retry-after")).toBe("5");
		expect(await failed.json()).toMatchObject({
			code: "SERVICE_UNAVAILABLE",
			success: false,
		});
		expect(timeout.recordAdmissionOutcome).toHaveBeenCalledWith(
			"dependency_unavailable"
		);
		await waitForAfterResponse();

		const retried = await app.handle(
			createLinkRequest("dbdy_resolution_timeout")
		);
		expect(retried.status).toBe(200);
		expect(getHandlerCalls()).toBe(1);
	});

	it("fails closed when the distributed quota dependency rejects", async () => {
		const key = createApiKey("quota-timeout", { rateLimitMax: 300 });
		const timeout = createDependencies(
			new Map([["dbdy_quota_timeout", key]])
		);
		timeout.dependencies.consume = vi
			.fn()
			.mockRejectedValue(new Error("Rate limit operation timed out"));
		const { app, getHandlerCalls } = createLinksApp(timeout.dependencies);

		const response = await app.handle(
			createLinkRequest("dbdy_quota_timeout")
		);

		expect(response.status).toBe(503);
		expect(response.headers.get("retry-after")).toBe("5");
		expect(await response.json()).toMatchObject({
			code: "SERVICE_UNAVAILABLE",
			error: "Service temporarily unavailable",
			success: false,
		});
		expect(getHandlerCalls()).toBe(0);
		expect(timeout.recordAdmissionOutcome).toHaveBeenCalledWith(
			"dependency_unavailable"
		);
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

	it("uses the paid-safe default for either missing or invalid value", () => {
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
		expect(
			getApiKeyRateLimitConfig(
				createApiKey("invalid-max", { rateLimitMax: 0 })
			)
		).toEqual({
			limit: DEFAULT_API_KEY_RATE_LIMIT.limit,
			windowSeconds: 60,
		});
		expect(
			getApiKeyRateLimitConfig(
				createApiKey("invalid-window", { rateLimitTimeWindow: -1 })
			)
		).toEqual({
			limit: 2,
			windowSeconds: DEFAULT_API_KEY_RATE_LIMIT.windowSeconds,
		});
		expect(getApiKeyRateLimitConfig(createApiKey("configured"))).toEqual({
			limit: 2,
			windowSeconds: 60,
		});
	});
});
