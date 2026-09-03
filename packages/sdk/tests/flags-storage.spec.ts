import {
	expect,
	test,
	waitForSDK,
} from "./test-utils";

test.describe("BrowserFlagStorage", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/test");
		await waitForSDK(page);
		await page.evaluate(() => localStorage.clear());
	});

	test.describe("setAll and getAll", () => {
		test("stores and retrieves multiple flags", async ({ page }) => {
			const result = await page.evaluate(() => {
				const storage = new window.__SDK__.BrowserFlagStorage();
				storage.setAll({
					"flag-a": {
						enabled: true,
						value: true,
						payload: null,
						reason: "MATCH",
					},
					"flag-b": {
						enabled: false,
						value: false,
						payload: null,
						reason: "NO_MATCH",
					},
				});
				return storage.getAll();
			});

			expect(result["flag-a"]).toBeDefined();
			expect(result["flag-a"].enabled).toBe(true);
			expect(result["flag-b"]).toBeDefined();
			expect(result["flag-b"].enabled).toBe(false);
		});

		test("returns empty object when nothing stored", async ({ page }) => {
			const result = await page.evaluate(() => {
				const storage = new window.__SDK__.BrowserFlagStorage();
				return storage.getAll();
			});

			expect(Object.keys(result)).toHaveLength(0);
		});

		test("uses single db-flags key in localStorage", async ({ page }) => {
			const result = await page.evaluate(() => {
				const storage = new window.__SDK__.BrowserFlagStorage();
				storage.setAll({
					"test-flag": {
						enabled: true,
						value: "hello",
						payload: null,
						reason: "MATCH",
					},
				});
				return {
					hasKey: localStorage.getItem("db-flags") !== null,
					keyCount: Object.keys(localStorage).filter((k) =>
						k.startsWith("db-flag")
					).length,
				};
			});

			expect(result.hasKey).toBe(true);
			expect(result.keyCount).toBe(1);
		});

		test("overwrites previous flags on setAll", async ({ page }) => {
			const result = await page.evaluate(() => {
				const storage = new window.__SDK__.BrowserFlagStorage();
				storage.setAll({
					"old-flag": {
						enabled: true,
						value: true,
						payload: null,
						reason: "MATCH",
					},
				});

				storage.setAll({
					"new-flag": {
						enabled: false,
						value: false,
						payload: null,
						reason: "NO_MATCH",
					},
				});

				return storage.getAll();
			});

			expect(result["new-flag"]).toBeDefined();
			expect(result["old-flag"]).toBeUndefined();
		});

		test("preserves variant and payload in round-trip", async ({ page }) => {
			const result = await page.evaluate(() => {
				const storage = new window.__SDK__.BrowserFlagStorage();
				storage.setAll({
					"var-flag": {
						enabled: true,
						value: "treatment-a",
						payload: { color: "red", size: 42 },
						reason: "MATCH",
						variant: "treatment-a",
					},
				});
				return storage.getAll();
			});

			expect(result["var-flag"].value).toBe("treatment-a");
			expect(result["var-flag"].variant).toBe("treatment-a");
			expect(result["var-flag"].payload).toEqual({ color: "red", size: 42 });
		});
	});

	test.describe("TTL expiration", () => {
		test("returns empty for expired blob", async ({ page }) => {
			const result = await page.evaluate(() => {
				localStorage.setItem(
					"db-flags",
					JSON.stringify({
						flags: {
							"expired-flag": {
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

		test("removes expired blob from localStorage", async ({ page }) => {
			const exists = await page.evaluate(() => {
				localStorage.setItem(
					"db-flags",
					JSON.stringify({
						flags: {
							old: {
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
				storage.getAll();
				return localStorage.getItem("db-flags");
			});

			expect(exists).toBeNull();
		});

		test("returns flags when blob is not expired", async ({ page }) => {
			const result = await page.evaluate(() => {
				localStorage.setItem(
					"db-flags",
					JSON.stringify({
						flags: {
							fresh: {
								enabled: true,
								value: true,
								payload: null,
								reason: "MATCH",
							},
						},
						savedAt: Date.now(),
					})
				);

				const storage = new window.__SDK__.BrowserFlagStorage();
				return storage.getAll();
			});

			expect(result.fresh).toBeDefined();
			expect(result.fresh.enabled).toBe(true);
		});
	});

	test.describe("clear", () => {
		test("removes the db-flags key", async ({ page }) => {
			const result = await page.evaluate(() => {
				const storage = new window.__SDK__.BrowserFlagStorage();
				storage.setAll({
					"flag-1": {
						enabled: true,
						value: true,
						payload: null,
						reason: "MATCH",
					},
				});

				localStorage.setItem("non-flag-key", "preserved");

				storage.clear();

				return {
					flags: storage.getAll(),
					nonFlagKey: localStorage.getItem("non-flag-key"),
				};
			});

			expect(Object.keys(result.flags)).toHaveLength(0);
			expect(result.nonFlagKey).toBe("preserved");
		});
	});

	test.describe("corrupt data", () => {
		test("returns empty for corrupt JSON blob", async ({ page }) => {
			const result = await page.evaluate(() => {
				localStorage.setItem("db-flags", "not valid json {{{");
				const storage = new window.__SDK__.BrowserFlagStorage();
				return storage.getAll();
			});

			expect(Object.keys(result)).toHaveLength(0);
		});

		test("handles blob with missing flags field", async ({ page }) => {
			const result = await page.evaluate(() => {
				localStorage.setItem(
					"db-flags",
					JSON.stringify({ savedAt: Date.now() })
				);
				const storage = new window.__SDK__.BrowserFlagStorage();
				return storage.getAll();
			});

			expect(Object.keys(result)).toHaveLength(0);
		});
	});
});
