import { vi, beforeEach, describe, expect, test } from "vitest";

const { mockDetectBotShared, mockParseUserAgentShared } = vi.hoisted(() => ({
	mockDetectBotShared: vi.fn(() => ({
		isBot: false,
		category: undefined,
		action: undefined,
		confidence: 0,
		reason: undefined,
		name: undefined,
	})),
	mockParseUserAgentShared: vi.fn((_userAgent: string) => ({
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

describe("detectBot", () => {
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

});

describe("parseUserAgent", () => {
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

describe("parseUserAgent memoization", () => {
	beforeEach(() => {
		mockParseUserAgentShared.mockReset();
		mockParseUserAgentShared.mockImplementation(() => ({
			browserName: "Firefox",
			browserVersion: "121.0",
			osName: "macOS",
			osVersion: "15",
			deviceType: "desktop",
			deviceBrand: undefined,
			deviceModel: undefined,
		}));
	});

	test("repeat user agent → parses once and returns the memoized value", async () => {
		const userAgent = "MemoAgent/1.0";
		const first = await parseUserAgent(userAgent);
		const second = await parseUserAgent(userAgent);

		expect(mockParseUserAgentShared).toHaveBeenCalledTimes(1);
		expect(second).toBe(first);
		expect(second.browserName).toBe("Firefox");
	});

	test("oversized user agents share one capped cache entry", async () => {
		const prefix = `Oversized/${"A".repeat(600)}`;
		const first = await parseUserAgent(`${prefix}-one`);
		const second = await parseUserAgent(`${prefix}-two`);

		expect(mockParseUserAgentShared).toHaveBeenCalledTimes(1);
		expect(mockParseUserAgentShared.mock.calls[0][0]).toHaveLength(512);
		expect(second).toBe(first);
	});
});
