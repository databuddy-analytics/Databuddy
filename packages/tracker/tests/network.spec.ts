import { expect, test } from "@playwright/test";
import { findEvent, hasEvent } from "./test-utils";

test.describe("Network & Batching", () => {
	test.beforeEach(async ({ page }) => {
		// Disable sendBeacon for reliable route interception (WebKit issue)
		await page.addInitScript(() => {
			Object.defineProperty(navigator, "sendBeacon", { value: undefined });
		});
	});

	test("retries on 500 errors", async ({ page }) => {
		let attemptCount = 0;
		await page.route("**/basket.databuddy.cc/*", async (route) => {
			attemptCount += 1;
			if (attemptCount <= 2) {
				await route.fulfill({ status: 500 });
			} else {
				await route.fulfill({
					status: 200,
					body: JSON.stringify({ success: true }),
				});
			}
		});

		await page.goto("/test");
		await page.evaluate(() => {
			// Disable beacon to force fetch usage, which supports retries
			navigator.sendBeacon = () => false;

			(window as any).databuddyConfig = {
				clientId: "test-retry",
				ignoreBotDetection: true,
				batchTimeout: 200,
				enableRetries: true,
				maxRetries: 3,
				initialRetryDelay: 100, // Fast retry for test
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

		await expect.poll(() => attemptCount).toBeGreaterThanOrEqual(3);
	});

	test("batches events when enabled", async ({ page, browserName }) => {
		// WebKit has issues intercepting bodies of keepalive requests or beacons in Playwright
		test.skip(
			browserName === "webkit",
			"WebKit/Playwright issue with intercepting keepalive/beacon request bodies"
		);

		await page.route("**/basket.databuddy.cc/track", async (route) => {
			await route.fulfill({
				status: 200,
				body: JSON.stringify({ success: true }),
			});
		});

		// db.track queues events and POSTs an array to /track (screen_view uses /batch)
		const requestPromise = page.waitForRequest(
			(req) =>
				req.url().includes("/track") &&
				req.method() === "POST" &&
				hasEvent(req, (e) => e.name === "event1")
		);

		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-batch",
				ignoreBotDetection: true,
				enableBatching: true,
				batchSize: 3,
				batchTimeout: 200,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

		// Fire 3 events quickly
		await page.evaluate(() => {
			(window as any).db.track("event1");
			(window as any).db.track("event2");
			(window as any).db.track("event3");
		});

		const request = await requestPromise;
		let payload = request.postDataJSON();
		if (!payload) {
			try {
				payload = JSON.parse(request.postData() || "[]");
			} catch (_e) {
				// ignore
			}
		}

		expect(Array.isArray(payload)).toBe(true);
		expect(payload.length).toBeGreaterThanOrEqual(2);
		expect(findEvent(request, (e) => e.name === "event1")).toBeTruthy();
		expect(findEvent(request, (e) => e.name === "event2")).toBeTruthy();
	});
});
