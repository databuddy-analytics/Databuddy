import { countEvents, expect, findEvent, hasEvent, test } from "./test-utils";

test.describe("Edge Cases", () => {
	test.describe("URL-based ID Override", () => {
		test("uses a well-formed anonId from URL query param", async ({ page }) => {
			const anonId = "anon_00000000-0000-4000-8000-000000000001";
			await page.goto(`/test?anonId=${anonId}`);
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
			expect(storedId).toBe(anonId);
		});

		test("rejects a malformed anonId from URL query param", async ({
			page,
		}) => {
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
			expect(storedId).toMatch(/^anon_[0-9a-f-]{36}$/);
		});

		test("uses a well-formed sessionId from URL query param", async ({
			page,
		}) => {
			const sessionId = "sess_00000000-0000-4000-8000-000000000002";
			await page.goto(`/test?sessionId=${sessionId}`);
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
			expect(storedId).toBe(sessionId);
		});

		test("rejects a malformed sessionId from URL query param", async ({
			page,
		}) => {
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
			expect(storedId).toMatch(/^sess_[0-9a-f-]{36}$/);
		});
	});

	test.describe("Opt-in after Opt-out", () => {
		test("tracking resumes after opt-in (requires page reload)", async ({
			page,
		}) => {
			await page.goto("/test");
			await page.evaluate(() => {
				localStorage.setItem("databuddy_opt_out", "true");
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await page.evaluate(() => {
				(window as any).databuddyOptIn();
			});

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

		test("should resume tracking after optIn without requiring page reload", async ({
			page,
		}) => {
			let trackRequestSent = false;

			await page.goto("/test");

			await page.evaluate(() => {
				localStorage.setItem("databuddy_opt_out", "true");
				(window as any).databuddyConfig = {
					clientId: "test-optin-noreload",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			await page.evaluate(() => {
				(window as any).databuddyOptIn();
			});

			page.on("request", (req) => {
				if (
					req.url().includes("basket.databuddy.cc") &&
					hasEvent(req, (e) => e.name === "post_optin_event")
				) {
					trackRequestSent = true;
				}
			});

			await page.evaluate(() => {
				(window as any).db.track("post_optin_event");
			});

			await page.waitForTimeout(500);
			expect(trackRequestSent).toBe(true);
		});
	});

	test.describe("No ClientId", () => {
		test("does not initialize without clientId", async ({ page }) => {
			let requestMade = false;

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
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

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });
			await page.waitForTimeout(100);
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });
			await page.waitForTimeout(500);

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
					batchSize: 100,
					batchTimeout: 500,
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

			await page.evaluate(() => {
				(window as any).db.track("timeout_event_1");
				(window as any).db.track("timeout_event_2");
			});

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
			let pixelRequestPath: string | null = null;

			await page.route("**/basket.databuddy.cc/*", async (route) => {
				if (route.request().method() !== "GET") {
					await route.fallback();
					return;
				}
				pixelRequestMade = true;
				try {
					pixelRequestPath = new URL(route.request().url()).pathname;
				} catch {
					/* best-effort */
				}
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
			expect(pixelRequestPath).toBe("/px.jpg");
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
					usePixel: true,
					batchTimeout: 200,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

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

	test.describe("Destroy", () => {
		test("interaction listeners should stop after destroy", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-destroy-interactions",
					ignoreBotDetection: true,
					batchTimeout: 200,
					trackInteractions: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).__tracker))
				.toBeTruthy();

			await page.mouse.move(100, 100);
			await page.mouse.click(100, 100);
			await page.waitForTimeout(100);

			await page.evaluate(() => {
				(window as any).__tracker.destroy();
			});

			const countAfterDestroy = await page.evaluate(
				() => (window as any).__tracker.interactionCount
			);

			await page.mouse.move(200, 200);
			await page.mouse.move(300, 300);
			await page.mouse.click(200, 200);
			await page.keyboard.press("a");
			await page.waitForTimeout(100);

			const countAfterInteractions = await page.evaluate(
				() => (window as any).__tracker.interactionCount
			);

			expect(countAfterInteractions).toBe(countAfterDestroy);
		});

		test("scroll depth listener should stop after destroy", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				document.body.style.minHeight = "5000px";
				(window as any).databuddyConfig = {
					clientId: "test-destroy-scroll",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).__tracker))
				.toBeTruthy();

			await page.evaluate(() => {
				(window as any).__tracker.destroy();
			});

			const depthAfterDestroy = await page.evaluate(
				() => (window as any).__tracker.maxScrollDepth
			);

			await page.evaluate(() => window.scrollTo(0, 2000));
			await page.waitForTimeout(100);

			const depthAfterScroll = await page.evaluate(
				() => (window as any).__tracker.maxScrollDepth
			);

			expect(depthAfterScroll).toBe(depthAfterDestroy);
		});

		test("error listeners should stop after destroy", async ({ page }) => {
			let errorTracked = false;

			await page.route("**/basket.databuddy.cc/errors**", async (route) => {
				errorTracked = true;
				await route.fulfill({
					status: 200,
					body: JSON.stringify({ success: true }),
				});
			});

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-destroy-errors",
					ignoreBotDetection: true,
					batchTimeout: 200,
					trackErrors: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).__tracker))
				.toBeTruthy();

			await page.evaluate(() => {
				(window as any).__tracker.destroy();
			});

			errorTracked = false;

			await page.evaluate(() => {
				setTimeout(() => {
					throw new Error("Error after destroy");
				}, 10);
			});

			await page.waitForTimeout(500);
			expect(errorTracked).toBe(false);
		});

		test("should flush pending events before destroying", async ({
			page,
			browserName,
		}) => {
			test.skip(
				browserName === "webkit",
				"WebKit/Playwright batch interception issues"
			);

			const sentEvents: string[] = [];

			page.on("request", (req) => {
				if (!req.url().includes("basket.databuddy.cc")) {
					return;
				}
				try {
					const data = JSON.parse(req.postData() ?? "[]");
					const events = Array.isArray(data) ? data : [data];
					for (const e of events) {
						if (e.name) {
							sentEvents.push(e.name as string);
						}
					}
				} catch {}
			});

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-destroy-flush",
					ignoreBotDetection: true,
					enableBatching: true,
					batchSize: 100,
					batchTimeout: 60_000,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).__tracker))
				.toBeTruthy();

			await page.evaluate(() => {
				(window as any).db.track("queued_event_1");
				(window as any).db.track("queued_event_2");
			});
			await page.waitForTimeout(100);

			await page.evaluate(() => {
				(window as any).__tracker.destroy();
			});

			await page.waitForTimeout(500);

			expect(sentEvents).toContain("queued_event_1");
			expect(sentEvents).toContain("queued_event_2");
		});
	});
});
