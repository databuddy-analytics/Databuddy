import { describe, expect, test } from "bun:test";
import { runCancellableAttempt } from "./insight-production-shadow";

describe("production shadow attempt deadline", () => {
	test("aborts timed-out work with the same generic error", async () => {
		let observedSignal: AbortSignal | undefined;
		const attempt = runCancellableAttempt(
			(signal) => {
				observedSignal = signal;
				return new Promise((_resolve, reject) => {
					signal.addEventListener("abort", () => reject(signal.reason), {
						once: true,
					});
				});
			},
			5
		);

		await expect(attempt).rejects.toThrow(
			"Production shadow attempt exceeded 5ms"
		);
		expect(observedSignal?.aborted).toBe(true);
		expect((observedSignal?.reason as Error).name).toBe("TimeoutError");
	});

	test("returns completed work before the deadline", async () => {
		let observedSignal: AbortSignal | undefined;
		await expect(
			runCancellableAttempt(async (signal) => {
				observedSignal = signal;
				expect(signal.aborted).toBe(false);
				return "done";
			}, 5)
		).resolves.toBe("done");

		await Bun.sleep(10);
		expect(observedSignal?.aborted).toBe(false);
	});

	test("keeps concurrent attempt deadlines isolated", async () => {
		let completedSignal: AbortSignal | undefined;
		const timedOut = runCancellableAttempt(
			(signal) =>
				new Promise((_resolve, reject) => {
					signal.addEventListener("abort", () => reject(signal.reason), {
						once: true,
					});
				}),
			5
		);
		const completed = runCancellableAttempt(async (signal) => {
			completedSignal = signal;
			await Bun.sleep(15);
			return "done";
		}, 50);

		await expect(timedOut).rejects.toThrow(
			"Production shadow attempt exceeded 5ms"
		);
		await expect(completed).resolves.toBe("done");
		expect(completedSignal?.aborted).toBe(false);
	});
});
