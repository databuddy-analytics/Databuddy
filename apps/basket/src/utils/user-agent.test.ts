import { beforeEach, describe, expect, test, vi } from "vitest";

const { mockParseUserAgentShared } = vi.hoisted(() => ({
	mockParseUserAgentShared: vi.fn((_userAgent: string) => ({
		browserName: "Firefox",
		browserVersion: "121.0",
		osName: "macOS",
		osVersion: "15",
		deviceType: "desktop",
	})),
}));

vi.mock("@databuddy/shared/bot-detection", () => ({
	parseUserAgent: mockParseUserAgentShared,
}));

vi.mock("@lib/tracing", () => ({
	record: (_n: string, fn: () => unknown) => Promise.resolve().then(() => fn()),
}));

const { parseUserAgent } = await import("./user-agent");

describe("parseUserAgent memoization", () => {
	beforeEach(() => {
		mockParseUserAgentShared.mockClear();
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
