import { expect, test } from "@playwright/test";
import { getStressIterations } from "./fuzz-helpers";
import { waitForSDK } from "./test-utils";

test.describe.configure({ mode: "parallel" });

test.describe("Fuzz — BrowserFlagStorage stress + edge cases", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/test");
		await waitForSDK(page);
		await page.evaluate(() => localStorage.clear());
	});

	test("many random setAll/getAll cycles stay consistent", async ({ page }) => {
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

	test("clear removes all flags, getAll returns empty", async ({ page }) => {
		const result = await page.evaluate(() => {
			const failures: string[] = [];
			const storage = new window.__SDK__.BrowserFlagStorage();
			const v = {
				enabled: true,
				value: true,
				payload: null,
				reason: "MATCH",
			};

			const batch: Record<string, typeof v> = {};
			for (let i = 0; i < 80; i++) {
				batch[`c-${i}`] = v;
			}
			storage.setAll(batch);

			const before = Object.keys(storage.getAll()).length;
			if (before !== 80) {
				failures.push(`expected 80 keys, got ${before}`);
			}

			storage.clear();

			const after = Object.keys(storage.getAll()).length;
			if (after !== 0) {
				failures.push(`expected 0 keys after clear, got ${after}`);
			}

			return { failures };
		});

		expect(result.failures, result.failures.join("\n")).toHaveLength(0);
	});

	test("string value round-trip in storage", async ({ page }) => {
		const result = await page.evaluate(() => {
			const failures: string[] = [];
			const storage = new window.__SDK__.BrowserFlagStorage();
			storage.setAll({
				"str-val": {
					enabled: true,
					value: "variant-b",
					payload: null,
					reason: "MATCH",
				},
			});
			const all = storage.getAll();
			if (all["str-val"]?.value !== "variant-b") {
				failures.push("value mismatch");
			}
			return { failures };
		});

		expect(result.failures).toHaveLength(0);
	});
});
