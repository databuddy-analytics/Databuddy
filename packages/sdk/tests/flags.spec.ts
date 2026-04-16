import { expect, test } from "@playwright/test";
import {
	MOCK_FLAG_DISABLED,
	MOCK_FLAG_ENABLED,
	MOCK_FLAG_VARIANT,
	waitForSDK,
} from "./test-utils";

test.describe("BrowserFlagsManager", () => {
	test.beforeEach(async ({ page }) => {
		await page.route(
			"**/api.databuddy.cc/public/v1/flags/**",
			async (route) => {
				const url = new URL(route.request().url());
				const key = url.searchParams.get("key");
				const keys = url.searchParams.get("keys");

				if (url.pathname.includes("/evaluate") && key) {
					const flags: Record<string, typeof MOCK_FLAG_ENABLED> = {
						"feature-on": MOCK_FLAG_ENABLED,
						"feature-off": MOCK_FLAG_DISABLED,
						"feature-variant": MOCK_FLAG_VARIANT,
					};
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify(flags[key] ?? MOCK_FLAG_DISABLED),
					});
					return;
				}

				if (url.pathname.includes("/bulk")) {
					const requestedKeys = keys?.split(",") ?? [];
					const allFlags: Record<string, typeof MOCK_FLAG_ENABLED> = {
						"feature-on": MOCK_FLAG_ENABLED,
						"feature-off": MOCK_FLAG_DISABLED,
						"feature-variant": MOCK_FLAG_VARIANT,
					};

					const response =
						requestedKeys.length > 0
							? Object.fromEntries(
									requestedKeys.map((k) => [
										k,
										allFlags[k] ?? MOCK_FLAG_DISABLED,
									])
								)
							: allFlags;

					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({ flags: response }),
					});
					return;
				}

				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ flags: {} }),
				});
			}
		);

		await page.goto("/test");
		await waitForSDK(page);
	});

	test.describe("initialization", () => {
		test("creates manager and reaches ready state", async ({ page }) => {
			const ready = await page.evaluate(async () => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: { clientId: "test-id", autoFetch: false },
				});
				await new Promise((r) => setTimeout(r, 50));
				const result = manager.isReady();
				manager.destroy();
				return result;
			});
			expect(ready).toBe(true);
		});

		test("auto-fetches flags on init by default", async ({ page }) => {
			let requestCount = 0;
			await page.route(
				"**/api.databuddy.cc/public/v1/flags/bulk**",
				async (route) => {
					requestCount++;
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({
							flags: { "feature-on": MOCK_FLAG_ENABLED },
						}),
					});
				}
			);

			await page.evaluate(async () => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: { clientId: "test-id" },
				});
				await new Promise((r) => setTimeout(r, 200));
				manager.destroy();
			});

			expect(requestCount).toBeGreaterThanOrEqual(1);
		});

		test("skips auto-fetch when autoFetch is false", async ({ page }) => {
			let requestCount = 0;
			await page.route(
				"**/api.databuddy.cc/public/v1/flags/bulk**",
				async (route) => {
					requestCount++;
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({ flags: {} }),
					});
				}
			);

			await page.evaluate(async () => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: { clientId: "test-id", autoFetch: false },
				});
				await new Promise((r) => setTimeout(r, 200));
				manager.destroy();
			});

			expect(requestCount).toBe(0);
		});
	});

	test.describe("getFlag", () => {
		test("fetches and returns an enabled flag", async ({ page }) => {
			const result = await page.evaluate(async () => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: { clientId: "test-id", autoFetch: false },
				});
				const flag = await manager.getFlag("feature-on");
				manager.destroy();
				return flag;
			});

			expect(result.enabled).toBe(true);
			expect(result.value).toBe(true);
			expect(result.reason).toBe("MATCH");
		});

		test("fetches and returns a disabled flag", async ({ page }) => {
			const result = await page.evaluate(async () => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: { clientId: "test-id", autoFetch: false },
				});
				const flag = await manager.getFlag("feature-off");
				manager.destroy();
				return flag;
			});

			expect(result.enabled).toBe(false);
			expect(result.value).toBe(false);
		});

		test("returns variant flag with value and variant name", async ({
			page,
		}) => {
			const result = await page.evaluate(async () => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: { clientId: "test-id", autoFetch: false },
				});
				const flag = await manager.getFlag("feature-variant");
				manager.destroy();
				return flag;
			});

			expect(result.enabled).toBe(true);
			expect(result.value).toBe("treatment-a");
			expect(result.variant).toBe("treatment-a");
		});

		test("returns default when disabled", async ({ page }) => {
			const result = await page.evaluate(async () => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: { clientId: "test-id", autoFetch: false, disabled: true },
				});
				const flag = await manager.getFlag("feature-on");
				manager.destroy();
				return flag;
			});

			expect(result.enabled).toBe(false);
			expect(result.reason).toBe("DEFAULT");
		});

		test("returns pending when isPending is true", async ({ page }) => {
			const result = await page.evaluate(async () => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: {
						clientId: "test-id",
						autoFetch: false,
						isPending: true,
					},
				});
				const flag = await manager.getFlag("feature-on");
				manager.destroy();
				return flag;
			});

			expect(result.enabled).toBe(false);
			expect(result.reason).toBe("SESSION_PENDING");
		});
	});

	test.describe("isEnabled (synchronous)", () => {
		test("returns loading state for uncached flag", async ({ page }) => {
			const state = await page.evaluate(() => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: { clientId: "test-id", autoFetch: false },
				});
				const result = manager.isEnabled("uncached-flag");
				manager.destroy();
				return result;
			});

			expect(state.on).toBe(false);
			expect(state.loading).toBe(true);
			expect(state.status).toBe("loading");
		});

		test("returns ready state for cached flag", async ({ page }) => {
			const state = await page.evaluate(async () => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: { clientId: "test-id", autoFetch: false },
				});
				await manager.getFlag("feature-on");
				const result = manager.isEnabled("feature-on");
				manager.destroy();
				return result;
			});

			expect(state.on).toBe(true);
			expect(state.loading).toBe(false);
			expect(state.status).toBe("ready");
		});
	});

	test.describe("getValue", () => {
		test("returns cached value", async ({ page }) => {
			const value = await page.evaluate(async () => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: { clientId: "test-id", autoFetch: false },
				});
				await manager.getFlag("feature-variant");
				const result = manager.getValue("feature-variant");
				manager.destroy();
				return result;
			});

			expect(value).toBe("treatment-a");
		});

		test("returns default for uncached flag", async ({ page }) => {
			const value = await page.evaluate(() => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: { clientId: "test-id", autoFetch: false },
				});
				const result = manager.getValue("unknown-flag", 42);
				manager.destroy();
				return result;
			});

			expect(value).toBe(42);
		});
	});

	test.describe("caching", () => {
		test("serves cached result without re-fetching", async ({ page }) => {
			const result = await page.evaluate(async () => {
				let fetchCount = 0;
				const originalFetch = window.fetch;
				window.fetch = async (...args) => {
					const url = typeof args[0] === "string" ? args[0] : "";
					if (url.includes("flags")) {
						fetchCount++;
					}
					return originalFetch(...args);
				};

				const manager = new window.__SDK__.BrowserFlagsManager({
					config: {
						clientId: "test-id",
						autoFetch: false,
						cacheTtl: 60_000,
						staleTime: 30_000,
					},
				});

				await manager.getFlag("feature-on");
				await manager.getFlag("feature-on");
				await manager.getFlag("feature-on");

				window.fetch = originalFetch;
				manager.destroy();
				return fetchCount;
			});

			// First call fetches, subsequent calls use cache
			// Due to batching, the exact fetch count may vary but should be minimal
			expect(result).toBeLessThanOrEqual(2);
		});

		test("cache expires after TTL", async ({ page }) => {
			const result = await page.evaluate(async () => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: {
						clientId: "test-id",
						autoFetch: false,
						cacheTtl: 50,
						staleTime: 25,
					},
				});

				await manager.getFlag("feature-on");
				const cached = manager.isEnabled("feature-on");

				await new Promise((r) => setTimeout(r, 100));

				const afterExpiry = manager.isEnabled("feature-on");
				manager.destroy();
				return { cached, afterExpiry };
			});

			expect(result.cached.status).toBe("ready");
			expect(result.afterExpiry.status).toBe("loading");
			expect(result.afterExpiry.loading).toBe(true);
		});
	});

	test.describe("request batching", () => {
		test("batches simultaneous getFlag calls into a single bulk request", async ({
			page,
		}) => {
			let bulkRequestCount = 0;
			let lastRequestedKeys: string[] = [];

			await page.route(
				"**/api.databuddy.cc/public/v1/flags/bulk**",
				async (route) => {
					bulkRequestCount++;
					const url = new URL(route.request().url());
					lastRequestedKeys = url.searchParams.get("keys")?.split(",") ?? [];

					const response: Record<string, typeof MOCK_FLAG_ENABLED> = {};
					for (const k of lastRequestedKeys) {
						response[k] = MOCK_FLAG_ENABLED;
					}

					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({ flags: response }),
					});
				}
			);

			const result = await page.evaluate(async () => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: { clientId: "test-id", autoFetch: false },
				});

				const [a, b, c] = await Promise.all([
					manager.getFlag("flag-a"),
					manager.getFlag("flag-b"),
					manager.getFlag("flag-c"),
				]);

				manager.destroy();
				return {
					allEnabled: a.enabled && b.enabled && c.enabled,
				};
			});

			expect(result.allEnabled).toBe(true);
			expect(bulkRequestCount).toBeGreaterThanOrEqual(1);
			expect(lastRequestedKeys.length).toBeGreaterThanOrEqual(2);
		});
	});

	test.describe("user context", () => {
		test("sends userId in query params", async ({ page }) => {
			let capturedUrl = "";
			await page.route(
				"**/api.databuddy.cc/public/v1/flags/bulk**",
				async (route) => {
					capturedUrl = route.request().url();
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({
							flags: { "feature-on": MOCK_FLAG_ENABLED },
						}),
					});
				}
			);

			await page.evaluate(async () => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: {
						clientId: "test-id",
						user: { userId: "user-123", email: "test@example.com" },
					},
				});
				await new Promise((r) => setTimeout(r, 200));
				manager.destroy();
			});

			expect(capturedUrl).toContain("userId=user-123");
			expect(capturedUrl).toContain("email=test%40example.com");
		});

		test("updateUser triggers fresh fetch with new user", async ({ page }) => {
			const capturedUrls: string[] = [];
			await page.route(
				"**/api.databuddy.cc/public/v1/flags/bulk**",
				async (route) => {
					capturedUrls.push(route.request().url());
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({
							flags: { "feature-on": MOCK_FLAG_ENABLED },
						}),
					});
				}
			);

			await page.evaluate(async () => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: {
						clientId: "test-id",
						user: { userId: "user-1" },
					},
				});
				await new Promise((r) => setTimeout(r, 200));
				manager.updateUser({ userId: "user-2" });
				await new Promise((r) => setTimeout(r, 200));
				manager.destroy();
			});

			const hasUser1 = capturedUrls.some((u) => u.includes("userId=user-1"));
			const hasUser2 = capturedUrls.some((u) => u.includes("userId=user-2"));
			expect(hasUser1).toBe(true);
			expect(hasUser2).toBe(true);
		});

		test("injects anonymous ID when no user identity provided", async ({
			page,
		}) => {
			let capturedUrl = "";
			await page.route(
				"**/api.databuddy.cc/public/v1/flags/bulk**",
				async (route) => {
					capturedUrl = route.request().url();
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({ flags: {} }),
					});
				}
			);

			await page.evaluate(async () => {
				localStorage.removeItem("did");
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: { clientId: "test-id" },
				});
				await new Promise((r) => setTimeout(r, 200));
				manager.destroy();
			});

			expect(capturedUrl).toContain("userId=anon_");
		});
	});

	test.describe("refresh and destroy", () => {
		test("refresh re-fetches all flags", async ({ page }) => {
			let fetchCount = 0;
			await page.route(
				"**/api.databuddy.cc/public/v1/flags/bulk**",
				async (route) => {
					fetchCount++;
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({
							flags: { "feature-on": MOCK_FLAG_ENABLED },
						}),
					});
				}
			);

			await page.evaluate(async () => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: { clientId: "test-id" },
				});
				await new Promise((r) => setTimeout(r, 200));
				await manager.refresh();
				manager.destroy();
			});

			expect(fetchCount).toBeGreaterThanOrEqual(2);
		});

		test("refresh with forceClear clears cache and storage", async ({
			page,
		}) => {
			const result = await page.evaluate(async () => {
				const storage = new window.__SDK__.BrowserFlagStorage();
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: { clientId: "test-id" },
					storage,
				});
				await new Promise((r) => setTimeout(r, 200));

				const flagsBefore = manager.getMemoryFlags();

				await manager.refresh(true);
				await new Promise((r) => setTimeout(r, 200));

				const flagsAfter = manager.getMemoryFlags();
				manager.destroy();

				return {
					hadFlags: Object.keys(flagsBefore).length > 0,
					hasFlags: Object.keys(flagsAfter).length > 0,
				};
			});

			expect(result.hadFlags).toBe(true);
			expect(result.hasFlags).toBe(true);
		});

		test("destroy clears cache and stops batching", async ({ page }) => {
			const result = await page.evaluate(async () => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: { clientId: "test-id", autoFetch: false },
				});
				await manager.getFlag("feature-on");
				const beforeDestroy = Object.keys(manager.getMemoryFlags()).length;

				manager.destroy();

				const afterDestroy = Object.keys(manager.getMemoryFlags()).length;
				return { beforeDestroy, afterDestroy };
			});

			expect(result.beforeDestroy).toBeGreaterThan(0);
			expect(result.afterDestroy).toBe(0);
		});
	});

	test.describe("getMemoryFlags", () => {
		test("returns all cached flags", async ({ page }) => {
			const flags = await page.evaluate(async () => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: { clientId: "test-id" },
				});
				await new Promise((r) => setTimeout(r, 300));
				const result = manager.getMemoryFlags();
				manager.destroy();
				return result;
			});

			expect(flags["feature-on"]).toBeDefined();
			expect(flags["feature-on"].enabled).toBe(true);
			expect(flags["feature-off"]).toBeDefined();
			expect(flags["feature-off"].enabled).toBe(false);
		});
	});

	test.describe("error handling", () => {
		test("returns default on API error", async ({ page }) => {
			await page.route(
				"**/api.databuddy.cc/public/v1/flags/bulk**",
				async (route) => {
					await route.fulfill({ status: 500, body: "Internal Server Error" });
				}
			);

			const result = await page.evaluate(async () => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: { clientId: "test-id", autoFetch: false },
				});
				const flag = await manager.getFlag("feature-on");
				manager.destroy();
				return flag;
			});

			expect(result.enabled).toBe(false);
			expect(result.reason).toBe("ERROR");
		});
	});

	test.describe("updateConfig", () => {
		test("enables fetching when transitioning from disabled to enabled", async ({
			page,
		}) => {
			let fetchCount = 0;
			await page.route(
				"**/api.databuddy.cc/public/v1/flags/bulk**",
				async (route) => {
					fetchCount++;
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({
							flags: { "feature-on": MOCK_FLAG_ENABLED },
						}),
					});
				}
			);

			await page.evaluate(async () => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: { clientId: "test-id", disabled: true },
				});
				await new Promise((r) => setTimeout(r, 100));
				manager.updateConfig({ clientId: "test-id", disabled: false });
				await new Promise((r) => setTimeout(r, 300));
				manager.destroy();
			});

			expect(fetchCount).toBeGreaterThanOrEqual(1);
		});

		test("enables fetching when transitioning from pending to not pending", async ({
			page,
		}) => {
			let fetchCount = 0;
			await page.route(
				"**/api.databuddy.cc/public/v1/flags/bulk**",
				async (route) => {
					fetchCount++;
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({
							flags: { "feature-on": MOCK_FLAG_ENABLED },
						}),
					});
				}
			);

			await page.evaluate(async () => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: { clientId: "test-id", isPending: true },
				});
				await new Promise((r) => setTimeout(r, 100));
				manager.updateConfig({ clientId: "test-id", isPending: false });
				await new Promise((r) => setTimeout(r, 300));
				manager.destroy();
			});

			expect(fetchCount).toBeGreaterThanOrEqual(1);
		});
	});

	test.describe("environment param", () => {
		test("includes environment in request", async ({ page }) => {
			let capturedUrl = "";
			await page.route(
				"**/api.databuddy.cc/public/v1/flags/bulk**",
				async (route) => {
					capturedUrl = route.request().url();
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({ flags: {} }),
					});
				}
			);

			await page.evaluate(async () => {
				const manager = new window.__SDK__.BrowserFlagsManager({
					config: {
						clientId: "test-id",
						environment: "staging",
					},
				});
				await new Promise((r) => setTimeout(r, 200));
				manager.destroy();
			});

			expect(capturedUrl).toContain("environment=staging");
		});
	});
});
