import { expect, test } from "@playwright/test";

test.describe("Mobile Tracking", () => {
	// biome-ignore lint/correctness/noEmptyPattern: skip test if not mobile
	test.beforeEach(({ }, testInfo) => {
		if (!testInfo.project.name.includes("mobile")) {
			test.skip();
		}
	});

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

	test("captures correct mobile viewport dimensions", async ({ page }) => {
		const requestPromise = page.waitForRequest((req) =>
			req.url().includes("basket.databuddy.cc")
		);

		await page.goto("/test");
		await page.evaluate(() => {
			(window as never as { databuddyConfig: unknown }).databuddyConfig = {
				clientId: "test-mobile",
				ignoreBotDetection: true,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy.js" });

		const request = await requestPromise;
		const payload = request.postDataJSON();

		const [vpWidth] = payload.viewport_size.split("x").map(Number);
		expect(vpWidth).toBeLessThan(500);
		expect(vpWidth).toBeGreaterThan(200);
	});

	test("tracks touch tap interactions", async ({ page }) => {
		await page.goto("/test");
		await page.evaluate(() => {
			const btn = document.createElement("button");
			btn.setAttribute("data-track", "mobile_tap");
			btn.style.cssText = "width:100px;height:50px;position:fixed;top:100px;left:100px";
			btn.innerText = "Tap";
			document.body.appendChild(btn);

			(window as never as { databuddyConfig: unknown }).databuddyConfig = {
				clientId: "test-mobile",
				ignoreBotDetection: true,
				trackAttributes: true,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy.js" });

		await expect
			.poll(async () => await page.evaluate(() => !!(window as never as { db: unknown }).db))
			.toBeTruthy();

		const requestPromise = page.waitForRequest((req) => {
			const payload = req.postDataJSON?.();
			return req.url().includes("basket.databuddy.cc") && payload?.name === "mobile_tap";
		});

		await page.touchscreen.tap(150, 125);

		const request = await requestPromise;
		const payload = request.postDataJSON();
		expect(payload.name).toBe("mobile_tap");
	});

	test("handles rapid touch events without losing data", async ({ page }) => {
		const sentEvents: string[] = [];

		await page.goto("/test");
		await page.evaluate(() => {
			(window as never as { databuddyConfig: unknown }).databuddyConfig = {
				clientId: "test-mobile",
				ignoreBotDetection: true,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy.js" });

		await expect
			.poll(async () => await page.evaluate(() => !!(window as never as { db: unknown }).db))
			.toBeTruthy();

		page.on("request", (req) => {
			const payload = req.postDataJSON?.();
			if (req.url().includes("basket.databuddy.cc") && payload?.name?.startsWith("rapid_")) {
				sentEvents.push(payload.name);
			}
		});

		await page.evaluate(() => {
			for (let i = 0; i < 10; i++) {
				(window as never as { db: { track: (name: string) => void } }).db.track(`rapid_${i}`);
			}
		});

		await page.waitForTimeout(1000);
		expect(sentEvents.length).toBe(10);
	});

	test("all required fields present in mobile events", async ({ page }) => {
		const requestPromise = page.waitForRequest((req) =>
			req.url().includes("basket.databuddy.cc")
		);

		await page.goto("/test");
		await page.evaluate(() => {
			(window as never as { databuddyConfig: unknown }).databuddyConfig = {
				clientId: "test-mobile-fields",
				ignoreBotDetection: true,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy.js" });

		const request = await requestPromise;
		const payload = request.postDataJSON();

		expect(payload.eventId).toBeTruthy();
		expect(payload.name).toBe("screen_view");
		expect(payload.anonymousId).toBeTruthy();
		expect(payload.sessionId).toBeTruthy();
		expect(payload.timestamp).toBeTruthy();
		expect(payload.path).toBeTruthy();
		expect(payload.viewport_size).toBeTruthy();
	});

	test("IDs persist correctly on mobile", async ({ page }) => {
		await page.goto("/test");
		await page.evaluate(() => {
			(window as never as { databuddyConfig: unknown }).databuddyConfig = {
				clientId: "test-mobile-persist",
				ignoreBotDetection: true,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy.js" });

		const id1 = await page.evaluate(() => localStorage.getItem("did"));
		expect(id1).toBeTruthy();

		await page.reload();
		await page.evaluate(() => {
			(window as never as { databuddyConfig: unknown }).databuddyConfig = {
				clientId: "test-mobile-persist",
				ignoreBotDetection: true,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy.js" });

		const id2 = await page.evaluate(() => localStorage.getItem("did"));
		expect(id2).toBe(id1);
	});
});
