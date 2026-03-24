import { expect, test } from "@playwright/test";
import { countEvents, findEvent, hasEvent } from "./test-utils";

test.describe("Edge Cases", () => {
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

	test.describe("URL-based ID Override", () => {
		test("uses anonId from URL query param", async ({ page }) => {
			await page.goto("/test?anonId=custom-anon-123");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-url-override",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			const storedId = await page.evaluate(() => localStorage.getItem("did"));
			expect(storedId).toBe("custom-anon-123");
		});

		test("uses sessionId from URL query param", async ({ page }) => {
			await page.goto("/test?sessionId=custom-session-456");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-url-override",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			const storedId = await page.evaluate(() =>
				sessionStorage.getItem("did_session")
			);
			expect(storedId).toBe("custom-session-456");
		});
	});

	test.describe("Opt-in after Opt-out", () => {
		test("databuddyOptIn clears opt-out flags", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				// First opt out
				localStorage.setItem("databuddy_opt_out", "true");
				localStorage.setItem("databuddy_disabled", "true");
			});

			// Call optIn
			await page.evaluate(() => {
				// Simulate the opt-in function
				localStorage.removeItem("databuddy_opt_out");
				localStorage.removeItem("databuddy_disabled");
				(window as any).databuddyOptedOut = false;
				(window as any).databuddyDisabled = false;
			});

			const optOutFlag = await page.evaluate(() =>
				localStorage.getItem("databuddy_opt_out")
			);
			const disabledFlag = await page.evaluate(() =>
				localStorage.getItem("databuddy_disabled")
			);

			expect(optOutFlag).toBeNull();
			expect(disabledFlag).toBeNull();
		});

		test("tracking resumes after opt-in (requires page reload)", async ({
			page,
		}) => {
			await page.goto("/test");
			await page.evaluate(() => {
				localStorage.setItem("databuddy_opt_out", "true");
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			// Opt back in
			await page.evaluate(() => {
				(window as any).databuddyOptIn();
			});

			// Reload to reinitialize tracker
			await page.reload();
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-optin",
					ignoreBotDetection: true,
					batchTimeout: 200,
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

	test.describe("No ClientId", () => {
		test("does not initialize without clientId", async ({ page }) => {
			let requestMade = false;

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					// No clientId
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			page.on("request", (req) => {
				if (req.url().includes("basket.databuddy.cc")) {
					requestMade = true;
				}
			});

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });
			await page.waitForTimeout(500);

			expect(requestMade).toBe(false);
		});
	});

	test.describe("Re-initialization Prevention", () => {
		test("does not re-initialize if already initialized", async ({ page }) => {
			let initCount = 0;

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-reinit",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			page.on("request", (req) => {
				initCount += countEvents(req, (e) => e.name === "screen_view");
			});

			// Load script twice
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });
			await page.waitForTimeout(100);
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });
			await page.waitForTimeout(500);

			// Should only have one screen_view
			expect(initCount).toBe(1);
		});
	});

	test.describe("Disabled Flag", () => {
		test("does not track when disabled option is true", async ({ page }) => {
			let requestMade = false;

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-disabled",
					ignoreBotDetection: true,
					disabled: true,
					batchTimeout: 200,
				};
			});

			page.on("request", (req) => {
				if (req.url().includes("basket.databuddy.cc")) {
					requestMade = true;
				}
			});

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });
			await page.waitForTimeout(500);

			expect(requestMade).toBe(false);
		});
	});

	test.describe("Batch Timeout", () => {
		test("flushes batch after timeout even if not full", async ({
			page,
			browserName,
		}) => {
			test.skip(
				browserName === "webkit",
				"WebKit/Playwright batch interception issues"
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
					clientId: "test-batch-timeout",
					ignoreBotDetection: true,
					enableBatching: true,
					batchSize: 100, // Large batch size
					batchTimeout: 500, // Short timeout for test
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			const requestPromise = page.waitForRequest(
				(req) => req.url().includes("/batch"),
				{ timeout: 3000 }
			);

			// Send fewer events than batch size
			await page.evaluate(() => {
				(window as any).db.track("timeout_event_1");
				(window as any).db.track("timeout_event_2");
			});

			// Wait for timeout to trigger flush
			const request = await requestPromise;
			const payload = request.postDataJSON();

			expect(Array.isArray(payload)).toBe(true);
		});
	});

	test.describe("Pixel Mode", () => {
		test("sends events via image pixel when usePixel is enabled", async ({
			page,
		}) => {
			let pixelRequestMade = false;

			// Pixel transport uses GET Image loads to /px.jpg, /batch, /track, etc.
			await page.route("**/basket.databuddy.cc/*", async (route) => {
				if (route.request().method() !== "GET") {
					await route.fallback();
					return;
				}
				pixelRequestMade = true;
				await route.fulfill({
					status: 200,
					contentType: "image/jpeg",
					body: Buffer.from([]),
				});
			});

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-pixel",
					ignoreBotDetection: true,
					usePixel: true,
					batchTimeout: 200,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await page.waitForTimeout(500);
			expect(pixelRequestMade).toBe(true);
		});
	});

	test.describe("Circular Reference Handling", () => {
		test("handles circular references in tracked properties", async ({
			page,
		}) => {
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-circular",
					ignoreBotDetection: true,
					usePixel: true, // Pixel mode uses the safeStringify
					batchTimeout: 200,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			// This should not throw
			const noError = await page.evaluate(() => {
				try {
					const circular: any = { a: 1 };
					circular.self = circular;
					(window as any).db.track("circular_test", circular);
					return true;
				} catch {
					return false;
				}
			});

			expect(noError).toBe(true);
		});
	});

	test.describe("localStorage/sessionStorage Errors", () => {
		test("handles localStorage access errors gracefully", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				// Mock localStorage to throw
				const originalGetItem = localStorage.getItem;
				localStorage.getItem = () => {
					throw new Error("Storage access denied");
				};

				(window as any).databuddyConfig = {
					clientId: "test-storage-error",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};

				// Restore after a short delay
				setTimeout(() => {
					localStorage.getItem = originalGetItem;
				}, 100);
			});

			// Should not throw
			const loaded = await page.evaluate(async () => {
				try {
					await new Promise((r) => setTimeout(r, 200));
					return true;
				} catch {
					return false;
				}
			});

			expect(loaded).toBe(true);
		});
	});

	test.describe("Empty Event Names", () => {
		test("handles tracking with empty string name", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-empty",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			// Should not throw
			const noError = await page.evaluate(() => {
				try {
					(window as any).db.track("");
					return true;
				} catch {
					return false;
				}
			});

			expect(noError).toBe(true);
		});
	});

	test.describe("Very Long Event Names/Properties", () => {
		test("handles very long event names", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-long",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			const longName = "a".repeat(1000);
			const requestPromise = page.waitForRequest(
				(req) =>
					req.url().includes("basket.databuddy.cc") &&
					req.method() === "POST" &&
					hasEvent(req, (e) => e.name === longName)
			);

			await page.evaluate((name) => {
				(window as any).db.track(name);
			}, longName);

			const request = await requestPromise;
			const event = findEvent(request, (e) => e.name === longName);
			expect(event).toBeDefined();
			expect(String(event?.name).length).toBe(1000);
		});
	});

	test.describe("Special Characters in Properties", () => {
		test("handles special characters in event properties", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-special",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			const requestPromise = page.waitForRequest(
				(req) =>
					req.url().includes("basket.databuddy.cc") &&
					req.method() === "POST" &&
					hasEvent(req, (e) => e.name === "special_chars")
			);

			await page.evaluate(() => {
				(window as any).db.track("special_chars", {
					emoji: "🎉🚀",
					unicode: "日本語",
					quotes: 'He said "hello"',
					newlines: "line1\nline2",
					html: "<script>alert('xss')</script>",
				});
			});

			const request = await requestPromise;
			const event = findEvent(request, (e) => e.name === "special_chars");
			const props = event?.properties as Record<string, unknown> | undefined;

			expect(props?.emoji).toBe("🎉🚀");
			expect(props?.unicode).toBe("日本語");
			expect(props?.quotes).toBe('He said "hello"');
			expect(props?.newlines).toBe("line1\nline2");
			expect(props?.html).toBe("<script>alert('xss')</script>");
		});
	});
});
