import { expect, findEvent, hasEvent, test } from "./test-utils";

test.describe("Event Context", () => {

	test.describe("UTM Parameters", () => {
		test("captures utm_source from URL", async ({ page }) => {
			await page.goto("/test?utm_source=google");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-utm",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(req, (e) => e.name === "screen_view")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			const payload = findEvent(request, (e) => e.name === "screen_view");

			expect(payload?.utm_source).toBe("google");
		});

		test("captures all UTM parameters", async ({ page }) => {
			await page.goto(
				"/test?utm_source=facebook&utm_medium=cpc&utm_campaign=summer_sale&utm_term=shoes&utm_content=banner_1"
			);
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-utm",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(req, (e) => e.name === "screen_view")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			const payload = findEvent(request, (e) => e.name === "screen_view");

			expect(payload?.utm_source).toBe("facebook");
			expect(payload?.utm_medium).toBe("cpc");
			expect(payload?.utm_campaign).toBe("summer_sale");
			expect(payload?.utm_term).toBe("shoes");
			expect(payload?.utm_content).toBe("banner_1");
		});

		test("utm parameters are undefined when not present", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-utm",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(req, (e) => e.name === "screen_view")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			const payload = findEvent(request, (e) => e.name === "screen_view");

			expect(payload?.utm_source).toBeUndefined();
			expect(payload?.utm_medium).toBeUndefined();
		});
	});

	test.describe("Ad Click IDs", () => {
		test("captures gclid from URL", async ({ page }) => {
			await page.goto("/test?gclid=EAIaIQobChMI_test123");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-gclid",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(req, (e) => e.name === "screen_view")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			const payload = findEvent(request, (e) => e.name === "screen_view");

			expect(payload?.gclid).toBe("EAIaIQobChMI_test123");
		});

		test("captures fbclid from URL", async ({ page }) => {
			await page.goto("/test?fbclid=fb_click_abc");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-fbclid",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(req, (e) => e.name === "screen_view")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			const payload = findEvent(request, (e) => e.name === "screen_view");

			expect(payload?.fbclid).toBe("fb_click_abc");
		});

		test("gclid is undefined when not present", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-gclid",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(req, (e) => e.name === "screen_view")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			const payload = findEvent(request, (e) => e.name === "screen_view");

			expect(payload?.gclid).toBeUndefined();
		});

		test("persists gclid to localStorage for later pages", async ({ page }) => {
			await page.goto("/test?gclid=persist_test_123");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-gclid-persist",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			const stored = await page.evaluate(() =>
				localStorage.getItem("did_params")
			);
			expect(stored).toBeTruthy();
			const parsed = JSON.parse(stored as string);
			expect(parsed.gclid).toBe("persist_test_123");
		});

		test("restores gclid from localStorage on pages without it in URL", async ({
			page,
		}) => {
			await page.goto("/test?gclid=restored_456");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-gclid-restore",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(
					req,
					(e) =>
						e.name === "screen_view" &&
						typeof e.path === "string" &&
						e.path.includes("/no-gclid-page")
				)
			);

			await page.evaluate(() => {
				history.pushState({}, "", "/no-gclid-page");
			});

			const request = await requestPromise;
			const payload = findEvent(
				request,
				(e) =>
					e.name === "screen_view" &&
					typeof e.path === "string" &&
					e.path.includes("/no-gclid-page")
			);

			expect(payload?.gclid).toBe("restored_456");
		});

		test("captures gclid and utm params together", async ({ page }) => {
			await page.goto("/test?gclid=combo_789&utm_source=google&utm_medium=cpc");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-combo",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(req, (e) => e.name === "screen_view")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			const payload = findEvent(request, (e) => e.name === "screen_view");

			expect(payload?.gclid).toBe("combo_789");
			expect(payload?.utm_source).toBe("google");
			expect(payload?.utm_medium).toBe("cpc");
		});

		test("new gclid overwrites previously stored one", async ({ page }) => {
			await page.goto("/test?gclid=old_click_aaa");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-overwrite",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(
					req,
					(e) =>
						e.name === "screen_view" &&
						typeof e.path === "string" &&
						e.path.includes("gclid=new_click_bbb")
				)
			);

			await page.evaluate(() => {
				history.pushState({}, "", "/landing2?gclid=new_click_bbb");
			});

			const request = await requestPromise;
			const payload = findEvent(
				request,
				(e) =>
					e.name === "screen_view" &&
					typeof e.path === "string" &&
					e.path.includes("gclid=new_click_bbb")
			);

			expect(payload?.gclid).toBe("new_click_bbb");

			const stored = await page.evaluate(() =>
				localStorage.getItem("did_params")
			);
			expect(JSON.parse(stored as string).gclid).toBe("new_click_bbb");
		});

		test("utm params are transient but click IDs persist across navigation", async ({
			page,
		}) => {
			await page.goto(
				"/test?gclid=persist_click&utm_source=google&utm_medium=cpc"
			);
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-transient",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(
					req,
					(e) =>
						e.name === "screen_view" &&
						typeof e.path === "string" &&
						e.path.includes("/clean-page")
				)
			);

			await page.evaluate(() => {
				history.pushState({}, "", "/clean-page");
			});

			const request = await requestPromise;
			const payload = findEvent(
				request,
				(e) =>
					e.name === "screen_view" &&
					typeof e.path === "string" &&
					e.path.includes("/clean-page")
			);

			expect(payload?.gclid).toBe("persist_click");
			expect(payload?.utm_source).toBeUndefined();
			expect(payload?.utm_medium).toBeUndefined();
		});

		test("multiple click IDs from different platforms at once", async ({
			page,
		}) => {
			await page.goto("/test?gclid=google_abc&fbclid=meta_xyz");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-multi-click",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(req, (e) => e.name === "screen_view")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			const payload = findEvent(request, (e) => e.name === "screen_view");

			expect(payload?.gclid).toBe("google_abc");
			expect(payload?.fbclid).toBe("meta_xyz");

			const stored = await page.evaluate(() =>
				localStorage.getItem("did_params")
			);
			const parsed = JSON.parse(stored as string);
			expect(parsed.gclid).toBe("google_abc");
			expect(parsed.fbclid).toBe("meta_xyz");
		});

		test("gclid persists through full page reload", async ({ page }) => {
			await page.goto("/test?gclid=reload_test_id");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-reload-gclid",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-reload-gclid",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(req, (e) => e.name === "screen_view")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			const payload = findEvent(request, (e) => e.name === "screen_view");

			expect(payload?.gclid).toBe("reload_test_id");
		});

		test("empty gclid param is not stored or sent", async ({ page }) => {
			await page.goto("/test?gclid=");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-empty-gclid",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(req, (e) => e.name === "screen_view")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			const payload = findEvent(request, (e) => e.name === "screen_view");

			expect(payload?.gclid).toBeUndefined();

			const stored = await page.evaluate(() =>
				localStorage.getItem("did_params")
			);
			expect(stored).toBeNull();
		});

		test("gclid carries through multiple SPA navigations into track events", async ({
			page,
		}) => {
			await page.goto("/test?gclid=multi_nav_id");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-multi-nav",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			await page.evaluate(() => {
				history.pushState({}, "", "/page-2");
			});
			await page.waitForTimeout(100);
			await page.evaluate(() => {
				history.pushState({}, "", "/page-3");
			});
			await page.waitForTimeout(100);

			const requestPromise = page.waitForRequest(
				(req) =>
					req.url().includes("basket.databuddy.cc") &&
					hasEvent(req, (e) => e.name === "deep_nav_event")
			);

			await page.evaluate(() => {
				(window as any).db.track("deep_nav_event", { step: 3 });
			});

			const request = await requestPromise;
			const raw = findEvent(request, (e) => e.name === "deep_nav_event");
			expect(raw).toBeDefined();
			const props = raw?.properties as Record<string, unknown> | undefined;
			expect(props?.gclid ?? raw?.gclid).toBe("multi_nav_id");
		});
	});

	test.describe("Timezone", () => {
		test("captures user timezone", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-timezone",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(req, (e) => e.name === "screen_view")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			const payload = findEvent(request, (e) => e.name === "screen_view");

			expect(payload?.timezone).toBeTruthy();
			// Timezone should be a valid IANA timezone string (UTC, GMT, or Area/Location format)
			expect(payload?.timezone).toMatch(/^([A-Za-z_]+\/[A-Za-z_]+|UTC|GMT)$/);
		});
	});

	test.describe("Referrer", () => {
		test("captures document referrer", async ({ page, browserName }) => {
			// WebKit has stricter referrer policies in Playwright
			test.skip(
				browserName === "webkit",
				"WebKit has stricter referrer policies that may not pass through referer header"
			);

			// Set referrer via page context
			await page.goto("/test", {
				referer: "https://google.com/search?q=test",
			});
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-referrer",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(req, (e) => e.name === "screen_view")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			const payload = findEvent(request, (e) => e.name === "screen_view");

			expect(payload?.referrer).toBe("https://google.com/search?q=test");
		});

		test("uses 'direct' when no referrer", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				// Clear any referrer
				Object.defineProperty(document, "referrer", {
					value: "",
					writable: true,
				});
				(window as any).databuddyConfig = {
					clientId: "test-referrer",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(req, (e) => e.name === "screen_view")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			const payload = findEvent(request, (e) => e.name === "screen_view");

			expect(payload?.referrer).toBe("direct");
		});
	});

	test.describe("Viewport Size", () => {
		test("captures viewport dimensions", async ({ page }) => {
			await page.setViewportSize({ width: 1920, height: 1080 });
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-viewport",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(req, (e) => e.name === "screen_view")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			const payload = findEvent(request, (e) => e.name === "screen_view");

			expect(payload?.viewport_size).toBe("1920x1080");
		});

		test("captures different viewport sizes", async ({ page }) => {
			await page.setViewportSize({ width: 375, height: 667 });
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-viewport",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(req, (e) => e.name === "screen_view")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			const payload = findEvent(request, (e) => e.name === "screen_view");

			expect(payload?.viewport_size).toBe("375x667");
		});
	});

	test.describe("Language", () => {
		test("captures browser language", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-language",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(req, (e) => e.name === "screen_view")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			const payload = findEvent(request, (e) => e.name === "screen_view");

			expect(payload?.language).toBeTruthy();
			// Language should be a valid locale string
			expect(payload?.language).toMatch(/^[a-z]{2}(-[A-Z]{2})?$/);
		});
	});

	test.describe("Page Title", () => {
		test("captures document title", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				document.title = "My Custom Page Title";
				(window as any).databuddyConfig = {
					clientId: "test-title",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(req, (e) => e.name === "screen_view")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			const payload = findEvent(request, (e) => e.name === "screen_view");

			expect(payload?.title).toBe("My Custom Page Title");
		});
	});

	test.describe("Path", () => {
		test("captures full path with origin", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				history.replaceState({}, "", "/my/custom/path?query=value#section");
				(window as any).databuddyConfig = {
					clientId: "test-path",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(req, (e) => e.name === "screen_view")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			const payload = findEvent(request, (e) => e.name === "screen_view");

			expect(payload?.path).toContain("/my/custom/path");
			expect(payload?.path).toContain("query=value");
			expect(payload?.path).toContain("#section");
		});
	});

	test.describe("Timestamp", () => {
		test("includes timestamp in events", async ({ page }) => {
			const beforeTime = Date.now();

			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-timestamp",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(req, (e) => e.name === "screen_view")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			const payload = findEvent(request, (e) => e.name === "screen_view");

			const afterTime = Date.now();

			expect(payload?.timestamp).toBeGreaterThanOrEqual(beforeTime);
			expect(payload?.timestamp).toBeLessThanOrEqual(afterTime);
		});
	});

	test.describe("Session & Anonymous IDs", () => {
		test("includes anonymousId in events", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-ids",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(req, (e) => e.name === "screen_view")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			const payload = findEvent(request, (e) => e.name === "screen_view");

			expect(payload?.anonymousId).toBeTruthy();
			expect(payload?.anonymousId).toMatch(/^anon_/);
		});

		test("includes sessionId in events", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-ids",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
			});

			const requestPromise = page.waitForRequest((req) =>
				hasEvent(req, (e) => e.name === "screen_view")
			);

			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const request = await requestPromise;
			const payload = findEvent(request, (e) => e.name === "screen_view");

			expect(payload?.sessionId).toBeTruthy();
			expect(payload?.sessionId).toMatch(/^sess_/);
		});
	});
});
