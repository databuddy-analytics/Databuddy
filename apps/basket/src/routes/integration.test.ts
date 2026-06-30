import { vi, beforeEach, describe, expect, test } from "vitest";

const {
	noop,
	noopAsync,
	mockLogger,
	mockValidateRequest,
	mockCheckForBot,
	mockInsertTrackEvent,
	mockInsertOutgoingLink,
	mockInsertTrackEventsBatch,
	mockInsertOutgoingLinksBatch,
	mockInsertIndividualVitals,
	mockInsertErrorSpans,
	mockInsertCustomEvents,
	mockGetApiKeyFromHeader,
	mockHasKeyScope,
	mockHasGlobalAccess,
	mockGetAccessibleWebsiteIds,
	mockGetWebsiteByIdV2,
	mockResolveApiKeyOwnerId,
} = vi.hoisted(() => {
	const noop = vi.fn(() => {});
	const noopAsync = vi.fn(() => Promise.resolve());
	const defaultApiKey = {
		id: "key_1",
		organizationId: "org_1",
		userId: "user_1",
		scopes: ["track:events"],
	};
	const defaultWebsite = {
		id: "ws_test",
		domain: "example.com",
		name: "Test",
		status: "ACTIVE",
		ownerId: "user_1",
		organizationId: "org_1",
	};
	return {
		noop,
		noopAsync,
		mockLogger: {
			set: vi.fn(() => {}),
			warn: vi.fn(() => {}),
			error: vi.fn(() => {}),
			info: vi.fn(() => {}),
		},
		mockValidateRequest: vi.fn(() =>
			Promise.resolve({
				clientId: "ws_test",
				userAgent: "TestAgent/1.0",
				ip: "1.2.3.4",
				ownerId: "user_1",
				organizationId: "org_1",
			})
		),
		mockCheckForBot: vi.fn(() => Promise.resolve(undefined)),
		mockInsertTrackEvent: vi.fn(() => Promise.resolve()),
		mockInsertOutgoingLink: vi.fn(() => Promise.resolve()),
		mockInsertTrackEventsBatch: vi.fn(() => Promise.resolve()),
		mockInsertOutgoingLinksBatch: vi.fn(() => Promise.resolve()),
		mockInsertIndividualVitals: vi.fn(() => Promise.resolve()),
		mockInsertErrorSpans: vi.fn(() => Promise.resolve()),
		mockInsertCustomEvents: vi.fn(() => Promise.resolve()),
		mockGetApiKeyFromHeader: vi.fn(() => Promise.resolve(defaultApiKey)),
		mockHasKeyScope: vi.fn(() => true),
		mockHasGlobalAccess: vi.fn(() => false),
		mockGetAccessibleWebsiteIds: vi.fn(() => ["ws_test"]),
		mockGetWebsiteByIdV2: vi.fn(() => Promise.resolve(defaultWebsite)),
		mockResolveApiKeyOwnerId: vi.fn(() => Promise.resolve("user_1")),
	};
});

vi.mock("evlog/elysia", () => ({
	useLogger: () => mockLogger,
}));

vi.mock("@lib/tracing", () => ({
	record: (_n: string, fn: Function) => Promise.resolve().then(() => fn()),
	captureError: noop,
}));

vi.mock("@lib/request-validation", () => ({
	validateRequest: mockValidateRequest,
	checkForBot: mockCheckForBot,
	getWebsiteSecuritySettings: vi.fn(() => null),
	ValidatedRequest: {},
}));

vi.mock("@lib/event-service", () => ({
	buildTrackEvent: vi.fn(() => ({
		id: "built_id",
		client_id: "ws_test",
		event_name: "pageview",
	})),
	insertTrackEvent: mockInsertTrackEvent,
	insertOutgoingLink: mockInsertOutgoingLink,
	insertTrackEventsBatch: mockInsertTrackEventsBatch,
	insertOutgoingLinksBatch: mockInsertOutgoingLinksBatch,
	insertIndividualVitals: mockInsertIndividualVitals,
	insertErrorSpans: mockInsertErrorSpans,
	insertCustomEvents: mockInsertCustomEvents,
}));

vi.mock("@lib/security", () => ({
	getDailySalt: vi.fn(() => Promise.resolve("test-salt")),
	saltAnonymousId: vi.fn((id: string) => `salted_${id}`),
	checkDuplicate: vi.fn(() => Promise.resolve(false)),
	applyVisitorIdPrivacy: vi.fn((id: string) => `salted_${id}`),
	shouldAnonymizeVisitorIds: vi.fn(() => true),
}));

vi.mock("@utils/ip-geo", () => ({
	getGeo: vi.fn(() =>
		Promise.resolve({
			anonymizedIP: "abc123",
			country: "US",
			region: "CA",
			city: "SF",
		})
	),
	extractIpFromRequest: vi.fn(() => "1.2.3.4"),
	extractTrustedClientIp: vi.fn(() => "1.2.3.4"),
	getVisitorCountryForAutoMode: vi.fn((events: Array<{ anonymizeVisitorIds?: unknown }>) =>
		Promise.resolve(
			events.some((event) => event.anonymizeVisitorIds === "auto")
				? "US"
				: undefined
		)
	),
	closeGeoIPReader: noop,
}));

vi.mock("@utils/user-agent", () => ({
	parseUserAgent: vi.fn(() =>
		Promise.resolve({ browserName: "Chrome", osName: "Windows" })
	),
	detectBot: vi.fn(() => ({ isBot: false })),
}));

vi.mock("@lib/blocked-traffic", () => ({
	logBlockedTraffic: noop,
}));

vi.mock("@lib/billing", () => ({
	checkAutumnUsage: vi.fn(() => Promise.resolve({ allowed: true })),
}));

vi.mock("@databuddy/redis/rate-limit", () => ({
	ratelimit: vi.fn(() =>
		Promise.resolve({ success: true, limit: 600, remaining: 599, reset: 60 })
	),
	getRateLimitHeaders: vi.fn(() => ({})),
}));

vi.mock("@lib/api-key", () => ({
	getApiKeyFromHeader: mockGetApiKeyFromHeader,
	hasKeyScope: mockHasKeyScope,
	hasGlobalAccess: mockHasGlobalAccess,
	getAccessibleWebsiteIds: mockGetAccessibleWebsiteIds,
}));

vi.mock("@hooks/auth", () => ({
	getWebsiteByIdV2: mockGetWebsiteByIdV2,
	resolveApiKeyOwnerId: mockResolveApiKeyOwnerId,
	isOriginAllowed: vi.fn(() => true),
	isValidIpFromSettings: vi.fn(() => true),
}));

vi.mock("@lib/producer", () => ({
	runFork: noop,
	send: vi.fn(() => ({})),
	sendBatch: vi.fn(() => ({})),
	runPromise: noopAsync,
}));

// ── Import routes after mocks ──

const { buildBasketErrorPayload } = await import("@lib/structured-errors");
const { Elysia } = await import("elysia");

// Wrap basket routes with the same onError handler as index.ts
const rawBasket = (await import("./basket")).default;
const basketApp = new Elysia()
	.onError(({ error, code }) => {
		if (code === "NOT_FOUND") {
			return new Response(null, { status: 404 });
		}
		const { status, payload } = buildBasketErrorPayload(error, {
			elysiaCode: code ?? "INTERNAL_SERVER_ERROR",
		});
		return new Response(JSON.stringify(payload), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	})
	.use(rawBasket);

const rawTrack = (await import("./track")).trackRoute;
const trackRoute = new Elysia()
	.onError(({ error, code }) => {
		if (code === "NOT_FOUND") {
			return new Response(null, { status: 404 });
		}
		const { status, payload } = buildBasketErrorPayload(error, {
			elysiaCode: code ?? "INTERNAL_SERVER_ERROR",
		});
		return new Response(JSON.stringify(payload), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	})
	.use(rawTrack);

// ── Helpers ──

const now = Date.now();

function post(
	app: any,
	path: string,
	body: unknown,
	headers?: Record<string, string>
) {
	return app.handle(
		new Request(`http://localhost${path}`, {
			method: "POST",
			body: JSON.stringify(body),
			headers: { "Content-Type": "application/json", ...headers },
		})
	);
}

function get(app: any, path: string) {
	return app.handle(new Request(`http://localhost${path}`));
}

async function json(res: Response) {
	return res.json() as Promise<Record<string, unknown>>;
}

// ── POST / (single ingest) ──

describe("POST /", () => {
	beforeEach(() => {
		mockInsertTrackEvent.mockClear();
		mockInsertOutgoingLink.mockClear();
	});

	test("valid track event → 200", async () => {
		const res = await post(basketApp, "/", {
			type: "track",
			eventId: "evt_1",
			name: "pageview",
			path: "https://example.com/page",
		});
		expect(res.status).toBe(200);
		const body = await json(res);
		expect(body.status).toBe("success");
		expect(body.type).toBe("track");
	});

	test("valid outgoing_link → 200", async () => {
		const res = await post(basketApp, "/", {
			type: "outgoing_link",
			eventId: "evt_link_1",
			href: "https://external.com",
		});
		expect(res.status).toBe(200);
		const body = await json(res);
		expect(body.type).toBe("outgoing_link");
	});

	test("unknown event type → 400", async () => {
		const res = await post(basketApp, "/", { type: "bogus" });
		expect(res.status).toBe(400);
	});
});

// ── POST /vitals ──

describe("POST /vitals", () => {
	test("valid vitals batch → 200", async () => {
		const res = await post(basketApp, "/vitals", [
			{
				timestamp: now,
				path: "https://example.com/page",
				metricName: "LCP",
				metricValue: 2500,
			},
		]);
		expect(res.status).toBe(200);
		const body = await json(res);
		expect(body.status).toBe("success");
		expect(body.type).toBe("web_vitals");
		expect(body.count).toBe(1);
	});

	test("invalid vitals (bad metric name) → 400", async () => {
		const res = await post(basketApp, "/vitals", [
			{
				timestamp: now,
				path: "https://example.com",
				metricName: "BOGUS",
				metricValue: 100,
			},
		]);
		expect(res.status).toBe(400);
	});

	test("empty array → 200 with count 0", async () => {
		const res = await post(basketApp, "/vitals", []);
		expect(res.status).toBe(200);
		const body = await json(res);
		expect(body.count).toBe(0);
	});

	test("not an array → 400", async () => {
		const res = await post(basketApp, "/vitals", { not: "array" });
		expect(res.status).toBe(400);
	});
});

// ── POST /errors ──

describe("POST /errors", () => {
	test("valid error batch → 200", async () => {
		const res = await post(basketApp, "/errors", [
			{
				timestamp: now,
				path: "https://example.com/page",
				message: "TypeError: x is undefined",
			},
		]);
		expect(res.status).toBe(200);
		const body = await json(res);
		expect(body.status).toBe("success");
		expect(body.type).toBe("error");
		expect(body.count).toBe(1);
	});

	test("missing message → 400", async () => {
		const res = await post(basketApp, "/errors", [
			{ timestamp: now, path: "https://example.com" },
		]);
		expect(res.status).toBe(400);
	});
});

// ── POST /events (custom events) ──

describe("POST /events", () => {
	test("valid custom event → 200", async () => {
		const res = await post(basketApp, "/events", [
			{
				timestamp: now,
				path: "https://example.com/page",
				eventName: "purchase",
			},
		]);
		expect(res.status).toBe(200);
		const body = await json(res);
		expect(body.status).toBe("success");
		expect(body.type).toBe("custom_event");
	});

	test("empty eventName → 400", async () => {
		const res = await post(basketApp, "/events", [
			{ timestamp: now, path: "https://example.com", eventName: "" },
		]);
		expect(res.status).toBe(400);
	});

	test("missing organizationId → 400", async () => {
		mockValidateRequest.mockResolvedValueOnce({
			clientId: "ws_test",
			userAgent: "TestAgent/1.0",
			ip: "1.2.3.4",
			ownerId: "user_1",
			organizationId: undefined,
		} as any);
		const res = await post(basketApp, "/events", [
			{ timestamp: now, path: "https://example.com/page", eventName: "x" },
		]);
		expect(res.status).toBe(400);
	});

	test("schema rejection wide-event includes event names + property keys", async () => {
		mockLogger.set.mockClear();
		const res = await post(basketApp, "/events", [
			{
				timestamp: now,
				path: "https://example.com",
				eventName: "purchase",
				properties: { plan: "pro", source: "homepage" },
			},
			{ timestamp: now, path: "https://example.com", eventName: "" },
		]);
		expect(res.status).toBe(400);
		const setCalls = mockLogger.set.mock.calls.map((c: unknown[]) => c[0]);
		const summaryCall = setCalls.find(
			(c: Record<string, unknown>) => c.rejectedEventCount !== undefined
		) as Record<string, unknown>;
		expect(summaryCall).toBeDefined();
		expect(summaryCall.rejectedEventCount).toBe(2);
		expect(summaryCall.rejectedEventNames).toEqual(["purchase"]);
		expect(summaryCall.rejectedPropertyKeys).toEqual(
			expect.arrayContaining(["plan", "source"])
		);
	});

	test("missing-organization rejection captures event-name summary", async () => {
		mockLogger.set.mockClear();
		mockValidateRequest.mockResolvedValueOnce({
			clientId: "ws_test",
			userAgent: "TestAgent/1.0",
			ip: "1.2.3.4",
			ownerId: "user_1",
			organizationId: undefined,
		} as any);
		const res = await post(basketApp, "/events", [
			{
				timestamp: now,
				path: "https://example.com",
				eventName: "signup",
				properties: { plan: "free" },
			},
		]);
		expect(res.status).toBe(400);
		const setCalls = mockLogger.set.mock.calls.map((c: unknown[]) => c[0]);
		const summaryCall = setCalls.find(
			(c: Record<string, unknown>) => c.rejectedEventCount !== undefined
		) as Record<string, unknown>;
		expect(summaryCall).toBeDefined();
		expect(summaryCall.rejectedEventCount).toBe(1);
		expect(summaryCall.rejectedEventNames).toEqual(["signup"]);
		expect(summaryCall.rejectedPropertyKeys).toEqual(["plan"]);
	});
});

// ── POST /batch ──

describe("POST /batch", () => {
	test("batch of track events → 200", async () => {
		const res = await post(basketApp, "/batch", [
			{
				type: "track",
				eventId: "evt_1",
				name: "pageview",
				path: "https://example.com/a",
			},
			{
				type: "track",
				eventId: "evt_2",
				name: "click",
				path: "https://example.com/b",
			},
		]);
		expect(res.status).toBe(200);
		const body = await json(res);
		expect(body.batch).toBe(true);
		expect(body.processed).toBe(2);
	});

	test("not an array → 400", async () => {
		const res = await post(basketApp, "/batch", { not: "array" });
		expect(res.status).toBe(400);
	});

	test("too many events (101) → 400", async () => {
		const events = Array.from({ length: 101 }, (_, i) => ({
			type: "track",
			eventId: `evt_${i}`,
			name: "x",
			path: "https://example.com",
		}));
		const res = await post(basketApp, "/batch", events);
		expect(res.status).toBe(400);
	});

	test("mixed valid + unknown types → partial results", async () => {
		const res = await post(basketApp, "/batch", [
			{
				type: "track",
				eventId: "evt_1",
				name: "pageview",
				path: "https://example.com/a",
			},
			{ type: "bogus_type" },
		]);
		expect(res.status).toBe(200);
		const body = await json(res);
		expect(body.processed).toBe(2);
		const results = body.results as any[];
		expect(results[1].status).toBe("error");
		expect(results[1].message).toBe("Unknown event type");
	});

	test("all invalid batch items keep transport 200 with per-item errors", async () => {
		const res = await post(basketApp, "/batch", [
			{ type: "bogus_type" },
			{ type: "also_bogus" },
		]);
		expect(res.status).toBe(200);
		const body = await json(res);
		expect(body.status).toBe("error");
		expect(body.processed).toBe(2);
		expect(body.results).toEqual([
			expect.objectContaining({
				status: "error",
				message: "Unknown event type",
			}),
			expect.objectContaining({
				status: "error",
				message: "Unknown event type",
			}),
		]);
	});
});

// ── GET /px.jpg ──

describe("GET /px.jpg", () => {
	test("returns transparent GIF", async () => {
		const res = await get(basketApp, "/px.jpg?type=track&name=pageview");
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("image/gif");
	});

	test("always returns pixel even on error", async () => {
		mockValidateRequest.mockRejectedValueOnce(new Error("boom"));
		const res = await get(basketApp, "/px.jpg?name=test");
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("image/gif");
	});
});

// ── POST /track (API key custom events) ──

describe("POST /track", () => {
	beforeEach(() => {
		mockInsertCustomEvents.mockClear();
		mockGetApiKeyFromHeader.mockReset();
		mockHasKeyScope.mockReset();
		mockHasGlobalAccess.mockReset();
		mockGetAccessibleWebsiteIds.mockReset();
		mockGetWebsiteByIdV2.mockReset();
		mockResolveApiKeyOwnerId.mockReset();

		mockGetApiKeyFromHeader.mockResolvedValue({
			id: "key_1",
			organizationId: "org_1",
			userId: "user_1",
			scopes: ["track:events"],
		});
		mockHasKeyScope.mockReturnValue(true);
		mockHasGlobalAccess.mockReturnValue(false);
		mockGetAccessibleWebsiteIds.mockReturnValue(["ws_test"]);
		mockGetWebsiteByIdV2.mockResolvedValue({
			id: "ws_test",
			domain: "example.com",
			name: "Test",
			status: "ACTIVE",
			ownerId: "user_1",
			organizationId: "org_1",
		});
		mockResolveApiKeyOwnerId.mockResolvedValue("user_1");
	});

	test("single event → 200", async () => {
		const res = await post(trackRoute, "/track", {
			name: "signup",
			websiteId: "ws_test",
		});
		expect(res.status).toBe(200);
		const body = await json(res);
		expect(body.status).toBe("success");
		expect(body.type).toBe("custom_event");
		expect(body.count).toBe(1);
	});

	test("batch of events → 200", async () => {
		const res = await post(trackRoute, "/track", [
			{ name: "signup", websiteId: "ws_test" },
			{ name: "purchase", websiteId: "ws_test", properties: { plan: "pro" } },
		]);
		expect(res.status).toBe(200);
		const body = await json(res);
		expect(body.count).toBe(2);
	});

	test("api key + no websiteId → 200 (org-scoped event)", async () => {
		mockHasGlobalAccess.mockReturnValue(true);
		const res = await post(trackRoute, "/track", { name: "org_event" });
		expect(res.status).toBe(200);
		expect(mockInsertCustomEvents).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					event_name: "org_event",
					website_id: undefined,
					owner_id: "org_1",
				}),
			],
			undefined
		);
	});

	test("website-scoped api key + no websiteId → 200 (org-scoped event)", async () => {
		const res = await post(trackRoute, "/track", { name: "org_event" });
		expect(res.status).toBe(200);
		expect(mockInsertCustomEvents).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					event_name: "org_event",
					website_id: undefined,
				}),
			],
			undefined
		);
	});

	test("website-scoped api key + websiteId outside scope → 403", async () => {
		const res = await post(trackRoute, "/track", {
			name: "signup",
			websiteId: "ws_other",
		});
		expect(res.status).toBe(403);
		expect(mockInsertCustomEvents).not.toHaveBeenCalled();
	});

	test("schema rejection wide-event includes event names + property keys", async () => {
		mockLogger.set.mockClear();
		const res = await post(trackRoute, "/track", [
			{ name: "signup", properties: { plan: "pro", source: "homepage" } },
			{ name: "purchase", properties: { plan: "pro", amount: 42 } },
			{ namespace: "no_name_here" },
		]);
		expect(res.status).toBe(400);

		const setCalls = mockLogger.set.mock.calls.map((c: unknown[]) => c[0]);
		const rejectedCall = setCalls.find(
			(c: Record<string, unknown>) => c.rejected === "schema"
		);
		expect(rejectedCall).toBeDefined();
		const summaryCall = setCalls.find(
			(c: Record<string, unknown>) => c.rejectedEventCount !== undefined
		) as Record<string, unknown>;
		expect(summaryCall).toBeDefined();
		expect(summaryCall.rejectedEventCount).toBe(3);
		expect(summaryCall.rejectedEventNames).toEqual(["signup", "purchase"]);
		expect(summaryCall.rejectedPropertyKeys).toEqual(
			expect.arrayContaining(["plan", "source", "amount"])
		);
		expect(summaryCall.rejectedHasWebsiteId).toBe(false);
	});

	test("scope rejection wide-event includes event names", async () => {
		mockLogger.set.mockClear();
		const res = await post(trackRoute, "/track", {
			name: "purchase",
			websiteId: "ws_other",
			properties: { sku: "abc" },
		});
		expect(res.status).toBe(403);

		const setCalls = mockLogger.set.mock.calls.map((c: unknown[]) => c[0]);
		const summaryCall = setCalls.find(
			(c: Record<string, unknown>) => c.rejectedEventCount !== undefined
		) as Record<string, unknown>;
		expect(summaryCall).toBeDefined();
		expect(summaryCall.rejectedEventCount).toBe(1);
		expect(summaryCall.rejectedEventNames).toEqual(["purchase"]);
		expect(summaryCall.rejectedPropertyKeys).toEqual(["sku"]);
		expect(summaryCall.rejectedHasWebsiteId).toBe(true);
	});

	test("payload-too-large rejection captures rejection summary", async () => {
		mockLogger.set.mockClear();
		const events: unknown[] = [];
		for (let i = 0; i < 5; i++) {
			events.push({
				name: `ev_${i}`,
				websiteId: "ws_test",
				properties: { blob: "a".repeat(250_000) },
			});
		}
		const res = await post(trackRoute, "/track", events);
		expect(res.status).toBe(413);
		const setCalls = mockLogger.set.mock.calls.map((c: unknown[]) => c[0]);
		const rejectedCall = setCalls.find(
			(c: Record<string, unknown>) => c.rejected === "payload_too_large"
		);
		expect(rejectedCall).toBeDefined();
		const summaryCall = setCalls.find(
			(c: Record<string, unknown>) => c.rejectedEventCount !== undefined
		) as Record<string, unknown>;
		expect(summaryCall).toBeDefined();
		expect(summaryCall.rejectedEventCount).toBe(5);
		expect(summaryCall.rejectedEventNames).toEqual([
			"ev_0",
			"ev_1",
			"ev_2",
			"ev_3",
			"ev_4",
		]);
	});

	test("rejection summary truncates large name and property sets", async () => {
		mockLogger.set.mockClear();
		const events: unknown[] = [];
		for (let i = 0; i < 80; i++) {
			const props: Record<string, string> = {};
			for (let j = 0; j < 10; j++) {
				props[`p_${i}_${j}`] = "v";
			}
			events.push({ namespace: "x", properties: props });
		}
		const res = await post(trackRoute, "/track", events);
		expect(res.status).toBe(400);
		const setCalls = mockLogger.set.mock.calls.map((c: unknown[]) => c[0]);
		const summaryCall = setCalls.find(
			(c: Record<string, unknown>) => c.rejectedEventCount !== undefined
		) as Record<string, unknown>;
		expect(summaryCall).toBeDefined();
		expect(summaryCall.rejectedEventCount).toBe(80);
		expect((summaryCall.rejectedEventNames as string[]).length).toBe(0);
		expect(
			(summaryCall.rejectedPropertyKeys as string[]).length
		).toBeLessThanOrEqual(50);
	});

	test("rejection summary handles non-object body (string)", async () => {
		mockLogger.set.mockClear();
		const res = await post(trackRoute, "/track", "not an object" as never);
		expect(res.status).toBe(400);
		const setCalls = mockLogger.set.mock.calls.map((c: unknown[]) => c[0]);
		const summaryCall = setCalls.find(
			(c: Record<string, unknown>) => c.rejectedEventCount !== undefined
		) as Record<string, unknown>;
		expect(summaryCall).toBeDefined();
		expect(summaryCall.rejectedEventCount).toBe(1);
		expect(summaryCall.rejectedEventNames).toEqual([]);
		expect(summaryCall.rejectedPropertyKeys).toEqual([]);
	});

	test("rejection summary skips event names exceeding max length", async () => {
		mockLogger.set.mockClear();
		const longName = "x".repeat(257);
		const res = await post(trackRoute, "/track", [
			{ name: longName, properties: { k: "v" } },
			{ name: "ok_name", properties: { k: "v" } },
		]);
		expect(res.status).toBe(400);
		const setCalls = mockLogger.set.mock.calls.map((c: unknown[]) => c[0]);
		const summaryCall = setCalls.find(
			(c: Record<string, unknown>) => c.rejectedEventCount !== undefined
		) as Record<string, unknown>;
		expect(summaryCall).toBeDefined();
		expect(summaryCall.rejectedEventNames).toEqual(["ok_name"]);
	});

	test("global api key + websiteId in event still allowed (not scope-checked)", async () => {
		mockHasGlobalAccess.mockReturnValue(true);
		const res = await post(trackRoute, "/track", {
			name: "any_event",
			websiteId: "ws_anywhere",
		});
		expect(res.status).toBe(200);
		expect(mockInsertCustomEvents).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					event_name: "any_event",
					website_id: "ws_anywhere",
				}),
			],
			undefined
		);
	});

	test("api key with no scope → 403 (regression: trackMissingScope)", async () => {
		mockHasKeyScope.mockReturnValue(false);
		const res = await post(trackRoute, "/track", {
			name: "signup",
			websiteId: "ws_test",
		});
		expect(res.status).toBe(403);
		expect(mockInsertCustomEvents).not.toHaveBeenCalled();
	});

	test("api key without owner → 400 (regression: trackMissingOwner)", async () => {
		mockGetApiKeyFromHeader.mockResolvedValueOnce({
			id: "key_x",
			organizationId: null,
			userId: null,
			scopes: ["track:events"],
		} as never);
		const res = await post(trackRoute, "/track", {
			name: "signup",
			websiteId: "ws_test",
		});
		expect(res.status).toBe(400);
		expect(mockInsertCustomEvents).not.toHaveBeenCalled();
	});

	test("no api key + no website_id query → 401 (regression: missing credentials)", async () => {
		mockGetApiKeyFromHeader.mockResolvedValueOnce(null);
		const res = await post(trackRoute, "/track", { name: "signup" });
		expect(res.status).toBe(401);
		expect(mockInsertCustomEvents).not.toHaveBeenCalled();
	});

	test("no api key + website not found → 404", async () => {
		mockGetApiKeyFromHeader.mockResolvedValueOnce(null);
		mockGetWebsiteByIdV2.mockResolvedValueOnce(null as never);
		const res = await post(trackRoute, "/track?website_id=ws_missing", {
			name: "signup",
		});
		expect(res.status).toBe(404);
		expect(mockInsertCustomEvents).not.toHaveBeenCalled();
	});

	test("global api key insert sets owner_id from organization", async () => {
		mockHasGlobalAccess.mockReturnValue(true);
		mockInsertCustomEvents.mockClear();
		await post(trackRoute, "/track", { name: "org_event" });
		expect(mockInsertCustomEvents).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					owner_id: "org_1",
					website_id: undefined,
					event_name: "org_event",
				}),
			],
			undefined
		);
	});

	test("preserves namespace, source, anonymousId, sessionId on insert", async () => {
		mockInsertCustomEvents.mockClear();
		await post(trackRoute, "/track", {
			name: "signup",
			websiteId: "ws_test",
			namespace: "auth",
			source: "node",
			anonymousId: "anon_123",
			anonymizeVisitorIds: false,
			sessionId: "sess_456",
		});
		expect(mockInsertCustomEvents).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					event_name: "signup",
					namespace: "auth",
					source: "node",
					anonymous_id: "anon_123",
					anonymizeVisitorIds: false,
					session_id: "sess_456",
				}),
			],
			undefined
		);
	});

	test("resolves request country for auto visitor anonymization", async () => {
		mockInsertCustomEvents.mockClear();
		await post(trackRoute, "/track", {
			name: "signup",
			websiteId: "ws_test",
			anonymousId: "anon_123",
			anonymizeVisitorIds: "auto",
		});
		expect(mockInsertCustomEvents).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					event_name: "signup",
					anonymous_id: "anon_123",
					anonymizeVisitorIds: "auto",
				}),
			],
			"US"
		);
	});

	test("website_id auth accepts matching website batch → 200", async () => {
		mockGetApiKeyFromHeader.mockResolvedValueOnce(null);
		const res = await post(trackRoute, "/track?website_id=ws_test", [
			{ name: "signup" },
			{ name: "purchase", websiteId: "ws_test" },
		]);

		expect(res.status).toBe(200);
		expect(mockInsertCustomEvents).toHaveBeenCalledWith(
			[
				expect.objectContaining({ event_name: "signup", website_id: "ws_test" }),
				expect.objectContaining({ event_name: "purchase", website_id: "ws_test" }),
			],
			undefined
		);
	});

	test("website_id auth rejects mixed-website batch", async () => {
		mockGetApiKeyFromHeader.mockResolvedValueOnce(null);
		const res = await post(trackRoute, "/track?website_id=ws_test", [
			{ name: "signup", websiteId: "ws_test" },
			{ name: "purchase", websiteId: "ws_other" },
		]);

		expect(res.status).toBe(403);
		expect(mockInsertCustomEvents).not.toHaveBeenCalled();
	});

	test("missing name → 400", async () => {
		const res = await post(trackRoute, "/track", {
			namespace: "x",
			websiteId: "ws_test",
		});
		expect(res.status).toBe(400);
	});

	test("empty name → 400", async () => {
		const res = await post(trackRoute, "/track", {
			name: "",
			websiteId: "ws_test",
		});
		expect(res.status).toBe(400);
	});

	test("schema failure response exposes Zod issues to client", async () => {
		const res = await post(trackRoute, "/track", {
			namespace: "x",
			websiteId: "ws_test",
		});
		expect(res.status).toBe(400);
		const body = await json(res);
		expect(Array.isArray(body.errors)).toBe(true);
		const issues = body.errors as Array<Record<string, unknown>>;
		expect(issues.length).toBeGreaterThan(0);
		expect(JSON.stringify(issues)).toContain("name");
	});

	test("invalid timestamp → 400 and no insert", async () => {
		mockInsertCustomEvents.mockClear();
		const res = await post(trackRoute, "/track", {
			name: "signup",
			timestamp: "not-a-date",
			websiteId: "ws_test",
		});
		expect(res.status).toBe(400);
		expect(mockInsertCustomEvents).not.toHaveBeenCalled();
	});

	test("inserts call event-service", async () => {
		mockInsertCustomEvents.mockClear();
		await post(trackRoute, "/track", {
			name: "test_event",
			websiteId: "ws_test",
		});
		expect(mockInsertCustomEvents).toHaveBeenCalled();
	});
});

// ── GET /health (inline in index.ts, test directly) ──

import { Elysia as ElysiaHealth } from "elysia";

describe("GET /health", () => {
	const healthApp = new ElysiaHealth().get("/health", () =>
		Response.json({ status: "ok" }, { status: 200 })
	);

	test("returns 200 with status ok", async () => {
		const res = await healthApp.handle(new Request("http://localhost/health"));
		expect(res.status).toBe(200);
		const body = await json(res);
		expect(body.status).toBe("ok");
	});
});

// ═══════════════════════════════════════════════════════════
// Response contract tests — exact shapes consumers depend on
// ═══════════════════════════════════════════════════════════

describe("response contracts", () => {
	// ── Success responses ──

	test("POST / track → { status, type }", async () => {
		const res = await post(basketApp, "/", {
			type: "track",
			eventId: "evt_c1",
			name: "pageview",
			path: "https://example.com/page",
		});
		const body = await json(res);
		expect(body).toEqual({ status: "success", type: "track" });
	});

	test("POST / outgoing_link → { status, type }", async () => {
		const res = await post(basketApp, "/", {
			type: "outgoing_link",
			eventId: "evt_c2",
			href: "https://external.com",
		});
		const body = await json(res);
		expect(body).toEqual({ status: "success", type: "outgoing_link" });
	});

	test("POST /vitals → { status, type, count }", async () => {
		const res = await post(basketApp, "/vitals", [
			{
				timestamp: now,
				path: "https://example.com",
				metricName: "LCP",
				metricValue: 2500,
			},
			{
				timestamp: now,
				path: "https://example.com",
				metricName: "FCP",
				metricValue: 1200,
			},
		]);
		const body = await json(res);
		expect(body).toEqual({ status: "success", type: "web_vitals", count: 2 });
	});

	test("POST /errors → { status, type, count }", async () => {
		const res = await post(basketApp, "/errors", [
			{ timestamp: now, path: "https://example.com", message: "err" },
		]);
		const body = await json(res);
		expect(body).toEqual({ status: "success", type: "error", count: 1 });
	});

	test("POST /events → { status, type, count }", async () => {
		const res = await post(basketApp, "/events", [
			{ timestamp: now, path: "https://example.com", eventName: "purchase" },
		]);
		const body = await json(res);
		expect(body).toEqual({ status: "success", type: "custom_event", count: 1 });
	});

	test("POST /track → { status, type, count }", async () => {
		const res = await post(trackRoute, "/track", {
			name: "signup",
			websiteId: "ws_test",
		});
		const body = await json(res);
		expect(body).toEqual({ status: "success", type: "custom_event", count: 1 });
	});

	test("POST /batch → { status, batch, processed, batched, results }", async () => {
		const res = await post(basketApp, "/batch", [
			{ type: "track", eventId: "b1", name: "pv", path: "https://example.com" },
		]);
		const body = await json(res);
		expect(body.status).toBe("success");
		expect(body.batch).toBe(true);
		expect(typeof body.processed).toBe("number");
		expect(body.batched).toEqual(
			expect.objectContaining({
				track: expect.any(Number),
				outgoing_link: expect.any(Number),
			})
		);
		expect(Array.isArray(body.results)).toBe(true);
	});

	// ── Error responses ──

	test("400 error → { success, status, error, message, code, why, fix }", async () => {
		const res = await post(basketApp, "/batch", { not: "array" });
		expect(res.status).toBe(400);
		const body = await json(res);
		expect(body.success).toBe(false);
		expect(body.status).toBe("error");
		expect(typeof body.error).toBe("string");
		expect(typeof body.message).toBe("string");
		expect(typeof body.code).toBe("string");
		expect(typeof body.why).toBe("string");
		expect(typeof body.fix).toBe("string");
	});

	test("POST / unknown type → 400 structured error", async () => {
		const res = await post(basketApp, "/", { type: "bogus" });
		expect(res.status).toBe(400);
		const body = await json(res);
		expect(body.success).toBe(false);
		expect(typeof body.why).toBe("string");
	});

	test("GET /px.jpg → image/gif regardless of errors", async () => {
		const res = await get(basketApp, "/px.jpg?type=track&name=test");
		expect(res.headers.get("Content-Type")).toBe("image/gif");
		expect(res.headers.get("Cache-Control")).toContain("no-cache");
		const buf = new Uint8Array(await res.arrayBuffer());
		// GIF89a header
		expect(buf[0]).toBe(0x47); // G
		expect(buf[1]).toBe(0x49); // I
		expect(buf[2]).toBe(0x46); // F
	});

	test("GET /health → exactly { status: 'ok' }", async () => {
		const healthApp = new ElysiaHealth().get("/health", () =>
			Response.json({ status: "ok" }, { status: 200 })
		);
		const res = await healthApp.handle(new Request("http://localhost/health"));
		const body = await json(res);
		expect(Object.keys(body)).toEqual(["status"]);
		expect(body.status).toBe("ok");
	});
});
