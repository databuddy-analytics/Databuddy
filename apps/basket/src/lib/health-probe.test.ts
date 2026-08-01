import { afterEach, describe, expect, test, vi } from "vitest";
import {
	HealthProbeTimeoutError,
	withHealthProbeDeadline,
} from "./health-probe";

afterEach(() => {
	vi.useRealTimers();
});

describe("Basket dependency health deadline", () => {
	test("returns a successful dependency result", async () => {
		await expect(
			withHealthProbeDeadline(() => Promise.resolve("PONG"), 20)
		).resolves.toBe("PONG");
	});

	test("preserves dependency failures", async () => {
		const failure = new Error("dependency unavailable");
		await expect(
			withHealthProbeDeadline(() => Promise.reject(failure), 20)
		).rejects.toBe(failure);
	});

	test("bounds a dependency that never settles", async () => {
		vi.useFakeTimers();
		const result = withHealthProbeDeadline(
			() => new Promise<never>(() => {}),
			20
		);

		vi.advanceTimersByTime(20);
		await Promise.resolve();

		await expect(result).rejects.toEqual(
			expect.objectContaining<Partial<HealthProbeTimeoutError>>({
				name: "HealthProbeTimeoutError",
				timeoutMs: 20,
			})
		);
	});
});
