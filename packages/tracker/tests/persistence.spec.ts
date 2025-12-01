import { expect, test } from "@playwright/test";

test.describe("Persistence", () => {
	test.beforeEach(async ({ page }) => {
		// Disable sendBeacon for reliable route interception (WebKit issue)
		await page.addInitScript(() => {
			Object.defineProperty(navigator, "sendBeacon", { value: undefined });
		});

		await page.route("**/basket.databuddy.cc/*", async (route) => {
			await route.fulfill({
				status: 200,
				body: JSON.stringify({ success: true }),
			});
		});
	});

	test("persists anonymousId across reloads", async ({ page }) => {
		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-persist",
				ignoreBotDetection: true,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy.js" });

		// Get first ID
		const id1 = await page.evaluate(() => localStorage.getItem("did"));
		expect(id1).toBeTruthy();

		// Reload
		await page.reload();
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-persist",
				ignoreBotDetection: true,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy.js" });

		// Get second ID
		const id2 = await page.evaluate(() => localStorage.getItem("did"));
		expect(id2).toBe(id1);
	});

	test("persists sessionId across reloads", async ({ page }) => {
		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-persist",
				ignoreBotDetection: true,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy.js" });

		const sess1 = await page.evaluate(() =>
			sessionStorage.getItem("did_session")
		);
		expect(sess1).toBeTruthy();

		await page.reload();
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-persist",
				ignoreBotDetection: true,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy.js" });

		const sess2 = await page.evaluate(() =>
			sessionStorage.getItem("did_session")
		);
		expect(sess2).toBe(sess1);
	});
});
