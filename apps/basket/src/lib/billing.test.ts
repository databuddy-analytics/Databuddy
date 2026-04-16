import { beforeEach, describe, expect, test, vi } from "vitest";

const { mockCheck, mockLoggerSet } = vi.hoisted(() => ({
	mockCheck: vi.fn(() =>
		Promise.resolve({
			allowed: true,
			customerId: "cust_1",
			balance: { usage: 50, granted: 1000, unlimited: false },
		})
	),
	mockLoggerSet: vi.fn(() => {}),
}));

vi.mock("@databuddy/rpc/autumn", () => ({
	getAutumn: () => ({ check: mockCheck }),
}));

vi.mock("evlog/elysia", () => ({
	useLogger: () => ({
		set: mockLoggerSet,
		warn: vi.fn(),
		error: vi.fn(),
	}),
}));

vi.mock("@lib/tracing", () => ({
	record: (_name: string, fn: Function) => Promise.resolve().then(() => fn()),
	captureError: vi.fn(),
}));

const { checkAutumnUsage } = await import("./billing");

describe("checkAutumnUsage", () => {
	beforeEach(() => {
		mockCheck.mockReset();
		mockLoggerSet.mockReset();
	});

	// ── Always allows (no enforcement yet, just metering) ──

	test("allowed response → allowed", async () => {
		mockCheck.mockResolvedValue({
			allowed: true,
			customerId: "cust_1",
			balance: { usage: 50, granted: 1000, unlimited: false },
		});
		const result = await checkAutumnUsage("cust_1", "events");
		expect(result).toEqual({ allowed: true });
	});

	test("denied response → still allowed (no enforcement)", async () => {
		mockCheck.mockResolvedValue({
			allowed: false,
			customerId: "cust_1",
			balance: { usage: 10_001, granted: 10_000, unlimited: false },
		});
		const result = await checkAutumnUsage("cust_1", "events");
		expect(result).toEqual({ allowed: true });
	});

	test("API error → fail-open (allowed)", async () => {
		mockCheck.mockRejectedValue(new Error("Autumn API down"));
		const result = await checkAutumnUsage("cust_1", "events");
		expect(result).toEqual({ allowed: true });
	});

	// ── Still calls Autumn (metering for paying customers) ──

	test("calls autumn.check with sendEvent: true", async () => {
		mockCheck.mockResolvedValue({
			allowed: true,
			customerId: "c",
			balance: { usage: 0, granted: 0, unlimited: false },
		});
		await checkAutumnUsage("cust_1", "events", { website_id: "ws_1" });
		expect(mockCheck).toHaveBeenCalledWith({
			customerId: "cust_1",
			featureId: "events",
			sendEvent: true,
			properties: { website_id: "ws_1" },
		});
	});

	// ── Logging ──

	test("logs balance context from Autumn response", async () => {
		mockCheck.mockResolvedValue({
			allowed: true,
			customerId: "cust_1",
			balance: { usage: 500, granted: 10_000, unlimited: false },
		});
		await checkAutumnUsage("cust_1", "events");
		expect(mockLoggerSet).toHaveBeenCalledWith(
			expect.objectContaining({
				billing: expect.objectContaining({
					allowed: true,
					usage: 500,
					granted: 10_000,
				}),
			})
		);
	});

	test("logs checkFailed on API error", async () => {
		mockCheck.mockRejectedValue(new Error("timeout"));
		await checkAutumnUsage("cust_1", "events");
		expect(mockLoggerSet).toHaveBeenCalledWith(
			expect.objectContaining({
				billing: expect.objectContaining({ checkFailed: true }),
			})
		);
	});
});
