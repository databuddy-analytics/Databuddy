import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLogger = vi.hoisted(() => ({
	error: vi.fn(),
	warn: vi.fn(),
}));

vi.mock("evlog/elysia", () => ({
	useLogger: () => mockLogger,
}));

const { ping } = await import("./health");

describe("health ping", () => {
	beforeEach(() => {
		mockLogger.error.mockClear();
		mockLogger.warn.mockClear();
	});

	it("records probe failures as warnings, not request errors", async () => {
		const result = await ping("postgres", () => {
			throw new Error("connection refused");
		});

		expect(result.status).toBe("error");
		expect(mockLogger.error).not.toHaveBeenCalled();
		expect(mockLogger.warn).toHaveBeenCalledWith("Health probe unavailable", {
			error_message: "connection refused",
			health_probe: "postgres",
		});
	});
});
