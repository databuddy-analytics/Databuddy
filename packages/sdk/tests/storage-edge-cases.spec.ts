import { expect, test } from "@playwright/test";
import { MOCK_FLAG_ENABLED, waitForSDK } from "./test-utils";

test.describe("BrowserFlagStorage — edge cases", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/test");
		await waitForSDK(page);
		await page.evaluate(() => localStorage.clear());
	});

	test("corrupt JSON in db-flags blob returns empty", async ({ page }) => {
		const result = await page.evaluate(() => {
			localStorage.setItem("db-flags", "{ not json");
			const storage = new window.__SDK__.BrowserFlagStorage();
			return storage.getAll();
		});

		expect(Object.keys(result)).toHaveLength(0);
	});

	test("setAll quota failure is swallowed (no throw)", async ({ page }) => {
		const result = await page.evaluate(() => {
			const storage = new window.__SDK__.BrowserFlagStorage();
			const original = Storage.prototype.setItem;
			let threw = false;
			Storage.prototype.setItem = () => {
				throw new DOMException("QuotaExceededError", "QuotaExceededError");
			};
			try {
				storage.setAll({
					q: {
						enabled: true,
						value: true,
						payload: null,
						reason: "MATCH",
					},
				});
			} catch {
				threw = true;
			}
			Storage.prototype.setItem = original;
			return { threw };
		});

		expect(result.threw).toBe(false);
	});

	test("numeric value 0 round-trip via setAll/getAll", async ({ page }) => {
		const result = await page.evaluate(() => {
			const storage = new window.__SDK__.BrowserFlagStorage();
			storage.setAll({
				zero: {
					enabled: true,
					value: 0,
					payload: null,
					reason: "MATCH",
				},
			});
			const all = storage.getAll();
			return { value: all.zero?.value };
		});

		expect(result.value).toBe(0);
	});

	test("expired blob returns empty on getAll", async ({ page }) => {
		const result = await page.evaluate(() => {
			localStorage.setItem(
				"db-flags",
				JSON.stringify({
					flags: {
						exp: {
							enabled: true,
							value: true,
							payload: null,
							reason: "MATCH",
						},
					},
					savedAt: Date.now() - 100_000_000,
				})
			);
			const storage = new window.__SDK__.BrowserFlagStorage();
			return storage.getAll();
		});

		expect(Object.keys(result)).toHaveLength(0);
	});
});

test.describe("Anonymous id when localStorage is unusable", () => {
	test("BrowserFlagsManager works when did cannot be persisted", async ({
		page,
	}) => {
		await page.route(
			"**/api.databuddy.cc/public/v1/flags/**",
			async (route) => {
				const url = new URL(route.request().url());
				if (url.pathname.includes("/bulk")) {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({
							flags: { x: MOCK_FLAG_ENABLED },
						}),
					});
					return;
				}
				await route.fulfill({ status: 200, body: "{}" });
			}
		);

		await page.goto("/test");
		await waitForSDK(page);

		const result = await page.evaluate(async () => {
			const originalGet = Storage.prototype.getItem;
			const originalSet = Storage.prototype.setItem;
			Storage.prototype.getItem = () => null;
			Storage.prototype.setItem = () => {
				throw new DOMException("QuotaExceededError", "QuotaExceededError");
			};

			const SDK = window.__SDK__;
			const manager = new SDK.BrowserFlagsManager({
				config: { clientId: "anon-fail", autoFetch: false },
			});

			const flag = await manager.getFlag("x");
			manager.destroy();

			Storage.prototype.getItem = originalGet;
			Storage.prototype.setItem = originalSet;

			return { enabled: flag.enabled };
		});

		expect(result.enabled).toBe(true);
	});
});
