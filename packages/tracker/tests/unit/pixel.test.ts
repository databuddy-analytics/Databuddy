import { afterEach, describe, expect, test } from "bun:test";
import type { BaseTracker } from "../../src/core/tracker";
import { initPixelTracking } from "../../src/plugins/pixel";

const originalImage = globalThis.Image;

afterEach(() => {
	globalThis.Image = originalImage;
});

function trackerFixture(): BaseTracker {
	const tracker = {
		options: {
			apiUrl: "https://basket.example",
			clientId: "ws_test",
			enableBatching: true,
			enableRetries: true,
			initialRetryDelay: 0,
			maxRetries: 1,
			sdk: "web",
			sdkVersion: "test",
		},
		api: {},
		sendBatchBeacon: () => false,
		sendBeacon: () => false,
	} as unknown as BaseTracker;
	initPixelTracking(tracker);
	return tracker;
}

describe("pixel tracking", () => {
	test("retries a failed image load", async () => {
		const requests: string[] = [];

		globalThis.Image = class {
			onerror: (() => void) | null = null;
			onload: (() => void) | null = null;

			set src(value: string) {
				requests.push(value);
				queueMicrotask(() => {
					if (requests.length === 1) {
						this.onerror?.();
						return;
					}
					this.onload?.();
				});
			}
		} as unknown as typeof Image;

		const tracker = trackerFixture();
		const result = await tracker.api.fetch("/track", {
			eventId: "evt_1",
			name: "signup_completed",
		});

		expect(result).toMatchObject({
			attempts: 2,
			ok: true,
		});
		expect(requests).toHaveLength(2);
		expect(new URL(requests[0] ?? "").pathname).toBe("/px.jpg");
	});
});
