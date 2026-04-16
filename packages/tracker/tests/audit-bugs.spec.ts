import { expect, hasEvent, test } from "./test-utils";

/**
 * Regression tests for bugs found during the tracker audit.
 * Each test asserts the correct behavior after fixes were applied.
 */

test.describe("Audit: Outgoing links respect shouldSkipTracking", () => {

	test("should NOT track outgoing links when tracker is disabled", async ({
		page,
	}) => {
		let outgoingTracked = false;

		await page.goto("/test");
		await page.evaluate(() => {
			const link = document.createElement("a");
			link.href = "https://external-site.com/page";
			link.innerText = "External";
			link.id = "ext-link";
			document.body.appendChild(link);

			(window as any).databuddyConfig = {
				clientId: "test-disabled-outgoing",
				ignoreBotDetection: true,
				disabled: true,
				trackOutgoingLinks: true,
				batchTimeout: 200,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

		await expect
			.poll(async () => await page.evaluate(() => !!(window as any).db))
			.toBeTruthy();

		page.on("request", (req) => {
			if (hasEvent(req, (e) => e.type === "outgoing_link")) {
				outgoingTracked = true;
			}
		});

		await page.evaluate(() => {
			const link = document.getElementById("ext-link");
			link?.addEventListener("click", (e) => e.preventDefault());
		});
		await page.click("#ext-link");

		await page.waitForTimeout(500);
		expect(outgoingTracked).toBe(false);
	});
});

test.describe("Audit: Opt-in resumes tracking without reload", () => {
	test("should resume tracking after optIn without requiring page reload", async ({
		page,
	}) => {
		let trackRequestSent = false;

		await page.goto("/test");

		await page.evaluate(() => {
			localStorage.setItem("databuddy_opt_out", "true");
			(window as any).databuddyConfig = {
				clientId: "test-optin-noreload",
				ignoreBotDetection: true,
				batchTimeout: 200,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

		await expect
			.poll(async () => await page.evaluate(() => !!(window as any).db))
			.toBeTruthy();

		// Opt back in WITHOUT reloading
		await page.evaluate(() => {
			(window as any).databuddyOptIn();
		});

		page.on("request", (req) => {
			if (
				req.url().includes("basket.databuddy.cc") &&
				hasEvent(req, (e) => e.name === "post_optin_event")
			) {
				trackRequestSent = true;
			}
		});

		await page.evaluate(() => {
			(window as any).db.track("post_optin_event");
		});

		await page.waitForTimeout(500);
		expect(trackRequestSent).toBe(true);
	});
});

test.describe("Audit: Plugin event listeners cleaned up on destroy", () => {
	test("interaction listeners should stop after destroy", async ({ page }) => {
		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-destroy-interactions",
				ignoreBotDetection: true,
				batchTimeout: 200,
				trackInteractions: true,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

		await expect
			.poll(async () => await page.evaluate(() => !!(window as any).__tracker))
			.toBeTruthy();

		await page.mouse.move(100, 100);
		await page.mouse.click(100, 100);
		await page.waitForTimeout(100);

		await page.evaluate(() => {
			(window as any).__tracker.destroy();
		});

		const countAfterDestroy = await page.evaluate(
			() => (window as any).__tracker.interactionCount
		);

		await page.mouse.move(200, 200);
		await page.mouse.move(300, 300);
		await page.mouse.click(200, 200);
		await page.keyboard.press("a");
		await page.waitForTimeout(100);

		const countAfterInteractions = await page.evaluate(
			() => (window as any).__tracker.interactionCount
		);

		expect(countAfterInteractions).toBe(countAfterDestroy);
	});

	test("scroll depth listener should stop after destroy", async ({ page }) => {
		await page.goto("/test");
		await page.evaluate(() => {
			document.body.style.minHeight = "5000px";
			(window as any).databuddyConfig = {
				clientId: "test-destroy-scroll",
				ignoreBotDetection: true,
				batchTimeout: 200,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

		await expect
			.poll(async () => await page.evaluate(() => !!(window as any).__tracker))
			.toBeTruthy();

		await page.evaluate(() => {
			(window as any).__tracker.destroy();
		});

		const depthAfterDestroy = await page.evaluate(
			() => (window as any).__tracker.maxScrollDepth
		);

		await page.evaluate(() => window.scrollTo(0, 2000));
		await page.waitForTimeout(100);

		const depthAfterScroll = await page.evaluate(
			() => (window as any).__tracker.maxScrollDepth
		);

		expect(depthAfterScroll).toBe(depthAfterDestroy);
	});

	test("error listeners should stop after destroy", async ({ page }) => {
		let errorTracked = false;

		await page.route("**/basket.databuddy.cc/errors**", async (route) => {
			errorTracked = true;
			await route.fulfill({
				status: 200,
				body: JSON.stringify({ success: true }),
			});
		});

		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-destroy-errors",
				ignoreBotDetection: true,
				batchTimeout: 200,
				trackErrors: true,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

		await expect
			.poll(async () => await page.evaluate(() => !!(window as any).__tracker))
			.toBeTruthy();

		await page.evaluate(() => {
			(window as any).__tracker.destroy();
		});

		errorTracked = false;

		await page.evaluate(() => {
			setTimeout(() => {
				throw new Error("Error after destroy");
			}, 10);
		});

		await page.waitForTimeout(500);
		expect(errorTracked).toBe(false);
	});
});

test.describe("Audit: destroy() flushes pending data", () => {
	test("should flush pending events before destroying", async ({
		page,
		browserName,
	}) => {
		test.skip(
			browserName === "webkit",
			"WebKit/Playwright batch interception issues"
		);

		const sentEvents: string[] = [];

		// Observe requests without intercepting — the basket fixture handles
		// fulfilment, and its strict allowlist still catches dead routes.
		page.on("request", (req) => {
			if (!req.url().includes("basket.databuddy.cc")) {
				return;
			}
			try {
				const data = JSON.parse(req.postData() ?? "[]");
				const events = Array.isArray(data) ? data : [data];
				for (const e of events) {
					if (e.name) {
						sentEvents.push(e.name as string);
					}
				}
			} catch {}
		});

		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-destroy-flush",
				ignoreBotDetection: true,
				enableBatching: true,
				batchSize: 100,
				batchTimeout: 60_000,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

		await expect
			.poll(async () => await page.evaluate(() => !!(window as any).__tracker))
			.toBeTruthy();

		await page.evaluate(() => {
			(window as any).db.track("queued_event_1");
			(window as any).db.track("queued_event_2");
		});
		await page.waitForTimeout(100);

		await page.evaluate(() => {
			(window as any).__tracker.destroy();
		});

		await page.waitForTimeout(500);

		expect(sentEvents).toContain("queued_event_1");
		expect(sentEvents).toContain("queued_event_2");
	});
});
