import type { Page } from "@playwright/test";
import { scrollDepthPercentFromScrollY } from "../src/plugins/scroll-depth-math";
import {
	expect,
	findEvent,
	readMaxScrollDepth,
	requestHasNamedEvent,
	test,
	waitForDebugScrollHook,
} from "./test-utils";

test.describe("scroll depth", () => {

	async function boot(
		page: Page,
		opts: { batchTimeout?: number; batchSize?: number; clientId?: string } = {}
	) {
		await page.goto("/test");
		await page.evaluate(
			([o]) => {
				document.documentElement.style.margin = "0";
				document.documentElement.style.padding = "0";
				document.body.style.margin = "0";
				(
					window as unknown as { databuddyConfig: Record<string, unknown> }
				).databuddyConfig = {
					clientId: o.clientId ?? "test-scroll-depth",
					ignoreBotDetection: true,
					batchTimeout: o.batchTimeout ?? 30_000,
					batchSize: o.batchSize ?? 100,
				};
			},
			[opts]
		);
		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });
		await waitForDebugScrollHook(page);
	}

	test("percent math, overscroll cap, monotonic max, SPA reset", async ({
		page,
	}) => {
		await boot(page);
		await page.evaluate(() => {
			document.body.style.minHeight = "5000px";
			document.body.style.height = "5000px";
		});
		await page.waitForTimeout(40);
		expect(await readMaxScrollDepth(page)).toBe(0);

		const range = await page.evaluate(
			() => document.documentElement.scrollHeight - window.innerHeight
		);
		expect(range).toBeGreaterThan(0);

		for (const frac of [0.25, 0.5, 0.75, 1] as const) {
			const y = Math.round(range * frac);
			await page.evaluate((sy) => window.scrollTo(0, sy), y);
			await expect
				.poll(async () => readMaxScrollDepth(page))
				.toBe(scrollDepthPercentFromScrollY(y, range));
		}

		await page.evaluate(() => window.scrollTo(0, 9_999_999));
		await expect.poll(async () => readMaxScrollDepth(page)).toBe(100);

		const yHigh = Math.round(range * 0.8);
		const yLow = Math.round(range * 0.1);
		await page.evaluate((y) => window.scrollTo(0, y), yHigh);
		await expect
			.poll(async () => readMaxScrollDepth(page))
			.toBeGreaterThanOrEqual(scrollDepthPercentFromScrollY(yHigh, range));
		const peak = await readMaxScrollDepth(page);
		await page.evaluate((y) => window.scrollTo(0, y), yLow);
		await page.waitForTimeout(80);
		expect(await readMaxScrollDepth(page)).toBe(peak);

		await page.evaluate(() => {
			history.pushState({}, "", "/scroll-depth-next");
			(window as unknown as { db: { screenView: () => void } }).db.screenView();
		});
		await expect.poll(async () => readMaxScrollDepth(page)).toBe(0);
	});

	test("no overflow: 100% after scroll event; tall page stays 0 until scroll", async ({
		page,
	}) => {
		await boot(page);
		await page.evaluate(() => {
			document.body.innerHTML = "<p>short</p>";
		});
		await page.evaluate(() => window.dispatchEvent(new Event("scroll")));
		await expect.poll(async () => readMaxScrollDepth(page)).toBe(100);

		await page.goto("/test");
		await page.evaluate(() => {
			document.body.style.minHeight = "4000px";
			(
				window as unknown as { databuddyConfig: Record<string, unknown> }
			).databuddyConfig = {
				clientId: "test-scroll-idle",
				ignoreBotDetection: true,
				batchTimeout: 30_000,
				batchSize: 100,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });
		await waitForDebugScrollHook(page);
		await page.waitForTimeout(40);
		expect(await readMaxScrollDepth(page)).toBe(0);
	});

	test("page_exit scroll_depth matches tracker max", async ({ page }) => {
		await boot(page, {
			clientId: "test-scroll-exit",
			batchTimeout: 200,
			batchSize: 5,
		});
		await page.evaluate(() => {
			document.body.style.minHeight = "3200px";
		});
		const range = await page.evaluate(
			() => document.documentElement.scrollHeight - window.innerHeight
		);
		const targetY = Math.round(range * 0.4);
		await page.evaluate((y) => window.scrollTo(0, y), targetY);
		await expect
			.poll(async () => readMaxScrollDepth(page))
			.toBe(scrollDepthPercentFromScrollY(targetY, range));
		const expectedDepth = await readMaxScrollDepth(page);

		const pageExitReq = page.waitForRequest((req) =>
			requestHasNamedEvent(req, "page_exit")
		);
		await page.evaluate(() => {
			history.pushState({}, "", "/after-scroll");
			(window as unknown as { db: { screenView: () => void } }).db.screenView();
		});
		const req = await pageExitReq;
		const exit = findEvent(req, (e) => e.name === "page_exit");
		expect(exit?.scroll_depth).toBe(expectedDepth);
	});
});
