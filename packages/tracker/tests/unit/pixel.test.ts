import { afterEach, describe, expect, jest, mock, test } from "bun:test";
import type { BaseTracker } from "../../src/core/tracker";
import type { TrackerOptions } from "../../src/core/types";
import { initPixelTracking } from "../../src/plugins/pixel";

const originalImage = Object.getOwnPropertyDescriptor(globalThis, "Image");

afterEach(() => {
	if (jest.isFakeTimers()) {
		jest.clearAllTimers();
		jest.useRealTimers();
	}
	if (originalImage) {
		Object.defineProperty(globalThis, "Image", originalImage);
		return;
	}
	Reflect.deleteProperty(globalThis, "Image");
});

function createTracker(
	overrides: Partial<TrackerOptions> = {}
): BaseTracker {
	return {
		options: {
			apiUrl: "https://basket.example",
			clientId: "ws_test",
			enableRetries: true,
			initialRetryDelay: 0,
			maxRetries: 1,
			sdk: "web",
			sdkVersion: "test",
			...overrides,
		},
		api: {
			cancelPendingRequests: mock(() => {}),
		},
	} as unknown as BaseTracker;
}

function installImageOutcomes(
	outcomes: Array<"error" | "load" | "pending">
): string[] {
	const requests: string[] = [];

	class MockImage {
		onerror: (() => void) | null = null;
		onload: (() => void) | null = null;

		set src(value: string) {
			requests.push(value);
			if (!value) {
				return;
			}
			const outcome = outcomes.shift() ?? "error";
			if (outcome === "pending") {
				return;
			}
			queueMicrotask(() => {
				if (outcome === "load") {
					this.onload?.();
					return;
				}
				this.onerror?.();
			});
		}
	}

	Object.defineProperty(globalThis, "Image", {
		configurable: true,
		value: MockImage,
	});
	return requests;
}


describe("pixel transport", () => {
	test("retries an unacknowledged pixel load with the same event identity", async () => {
		const requests = installImageOutcomes(["error", "load"]);
		const tracker = createTracker();
		initPixelTracking(tracker);

		const result = await tracker.api.fetch("/", {
			eventId: "event_1",
			name: "pageview",
		});

		expect(result).toMatchObject({ ok: true, attempts: 2 });
		expect(requests).toHaveLength(2);
		const first = new URL(requests[0] ?? "");
		const second = new URL(requests[1] ?? "");
		expect(first.searchParams.get("eventId")).toBe("event_1");
		expect(second.searchParams.get("eventId")).toBe("event_1");
	});

	test("does not report an unverified image load as a beacon success", () => {
		const tracker = createTracker();
		initPixelTracking(tracker);

		expect(tracker.sendBeacon({ eventId: "event_1" }, "/")).toBe(false);
	});

	test("cancels an active image request when tracking is cleared", async () => {
		const requests = installImageOutcomes(["pending"]);
		const tracker = createTracker();
		initPixelTracking(tracker);

		const delivery = tracker.api.fetch("/", { eventId: "event_1" });
		tracker.api.cancelPendingRequests();

		expect(await delivery).toMatchObject({
			ok: false,
			attempts: 1,
		});
		expect(requests).toHaveLength(2);
		expect(requests[1]).toBe("");
	});

	test("bounds a pixel image load that never completes", async () => {
		jest.useFakeTimers();
		const requests = installImageOutcomes(["pending"]);
		const tracker = createTracker({ maxRetries: 0 });
		initPixelTracking(tracker);

		const delivery = tracker.api.fetch("/", { eventId: "event_1" });
		jest.advanceTimersByTime(10_000);

		expect(await delivery).toMatchObject({
			ok: false,
			attempts: 1,
		});
		expect(requests).toHaveLength(2);
		expect(requests[1]).toBe("");
	});

	test("cancels a scheduled retry without waiting for the backoff", async () => {
		jest.useFakeTimers();
		const requests = installImageOutcomes(["error"]);
		const tracker = createTracker({ initialRetryDelay: 30_000 });
		initPixelTracking(tracker);

		const delivery = tracker.api.fetch("/", { eventId: "event_1" });
		await Promise.resolve();
		tracker.api.cancelPendingRequests();

		expect(await delivery).toMatchObject({
			ok: false,
			attempts: 1,
		});
		expect(requests).toHaveLength(1);
	});

	test("uses the retry fallback for an invalid maxRetries value", async () => {
		const requests = installImageOutcomes(["error", "error", "error", "error"]);
		const tracker = createTracker({ maxRetries: Number.NaN });
		initPixelTracking(tracker);

		const result = await tracker.api.fetch("/", { eventId: "event_1" });

		expect(result).toMatchObject({ ok: false, attempts: 4 });
		expect(requests).toHaveLength(4);
	});
});
