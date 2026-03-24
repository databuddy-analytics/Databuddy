import { expect, test } from "@playwright/test";
import { countEvents, findEvent, hasEvent } from "./test-utils";

test.describe("Sampling & Filtering", () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(navigator, "sendBeacon", { value: undefined });
		});

		await page.route("**/basket.databuddy.cc/*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ success: true }),
				headers: { "Access-Control-Allow-Origin": "*" },
			});
		});
	});

	test.describe("samplingRate", () => {
		test("sends all events when samplingRate is 1.0", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-sampling",
					ignoreBotDetection: true,
					batchTimeout: 200,
					samplingRate: 1.0,
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(req, (e) => e.name === "screen_view")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			const event = findEvent(request, (e) => e.name === "screen_view");
			expect(event).toBeDefined();
		});

		test("sends no events when samplingRate is 0", async ({ page }) => {
			let eventSent = false;

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-sampling",
					ignoreBotDetection: true,
					batchTimeout: 200,
					samplingRate: 0,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			page.on("request", (req) => {
				if (req.url().includes("basket.databuddy.cc")) {
					eventSent = true;
				}
			});

			await page.waitForTimeout(500);
			expect(eventSent).toBe(false);
		});

		test("custom events bypass sampling", async ({ page }) => {
			let customEventCount = 0;

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-sampling-bypass",
					ignoreBotDetection: true,
					batchTimeout: 200,
					samplingRate: 0,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			page.on("request", (req) => {
				if (!req.url().includes("basket.databuddy.cc")) {
					return;
				}
				customEventCount += countEvents(
					req,
					(e) => e.name === "custom_bypass"
				);
			});

			await page.evaluate(() => {
				(window as any).db.track("custom_bypass");
			});

			await page.waitForTimeout(500);
			expect(customEventCount).toBe(1);
		});
	});

	test.describe("filter function", () => {
		test("blocks batch events that fail filter", async ({ page }) => {
			let screenViewSent = false;

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-filter",
					ignoreBotDetection: true,
					batchTimeout: 200,
					filter: () => false,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			page.on("request", (req) => {
				if (!req.url().includes("basket.databuddy.cc")) {
					return;
				}
				if (countEvents(req, (e) => e.name === "screen_view") > 0) {
					screenViewSent = true;
				}
			});

			await page.waitForTimeout(500);
			expect(screenViewSent).toBe(false);
		});

		test("filter receives full event payload", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).receivedPayload = null;
				(window as any).databuddyConfig = {
					clientId: "test-filter",
					ignoreBotDetection: true,
					batchTimeout: 200,
					filter: (event: any) => {
						if (event.name === "screen_view" && !(window as any).receivedPayload) {
							(window as any).receivedPayload = event;
						}
						return true;
					},
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await page.waitForTimeout(300);

			const receivedPayload = await page.evaluate(
				() => (window as any).receivedPayload
			);

			expect(receivedPayload).not.toBeNull();
			expect(receivedPayload.name).toBe("screen_view");
			expect(receivedPayload.anonymousId).toBeTruthy();
			expect(receivedPayload.sessionId).toBeTruthy();
			expect(receivedPayload.timestamp).toBeTruthy();
		});

		test("custom events bypass filter", async ({ page }) => {
			let customEventSent = false;

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-filter-bypass",
					ignoreBotDetection: true,
					batchTimeout: 200,
					filter: () => false,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			page.on("request", (req) => {
				if (!req.url().includes("basket.databuddy.cc")) {
					return;
				}
				if (countEvents(req, (e) => e.name === "custom_unfiltered") > 0) {
					customEventSent = true;
				}
			});

			await page.evaluate(() => {
				(window as any).db.track("custom_unfiltered");
			});

			await page.waitForTimeout(500);
			expect(customEventSent).toBe(true);
		});
	});

	test.describe("skipPatterns", () => {
		test("skips exact path matches", async ({ page }) => {
			let eventSent = false;

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-skip",
					ignoreBotDetection: true,
					batchTimeout: 200,
					skipPatterns: ["/test"],
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			page.on("request", (req) => {
				if (req.url().includes("basket.databuddy.cc")) {
					eventSent = true;
				}
			});

			await page.waitForTimeout(500);
			expect(eventSent).toBe(false);
		});

		test("skips wildcard path matches", async ({ page }) => {
			let eventSent = false;

			await page.goto("/test");
			await page.evaluate(() => {
				history.replaceState({}, "", "/admin/users/list");
				(window as any).databuddyConfig = {
					clientId: "test-skip",
					ignoreBotDetection: true,
					batchTimeout: 200,
					skipPatterns: ["/admin/*"],
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			page.on("request", (req) => {
				if (req.url().includes("basket.databuddy.cc")) {
					eventSent = true;
				}
			});

			await page.waitForTimeout(500);
			expect(eventSent).toBe(false);
		});

		test("does not skip non-matching paths", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				history.replaceState({}, "", "/public/page");
				(window as any).databuddyConfig = {
					clientId: "test-skip",
					ignoreBotDetection: true,
					batchTimeout: 200,
					skipPatterns: ["/admin/*", "/private/*"],
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				req.url().includes("basket.databuddy.cc")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			expect(request).toBeTruthy();
		});
	});
});
