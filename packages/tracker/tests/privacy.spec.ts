import { expect, test } from "@playwright/test";

test.describe("Privacy & Opt-out", () => {
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

	test("does not track when opted out via function", async ({ page }) => {
		let requestCount = 0;
		page.on("request", (req) => {
			if (req.url().includes("basket.databuddy.cc")) {
				requestCount += 1;
			}
		});

		await page.goto("/test");
		await page.evaluate(() => {
			// Pre-set opt-out in localStorage
			localStorage.setItem("databuddy_opt_out", "true");
			(window as any).databuddyConfig = {
				clientId: "test-privacy",
				ignoreBotDetection: true,
			};
		});

		await page.addScriptTag({ url: "/dist/databuddy.js" });

		// Try to track
		await page.evaluate(() => {
			if ((window as any).db) {
				(window as any).db.track("should_fail");
			}
		});

		await page.waitForTimeout(1000);
		expect(requestCount).toBe(0);
	});

	test("dynamically opts out and stops tracking", async ({ page }) => {
		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-privacy",
				ignoreBotDetection: true,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy.js" });

		// Ensure we are loaded
		await expect
			.poll(async () => await page.evaluate(() => !!(window as any).db))
			.toBe(true);

		// Call opt out
		await page.evaluate(() => {
			(window as any).databuddyOptOut();
		});

		// Verify flags
		const isOptedOut = await page.evaluate(
			() =>
				localStorage.getItem("databuddy_opt_out") === "true" &&
				(window as any).databuddyOptedOut === true
		);
		expect(isOptedOut).toBe(true);

		// Try to track
		let requestSent = false;
		page.on("request", (req) => {
			if (
				req.url().includes("basket.databuddy.cc") &&
				req.postDataJSON()?.name === "after_opt_out"
			) {
				requestSent = true;
			}
		});

		await page.evaluate(() => {
			(window as any).db.track("after_opt_out");
		});

		await page.waitForTimeout(500);
		expect(requestSent).toBe(false);
	});

	test("skips tracking on matching skipPatterns", async ({ page }) => {
		let requestCount = 0;
		page.on("request", (req) => {
			if (req.url().includes("basket.databuddy.cc")) {
				requestCount += 1;
			}
		});

		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-skip",
				skipPatterns: ["/test", "/admin/*"],
			};
		});

		await page.addScriptTag({ url: "/dist/databuddy.js" });

		// Try to track
		await page.evaluate(() => {
			if ((window as any).db) {
				(window as any).db.track("should_be_skipped");
			}
		});

		await page.waitForTimeout(500);
		expect(requestCount).toBe(0);
	});
});
