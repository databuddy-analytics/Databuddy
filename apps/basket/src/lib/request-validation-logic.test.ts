import { vi, beforeEach, describe, expect, test } from "vitest";
import { EvlogError } from "evlog";

const {
	mockGetWebsiteByIdV2,
	mockIsValidOrigin,
	mockIsValidOriginFromSettings,
	mockIsValidIpFromSettings,
	mockCheckAutumnUsage,
	mockLogBlockedTraffic,
	mockRunFork,
	mockSend,
	mockDetectBot,
	mockLoggerSet,
	mockLoggerWarn,
	mockLoggerError,
} = vi.hoisted(() => ({
	mockGetWebsiteByIdV2: vi.fn(() =>
		Promise.resolve({
			id: "ws_1",
			domain: "example.com",
			name: "Example",
			status: "ACTIVE",
			ownerId: "user_1",
			organizationId: "org_1",
			settings: null,
		})
	),
	mockIsValidOrigin: vi.fn(() => true),
	mockIsValidOriginFromSettings: vi.fn(() => true),
	mockIsValidIpFromSettings: vi.fn(() => true),
	mockCheckAutumnUsage: vi.fn(() => Promise.resolve({ allowed: true })),
	mockLogBlockedTraffic: vi.fn(() => {}),
	mockRunFork: vi.fn(() => {}),
	mockSend: vi.fn(() => ({})),
	mockDetectBot: vi.fn(() => ({ isBot: false })),
	mockLoggerSet: vi.fn(() => {}),
	mockLoggerWarn: vi.fn(() => {}),
	mockLoggerError: vi.fn(() => {}),
}));

vi.mock("@hooks/auth", () => ({
	getWebsiteByIdV2: mockGetWebsiteByIdV2,
	isValidOrigin: mockIsValidOrigin,
	isValidOriginFromSettings: mockIsValidOriginFromSettings,
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

vi.mock("ua-parser-js/bot-detection", () => ({
	isBot: () => false,
	isAICrawler: () => false,
	isAIAssistant: () => false,
}));
vi.mock("ua-parser-js", () => ({
	UAParser: class { getResult() { return {}; } },
}));
vi.mock("@utils/user-agent", () => ({
	detectBot: mockDetectBot,
}));

vi.mock("evlog/elysia", () => ({
	useLogger: () => ({
		set: mockLoggerSet,
		warn: mockLoggerWarn,
		error: mockLoggerError,
	}),
}));

vi.mock("@lib/tracing", () => ({
	record: (_name: string, fn: Function) => Promise.resolve().then(() => fn()),
	captureError: vi.fn(),
}));

// Import after mocks
const { validateRequest, checkForBot } = await import("./request-validation");

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

// ── validateRequest ──

describe("validateRequest", () => {
	beforeEach(() => {
		mockGetWebsiteByIdV2.mockReset();
		mockCheckAutumnUsage.mockReset();
		mockIsValidOrigin.mockReset();
		mockIsValidOriginFromSettings.mockReset();
		mockIsValidIpFromSettings.mockReset();
		mockLogBlockedTraffic.mockReset();
		mockLoggerSet.mockReset();

		// Defaults: everything passes
		mockGetWebsiteByIdV2.mockResolvedValue({
			id: "ws_1",
			domain: "example.com",
			name: "Example",
			status: "ACTIVE",
			ownerId: "user_1",
			organizationId: "org_1",
			settings: null,
		} as any);
		mockCheckAutumnUsage.mockResolvedValue({ allowed: true });
		mockIsValidOrigin.mockReturnValue(true);
		mockIsValidOriginFromSettings.mockReturnValue(true);
		mockIsValidIpFromSettings.mockReturnValue(true);
	});

	test("happy path → returns ValidatedRequest", async () => {
		const result = await validateRequest({}, { client_id: "ws_1" }, makeReq());
		expect(result).toEqual({
			clientId: "ws_1",
			userAgent: expect.any(String),
			ip: "1.2.3.4",
			ownerId: "user_1",
			organizationId: "org_1",
		});
	});

	test("client_id from query string", async () => {
		const result = await validateRequest(
			{},
			{ client_id: "ws_from_query" },
			makeReq("https://example.com")
		);
		expect("clientId" in result && result.clientId).toBe("ws_from_query");
	});

	test("client_id from header fallback", async () => {
		const result = await validateRequest(
			{},
			{},
			makeReq("https://example.com", {
				"databuddy-client-id": "ws_from_header",
			})
		);
		expect("clientId" in result && result.clientId).toBe("ws_from_header");
	});

	test("missing client_id → throws 400", async () => {
		try {
			await validateRequest({}, {}, makeReq("https://example.com"));
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(EvlogError);
			expect((e as EvlogError).status).toBe(400);
		}
	});

	test("payload too large → throws 413", async () => {
		const huge = "x".repeat(2_000_000);
		try {
			await validateRequest(huge, { client_id: "ws_1" }, makeReq());
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(EvlogError);
			expect((e as EvlogError).status).toBe(413);
		}
	});

	test("inactive website → throws 400", async () => {
		mockGetWebsiteByIdV2.mockResolvedValue({
			id: "ws_1",
			domain: "example.com",
			name: "Example",
			status: "INACTIVE",
			ownerId: null,
			organizationId: null,
			settings: null,
		} as any);
		try {
			await validateRequest({}, { client_id: "ws_1" }, makeReq());
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(EvlogError);
			expect((e as EvlogError).status).toBe(400);
		}
	});

	test("website not found → throws 400", async () => {
		mockGetWebsiteByIdV2.mockResolvedValue(null);
		try {
			await validateRequest({}, { client_id: "ws_bad" }, makeReq());
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(EvlogError);
		}
	});

	test("billing always allows (no enforcement, just metering)", async () => {
		mockCheckAutumnUsage.mockResolvedValue({ allowed: true });
		const result = await validateRequest({}, { client_id: "ws_1" }, makeReq());
		expect("clientId" in result).toBe(true);
		expect(mockCheckAutumnUsage).toHaveBeenCalled();
	});

	test("no ownerId → skips billing check", async () => {
		mockGetWebsiteByIdV2.mockResolvedValue({
			id: "ws_1",
			domain: "example.com",
			name: "Example",
			status: "ACTIVE",
			ownerId: null,
			organizationId: "org_1",
			settings: null,
		} as any);
		await validateRequest({}, { client_id: "ws_1" }, makeReq());
		expect(mockCheckAutumnUsage).not.toHaveBeenCalled();
	});

	test("origin mismatch (no settings) → throws 403", async () => {
		mockIsValidOrigin.mockReturnValue(false);
		try {
			await validateRequest(
				{},
				{ client_id: "ws_1" },
				makeReq("https://example.com", { origin: "https://evil.com" })
			);
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(EvlogError);
			expect((e as EvlogError).status).toBe(403);
		}
	});

	test("origin mismatch (with settings) → throws 403", async () => {
		mockGetWebsiteByIdV2.mockResolvedValue({
			id: "ws_1",
			domain: "example.com",
			name: "Example",
			status: "ACTIVE",
			ownerId: "user_1",
			organizationId: "org_1",
			settings: { allowedOrigins: ["trusted.com"] },
		} as any);
		mockIsValidOriginFromSettings.mockReturnValue(false);
		try {
			await validateRequest(
				{},
				{ client_id: "ws_1" },
				makeReq("https://example.com", { origin: "https://evil.com" })
			);
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(EvlogError);
			expect((e as EvlogError).status).toBe(403);
		}
	});

	test("IP not authorized → throws 403", async () => {
		mockGetWebsiteByIdV2.mockResolvedValue({
			id: "ws_1",
			domain: "example.com",
			name: "Example",
			status: "ACTIVE",
			ownerId: "user_1",
			organizationId: "org_1",
			settings: { allowedIps: ["10.0.0.1"] },
		} as any);
		mockIsValidIpFromSettings.mockReturnValue(false);
		try {
			await validateRequest({}, { client_id: "ws_1" }, makeReq());
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(EvlogError);
			expect((e as EvlogError).status).toBe(403);
		}
	});

	test("logs blocked traffic on client_id miss", async () => {
		try {
			await validateRequest({}, {}, makeReq("https://example.com"));
		} catch {
			/* expected */
		}
		expect(mockLogBlockedTraffic).toHaveBeenCalled();
	});
});

// ── checkForBot ──

describe("checkForBot", () => {
	beforeEach(() => {
		mockDetectBot.mockReset();
		mockRunFork.mockReset();
		mockSend.mockReset();
		mockLogBlockedTraffic.mockReset();
		mockLoggerSet.mockReset();
	});

	test("not a bot → returns undefined", async () => {
		mockDetectBot.mockReturnValue({ isBot: false });
		const result = await checkForBot(
			makeReq(),
			{},
			{},
			"ws_1",
			"Mozilla/5.0 Chrome/120"
		);
		expect(result).toBeUndefined();
	});

	test("bot with allow action → returns undefined", async () => {
		mockDetectBot.mockReturnValue({
			isBot: true,
			action: "allow",
			botName: "Googlebot",
			category: "Known Bot",
		});
		const result = await checkForBot(
			makeReq(),
			{},
			{},
			"ws_1",
			"Googlebot/2.1"
		);
		expect(result).toBeUndefined();
	});

	test("bot with track_only → returns 204 + sends AI traffic span", async () => {
		mockDetectBot.mockReturnValue({
			isBot: true,
			action: "track_only",
			botName: "GPTBot",
			category: "AI Crawler",
			result: { category: "ai_crawler" },
		});
		const result = await checkForBot(
			makeReq(),
			{ path: "/about" },
			{},
			"ws_1",
			"GPTBot/1.0"
		);
		expect(result).toBeDefined();
		expect(result!.error).toBeDefined();
		expect(result!.error!.status).toBe(204);
		expect(mockSend).toHaveBeenCalledWith(
			"analytics-ai-traffic-spans",
			expect.objectContaining({
				client_id: "ws_1",
				bot_name: "GPTBot",
				path: "/about",
				action: "tracked",
			})
		);
		expect(mockRunFork).toHaveBeenCalled();
	});

	test("track_only: path from body.url fallback", async () => {
		mockDetectBot.mockReturnValue({
			isBot: true,
			action: "track_only",
			botName: "ClaudeBot",
			result: { category: "ai_crawler" },
		});
		await checkForBot(makeReq(), { url: "/from-url" }, {}, "ws_1", "ClaudeBot");
		expect(mockSend).toHaveBeenCalledWith(
			"analytics-ai-traffic-spans",
			expect.objectContaining({ path: "/from-url" })
		);
	});

	test("track_only: path from referer header fallback", async () => {
		mockDetectBot.mockReturnValue({
			isBot: true,
			action: "track_only",
			botName: "Bot",
			result: { category: "ai" },
		});
		await checkForBot(
			makeReq("https://example.com", { referer: "https://ref.com/page" }),
			{},
			{},
			"ws_1",
			"Bot"
		);
		expect(mockSend).toHaveBeenCalledWith(
			"analytics-ai-traffic-spans",
			expect.objectContaining({ path: "https://ref.com/page" })
		);
	});

	test("bot with block action → returns 204 + logs blocked traffic", async () => {
		mockDetectBot.mockReturnValue({
			isBot: true,
			action: "block",
			botName: "BadBot",
			reason: "known_scraper",
			category: "Known Bot",
		});
		const result = await checkForBot(makeReq(), {}, {}, "ws_1", "BadBot/1.0");
		expect(result).toBeDefined();
		expect(result!.error!.status).toBe(204);
		expect(mockLogBlockedTraffic).toHaveBeenCalledWith(
			expect.any(Request),
			{},
			{},
			"known_scraper",
			"Known Bot",
			"BadBot",
			"ws_1"
		);
	});

	test("bot with no action (default block) → returns 204", async () => {
		mockDetectBot.mockReturnValue({
			isBot: true,
			action: undefined,
			reason: "unknown_bot",
		});
		const result = await checkForBot(makeReq(), {}, {}, "ws_1", "SomeBot");
		expect(result).toBeDefined();
		expect(result!.error!.status).toBe(204);
	});
});
