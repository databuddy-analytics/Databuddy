import { expect, hasEvent, test } from "./test-utils";

const IDENTITY_STORAGE_KEYS = ["did", "did_params", "did_profile"];
const SESSION_STORAGE_KEYS = [
	"did_profile_sent",
	"did_session",
	"did_session_start",
	"did_session_timestamp",
];

async function readStoredTrackingIdentity(page: import("@playwright/test").Page) {
	return page.evaluate(
		({ identityKeys, sessionKeys }) => ({
			local: identityKeys.map((key) => localStorage.getItem(key)),
			session: sessionKeys.map((key) => sessionStorage.getItem(key)),
		}),
		{ identityKeys: IDENTITY_STORAGE_KEYS, sessionKeys: SESSION_STORAGE_KEYS }
	);
}

async function seedStoredTrackingIdentity(page: import("@playwright/test").Page) {
	await page.evaluate(
		({ identityKeys, sessionKeys }) => {
			for (const key of identityKeys) {
				localStorage.setItem(key, `stored-${key}`);
			}
			for (const key of sessionKeys) {
				sessionStorage.setItem(key, `stored-${key}`);
			}
		},
		{ identityKeys: IDENTITY_STORAGE_KEYS, sessionKeys: SESSION_STORAGE_KEYS }
	);
}

test.describe("Privacy & Opt-out", () => {
	test("does not track when Global Privacy Control is enabled", async ({
		page,
	}) => {
		let requestCount = 0;
		page.on("request", (request) => {
			if (request.url().includes("basket.databuddy.cc")) {
				requestCount += 1;
			}
		});

		await page.goto("/test?gclid=private-click-id");
		await seedStoredTrackingIdentity(page);
		await page.evaluate(() => {
			Object.defineProperty(navigator, "globalPrivacyControl", {
				configurable: true,
				value: true,
			});
			(window as any).databuddyConfig = {
				clientId: "test-gpc",
				ignoreBotDetection: true,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });
		await page.waitForTimeout(500);

		expect(requestCount).toBe(0);
		expect(await readStoredTrackingIdentity(page)).toEqual({
			local: [null, null, null],
			session: [null, null, null, null],
		});
	});

	test("does not track when Do Not Track is enabled", async ({ page }) => {
		let requestCount = 0;
		page.on("request", (request) => {
			if (request.url().includes("basket.databuddy.cc")) {
				requestCount += 1;
			}
		});

		await page.goto("/test?gclid=private-click-id");
		await seedStoredTrackingIdentity(page);
		await page.evaluate(() => {
			Object.defineProperty(navigator, "doNotTrack", {
				configurable: true,
				value: "1",
			});
			(window as any).databuddyConfig = {
				clientId: "test-dnt",
				ignoreBotDetection: true,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });
		await page.waitForTimeout(500);

		expect(requestCount).toBe(0);
		expect(await readStoredTrackingIdentity(page)).toEqual({
			local: [null, null, null],
			session: [null, null, null, null],
		});
	});

	test("does not track when opted out via function", async ({ page }) => {
		let requestCount = 0;
		page.on("request", (req) => {
			if (req.url().includes("basket.databuddy.cc")) {
				requestCount += 1;
			}
		});

		await page.goto("/test?gclid=private-click-id");
		await seedStoredTrackingIdentity(page);
		await page.evaluate(() => {
			// Pre-set opt-out in localStorage
			localStorage.setItem("databuddy_opt_out", "true");
			(window as any).databuddyConfig = {
				clientId: "test-privacy",
				ignoreBotDetection: true,
				batchTimeout: 200,
			};
		});

		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

		// Try to track
		await page.evaluate(() => {
			if ((window as any).db) {
				(window as any).db.track("should_fail");
			}
		});

		await page.waitForTimeout(1000);
		expect(requestCount).toBe(0);
		expect(await readStoredTrackingIdentity(page)).toEqual({
			local: [null, null, null],
			session: [null, null, null, null],
		});
	});

	test("dynamically opts out and stops tracking", async ({ page }) => {
		let queuedBeforeOptOutSent = false;
		page.on("request", (req) => {
			if (
				req.url().includes("basket.databuddy.cc") &&
				hasEvent(req, (event) => event.name === "queued_before_opt_out")
			) {
				queuedBeforeOptOutSent = true;
			}
		});
		await page.goto("/test");
		await page.evaluate(() => {
			(window as any).databuddyConfig = {
				clientId: "test-privacy",
				ignoreBotDetection: true,
				batchTimeout: 200,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

		// Ensure we are loaded
		await expect
			.poll(async () => await page.evaluate(() => !!(window as any).db))
			.toBe(true);

		await page.evaluate(() => {
			(window as any).db.track("queued_before_opt_out");
		});

		// Call opt out
		await page.evaluate(() => {
			(window as any).databuddyOptOut();
			window.dispatchEvent(new PageTransitionEvent("pagehide"));
		});

		// Verify flags
		const isOptedOut = await page.evaluate(
			() =>
				localStorage.getItem("databuddy_opt_out") === "true" &&
				(window as any).databuddyOptedOut === true
		);
		expect(isOptedOut).toBe(true);
		expect(await readStoredTrackingIdentity(page)).toEqual({
			local: [null, null, null],
			session: [null, null, null, null],
		});

		// Try to track
		let requestSent = false;
		page.on("request", (req) => {
			if (
				req.url().includes("basket.databuddy.cc") &&
				hasEvent(req, (e) => e.name === "after_opt_out")
			) {
				requestSent = true;
			}
		});

		await page.evaluate(() => {
			(window as any).db.track("after_opt_out");
		});

		await page.waitForTimeout(500);
		expect(requestSent).toBe(false);
		expect(queuedBeforeOptOutSent).toBe(false);
	});
});
