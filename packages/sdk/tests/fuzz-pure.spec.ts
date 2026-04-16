import { expect, test } from "@playwright/test";
import { getFuzzIterations } from "./fuzz-helpers";
import { waitForSDK } from "./test-utils";

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

	test("getCacheKey edge cases (unicode, empty, colon in key)", async ({
		page,
	}) => {
		const result = await page.evaluate(() => {
			const failures: string[] = [];
			const SDK = window.__SDK__;

			const cases: {
				key: string;
				user?: { userId?: string; email?: string };
			}[] = [
				{ key: "" },
				{ key: "a:b:c" },
				{ key: "フラグ" },
				{ key: "x", user: { userId: "u" } },
				{ key: "x", user: { email: "a@b.co" } },
				{ key: "x", user: { userId: "", email: "only@email.com" } },
				{ key: "p", user: { userId: "id", email: "e@e" } },
			];

			for (const c of cases) {
				const k = SDK.getCacheKey(c.key, c.user);
				if ((c.user?.userId || c.user?.email) && !k.includes(":")) {
					failures.push(`expected colon in key for ${JSON.stringify(c)}`);
				}
			}

			return { failures };
		});

		expect(result.failures, result.failures.join("\n")).toHaveLength(0);
	});

	test("buildQueryParams round-trips expected keys", async ({ page }) => {
		const iterations = getFuzzIterations();
		const seed = 7;

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

				for (let i = 0; i < n; i++) {
					const clientId = `c-${i}-${Math.floor(rand() * 1_000_000)}`;
					const env =
						rand() > 0.7 ? ["prod", "staging", ""][Math.floor(rand() * 3)] : "";

					const params = SDK.buildQueryParams({
						clientId,
						environment: env || undefined,
						user: {
							userId: rand() > 0.5 ? `u-${i}` : undefined,
							email: rand() > 0.5 ? `e${i}@t.co` : undefined,
							organizationId: rand() > 0.8 ? `org-${i}` : undefined,
							teamId: rand() > 0.9 ? `team-${i}` : undefined,
							properties:
								rand() > 0.85
									? { n: i, flag: true, nested: { a: 1 } }
									: undefined,
						},
					});

					const str = params.toString();
					if (!str.includes("clientId=")) {
						failures.push(`iteration ${i}: missing clientId`);
					}
					if (env && !str.includes("environment=")) {
						failures.push(`iteration ${i}: missing environment`);
					}
				}

				return { failures };
			},
			{ iterations, seed }
		);

		expect(result.failures, result.failures.join("\n")).toHaveLength(0);
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

	test("DEFAULT_RESULT shape is stable", async ({ page }) => {
		const result = await page.evaluate(() => {
			const failures: string[] = [];
			const d = window.__SDK__.DEFAULT_RESULT;
			for (let i = 0; i < 300; i++) {
				if (d.enabled !== false) {
					failures.push("enabled");
				}
				if (d.reason !== "DEFAULT") {
					failures.push("reason");
				}
			}
			return { failures };
		});

		expect(result.failures).toHaveLength(0);
	});
});
