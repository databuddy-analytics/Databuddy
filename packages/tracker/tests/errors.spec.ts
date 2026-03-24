import { expect, test } from "@playwright/test";

function findError(
	req: Request,
	predicate: (event: Record<string, unknown>) => boolean
): Record<string, unknown> | undefined {
	try {
		const data = req.postDataJSON();
		if (Array.isArray(data)) {
			return data.find(predicate);
		}
		return predicate(data) ? data : undefined;
	} catch {
		return undefined;
	}
}

test.describe("Error Tracking", () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(navigator, "sendBeacon", { value: undefined });
		});

		await page.route("**/basket.databuddy.cc/errors**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ success: true }),
				headers: { "Access-Control-Allow-Origin": "*" },
			});
		});
	});

	test("captures unhandled errors", async ({ page }) => {
		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-client-id",
				trackErrors: true,
				ignoreBotDetection: true,
				batchTimeout: 200,
			};
		});
		await page.addScriptTag({ url: "/dist/errors-debug.js" });

		const requestPromise = page.waitForRequest(
			(req) =>
				req.url().includes("/basket.databuddy.cc/errors") &&
				req.method() === "POST"
		);

		await page.evaluate(() => {
			setTimeout(() => {
				throw new Error("Test Error Capture");
			}, 10);
		});

		const request = await requestPromise;
		const error = findError(
			request,
			(e) =>
				typeof e.message === "string" &&
				e.message.includes("Test Error Capture")
		);
		expect(error).toBeTruthy();
		expect(error?.message).toContain("Test Error Capture");
		expect(error?.errorType).toBe("Error");
	});

	test("captures unhandled promise rejections (Error object)", async ({
		page,
	}) => {
		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-client-id",
				trackErrors: true,
				ignoreBotDetection: true,
				batchTimeout: 200,
			};
		});
		await page.addScriptTag({ url: "/dist/errors-debug.js" });

		const requestPromise = page.waitForRequest(
			(req) =>
				req.url().includes("/basket.databuddy.cc/errors") &&
				req.method() === "POST"
		);

		await page.evaluate(() => {
			Promise.reject(new Error("Async Failure"));
		});

		const request = await requestPromise;
		const error = findError(
			request,
			(e) =>
				typeof e.message === "string" && e.message.includes("Async Failure")
		);
		expect(error).toBeTruthy();
		expect(error?.message).toContain("Async Failure");
		expect(error?.errorType).toBe("Error");
	});

	test("captures unhandled promise rejections (String)", async ({ page }) => {
		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-client-id",
				trackErrors: true,
				ignoreBotDetection: true,
				batchTimeout: 200,
			};
		});
		await page.addScriptTag({ url: "/dist/errors-debug.js" });

		const requestPromise = page.waitForRequest(
			(req) =>
				req.url().includes("/basket.databuddy.cc/errors") &&
				req.method() === "POST"
		);

		await page.evaluate(() => {
			Promise.reject("String Rejection");
		});

		const request = await requestPromise;
		const error = findError(
			request,
			(e) =>
				typeof e.message === "string" &&
				e.message.includes("String Rejection")
		);
		expect(error).toBeTruthy();
		expect(error?.message).toContain("String Rejection");
		expect(error?.errorType).toBe("UnhandledRejection");
	});

	test("captures unhandled promise rejections (Object)", async ({ page }) => {
		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-client-id",
				trackErrors: true,
				ignoreBotDetection: true,
				batchTimeout: 200,
			};
		});
		await page.addScriptTag({ url: "/dist/errors-debug.js" });

		const requestPromise = page.waitForRequest(
			(req) =>
				req.url().includes("/basket.databuddy.cc/errors") &&
				req.method() === "POST"
		);

		await page.evaluate(() => {
			Promise.reject({ reason: "Object Rejection", code: 500 });
		});

		const request = await requestPromise;
		const error = findError(
			request,
			(e) =>
				typeof e.message === "string" &&
				e.message.includes("Object Rejection")
		);
		expect(error).toBeTruthy();
		expect(error?.message).toContain(
			'{"reason":"Object Rejection","code":500}'
		);
		expect(error?.errorType).toBe("UnhandledRejection");
	});
});
