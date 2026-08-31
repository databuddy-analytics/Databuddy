import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import * as actualLinkVisitDelivery from "../lib/link-visit-delivery";

const dbSelect = mock(() => ({
	from: () => ({
		where: () => ({
			limit: async () => [],
		}),
	}),
}));
const getCachedLink = mock();
const ratelimit = mock();
const resolveDeepLink = mock();
const enqueueLinkVisit = mock();
const captureError = mock(() => {});
const captureWarning = mock(() => {});
const emitServiceEvent = mock(() => {});
const setCachedLinkIfAbsent = mock(async () => true);
const setCachedLinkNotFoundIfAbsent = mock(async () => true);
const linkVisitDeliveryModule = { ...actualLinkVisitDelivery };

mock.module("@databuddy/env/app", () => ({
	config: { urls: { dashboard: "https://dashboard.test" } },
}));

mock.module("@databuddy/db", () => ({
	and: (...conditions: unknown[]) => conditions,
	db: { select: dbSelect },
	eq: (left: unknown, right: unknown) => [left, right],
	isNull: (value: unknown) => value,
}));

mock.module("@databuddy/db/schema", () => ({
	links: {
		androidUrl: "androidUrl",
		deepLinkApp: "deepLinkApp",
		deletedAt: "deletedAt",
		expiredRedirectUrl: "expiredRedirectUrl",
		expiresAt: "expiresAt",
		id: "id",
		iosUrl: "iosUrl",
		ogDescription: "ogDescription",
		ogImageUrl: "ogImageUrl",
		ogTitle: "ogTitle",
		ogVideoUrl: "ogVideoUrl",
		slug: "slug",
		targetUrl: "targetUrl",
	},
}));

mock.module("@databuddy/redis", () => ({
	getCachedLink,
	getRateLimitHeaders: (result: {
		limit: number;
		remaining: number;
		reset: number;
		success: boolean;
	}) => ({
		"X-RateLimit-Limit": String(result.limit),
		"X-RateLimit-Remaining": String(result.remaining),
	}),
	ratelimit,
	setCachedLinkIfAbsent,
	setCachedLinkNotFoundIfAbsent,
}));

mock.module("@databuddy/shared/bot-detection", () => ({
	BotCategory: {
		SEARCH_ENGINE: "search_engine",
		SOCIAL_MEDIA: "social_media",
	},
	detectBot: () => ({ category: "other", isBot: false }),
}));

mock.module("@databuddy/shared/constants/deep-link-apps", () => ({
	resolveDeepLink,
}));

mock.module("../lib/logging", () => ({
	captureError,
	captureWarning,
	emitServiceEvent,
	mergeWideEvent: mock(() => {}),
	record: async <T>(_name: string, run: () => Promise<T> | T) => run(),
	setAttributes: mock(() => {}),
}));

mock.module("../lib/link-visit-delivery", () => ({
	...linkVisitDeliveryModule,
	enqueueLinkVisit,
}));

mock.module("../utils/geo", () => ({
	extractIp: () => "127.0.0.1",
	getGeo: mock(async () => ({ city: null, country: null, region: null })),
}));

const { redirectRoute } = await import("./redirect");
const app = new Elysia().use(redirectRoute);

const baseLink = {
	androidUrl: null,
	deepLinkApp: null,
	expiredRedirectUrl: null,
	expiresAt: null,
	id: "link-1",
	iosUrl: null,
	ogDescription: null,
	ogImageUrl: null,
	ogTitle: null,
	ogVideoUrl: null,
	targetUrl: "https://example.com",
};

beforeEach(() => {
	dbSelect.mockClear();
	getCachedLink.mockClear();
	ratelimit.mockClear();
	resolveDeepLink.mockClear();
	enqueueLinkVisit.mockClear();
	captureError.mockClear();
	captureWarning.mockClear();
	emitServiceEvent.mockClear();
	setCachedLinkIfAbsent.mockClear();
	setCachedLinkNotFoundIfAbsent.mockClear();
	dbSelect.mockImplementation(() => ({
		from: () => ({
			where: () => ({
				limit: async () => [],
			}),
		}),
	}));
	getCachedLink.mockResolvedValue({ state: "miss" });
	ratelimit.mockResolvedValue({
		limit: 60,
		remaining: 59,
		reset: Date.now() + 60_000,
		success: true,
	});
	resolveDeepLink.mockReturnValue(null);
	enqueueLinkVisit.mockResolvedValue(undefined);
});

describe("redirect route", () => {
	test("warns and falls through to Postgres when the cache is unavailable", async () => {
		const cacheError = new Error("Redis unavailable");
		getCachedLink.mockRejectedValueOnce(cacheError);

		const response = await app.handle(
			new Request("http://links.test/cache-fallback")
		);

		expect(response.status).toBe(302);
		expect(dbSelect).toHaveBeenCalledTimes(1);
		expect(captureWarning).toHaveBeenCalledWith(cacheError, {
			error_step: "cache_get",
		});
		expect(captureError).not.toHaveBeenCalled();
	});

	test("uses a negative cache hit without querying Postgres", async () => {
		getCachedLink.mockResolvedValue({ state: "not_found" });

		const response = await app.handle(
			new Request("http://links.test/missing-link")
		);

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"https://dashboard.test/dby/not-found"
		);
		expect(dbSelect).not.toHaveBeenCalled();
	});

	test("serves a link under mutation from Postgres without cache writes", async () => {
		getCachedLink.mockResolvedValue({ state: "pending" });
		dbSelect.mockImplementation(() => ({
			from: () => ({
				where: () => ({
					limit: async () => [{ ...baseLink, expiresAt: null }],
				}),
			}),
		}));

		const response = await app.handle(
			new Request("http://links.test/updating-link")
		);

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe("https://example.com");
		expect(dbSelect).toHaveBeenCalledTimes(1);
		expect(setCachedLinkIfAbsent).not.toHaveBeenCalled();
		expect(setCachedLinkNotFoundIfAbsent).not.toHaveBeenCalled();
	});

	test("returns a retryable 503 when Postgres is unavailable on a cache miss", async () => {
		dbSelect.mockImplementation(() => {
			throw new Error("connection refused");
		});

		const response = await app.handle(
			new Request("http://links.test/cold-link")
		);

		expect(response.status).toBe(503);
		expect(response.headers.get("retry-after")).toBe("5");
		expect(captureError).toHaveBeenCalled();
	});

	test("limits cache misses before querying Postgres", async () => {
		ratelimit.mockResolvedValue({
			limit: 60,
			remaining: 0,
			reset: Date.now() + 60_000,
			success: false,
		});

		const response = await app.handle(
			new Request("http://links.test/uncached-link")
		);

		expect(response.status).toBe(429);
		expect(dbSelect).not.toHaveBeenCalled();
	});

	test("serves a mobile deep-link launcher with a safe HTTPS fallback", async () => {
		getCachedLink.mockResolvedValue({
			link: {
				...baseLink,
				id: "deep-link-1",
				deepLinkApp: "instagram",
				iosUrl: "javascript:alert(1)",
				targetUrl: "https://www.instagram.com/databuddy",
			},
			state: "hit",
		});
		resolveDeepLink.mockReturnValue("instagram://user?username=databuddy");

		const response = await app.handle(
			new Request("http://links.test/databuddy", {
				headers: {
					"user-agent":
						"Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X)",
				},
			})
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		const body = await response.text();
		expect(body).toContain("instagram://user?username=databuddy");
		expect(body).toContain("https://www.instagram.com/databuddy");
		expect(body).not.toContain("javascript:alert(1)");
		expect(enqueueLinkVisit).toHaveBeenCalledWith(
			expect.objectContaining({ link_id: "deep-link-1" })
		);
	});

	test("ignores an unsafe legacy expiry redirect", async () => {
		getCachedLink.mockResolvedValue({
			link: {
				...baseLink,
				expiredRedirectUrl: "javascript:alert(1)",
				expiresAt: "2000-01-01T00:00:00.000Z",
			},
			state: "hit",
		});

		const response = await app.handle(
			new Request("http://links.test/expired-link")
		);

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"https://dashboard.test/dby/expired"
		);
		expect(enqueueLinkVisit).not.toHaveBeenCalled();
	});

	test("redirects even when the durable queue rejects a click", async () => {
		getCachedLink.mockResolvedValue({
			link: { ...baseLink, id: "durable-link-1" },
			state: "hit",
		});
		enqueueLinkVisit.mockRejectedValueOnce(new Error("queue unavailable"));

		const response = await app.handle(
			new Request("http://links.test/durable-link")
		);

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe("https://example.com");
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(emitServiceEvent).toHaveBeenCalledWith(
			"error",
			expect.objectContaining({
				links: "click_lost",
				link_id: "durable-link-1",
			})
		);
	});

	test("queues the click before redirecting", async () => {
		getCachedLink.mockResolvedValue({
			link: { ...baseLink, id: "durable-link-2" },
			state: "hit",
		});

		const response = await app.handle(
			new Request("http://links.test/durable-link-two")
		);

		expect(response.status).toBe(302);
		expect(enqueueLinkVisit).toHaveBeenCalledWith(
			expect.objectContaining({
				id: expect.any(String),
				link_id: "durable-link-2",
			})
		);
	});
});
