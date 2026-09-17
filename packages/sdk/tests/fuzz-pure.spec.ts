import { getFuzzIterations } from "./fuzz-helpers";
import { expect, test, waitForSDK } from "./test-utils";

test.describe.configure({ mode: "parallel" });

test.describe("Fuzz — pure flag helpers (seeded, many iterations)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/test");
		await waitForSDK(page);
	});

	test("getCacheKey is stable and deterministic across random inputs", async ({
		page,
	}) => {
		const iterations = getFuzzIterations();
		const seed = 42;

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
				const SDK = window.__SDK__;

				function randomString(): string {
					const len = 1 + Math.floor(rand() * 64);
					let out = "";
					for (let i = 0; i < len; i++) {
						const code = 32 + Math.floor(rand() * 95);
						out += String.fromCharCode(code);
					}
					return out;
				}

				for (let i = 0; i < n; i++) {
					const key = `k-${i}-${randomString()}`;
					const userId = rand() > 0.5 ? `u-${randomString()}` : "";
					const email = rand() > 0.5 ? `${randomString()}@x.test` : undefined;

					const user =
						userId || email
							? { userId: userId || undefined, email }
							: undefined;

					const a = SDK.getCacheKey(key, user);
					const b = SDK.getCacheKey(key, user);
					if (a !== b) {
						failures.push(`iteration ${i}: cache key not stable`);
					}

					const noUser = SDK.getCacheKey(key, undefined);
					if (userId || email) {
						if (a === noUser) {
							failures.push(`iteration ${i}: expected user suffix`);
						}
					} else if (a !== key) {
						failures.push(`iteration ${i}: expected bare key`);
					}
				}

				return { failures, iterations: n };
			},
			{ iterations, seed }
		);

		expect(result.failures, result.failures.join("\n")).toHaveLength(0);
		expect(result.iterations).toBe(iterations);
	});

	test("createCacheEntry + isCacheValid + isCacheStale (logical consistency)", async ({
		page,
	}) => {
		const iterations = getFuzzIterations();

		const result = await page.evaluate(
			({ iterations: n }) => {
				const failures: string[] = [];
				const SDK = window.__SDK__;
				const base = {
					enabled: true,
					value: true,
					payload: null,
					reason: "MATCH",
				};

				for (let i = 0; i < n; i++) {
					const ttl = 10_000 + (i % 50_000);
					const staleTime = Math.floor(ttl / 3);
					const entry = SDK.createCacheEntry(base, ttl, staleTime);

					if (!SDK.isCacheValid(entry)) {
						failures.push(`iteration ${i}: fresh entry should be valid`);
					}
					if (SDK.isCacheStale(entry)) {
						failures.push(`iteration ${i}: fresh entry should not be stale`);
					}
					if (entry.staleAt >= entry.expiresAt) {
						failures.push(`iteration ${i}: staleAt should be before expiresAt`);
					}
				}

				if (SDK.isCacheValid(undefined)) {
					failures.push("undefined should be invalid");
				}

				return { failures };
			},
			{ iterations }
		);

		expect(result.failures, result.failures.join("\n")).toHaveLength(0);
	});
});
