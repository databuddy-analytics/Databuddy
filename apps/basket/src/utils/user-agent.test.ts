import { vi, describe, expect, test } from "vitest";

const { mockDetectBotShared, mockParseUserAgentShared } = vi.hoisted(() => ({
	mockDetectBotShared: vi.fn(() => ({
		isBot: false,
		category: undefined,
		action: undefined,
		confidence: 0,
		reason: undefined,
		name: undefined,
	})),
	mockParseUserAgentShared: vi.fn(() => ({
		browserName: "Chrome",
		browserVersion: "120.0",
		osName: "Windows",
		osVersion: "10",
		deviceType: "desktop",
		deviceBrand: undefined,
		deviceModel: undefined,
	})),
}));

vi.mock("@databuddy/shared/bot-detection/detector", () => ({
	detectBot: mockDetectBotShared,
}));
vi.mock("@databuddy/shared/bot-detection/user-agent", () => ({
	parseUserAgent: mockParseUserAgentShared,
}));
vi.mock("@databuddy/shared/bot-detection/types", async (importOriginal) => ({
	...(await importOriginal()),
}));

vi.mock("@lib/tracing", () => ({
	record: (_n: string, fn: Function) => Promise.resolve().then(() => fn()),
	captureError: vi.fn(),
}));

const { detectBot, parseUserAgent } = await import("./user-agent");

const dummyReq = new Request("https://example.com");

// ── detectBot wrapper — tests the legacy category mapping ──

describe("detectBot", () => {
	test("not a bot → passes through", () => {
		mockDetectBotShared.mockReturnValue({
			isBot: false,
			category: undefined,
			action: undefined,
			confidence: 0,
			reason: undefined,
			name: undefined,
		});
		const result = detectBot("normal-browser", dummyReq);
		expect(result.isBot).toBe(false);
		expect(result.category).toBeUndefined();
	});

	test("AI_CRAWLER → maps to 'AI Crawler'", () => {
		mockDetectBotShared.mockReturnValue({
			isBot: true,
			category: "ai_crawler",
			action: "track_only",
			confidence: 90,
			reason: "ai_pattern",
			name: "GPTBot",
		});
		const result = detectBot("GPTBot/1.0", dummyReq);
		expect(result.isBot).toBe(true);
		expect(result.category).toBe("AI Crawler");
		expect(result.botName).toBe("GPTBot");
		expect(result.action).toBe("track_only");
	});

	test("AI_ASSISTANT → maps to 'AI Assistant'", () => {
		mockDetectBotShared.mockReturnValue({
			isBot: true,
			category: "ai_assistant",
			action: "track_only",
			confidence: 90,
			reason: "ai_pattern",
			name: "ChatGPT",
		});
		const result = detectBot("ChatGPT-User/1.0", dummyReq);
		expect(result.category).toBe("AI Assistant");
	});

	test("other bot category → maps to 'Known Bot'", () => {
		mockDetectBotShared.mockReturnValue({
			isBot: true,
			category: "search_engine",
			action: "allow",
			confidence: 90,
			reason: "search_engine_pattern",
			name: "Googlebot",
		});
		const result = detectBot("Googlebot/2.1", dummyReq);
		expect(result.category).toBe("Known Bot");
		expect(result.action).toBe("allow");
	});

	test("passes through reason and full result", () => {
		const sharedResult = {
			isBot: true,
			category: "unknown_bot",
			action: "block" as const,
			confidence: 80,
			reason: "suspicious_pattern",
			name: "BadBot",
		};
		mockDetectBotShared.mockReturnValue(sharedResult);
		const result = detectBot("BadBot/1.0", dummyReq);
		expect(result.reason).toBe("suspicious_pattern");
		expect(result.result).toEqual(sharedResult);
	});

	test("non-bot has no category", () => {
		mockDetectBotShared.mockReturnValue({
			isBot: false,
			category: undefined,
			action: undefined,
			confidence: 0,
			reason: undefined,
			name: undefined,
		});
		const result = detectBot("Chrome/120", dummyReq);
		expect(result.category).toBeUndefined();
		expect(result.botName).toBeUndefined();
	});
});

// ── parseUserAgent wrapper ──

describe("parseUserAgent", () => {
	test("returns parsed fields from shared function", async () => {
		mockParseUserAgentShared.mockReturnValue({
			browserName: "Firefox",
			browserVersion: "121.0",
			osName: "Linux",
			osVersion: "6.1",
			deviceType: "desktop",
			deviceBrand: undefined,
			deviceModel: undefined,
		});
		const result = await parseUserAgent("Firefox/121.0");
		expect(result.browserName).toBe("Firefox");
		expect(result.osName).toBe("Linux");
		expect(result.deviceType).toBe("desktop");
	});

	test("empty UA → all undefined", async () => {
		const result = await parseUserAgent("");
		expect(result.browserName).toBeUndefined();
		expect(result.osName).toBeUndefined();
		expect(result.deviceType).toBeUndefined();
	});

	test("shared function throws → all undefined (doesn't crash)", async () => {
		mockParseUserAgentShared.mockImplementation(() => {
			throw new Error("parse failed");
		});
		const result = await parseUserAgent("broken-ua");
		expect(result.browserName).toBeUndefined();
		expect(result.osName).toBeUndefined();
	});
});
