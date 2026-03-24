import { expect, test } from "@playwright/test";
import { findEvent, hasEvent } from "./test-utils";

test.describe("General Tracking", () => {
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

	test("loads and initializes successfully via window.databuddyConfig", async ({
		page,
	}) => {
		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-client-id",
				ignoreBotDetection: true,
				batchTimeout: 200,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

		await expect
			.poll(async () => await page.evaluate(() => !!(window as any).databuddy))
			.toBeTruthy();

		const tracker = await page.evaluate(
			() => (window as any).databuddy.options
		);
		expect(tracker.clientId).toBe("test-client-id");
	});

	test("initializes via data- attributes", async ({ page }) => {
		await page.goto("/test");
		await page.evaluate(() => {
			const script = document.createElement("script");
			script.src = "/dist/databuddy-debug.js";
			script.setAttribute("data-client-id", "data-attr-client");
			script.setAttribute("data-ignore-bot-detection", "true");
			document.body.appendChild(script);
		});

		await expect
			.poll(async () => await page.evaluate(() => !!(window as any).databuddy))
			.toBeTruthy();

		const tracker = await page.evaluate(
			() => (window as any).databuddy.options
		);
		expect(tracker.clientId).toBe("data-attr-client");
		expect(tracker.ignoreBotDetection).toBe(true);
	});

	test("initializes via query parameters", async ({ page }) => {
		await page.goto("/test");
		await page.evaluate(() => {
			const script = document.createElement("script");
			script.src =
				"/dist/databuddy-debug.js?clientId=query-param-client&ignoreBotDetection=true";
			document.body.appendChild(script);
		});

		await expect
			.poll(async () => await page.evaluate(() => !!(window as any).databuddy))
			.toBeTruthy();

		const tracker = await page.evaluate(
			() => (window as any).databuddy.options
		);
		expect(tracker.clientId).toBe("query-param-client");
		expect(tracker.ignoreBotDetection).toBe(true);
	});

	test("sends screen_view event on load", async ({ page }) => {
		// Match exactly the root endpoint for track events
		const requestPromise = page.waitForRequest(
			(request) =>
				request.url().includes("basket.databuddy.cc") &&
				request.method() === "POST" &&
				hasEvent(request, (e) => e.name === "screen_view")
		);

		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-client-id",
				ignoreBotDetection: true,
				batchTimeout: 200,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

		const request = await requestPromise;
		const event = findEvent(request, (e) => e.name === "screen_view");
		expect(event).toBeTruthy();
		expect(event?.name).toBe("screen_view");
		expect(event?.anonymousId).toBeTruthy();
	});

	test("tracks custom events via window.db", async ({ page }) => {
		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-client-id",
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
				hasEvent(req, (e) => e.name === "custom_click")
		);

		await page.evaluate(() => {
			(window as any).db.track("custom_click", { foo: "bar" });
		});

		const request = await requestPromise;
		const event = findEvent(request, (e) => e.name === "custom_click");
		expect(event).toBeTruthy();
		const props = event?.properties as Record<string, unknown> | undefined;
		expect(props?.foo).toBe("bar");
	});

	test("blocks tracking when bot detection is active (default)", async ({
		page,
	}) => {
		// Should NOT send a request if ignoreBotDetection is not set (default false)
		// We need to make sure the browser context actually looks like a bot to Playwright (headless usually does)
		// or we rely on the fact that we are NOT setting ignoreBotDetection: true.
		// However, standard Playwright headless chrome matches HEADLESS_CHROME_REGEX.

		let requestSent = false;
		page.on("request", (req) => {
			if (req.url().includes("/basket.databuddy.cc/")) {
				requestSent = true;
			}
		});

		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = { clientId: "test-client-id" }; // ignoreBotDetection defaults to false
		});
		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

		// Wait a bit to ensure no request is fired
		await page.waitForTimeout(1000);

		expect(requestSent).toBe(false);
	});
});
