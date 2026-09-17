import { getStressIterations } from "./fuzz-helpers";
import { expect, test, waitForSDK } from "./test-utils";

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

	test.describe("stress", () => {
		test("many random setAll/getAll cycles stay consistent", async ({
			page,
		}) => {
			const iterations = getStressIterations();
			const seed = 99;

			const result = await page.evaluate(
				({ iterations: n, seed: s }) => {
					const failures: string[] = [];

					function mulberry32(a: number) {
						return () => {
							let t = (a += 0x6d_2b_79_f5);
							t = Math.imul(t ^ (t >>> 15), t | 1);
							t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
							return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
						};
					}

					const rand = mulberry32(s);
					const storage = new window.__SDK__.BrowserFlagStorage();
					const base = {
						enabled: true,
						value: true,
						payload: null,
						reason: "MATCH",
					};

					for (let i = 0; i < n; i++) {
						const batchSize = 1 + Math.floor(rand() * 10);
						const batch: Record<string, typeof base> = {};
						const keys: string[] = [];
						for (let j = 0; j < batchSize; j++) {
							const key = `f-${Math.floor(rand() * 1_000_000)}-${i % 50}`;
							batch[key] = base;
							keys.push(key);
						}
						storage.setAll(batch);
						const all = storage.getAll();
						for (const key of keys) {
							if (!all[key] || all[key].enabled !== true) {
								failures.push(`getAll mismatch at iter ${i}, key ${key}`);
							}
						}
					}

					return { failures, iterations: n };
				},
				{ iterations, seed }
			);

			expect(result.failures, result.failures.join("\n")).toHaveLength(0);
			expect(result.iterations).toBeGreaterThan(0);
		});

		test("setAll replaces prior keys (repeated random)", async ({ page }) => {
			const rounds = Math.min(30, Math.floor(getStressIterations() / 10));
			const seed = 3;

			const result = await page.evaluate(
				({ rounds: r, seed: s }) => {
					const failures: string[] = [];

					function mulberry32(a: number) {
						return () => {
							let t = (a += 0x6d_2b_79_f5);
							t = Math.imul(t ^ (t >>> 15), t | 1);
							t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
							return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
						};
					}

					const rand = mulberry32(s);
					const storage = new window.__SDK__.BrowserFlagStorage();
					const flag = {
						enabled: false,
						value: false,
						payload: null,
						reason: "NO_MATCH",
					};

					for (let round = 0; round < r; round++) {
						const batch: Record<string, typeof flag> = {};
						const batchSize = 5 + Math.floor(rand() * 20);
						for (let j = 0; j < batchSize; j++) {
							const k = `r${round}-k${j}-${Math.floor(rand() * 10_000)}`;
							batch[k] = flag;
						}
						storage.setAll(batch);
						const all = storage.getAll();
						const count = Object.keys(all).length;
						if (count !== batchSize) {
							failures.push(
								`round ${round}: expected ${batchSize} keys, got ${count}`
							);
						}
					}

					return { failures };
				},
				{ rounds, seed }
			);

			expect(result.failures, result.failures.join("\n")).toHaveLength(0);
		});
	});
});
