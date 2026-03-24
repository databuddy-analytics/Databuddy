import { expect, test } from "@playwright/test";
import { findEvent, hasEvent } from "./test-utils";

test.describe("SPA Navigation", () => {
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

	test("tracks screen_view on pushState navigation", async ({ page }) => {
		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-spa",
				ignoreBotDetection: true,
				batchTimeout: 200,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

		await expect
			.poll(async () => await page.evaluate(() => !!(window as any).db))
			.toBeTruthy();

		await page.waitForTimeout(100);

		const requestPromise = page.waitForRequest((req) =>
			hasEvent(
				req,
				(e) =>
					e.name === "screen_view" &&
					typeof e.path === "string" &&
					e.path.includes("/new-page")
			)
		);

		await page.evaluate(() => {
			history.pushState({}, "", "/new-page");
		});

		const request = await requestPromise;
		const event = findEvent(
			request,
			(e) =>
				e.name === "screen_view" &&
				typeof e.path === "string" &&
				e.path.includes("/new-page")
		);
		expect(event?.name).toBe("screen_view");
		expect(event?.path).toContain("/new-page");
		expect(event?.page_count).toBe(2);
	});

	test("tracks screen_view on replaceState navigation", async ({ page }) => {
		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-spa",
				ignoreBotDetection: true,
				batchTimeout: 200,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

		await expect
			.poll(async () => await page.evaluate(() => !!(window as any).db))
			.toBeTruthy();

		await page.waitForTimeout(100);

		const requestPromise = page.waitForRequest((req) =>
			hasEvent(
				req,
				(e) =>
					e.name === "screen_view" &&
					typeof e.path === "string" &&
					e.path.includes("/replaced-page")
			)
		);

		await page.evaluate(() => {
			history.replaceState({}, "", "/replaced-page");
		});

		const request = await requestPromise;
		const event = findEvent(
			request,
			(e) =>
				e.name === "screen_view" &&
				typeof e.path === "string" &&
				e.path.includes("/replaced-page")
		);
		expect(event?.name).toBe("screen_view");
		expect(event?.path).toContain("/replaced-page");
	});

	test("tracks screen_view on popstate (back/forward)", async ({ page }) => {
		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-spa",
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

		const requestPromise = page.waitForRequest((req) =>
			hasEvent(
				req,
				(e) =>
					e.name === "screen_view" &&
					typeof e.path === "string" &&
					e.path.includes("/test")
			)
		);

		await page.goBack();

		const request = await requestPromise;
		const event = findEvent(
			request,
			(e) =>
				e.name === "screen_view" &&
				typeof e.path === "string" &&
				e.path.includes("/test")
		);
		expect(event?.name).toBe("screen_view");
	});

	test("does NOT track hash changes by default", async ({ page }) => {
		let screenViewCount = 0;

		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-spa",
				ignoreBotDetection: true,
				batchTimeout: 200,
			};
		});

		page.on("request", (req) => {
			if (!req.url().includes("basket.databuddy.cc")) {
				return;
			}
			try {
				const data = req.postDataJSON();
				const events = Array.isArray(data) ? data : [data];
				for (const e of events) {
					if (e.name === "screen_view") {
						screenViewCount += 1;
					}
				}
			} catch { }
		});

		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

		await expect
			.poll(async () => await page.evaluate(() => !!(window as any).db))
			.toBeTruthy();

		await page.waitForTimeout(500);
		const initialCount = screenViewCount;

		await page.evaluate(() => {
			window.location.hash = "#section";
		});

		await page.waitForTimeout(500);

		expect(screenViewCount).toBe(initialCount);
	});

	test("tracks hash changes when trackHashChanges is enabled", async ({
		page,
	}) => {
		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-spa",
				ignoreBotDetection: true,
				trackHashChanges: true,
				batchTimeout: 200,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

		await expect
			.poll(async () => await page.evaluate(() => !!(window as any).db))
			.toBeTruthy();

		await page.waitForTimeout(100);

		const requestPromise = page.waitForRequest((req) =>
			hasEvent(
				req,
				(e) =>
					e.name === "screen_view" &&
					typeof e.path === "string" &&
					e.path.includes("#my-section")
			)
		);

		await page.evaluate(() => {
			window.location.hash = "#my-section";
		});

		const request = await requestPromise;
		const event = findEvent(
			request,
			(e) =>
				e.name === "screen_view" &&
				typeof e.path === "string" &&
				e.path.includes("#my-section")
		);
		expect(event?.path).toContain("#my-section");
	});

	test("debounces rapid navigation events", async ({ page }) => {
		let screenViewCount = 0;

		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-spa",
				ignoreBotDetection: true,
				batchTimeout: 200,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

		await expect
			.poll(async () => await page.evaluate(() => !!(window as any).db))
			.toBeTruthy();

		await page.waitForTimeout(500);

		page.on("request", (req) => {
			if (!req.url().includes("basket.databuddy.cc")) {
				return;
			}
			try {
				const data = req.postDataJSON();
				const events = Array.isArray(data) ? data : [data];
				for (const e of events) {
					if (e.name === "screen_view") {
						screenViewCount += 1;
					}
				}
			} catch { }
		});

		await page.evaluate(() => {
			history.pushState({}, "", "/page-1");
			history.pushState({}, "", "/page-2");
			history.pushState({}, "", "/page-3");
		});

		await page.waitForTimeout(500);

		expect(screenViewCount).toBeLessThanOrEqual(2);
	});

	test("does not track same URL twice", async ({ page }) => {
		let screenViewCount = 0;

		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-spa",
				ignoreBotDetection: true,
				batchTimeout: 200,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

		await expect
			.poll(async () => await page.evaluate(() => !!(window as any).db))
			.toBeTruthy();

		await page.waitForTimeout(500);
		screenViewCount = 0;

		page.on("request", (req) => {
			if (!req.url().includes("basket.databuddy.cc")) {
				return;
			}
			try {
				const data = req.postDataJSON();
				const events = Array.isArray(data) ? data : [data];
				for (const e of events) {
					if (e.name === "screen_view") {
						screenViewCount += 1;
					}
				}
			} catch { }
		});

		await page.evaluate(() => {
			(window as any).db.screenView();
			(window as any).db.screenView();
			(window as any).db.screenView();
		});

		await page.waitForTimeout(500);
		expect(screenViewCount).toBe(0);
	});
});
