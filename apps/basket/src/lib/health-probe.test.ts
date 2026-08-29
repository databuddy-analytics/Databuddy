import { afterEach, describe, expect, test, vi } from "vitest";
import {
	HealthProbeTimeoutError,
	withHealthProbeDeadline,
} from "./health-probe";

afterEach(() => {
	vi.useRealTimers();
});

describe("Basket dependency health deadline", () => {
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
