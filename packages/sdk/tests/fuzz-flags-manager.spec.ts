import { expect, test } from "@playwright/test";
import {
	MOCK_FLAG_DISABLED,
	MOCK_FLAG_ENABLED,
	waitForSDK,
} from "./test-utils";

const MANAGER_ITERATIONS = (() => {
	const raw = process.env.SDK_MANAGER_FUZZ_ITERATIONS;
	if (raw !== undefined && raw !== "") {
		const n = Number(raw);
		if (Number.isFinite(n)) {
			return Math.min(500, Math.max(20, Math.floor(n)));
		}
	}
	return 120;
})();

test.describe.configure({ mode: "parallel" });

test.describe("Fuzz — BrowserFlagsManager (many async getFlag tries)", () => {
	test.beforeEach(async ({ page }) => {
		await page.route(
			"**/api.databuddy.cc/public/v1/flags/**",
			async (route) => {
				const url = new URL(route.request().url());
				const keysParam = url.searchParams.get("keys");

				if (url.pathname.includes("/bulk")) {
					const requestedKeys = keysParam?.split(",").filter(Boolean) ?? [];
					const response: Record<string, typeof MOCK_FLAG_ENABLED> = {};
					for (const k of requestedKeys) {
						response[k] = k.includes("off")
							? MOCK_FLAG_DISABLED
							: MOCK_FLAG_ENABLED;
					}
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
		await page.evaluate(() => localStorage.clear());
	});

	test(`sequential getFlag (${MANAGER_ITERATIONS} keys, rotating pool)`, async ({
		page,
	}) => {
		test.slow();

		const n = MANAGER_ITERATIONS;

		const result = await page.evaluate(
			async ({ iterations: total }) => {
				const failures: string[] = [];
				const SDK = window.__SDK__;
				const manager = new SDK.BrowserFlagsManager({
					config: { clientId: "fuzz-client", autoFetch: false },
				});

				const pool: string[] = [];
				for (let p = 0; p < 25; p++) {
					pool.push(`pool-flag-${p}-on`);
					pool.push(`pool-flag-${p}-off`);
				}

				for (let i = 0; i < total; i++) {
					const key = pool[i % pool.length];
					const flag = await manager.getFlag(key);
					const expectOn = !key.includes("off");
					if (flag.enabled !== expectOn) {
						failures.push(`iter ${i} key ${key} enabled=${flag.enabled}`);
					}
				}

				manager.destroy();
				return { failures, iterations: total };
			},
			{ iterations: n }
		);

		expect(result.failures, result.failures.join("\n")).toHaveLength(0);
		expect(result.iterations).toBe(n);
	});

	test("parallel getFlag burst (same tick, batcher path)", async ({ page }) => {
		test.slow();

		const result = await page.evaluate(async () => {
			const failures: string[] = [];
			const SDK = window.__SDK__;
			const manager = new SDK.BrowserFlagsManager({
				config: { clientId: "fuzz-client", autoFetch: false },
			});

			const keys = ["b-a-on", "b-b-on", "b-c-off", "d-a-on", "d-b-off"];
			const results = await Promise.all(keys.map((k) => manager.getFlag(k)));

			for (let i = 0; i < keys.length; i++) {
				const expectOn = !keys[i].includes("off");
				if (results[i].enabled !== expectOn) {
					failures.push(keys[i]);
				}
			}

			manager.destroy();
			return { failures };
		});

		expect(result.failures, result.failures.join("\n")).toHaveLength(0);
	});

	test("repeated getFlag for same key returns cached (deterministic)", async ({
		page,
	}) => {
		const iterations = 80;

		const result = await page.evaluate(
			async ({ iterations: total }) => {
				const failures: string[] = [];
				const SDK = window.__SDK__;
				const manager = new SDK.BrowserFlagsManager({
					config: { clientId: "fuzz-client", autoFetch: false },
				});

				const first = await manager.getFlag("stable-key-on");
				for (let i = 0; i < total; i++) {
					const again = await manager.getFlag("stable-key-on");
					if (again.enabled !== first.enabled) {
						failures.push(`mismatch at ${i}`);
					}
				}

				manager.destroy();
				return { failures };
			},
			{ iterations }
		);

		expect(result.failures, result.failures.join("\n")).toHaveLength(0);
	});
});
