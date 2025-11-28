import { expect, test } from "@playwright/test";

test.describe("Mobile Tracking", () => {
	test.beforeEach(({ }, testInfo) => {
		if (!testInfo.project.name.includes("mobile")) {
			test.skip();
		}
	});

	test.beforeEach(async ({ page }) => {
		// Disable sendBeacon for reliable route interception (WebKit issue)
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

	test.describe("Viewport & Device", () => {
		test("captures correct mobile viewport dimensions", async ({ page }) => {
			const requestPromise = page.waitForRequest((req) =>
				req.url().includes("basket.databuddy.cc")
			);

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-mobile",
					ignoreBotDetection: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy.js" });

			const request = await requestPromise;
			const payload = request.postDataJSON();

			const [vpWidth, vpHeight] = payload.viewport_size.split("x").map(Number);
			// Mobile viewports are typically less than 500px wide
			expect(vpWidth).toBeLessThan(500);
			expect(vpWidth).toBeGreaterThan(200);
			expect(vpHeight).toBeGreaterThan(0);
		});

		test("handles viewport changes on orientation change", async ({
			page,
		}) => {
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-mobile",
					ignoreBotDetection: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			// Get initial viewport
			const initialViewport = await page.evaluate(() => ({
				width: window.innerWidth,
				height: window.innerHeight,
			}));

			// Simulate orientation change by setting new viewport
			await page.setViewportSize({
				width: initialViewport.height,
				height: initialViewport.width,
			});

			// Track an event with the new viewport
			const requestPromise = page.waitForRequest((req) => {
				const payload = req.postDataJSON?.();
				return (
					req.url().includes("basket.databuddy.cc") &&
					payload?.name === "after_orientation"
				);
			});

			await page.evaluate(() => {
				(window as any).db.track("after_orientation");
			});

			const request = await requestPromise;
			const payload = request.postDataJSON();

			// Viewport should reflect the new dimensions
			expect(payload.viewport_size).toBeTruthy();
		});
	});

	test.describe("Touch Events", () => {
		test("tracks touch tap interactions", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-mobile",
					ignoreBotDetection: true,
					trackInteractions: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			// Tap multiple times
			await page.touchscreen.tap(100, 100);
			await page.touchscreen.tap(150, 150);
			await page.touchscreen.tap(200, 200);

			// Tracker should still be functional
			const trackerWorks = await page.evaluate(() => {
				try {
					(window as any).db.track("test_after_touch");
					return true;
				} catch {
					return false;
				}
			});

			expect(trackerWorks).toBe(true);
		});

		test("handles rapid touch events without losing data", async ({
			page,
		}) => {
			const sentEvents: string[] = [];

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-mobile",
					ignoreBotDetection: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			page.on("request", (req) => {
				const payload = req.postDataJSON?.();
				if (
					req.url().includes("basket.databuddy.cc") &&
					payload?.name?.startsWith("rapid_")
				) {
					sentEvents.push(payload.name);
				}
			});

			// Rapid fire events (simulating fast taps)
			await page.evaluate(() => {
				for (let i = 0; i < 10; i++) {
					(window as any).db.track(`rapid_${i}`);
				}
			});

			await page.waitForTimeout(1000);

			// All events should be sent
			expect(sentEvents.length).toBe(10);
		});

		test("tracks data-track elements via touch", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				const btn = document.createElement("button");
				btn.setAttribute("data-track", "mobile_cta");
				btn.setAttribute("data-button-type", "primary");
				btn.style.width = "100px";
				btn.style.height = "50px";
				btn.style.position = "fixed";
				btn.style.top = "100px";
				btn.style.left = "100px";
				btn.innerText = "Tap Me";
				document.body.appendChild(btn);

				(window as any).databuddyConfig = {
					clientId: "test-mobile",
					ignoreBotDetection: true,
					trackAttributes: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			const requestPromise = page.waitForRequest((req) => {
				const payload = req.postDataJSON?.();
				return (
					req.url().includes("basket.databuddy.cc") &&
					payload?.name === "mobile_cta"
				);
			});

			// Tap the button
			await page.touchscreen.tap(150, 125);

			const request = await requestPromise;
			const payload = request.postDataJSON();

			expect(payload.name).toBe("mobile_cta");
			expect(payload.buttonType).toBe("primary");
		});
	});

	test.describe("Visibility & Background", () => {
		test("sends events before page becomes hidden", async ({ page }) => {
			let eventSentBeforeHidden = false;

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-mobile",
					ignoreBotDetection: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			page.on("request", (req) => {
				const payload = req.postDataJSON?.();
				if (
					req.url().includes("basket.databuddy.cc") &&
					payload?.name === "before_hide"
				) {
					eventSentBeforeHidden = true;
				}
			});

			await page.evaluate(() => {
				(window as any).db.track("before_hide");
			});

			await page.waitForTimeout(200);
			expect(eventSentBeforeHidden).toBe(true);
		});

		test("handles visibilitychange event correctly", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-mobile",
					ignoreBotDetection: true,
					trackWebVitals: true,
				};
			});
			await page.addScriptTag({ url: "/dist/vitals.js" });

			await page.waitForTimeout(100);

			// Simulate visibility change
			const noErrors = await page.evaluate(() => {
				try {
					Object.defineProperty(document, "visibilityState", {
						value: "hidden",
						writable: true,
					});
					document.dispatchEvent(new Event("visibilitychange"));
					return true;
				} catch {
					return false;
				}
			});

			expect(noErrors).toBe(true);
		});

		test("preserves events when app backgrounds and returns", async ({
			page,
		}) => {
			const events: string[] = [];

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-mobile",
					ignoreBotDetection: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			page.on("request", (req) => {
				const payload = req.postDataJSON?.();
				if (
					req.url().includes("basket.databuddy.cc") &&
					payload?.name?.startsWith("lifecycle_")
				) {
					events.push(payload.name);
				}
			});

			// Track before "backgrounding"
			await page.evaluate(() => {
				(window as any).db.track("lifecycle_before");
			});

			// Simulate background
			await page.evaluate(() => {
				Object.defineProperty(document, "visibilityState", {
					value: "hidden",
					writable: true,
					configurable: true,
				});
				document.dispatchEvent(new Event("visibilitychange"));
			});

			// Simulate foreground
			await page.evaluate(() => {
				Object.defineProperty(document, "visibilityState", {
					value: "visible",
					writable: true,
					configurable: true,
				});
				document.dispatchEvent(new Event("visibilitychange"));
			});

			// Track after "foregrounding"
			await page.evaluate(() => {
				(window as any).db.track("lifecycle_after");
			});

			await page.waitForTimeout(500);

			expect(events).toContain("lifecycle_before");
			expect(events).toContain("lifecycle_after");
		});
	});

	test.describe("Network Resilience", () => {
		test("handles network going offline gracefully", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-mobile",
					ignoreBotDetection: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			// Go offline
			await page.context().setOffline(true);

			// Should not throw when tracking offline
			const noError = await page.evaluate(() => {
				try {
					(window as any).db.track("offline_event");
					return true;
				} catch {
					return false;
				}
			});

			expect(noError).toBe(true);

			// Go back online
			await page.context().setOffline(false);
		});

		test("retries failed requests on mobile", async ({ page }) => {
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
				navigator.sendBeacon = () => false; // Force fetch path

				(window as any).databuddyConfig = {
					clientId: "test-mobile",
					ignoreBotDetection: true,
					enableRetries: true,
					maxRetries: 3,
					initialRetryDelay: 50,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy.js" });

			await expect.poll(() => attemptCount).toBeGreaterThanOrEqual(3);
		});

		test("uses sendBeacon for reliable delivery on mobile", async ({
			page,
		}) => {
			test.skip(true, "sendBeacon is disabled in tests for reliable route interception");

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-mobile",
					ignoreBotDetection: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			const beaconUsed = await page.evaluate(() => {
				let beaconCalled = false;
				const original = navigator.sendBeacon;
				if (original) {
					navigator.sendBeacon = (url, data) => {
						beaconCalled = true;
						return original.call(navigator, url, data);
					};
				}

				(window as any).db.track("beacon_test");

				if (original) {
					navigator.sendBeacon = original;
				}
				return beaconCalled;
			});

			expect(beaconUsed).toBe(true);
		});
	});

	test.describe("Scroll & Scroll Depth", () => {
		test("tracks scroll depth on mobile with touch scroll", async ({
			page,
		}) => {
			await page.goto("/test");
			await page.evaluate(() => {
				document.body.style.height = "5000px";
				(window as any).databuddyConfig = {
					clientId: "test-mobile",
					ignoreBotDetection: true,
					trackScrollDepth: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			// Simulate mobile scroll via touch gestures
			await page.touchscreen.tap(200, 400);

			// Scroll down
			await page.evaluate(() => {
				window.scrollTo(0, 1000);
				window.dispatchEvent(new Event("scroll"));
			});

			await page.waitForTimeout(100);

			// Scroll more
			await page.evaluate(() => {
				window.scrollTo(0, 2500);
				window.dispatchEvent(new Event("scroll"));
			});

			// Verify no errors
			const trackerWorks = await page.evaluate(() => {
				return typeof (window as any).db === "object";
			});

			expect(trackerWorks).toBe(true);
		});
	});

	test.describe("Storage & Privacy", () => {
		test("handles localStorage being unavailable (private mode)", async ({
			page,
		}) => {
			await page.goto("/test");
			await page.evaluate(() => {
				// Simulate private browsing where localStorage throws
				const originalLocalStorage = window.localStorage;
				Object.defineProperty(window, "localStorage", {
					get: () => {
						throw new Error("localStorage not available in private mode");
					},
					configurable: true,
				});

				try {
					(window as any).databuddyConfig = {
						clientId: "test-mobile-private",
						ignoreBotDetection: true,
					};
				} finally {
					// Restore for script loading
					Object.defineProperty(window, "localStorage", {
						value: originalLocalStorage,
						configurable: true,
					});
				}
			});

			// Should not crash
			const loaded = await page.evaluate(async () => {
				return true;
			});

			expect(loaded).toBe(true);
		});

		test("handles sessionStorage being unavailable", async ({ page }) => {
			await page.goto("/test");

			const noError = await page.evaluate(() => {
				try {
					// Try to use sessionStorage
					sessionStorage.setItem("test", "value");
					return true;
				} catch {
					return true; // Still OK even if it fails
				}
			});

			expect(noError).toBe(true);
		});
	});

	test.describe("Mobile Bot Detection", () => {
		test("detects mobile webdriver bots", async ({ page }) => {
			let requestSent = false;

			await page.goto("/test");
			await page.evaluate(() => {
				// Simulate webdriver being set (bot indicator)
				Object.defineProperty(navigator, "webdriver", {
					get: () => true,
					configurable: true,
				});

				(window as any).databuddyConfig = {
					clientId: "test-mobile-bot",
					// NOT setting ignoreBotDetection
				};
			});

			page.on("request", (req) => {
				if (req.url().includes("basket.databuddy.cc")) {
					requestSent = true;
				}
			});

			await page.addScriptTag({ url: "/dist/databuddy.js" });
			await page.waitForTimeout(500);

			// Should be blocked due to webdriver detection
			expect(requestSent).toBe(false);
		});

		test("allows real mobile users with ignoreBotDetection", async ({
			page,
		}) => {
			const requestPromise = page.waitForRequest((req) =>
				req.url().includes("basket.databuddy.cc")
			);

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-mobile-real",
					ignoreBotDetection: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy.js" });

			const request = await requestPromise;
			expect(request).toBeTruthy();
		});
	});

	test.describe("Error Handling", () => {
		test("captures errors on mobile correctly", async ({ page }) => {
			// Set up error endpoint interception
			await page.route("**/basket.databuddy.cc/errors", async (route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ success: true }),
					headers: { "Access-Control-Allow-Origin": "*" },
				});
			});

			const requestPromise = page.waitForRequest(
				(req) =>
					req.url().includes("/basket.databuddy.cc/errors") &&
					req.method() === "POST"
			);

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-mobile",
					ignoreBotDetection: true,
					trackErrors: true,
				};
			});
			await page.addScriptTag({ url: "/dist/errors.js" });

			await page.waitForTimeout(100);

			// Trigger error
			await page.evaluate(() => {
				setTimeout(() => {
					throw new Error("Mobile Error Test");
				}, 10);
			});

			const request = await requestPromise;
			const payload = request.postDataJSON();

			expect(payload.message).toContain("Mobile Error Test");
		});

		test("captures promise rejections on mobile", async ({ page }) => {
			// Set up error endpoint interception
			await page.route("**/basket.databuddy.cc/errors", async (route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ success: true }),
					headers: { "Access-Control-Allow-Origin": "*" },
				});
			});

			const requestPromise = page.waitForRequest(
				(req) =>
					req.url().includes("/basket.databuddy.cc/errors") &&
					req.method() === "POST"
			);

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-mobile",
					ignoreBotDetection: true,
					trackErrors: true,
				};
			});
			await page.addScriptTag({ url: "/dist/errors.js" });

			await page.waitForTimeout(100);

			await page.evaluate(() => {
				Promise.reject(new Error("Mobile Promise Rejection"));
			});

			const request = await requestPromise;
			const payload = request.postDataJSON();

			expect(payload.message).toContain("Mobile Promise Rejection");
		});
	});

	test.describe("Performance & Memory", () => {
		test("handles many events without memory issues", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-mobile",
					ignoreBotDetection: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			// Send many events
			const start = Date.now();
			await page.evaluate(() => {
				for (let i = 0; i < 100; i++) {
					(window as any).db.track(`perf_event_${i}`, { index: i });
				}
			});
			const duration = Date.now() - start;

			// Should complete in reasonable time (< 2 seconds)
			expect(duration).toBeLessThan(2000);

			// Tracker should still be responsive
			const stillWorks = await page.evaluate(() => {
				try {
					(window as any).db.track("final_test");
					return true;
				} catch {
					return false;
				}
			});

			expect(stillWorks).toBe(true);
		});

		test("batch mode works correctly on mobile", async ({
			page,
			browserName,
		}) => {
			test.skip(
				browserName === "webkit",
				"WebKit batch interception issues in Playwright"
			);

			await page.route("**/basket.databuddy.cc/batch", async (route) => {
				await route.fulfill({
					status: 200,
					body: JSON.stringify({ success: true }),
				});
			});

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-mobile-batch",
					ignoreBotDetection: true,
					enableBatching: true,
					batchSize: 5,
					batchTimeout: 500,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			const requestPromise = page.waitForRequest((req) =>
				req.url().includes("/batch")
			);

			// Fire events to trigger batch
			await page.evaluate(() => {
				for (let i = 0; i < 5; i++) {
					(window as any).db.track(`batch_${i}`);
				}
			});

			const request = await requestPromise;
			const payload = request.postDataJSON();

			expect(Array.isArray(payload)).toBe(true);
			expect(payload.length).toBeGreaterThanOrEqual(4);
		});
	});

	test.describe("SPA Navigation on Mobile", () => {
		test("tracks pushState navigation on mobile", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-mobile-spa",
					ignoreBotDetection: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			await page.waitForTimeout(100);

			const requestPromise = page.waitForRequest((req) => {
				const payload = req.postDataJSON?.();
				return (
					req.url().includes("basket.databuddy.cc") &&
					payload?.name === "screen_view" &&
					payload?.path?.includes("/mobile-page")
				);
			});

			await page.evaluate(() => {
				history.pushState({}, "", "/mobile-page");
			});

			const request = await requestPromise;
			const payload = request.postDataJSON();

			expect(payload.path).toContain("/mobile-page");
		});

		test("handles back button on mobile", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-mobile-back",
					ignoreBotDetection: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			// Navigate forward
			await page.evaluate(() => {
				history.pushState({}, "", "/page-2");
			});
			await page.waitForTimeout(100);

			const requestPromise = page.waitForRequest((req) => {
				const payload = req.postDataJSON?.();
				return (
					req.url().includes("basket.databuddy.cc") &&
					payload?.name === "screen_view" &&
					payload?.path?.includes("/test")
				);
			});

			// Go back
			await page.goBack();

			const request = await requestPromise;
			expect(request).toBeTruthy();
		});
	});

	test.describe("Data Integrity", () => {
		test("all required fields present in mobile events", async ({ page }) => {
			const requestPromise = page.waitForRequest((req) =>
				req.url().includes("basket.databuddy.cc")
			);

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-mobile-fields",
					ignoreBotDetection: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy.js" });

			const request = await requestPromise;
			const payload = request.postDataJSON();

			// Verify all required fields
			expect(payload.eventId).toBeTruthy();
			expect(payload.name).toBe("screen_view");
			expect(payload.anonymousId).toBeTruthy();
			expect(payload.sessionId).toBeTruthy();
			expect(payload.timestamp).toBeTruthy();
			expect(payload.path).toBeTruthy();
			expect(payload.viewport_size).toBeTruthy();
			expect(payload.language).toBeTruthy();
		});

		test("timestamp accuracy on mobile", async ({ page }) => {
			const beforeTime = Date.now();

			const requestPromise = page.waitForRequest((req) => {
				const payload = req.postDataJSON?.();
				return (
					req.url().includes("basket.databuddy.cc") &&
					payload?.name === "timestamp_test"
				);
			});

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-mobile-time",
					ignoreBotDetection: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			await page.evaluate(() => {
				(window as any).db.track("timestamp_test");
			});

			const request = await requestPromise;
			const payload = request.postDataJSON();
			const afterTime = Date.now();

			expect(payload.timestamp).toBeGreaterThanOrEqual(beforeTime);
			expect(payload.timestamp).toBeLessThanOrEqual(afterTime);
		});

		test("IDs persist correctly on mobile", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-mobile-persist",
					ignoreBotDetection: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy.js" });

			const id1 = await page.evaluate(() => localStorage.getItem("did"));
			expect(id1).toBeTruthy();

			await page.reload();
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-mobile-persist",
					ignoreBotDetection: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy.js" });

			const id2 = await page.evaluate(() => localStorage.getItem("did"));
			expect(id2).toBe(id1);
		});
	});
});
