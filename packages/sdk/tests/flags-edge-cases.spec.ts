import {
	MOCK_FLAG_DISABLED,
	MOCK_FLAG_ENABLED,
	expect,
	getFlagRequestKeys,
	test,
	waitForSDK,
} from "./test-utils";

function bulkOnlyRoute(
	page: import("@playwright/test").Page,
	handler: (requestedKeys: string[]) => Record<string, typeof MOCK_FLAG_ENABLED>
) {
	return page.route("**/api.databuddy.cc/public/v1/flags/**", async (route) => {
		const url = new URL(route.request().url());
		if (url.pathname.includes("/bulk")) {
			const requestedKeys = getFlagRequestKeys(route.request());
			const flags = handler(requestedKeys);
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ flags }),
			});
			return;
		}

		await route.fulfill({
			status: 404,
			body: "not found",
		});
	});
}

test.describe("BrowserFlagsManager — edge cases", () => {
	test("skipStorage: does not hydrate cache from BrowserFlagStorage", async ({
		page,
	}) => {
		await bulkOnlyRoute(page, () => ({
			"remote-only": MOCK_FLAG_ENABLED,
		}));

		await page.goto("/test");
		await waitForSDK(page);

		const result = await page.evaluate(async () => {
			const SDK = window.__SDK__;
			const storage = new SDK.BrowserFlagStorage();
			storage.setAll({
				preseed: {
					enabled: true,
					value: true,
					payload: null,
					reason: "MATCH",
				},
			});

			const manager = new SDK.BrowserFlagsManager({
				config: { clientId: "skip-test", autoFetch: false, skipStorage: true },
				storage,
			});

			await new Promise((r) => setTimeout(r, 50));
			const beforeFetch = Object.keys(manager.getMemoryFlags()).length;

			await manager.fetchAllFlags();
			const after = manager.getMemoryFlags();

			manager.destroy();
			return { beforeFetch, hasRemoteOnly: "remote-only" in after };
		});

		expect(result.beforeFetch).toBe(0);
		expect(result.hasRemoteOnly).toBe(true);
	});

	test("getFlag(key, user): per-call users get isolated cache entries outside the active context", async ({
		page,
	}) => {
		await bulkOnlyRoute(page, (keys) =>
			Object.fromEntries(keys.map((k) => [k, MOCK_FLAG_ENABLED]))
		);

		await page.goto("/test");
		await waitForSDK(page);

		const result = await page.evaluate(async () => {
			const SDK = window.__SDK__;
			const kA = SDK.getCacheKey("shared-flag", { userId: "user-a" });
			const kB = SDK.getCacheKey("shared-flag", { userId: "user-b" });
			const manager = new SDK.BrowserFlagsManager({
				config: {
					clientId: "u-test",
					autoFetch: false,
					user: { userId: "api-user" },
				},
			});

			const forUserA = await manager.getFlag("shared-flag", {
				userId: "user-a",
			});
			const forUserB = await manager.getFlag("shared-flag", {
				userId: "user-b",
			});
			const activeContextFlags = manager.getMemoryFlags();

			manager.destroy();
			return {
				cacheKeysDiffer: kA !== kB,
				enabledForUserA: forUserA.enabled,
				enabledForUserB: forUserB.enabled,
				activeContextKeys: Object.keys(activeContextFlags),
			};
		});

		expect(result.cacheKeysDiffer).toBe(true);
		expect(result.enabledForUserA).toBe(true);
		expect(result.enabledForUserB).toBe(true);
		expect(result.activeContextKeys).not.toContain("shared-flag");
	});

	test("in-flight dedup: parallel getFlag same key issues one bulk request", async ({
		page,
	}) => {
		let bulkCount = 0;
		await page.route(
			"**/api.databuddy.cc/public/v1/flags/**",
			async (route) => {
				const url = new URL(route.request().url());
				if (url.pathname.includes("/bulk")) {
					bulkCount++;
					const keys = getFlagRequestKeys(route.request());
					const flags = Object.fromEntries(
						keys.map((k) => [k, MOCK_FLAG_ENABLED])
					);
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({ flags }),
					});
					return;
				}
				await route.fulfill({ status: 200, body: "{}" });
			}
		);

		await page.goto("/test");
		await waitForSDK(page);

		await page.evaluate(async () => {
			const SDK = window.__SDK__;
			const manager = new SDK.BrowserFlagsManager({
				config: { clientId: "dedup-test", autoFetch: false },
			});

			await Promise.all([
				manager.getFlag("same-key"),
				manager.getFlag("same-key"),
				manager.getFlag("same-key"),
			]);

			manager.destroy();
		});

		expect(bulkCount).toBe(1);
	});

	test("getMemoryFlags: preserves flag keys that contain colons", async ({
		page,
	}) => {
		await bulkOnlyRoute(page, (keys) => {
			const out: Record<string, typeof MOCK_FLAG_ENABLED> = {};
			for (const k of keys) {
				if (k === "x:y") {
					out[k] = MOCK_FLAG_ENABLED;
				} else if (k === "x:z") {
					out[k] = MOCK_FLAG_DISABLED;
				} else {
					out[k] = MOCK_FLAG_ENABLED;
				}
			}
			return out;
		});

		await page.goto("/test");
		await waitForSDK(page);

		const result = await page.evaluate(async () => {
			const SDK = window.__SDK__;
			const manager = new SDK.BrowserFlagsManager({
				config: { clientId: "colon-test", autoFetch: false },
			});

			await manager.getFlag("x:y");
			await manager.getFlag("x:z");
			const mem = manager.getMemoryFlags();

			manager.destroy();
			return { keys: Object.keys(mem), y: mem["x:y"], z: mem["x:z"] };
		});

		expect(result.keys).toContain("x:y");
		expect(result.keys).toContain("x:z");
		expect(result.y?.enabled).toBe(true);
		expect(result.z?.enabled).toBe(false);
	});

	test("fetchAllFlags with empty flags removes prior cache entries", async ({
		page,
	}) => {
		let call = 0;
		await page.route(
			"**/api.databuddy.cc/public/v1/flags/**",
			async (route) => {
				const url = new URL(route.request().url());
				if (!url.pathname.includes("/bulk")) {
					await route.fulfill({ status: 200, body: "{}" });
					return;
				}
				call++;
				const body =
					call === 1
						? JSON.stringify({
								flags: { keepMe: MOCK_FLAG_ENABLED },
							})
						: JSON.stringify({ flags: {} });

				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body,
				});
			}
		);

		await page.goto("/test");
		await waitForSDK(page);

		const result = await page.evaluate(async () => {
			const SDK = window.__SDK__;
			const manager = new SDK.BrowserFlagsManager({
				config: { clientId: "empty-bulk", autoFetch: false },
			});

			await manager.fetchAllFlags();
			const afterFirst = Object.keys(manager.getMemoryFlags());

			await manager.fetchAllFlags();
			const afterSecond = Object.keys(manager.getMemoryFlags());

			manager.destroy();
			return { afterFirst, afterSecond };
		});

		expect(result.afterFirst).toContain("keepMe");
		expect(result.afterSecond).not.toContain("keepMe");
	});

	test("isEnabled surfaces error status when result.reason is ERROR", async ({
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
							flags: {
								errFlag: {
									enabled: false,
									value: false,
									payload: null,
									reason: "ERROR",
								},
							},
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
			const SDK = window.__SDK__;
			const manager = new SDK.BrowserFlagsManager({
				config: { clientId: "err-status", autoFetch: false },
			});

			await manager.getFlag("errFlag");
			const state = manager.isEnabled("errFlag");

			manager.destroy();
			return { status: state.status };
		});

		expect(result.status).toBe("error");
	});

	test("visibility: skips fetchAllFlags when hidden and cache non-empty", async ({
		page,
	}) => {
		let bulkCount = 0;
		await page.route(
			"**/api.databuddy.cc/public/v1/flags/**",
			async (route) => {
				const url = new URL(route.request().url());
				if (url.pathname.includes("/bulk")) {
					bulkCount++;
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({
							flags: { warm: MOCK_FLAG_ENABLED },
						}),
					});
					return;
				}
				await route.fulfill({ status: 200, body: "{}" });
			}
		);

		await page.goto("/test");
		await waitForSDK(page);

		await page.evaluate(async () => {
			const SDK = window.__SDK__;
			const manager = new SDK.BrowserFlagsManager({
				config: { clientId: "vis-test", autoFetch: false },
			});
			await manager.fetchAllFlags();
			(window as unknown as { __tm: typeof manager }).__tm = manager;
		});

		expect(bulkCount).toBe(1);

		await page.evaluate(() => {
			Object.defineProperty(document, "visibilityState", {
				configurable: true,
				get: () => "hidden",
			});
			document.dispatchEvent(new Event("visibilitychange"));
		});

		await page.evaluate(async () => {
			const w = window as unknown as {
				__tm: { fetchAllFlags: () => Promise<void> };
			};
			await w.__tm.fetchAllFlags();
		});

		expect(bulkCount).toBe(1);

		await page.evaluate(() => {
			Object.defineProperty(document, "visibilityState", {
				configurable: true,
				get: () => "visible",
			});
			document.dispatchEvent(new Event("visibilitychange"));
		});

		await page.evaluate(async () => {
			const w = window as unknown as {
				__tm: { fetchAllFlags: () => Promise<void> };
			};
			await w.__tm.fetchAllFlags();
		});

		expect(bulkCount).toBe(2);

		await page.evaluate(() => {
			const w = window as unknown as { __tm: { destroy: () => void } };
			w.__tm.destroy();
			delete (window as unknown as { __tm?: unknown }).__tm;
		});
	});

	test("getFlag rejects when bulk fetch network fails", async ({ page }) => {
		await page.route(
			"**/api.databuddy.cc/public/v1/flags/**",
			async (route) => {
				await route.abort("failed");
			}
		);

		await page.goto("/test");
		await waitForSDK(page);

		const result = await page.evaluate(async () => {
			const SDK = window.__SDK__;
			const manager = new SDK.BrowserFlagsManager({
				config: { clientId: "net-fail", autoFetch: false },
			});

			let rejected = false;
			try {
				await manager.getFlag("any");
			} catch {
				rejected = true;
			}

			manager.destroy();
			return { rejected };
		});

		expect(result.rejected).toBe(true);
	});

	test("a rate-limited endpoint does not trigger one request per getFlag", async ({
		page,
	}) => {
		let requests = 0;
		await page.route("**/api.databuddy.cc/public/v1/flags/**", (route) => {
			requests++;
			return route.fulfill({
				status: 429,
				contentType: "application/json",
				body: JSON.stringify({ flags: {}, count: 0, reason: "RATE_LIMITED" }),
			});
		});

		await page.goto("/test");
		await waitForSDK(page);

		const rejections = await page.evaluate(async () => {
			const SDK = window.__SDK__;
			const manager = new SDK.BrowserFlagsManager({
				config: { clientId: "rate-limited", autoFetch: false },
			});
			let count = 0;
			for (let i = 0; i < 40; i++) {
				try {
					await manager.getFlag("some-flag");
				} catch {
					count++;
				}
			}
			manager.destroy();
			return count;
		});

		expect(rejections).toBe(40);
		expect(requests).toBeLessThanOrEqual(2);
	});

	test("retries again once the failure backoff expires", async ({ page }) => {
		let requests = 0;
		await page.route("**/api.databuddy.cc/public/v1/flags/**", (route) => {
			requests++;
			return route.fulfill({ status: 500, body: "Internal Server Error" });
		});

		await page.goto("/test");
		await waitForSDK(page);

		const observed = await page.evaluate(async () => {
			const SDK = window.__SDK__;
			const manager = new SDK.BrowserFlagsManager({
				config: { clientId: "backoff-recovery", autoFetch: false },
			});
			const attempt = async () => {
				try {
					await manager.getFlag("some-flag");
				} catch {
					/* expected */
				}
			};
			await attempt();
			await attempt();
			await new Promise((resolve) => setTimeout(resolve, 5100));
			await attempt();
			manager.destroy();
			return true;
		});

		expect(observed).toBe(true);
		expect(requests).toBe(2);
	});
});
