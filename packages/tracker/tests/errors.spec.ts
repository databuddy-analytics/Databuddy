import { expect, test } from "@playwright/test";

test.describe("Error Tracking", () => {
	test.beforeEach(async ({ page }) => {
		// Disable sendBeacon for reliable route interception (WebKit issue)
		await page.addInitScript(() => {
			Object.defineProperty(navigator, "sendBeacon", { value: undefined });
		});

		await page.route("**/basket.databuddy.cc/errors", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ success: true }),
				headers: { "Access-Control-Allow-Origin": "*" },
			});
		});
	});

	test("captures unhandled errors", async ({ page }) => {
		const requestPromise = page.waitForRequest(
			(req) =>
				req.url().includes("/basket.databuddy.cc/errors") &&
				req.method() === "POST"
		);

		await page.goto("/test");

		// Load dedicated errors script
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-client-id",
				trackErrors: true,
				ignoreBotDetection: true,
			};
		});
		await page.addScriptTag({ url: "/dist/errors.js" });

		// Trigger error
		await page.evaluate(() => {
			setTimeout(() => {
				throw new Error("Test Error Capture");
			}, 10);
		});

		const request = await requestPromise;
		const payload = request.postDataJSON();

		console.log("Error payload:", payload);
		expect(payload.message).toContain("Test Error Capture");
		expect(payload.errorType).toBe("Error");
	});

	test("captures unhandled promise rejections (Error object)", async ({
		page,
	}) => {
		const requestPromise = page.waitForRequest(
			(req) =>
				req.url().includes("/basket.databuddy.cc/errors") &&
				req.method() === "POST"
		);

		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-client-id",
				trackErrors: true,
				ignoreBotDetection: true,
			};
		});
		await page.addScriptTag({ url: "/dist/errors.js" });

		await page.evaluate(() => {
			Promise.reject(new Error("Async Failure"));
		});

		const request = await requestPromise;
		const payload = request.postDataJSON();

		expect(payload.message).toContain("Async Failure");
		expect(payload.errorType).toBe("Error");
	});

	test("captures unhandled promise rejections (String)", async ({ page }) => {
		const requestPromise = page.waitForRequest(
			(req) =>
				req.url().includes("/basket.databuddy.cc/errors") &&
				req.method() === "POST"
		);

		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-client-id",
				trackErrors: true,
				ignoreBotDetection: true,
			};
		});
		await page.addScriptTag({ url: "/dist/errors.js" });

		await page.evaluate(() => {
			Promise.reject("String Rejection");
		});

		const request = await requestPromise;
		const payload = request.postDataJSON();

		expect(payload.message).toContain("String Rejection");
		expect(payload.errorType).toBe("UnhandledRejection");
	});

	test("captures unhandled promise rejections (Object)", async ({ page }) => {
		const requestPromise = page.waitForRequest(
			(req) =>
				req.url().includes("/basket.databuddy.cc/errors") &&
				req.method() === "POST"
		);

		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-client-id",
				trackErrors: true,
				ignoreBotDetection: true,
			};
		});
		await page.addScriptTag({ url: "/dist/errors.js" });

		await page.evaluate(() => {
			Promise.reject({ reason: "Object Rejection", code: 500 });
		});

		const request = await requestPromise;
		const payload = request.postDataJSON();

		// Should be JSON stringified
		expect(payload.message).toContain(
			'{"reason":"Object Rejection","code":500}'
		);
		expect(payload.errorType).toBe("UnhandledRejection");
	});
});
