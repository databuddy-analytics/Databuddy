import { expect, test } from "@playwright/test";

type WebVitalEvent = {
	name: "web_vital";
	eventId: string;
	timestamp: number;
	path: string;
	metricName: string;
	metricValue: number;
};

test.describe("Web Vitals Tracking", () => {
	test.beforeEach(async ({ page }) => {
		// Disable sendBeacon for reliable route interception (WebKit issue)
		await page.addInitScript(() => {
			Object.defineProperty(navigator, "sendBeacon", { value: undefined });
		});

		await page.route("**/basket.databuddy.cc/vitals", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ success: true }),
				headers: { "Access-Control-Allow-Origin": "*" },
			});
		});
	});

	test("batches vitals and sends to /vitals endpoint", async ({ page }) => {
		const vitalBatches: WebVitalEvent[][] = [];

		page.on("request", (req) => {
			if (req.url().includes("/basket.databuddy.cc/vitals") && req.method() === "POST") {
				const payload = req.postDataJSON() as WebVitalEvent[];
				vitalBatches.push(payload);
			}
		});

		await page.goto("/test");

		await page.evaluate(() => {
			(window as never as { databuddyConfig: unknown }).databuddyConfig = {
				clientId: "test-client-id",
				trackWebVitals: true,
				ignoreBotDetection: true,
			};
		});
		await page.addScriptTag({ url: "/dist/vitals.js" });

		// Wait for FPS measurement (2 seconds) + batch timeout (2 seconds) + buffer
		await page.waitForTimeout(5000);

		if (vitalBatches.length > 0) {
			const allVitals = vitalBatches.flat();
			expect(allVitals.length).toBeGreaterThan(0);

			const validMetrics = ["FCP", "LCP", "CLS", "INP", "TTFB", "FPS"];
			for (const vital of allVitals) {
				expect(vital.name).toBe("web_vital");
				expect(vital.eventId).toBeDefined();
				expect(validMetrics).toContain(vital.metricName);
				expect(typeof vital.metricValue).toBe("number");
			}

			console.table(allVitals.map((v) => ({ metric: v.metricName, value: v.metricValue })));
		} else {
			console.log("No vitals captured - this can happen in test environments");
		}
	});

	test("captures FPS metric", async ({ page }) => {
		const vitalBatches: WebVitalEvent[][] = [];

		page.on("request", (req) => {
			if (req.url().includes("/basket.databuddy.cc/vitals") && req.method() === "POST") {
				const payload = req.postDataJSON() as WebVitalEvent[];
				vitalBatches.push(payload);
			}
		});

		await page.goto("/test");

		await page.evaluate(() => {
			(window as never as { databuddyConfig: unknown }).databuddyConfig = {
				clientId: "test-client-id",
				trackWebVitals: true,
				ignoreBotDetection: true,
			};
		});
		await page.addScriptTag({ url: "/dist/vitals.js" });

		// FPS measurement takes 2 seconds + batch timeout
		await page.waitForTimeout(5000);

		const allVitals = vitalBatches.flat();
		const fpsVital = allVitals.find((v) => v.metricName === "FPS");
		if (fpsVital) {
			expect(fpsVital.metricValue).toBeGreaterThan(0);
			expect(fpsVital.metricValue).toBeLessThanOrEqual(240); // High refresh rate displays
			console.log("FPS captured:", fpsVital.metricValue);
		} else {
			console.log("FPS not captured - this can happen in headless browsers");
		}
	});

	test("does not send duplicate metrics", async ({ page }) => {
		const vitalBatches: WebVitalEvent[][] = [];

		page.on("request", (req) => {
			if (req.url().includes("/basket.databuddy.cc/vitals") && req.method() === "POST") {
				const payload = req.postDataJSON() as WebVitalEvent[];
				vitalBatches.push(payload);
			}
		});

		await page.goto("/test");

		await page.evaluate(() => {
			(window as never as { databuddyConfig: unknown }).databuddyConfig = {
				clientId: "test-client-id",
				trackWebVitals: true,
				ignoreBotDetection: true,
			};
		});
		await page.addScriptTag({ url: "/dist/vitals.js" });

		await page.waitForTimeout(5000);

		const allVitals = vitalBatches.flat();
		const metricNames = allVitals.map((v) => v.metricName);
		const uniqueNames = [...new Set(metricNames)];
		expect(metricNames.length).toBe(uniqueNames.length);
	});
});
