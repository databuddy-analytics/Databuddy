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
