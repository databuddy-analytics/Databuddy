import { EvlogError } from "evlog";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { basketErrors } from "./structured-errors";

const {
	mockGetWebsiteByIdV2,
	mockIsOriginAllowed,
	mockIsValidIpFromSettings,
	mockCheckAutumnUsage,
	mockLogBlockedTraffic,
	mockRunFork,
	mockSend,
	mockLoggerSet,
} = vi.hoisted(() => ({
	mockGetWebsiteByIdV2: vi.fn(),
	mockIsOriginAllowed: vi.fn(() => true),
	mockIsValidIpFromSettings: vi.fn(() => true),
	mockCheckAutumnUsage: vi.fn(() => Promise.resolve({ allowed: true })),
	mockLogBlockedTraffic: vi.fn(),
	mockRunFork: vi.fn(),
	mockSend: vi.fn(() => ({})),
	mockLoggerSet: vi.fn(),
}));

vi.mock("@hooks/auth", () => ({
	getWebsiteByIdV2: mockGetWebsiteByIdV2,
	isOriginAllowed: mockIsOriginAllowed,
	isValidIpFromSettings: mockIsValidIpFromSettings,
}));

vi.mock("@lib/billing", () => ({
	checkAutumnUsage: mockCheckAutumnUsage,
}));

vi.mock("@lib/blocked-traffic", () => ({
	logBlockedTraffic: mockLogBlockedTraffic,
}));

vi.mock("@lib/producer", () => ({
	runFork: mockRunFork,
	send: mockSend,
}));

vi.mock("evlog/elysia", () => ({
	useLogger: () => ({
		set: mockLoggerSet,
		warn: vi.fn(),
		error: vi.fn(),
	}),
}));

vi.mock("@lib/tracing", () => ({
	record: (_name: string, fn: () => unknown) =>
		Promise.resolve().then(() => fn()),
	captureError: vi.fn(),
}));

const {
	validateRequest,
	checkForBot,
	getWebsiteSecuritySettings,
	recordAiPageView,
} = await import("./request-validation");

function website(overrides: Record<string, unknown> = {}) {
	return {
		id: "ws_1",
		domain: "example.com",
		name: "Example",
		status: "ACTIVE",
		ownerId: "user_1",
		organizationId: "org_1",
		settings: null,
		...overrides,
	} as never;
}

function makeReq(
	url = "https://example.com?client_id=ws_1",
	headers: Record<string, string> = {}
): Request {
	return new Request(url, {
		method: "POST",
		headers: {
			"user-agent": "Mozilla/5.0 Chrome/120",
			"cf-connecting-ip": "1.2.3.4",
			...headers,
		},
	});
}

function expectRejection(promise: Promise<unknown>, status: number) {
	return promise.then(
		() => {
			throw new Error(`expected rejection with status ${status}`);
		},
		(error) => {
			expect(error).toBeInstanceOf(EvlogError);
			expect((error as EvlogError).status).toBe(status);
			return error as EvlogError;
		}
	);
}

describe("getWebsiteSecuritySettings", () => {
	test.each([
		[null],
		[undefined],
		["string"],
		[42],
		[["array"]],
	])("non-object settings %j → null", (settings) => {
		expect(getWebsiteSecuritySettings(settings)).toBeNull();
	});

	test("keeps only string entries from mixed allowlists", () => {
		expect(
			getWebsiteSecuritySettings({
				allowedOrigins: ["https://a.com", 42, null, "https://b.com"],
				allowedIps: [true, "10.0.0.1"],
			})
		).toEqual({
			allowedOrigins: ["https://a.com", "https://b.com"],
			allowedIps: ["10.0.0.1"],
		});
	});

	test("missing allowlists stay undefined instead of becoming empty arrays", () => {
		expect(getWebsiteSecuritySettings({ other: true })).toEqual({
			allowedOrigins: undefined,
			allowedIps: undefined,
		});
	});
});

describe("validateRequest", () => {
	beforeEach(() => {
		mockGetWebsiteByIdV2.mockReset();
		mockCheckAutumnUsage.mockReset();
		mockIsOriginAllowed.mockReset();
		mockIsValidIpFromSettings.mockReset();
		mockLogBlockedTraffic.mockReset();
		mockLoggerSet.mockReset();

		mockGetWebsiteByIdV2.mockResolvedValue(website());
		mockCheckAutumnUsage.mockResolvedValue({ allowed: true });
		mockIsOriginAllowed.mockReturnValue(true);
		mockIsValidIpFromSettings.mockReturnValue(true);
	});

	test("valid request resolves the full ingestion identity", async () => {
		const result = await validateRequest({}, { client_id: "ws_1" }, makeReq());
		expect(result).toEqual({
			clientId: "ws_1",
			userAgent: expect.any(String),
			ip: "1.2.3.4",
			ownerId: "user_1",
			organizationId: "org_1",
		});
		expect(mockCheckAutumnUsage).toHaveBeenCalledOnce();
	});

	test("client_id from query string wins", async () => {
		const result = await validateRequest(
			{},
			{ client_id: "ws_from_query" },
			makeReq("https://example.com")
		);
		expect(result.clientId).toBe("ws_from_query");
	});

	test("client_id falls back to the databuddy-client-id header", async () => {
		const result = await validateRequest(
			{},
			{},
			makeReq("https://example.com", {
				"databuddy-client-id": "ws_from_header",
			})
		);
		expect(result.clientId).toBe("ws_from_header");
	});

	test("missing client_id → 400 and blocked-traffic log", async () => {
		await expectRejection(
			validateRequest({}, {}, makeReq("https://example.com")),
			400
		);
		expect(mockLogBlockedTraffic).toHaveBeenCalledWith(
			expect.any(Request),
			{},
			{},
			"missing_client_id",
			"Validation Error"
		);
	});

	test("payload too large → 413", async () => {
		await expectRejection(
			validateRequest("x".repeat(2_000_000), { client_id: "ws_1" }, makeReq()),
			413
		);
	});

	test("inactive website → 400", async () => {
		mockGetWebsiteByIdV2.mockResolvedValue(
			website({ status: "INACTIVE", ownerId: null, organizationId: null })
		);
		await expectRejection(
			validateRequest({}, { client_id: "ws_1" }, makeReq()),
			400
		);
	});

	test("website not found → 400", async () => {
		mockGetWebsiteByIdV2.mockResolvedValue(null);
		await expectRejection(
			validateRequest({}, { client_id: "ws_bad" }, makeReq()),
			400
		);
	});

	test("website lookup outage stays retryable instead of becoming an invalid client ID", async () => {
		mockGetWebsiteByIdV2.mockRejectedValue(
			basketErrors.websiteLookupUnavailable()
		);
		const error = await expectRejection(
			validateRequest({}, { client_id: "ws_1" }, makeReq()),
			503
		);
		expect(error.code).toBe(basketErrors.websiteLookupUnavailable.code);
	});

	test("checkUsage: false skips billing metering", async () => {
		await validateRequest({}, { client_id: "ws_1" }, makeReq(), {
			checkUsage: false,
		});
		expect(mockCheckAutumnUsage).not.toHaveBeenCalled();
	});

	test("website without an owner skips billing metering", async () => {
		mockGetWebsiteByIdV2.mockResolvedValue(website({ ownerId: null }));
		await validateRequest({}, { client_id: "ws_1" }, makeReq());
		expect(mockCheckAutumnUsage).not.toHaveBeenCalled();
	});

	test("origin mismatch → 403", async () => {
		mockIsOriginAllowed.mockReturnValue(false);
		await expectRejection(
			validateRequest(
				{},
				{ client_id: "ws_1" },
				makeReq("https://example.com", { origin: "https://evil.com" })
			),
			403
		);
	});

	test("origin check receives website domain and configured allowedOrigins", async () => {
		mockGetWebsiteByIdV2.mockResolvedValue(
			website({ settings: { allowedOrigins: ["trusted.com"] } })
		);
		await validateRequest(
			{},
			{ client_id: "ws_1" },
			makeReq("https://example.com", { origin: "https://www.example.com" })
		);
		expect(mockIsOriginAllowed).toHaveBeenCalledWith(
			"https://www.example.com",
			"example.com",
			["trusted.com"]
		);
	});

	test("missing origin with allowedOrigins configured → 403 before the origin check", async () => {
		mockGetWebsiteByIdV2.mockResolvedValue(
			website({ settings: { allowedOrigins: ["trusted.com"] } })
		);
		await expectRejection(
			validateRequest({}, { client_id: "ws_1" }, makeReq()),
			403
		);
		expect(mockIsOriginAllowed).not.toHaveBeenCalled();
	});

	test("IP outside the allowlist → 403", async () => {
		mockGetWebsiteByIdV2.mockResolvedValue(
			website({ settings: { allowedIps: ["10.0.0.1"] } })
		);
		mockIsValidIpFromSettings.mockReturnValue(false);
		await expectRejection(
			validateRequest({}, { client_id: "ws_1" }, makeReq()),
			403
		);
	});

	test("IP allowlist refuses a self-host deployment's spoofable header", async () => {
		const previous = process.env.SELFHOST;
		process.env.SELFHOST = "true";
		mockGetWebsiteByIdV2.mockResolvedValue(
			website({ settings: { allowedIps: ["10.0.0.1"] } })
		);
		mockIsValidIpFromSettings.mockReturnValue(true);
		try {
			await expectRejection(
				validateRequest(
					{},
					{ client_id: "ws_1" },
					makeReq("https://example.com", { "cf-connecting-ip": "10.0.0.1" })
				),
				403
			);
		} finally {
			if (previous === undefined) {
				delete process.env.SELFHOST;
			} else {
				process.env.SELFHOST = previous;
			}
		}
	});

	test("IP allowlist rejects requests without a trusted IP header", async () => {
		mockGetWebsiteByIdV2.mockResolvedValue(
			website({ settings: { allowedIps: ["10.0.0.1"] } })
		);
		await expectRejection(
			validateRequest(
				{},
				{ client_id: "ws_1" },
				makeReq("https://example.com", {
					"cf-connecting-ip": "",
					"x-forwarded-for": "10.0.0.1",
				})
			),
			403
		);
		expect(mockIsValidIpFromSettings).not.toHaveBeenCalled();
	});
});

describe("checkForBot", () => {
	const GPTBOT =
		"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)";

	beforeEach(() => {
		mockRunFork.mockReset();
		mockSend.mockReset();
		mockLogBlockedTraffic.mockReset();
		mockLoggerSet.mockReset();
	});

	test.each([
		[
			"people",
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
		],
		[
			"search engines",
			"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
		],
	])("lets %s through untouched", async (_label, userAgent) => {
		await expect(
			checkForBot(makeReq(), {}, {}, "ws_1", userAgent)
		).resolves.toBeUndefined();
		expect(mockSend).not.toHaveBeenCalled();
		expect(mockLogBlockedTraffic).not.toHaveBeenCalled();
	});

	test("AI crawlers short-circuit with 204 and their page views record an AI traffic span", async () => {
		const event = { name: "screen_view", path: "/about" };
		const result = await checkForBot(makeReq(), event, {}, "ws_1", GPTBOT);
		expect(result?.response?.status).toBe(204);
		expect(result?.isTrackOnly).toBe(true);
		expect(mockSend).not.toHaveBeenCalled();
		recordAiPageView(event, "ws_1", GPTBOT);
		expect(mockSend).toHaveBeenCalledWith(
			"analytics-ai-traffic-spans",
			expect.objectContaining({
				client_id: "ws_1",
				agent_id: "openai-crawler",
				agent_purpose: "training",
				bot_type: "ai_crawler",
				path: "/about",
				source: "tracker",
			})
		);
		expect(mockRunFork).toHaveBeenCalledOnce();
	});

	test.each([
		["page exits", { name: "page_exit", path: "/about" }],
		["custom events", { name: "signup", path: "/about" }],
	])("AI traffic spans skip %s", (_label, event) => {
		recordAiPageView(event, "ws_1", GPTBOT);
		expect(mockSend).not.toHaveBeenCalled();
	});

	test("AI traffic spans take path and referrer from the event only", () => {
		recordAiPageView(
			{ name: "screen_view", path: "https://example.com/pricing" },
			"ws_1",
			GPTBOT
		);
		expect(mockSend).toHaveBeenCalledWith(
			"analytics-ai-traffic-spans",
			expect.objectContaining({
				path: "https://example.com/pricing",
				referrer: null,
			})
		);
	});

	test("blocked bots short-circuit with 204 and log blocked traffic", async () => {
		const result = await checkForBot(
			makeReq(),
			{},
			{},
			"ws_1",
			"Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)"
		);
		expect(result?.response?.status).toBe(204);
		expect(mockSend).not.toHaveBeenCalled();
		expect(mockLogBlockedTraffic).toHaveBeenCalledWith(
			expect.any(Request),
			{},
			{},
			"seo_tool_pattern",
			"Known Bot",
			"AhrefsBot",
			"ws_1"
		);
	});
});
