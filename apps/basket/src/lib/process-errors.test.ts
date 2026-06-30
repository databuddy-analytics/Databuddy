import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { mockCaptureError, mockLogError } = vi.hoisted(() => ({
	mockCaptureError: vi.fn(),
	mockLogError: vi.fn(),
}));

vi.mock("@lib/tracing", () => ({
	captureError: mockCaptureError,
}));

vi.mock("evlog", () => ({
	log: {
		error: mockLogError,
	},
}));

const { handleUncaughtException, handleUnhandledRejection } = await import(
	"./process-errors"
);

const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
	_code?: number
) => undefined as never) as typeof process.exit);

beforeEach(() => {
	mockCaptureError.mockReset();
	mockLogError.mockReset();
	exitSpy.mockClear();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("process error handlers", () => {
	test("uncaught exception logs, runs shutdown, then exits 1", async () => {
		const shutdown = vi.fn(() => Promise.resolve());
		const error = new Error("boom");

		handleUncaughtException(error, shutdown);
		await Promise.resolve();
		await Promise.resolve();

		expect(mockCaptureError).toHaveBeenCalledWith(error);
		expect(mockLogError).toHaveBeenCalledWith(
			expect.objectContaining({
				process: "uncaughtException",
				error_message: "boom",
				error_source: "process",
			})
		);
		expect(shutdown).toHaveBeenCalledWith("uncaughtException", 1);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	test("unhandled rejection logs and runs fatal shutdown", async () => {
		const shutdown = vi.fn(() => Promise.resolve());

		handleUnhandledRejection("bad promise", shutdown);
		await Promise.resolve();
		await Promise.resolve();

		expect(mockCaptureError).toHaveBeenCalledWith("bad promise");
		expect(mockLogError).toHaveBeenCalledWith(
			expect.objectContaining({
				process: "unhandledRejection",
				error_message: "bad promise",
				error_source: "process",
			})
		);
		expect(shutdown).toHaveBeenCalledWith("unhandledRejection", 1);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	test("forces exit when shutdown exceeds timeout", () => {
		vi.useFakeTimers();
		const shutdown = vi.fn(() => new Promise<void>(() => undefined));

		handleUncaughtException(new Error("hung"), shutdown);

		expect(exitSpy).not.toHaveBeenCalled();
		vi.advanceTimersByTime(10_000);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});

