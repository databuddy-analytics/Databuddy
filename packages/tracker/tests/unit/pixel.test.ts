import { afterEach, describe, expect, mock, test } from "bun:test";
import type { BaseTracker } from "../../src/core/tracker";
import type { TrackerOptions } from "../../src/core/types";
import { initPixelTracking } from "../../src/plugins/pixel";

const originalImage = Object.getOwnPropertyDescriptor(globalThis, "Image");

afterEach(() => {
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
		api: {
			cancelPendingRequests: mock(() => {}),
		},
		options: {
			clientId: "site_example",
			enableRetries: true,
			initialRetryDelay: 0,
			maxRetries: 1,
			sdk: "web",
			sdkVersion: "2.0.0",
			...overrides,
		},
	} as unknown as BaseTracker;
}

function installImageOutcomes(outcomes: Array<"error" | "load">): string[] {
	const requests: string[] = [];

	class MockImage {
		onerror: (() => void) | null = null;
		onload: (() => void) | null = null;

		set src(value: string) {
			requests.push(value);
			const outcome = outcomes.shift() ?? "error";
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
});
