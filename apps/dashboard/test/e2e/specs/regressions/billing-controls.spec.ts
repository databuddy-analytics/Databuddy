import type { UseCustomerResult } from "autumn-js/react";
import { expect, test } from "@/test/e2e/fixtures";

type Customer = NonNullable<UseCustomerResult["data"]>;

function syntheticCustomer(): Customer {
	return {
		id: "billing-controls.invalid",
		name: "Synthetic billing account",
		email: null,
		createdAt: 0,
		fingerprint: null,
		stripeId: null,
		env: "sandbox",
		metadata: {},
		sendEmailReceipts: false,
		billingControls: { autoTopups: [], usageAlerts: [], spendLimits: [] },
		subscriptions: [],
		purchases: [],
		balances: {},
		flags: {},
	};
}

test(
	"billing switches collapse and persist for agent credits",
	{ tag: "@regression" },
	async ({ page }, testInfo) => {
		const key = process.env.DATABUDDY_E2E_TEST_KEY;
		if (!key) throw new Error("DATABUDDY_E2E_TEST_KEY is required");
		await page.setExtraHTTPHeaders({ "x-e2e-test-key": key });
		const customer = syntheticCustomer();
		const savedFeatures: string[] = [];
		let releaseFirstSave: () => void = () => {};
		const firstSave = new Promise<void>((resolve) => {
			releaseFirstSave = resolve;
		});
		let requestCount = 0;
		await page.route("**/api/autumn/**", (route) =>
			route.fulfill({ json: customer })
		);
		await page.route("**/rpc/billing/**", async (route) => {
			if (route.request().method() === "OPTIONS") {
				await route.fulfill({
					status: 204,
					headers: {
						"access-control-allow-origin": new URL(page.url()).origin,
						"access-control-allow-credentials": "true",
						"access-control-allow-headers": "content-type,x-e2e-test-key",
						"access-control-allow-methods": "POST",
					},
				});
				return;
			}
			requestCount++;
			if (requestCount === 1) await firstSave;
			const input = route.request().postDataJSON().json;
			if (route.request().url().endsWith("setUsageAlert")) {
				customer.billingControls.usageAlerts = [
					{
						featureId: "events",
						thresholdType: "usage_percentage",
						enabled: input.enabled,
						threshold: input.threshold,
					},
				];
			} else if (route.request().url().endsWith("setSpendLimit")) {
				savedFeatures.push(input.featureId);
				customer.billingControls.spendLimits = [
					{
						featureId: input.featureId,
						enabled: input.enabled,
						overageLimit: input.overageLimit,
					},
				];
			} else throw new Error("Unexpected billing mutation");
			await route.fulfill({
				json: { json: input },
				headers: {
					"access-control-allow-origin": new URL(page.url()).origin,
					"access-control-allow-credentials": "true",
				},
			});
		});
		await page.goto("/public/e2e/billing-controls");
		const alertSwitch = page.getByRole("switch", {
			name: "Enable usage alert",
		});
		await expect(alertSwitch).not.toBeChecked();
		await expect(
			page.getByRole("switch", { name: "Enable credit auto top-up" })
		).toHaveCount(1);
		await expect(
			page.getByText("Credit usage limit", { exact: true })
		).toHaveCount(1);
		const row = page.locator("section").filter({ has: alertSwitch });
		const closedHeight = await row.evaluate(
			(el) => el.getBoundingClientRect().height
		);
		const headerHeight = await row
			.locator("header")
			.evaluate((el) => el.getBoundingClientRect().height);
		expect(closedHeight - headerHeight).toBeLessThanOrEqual(34);
		await expect(row.getByRole("spinbutton")).toHaveCount(0);
		await expect(row.getByRole("button")).toHaveCount(0);
		await page.screenshot({
			path: testInfo.outputPath("billing-controls-off.png"),
			fullPage: true,
		});

		await alertSwitch.click();
		await expect(alertSwitch).toBeChecked();
		await expect(
			row.getByRole("spinbutton", { name: "Notify me at" })
		).toHaveValue("80");
		expect(
			await row.evaluate((el) => el.getBoundingClientRect().height)
		).toBeGreaterThan(closedHeight + 40);
		await row.getByRole("spinbutton", { name: "Notify me at" }).fill("75");
		const saveButton = row.getByRole("button", {
			name: "Turn on",
			exact: true,
		});
		const beforeWidth = await saveButton.evaluate(
			(button) => button.getBoundingClientRect().width
		);
		await saveButton.click();
		const pendingButton = row.getByRole("button", {
			name: "Saving…",
			exact: true,
		});
		try {
			await expect(pendingButton).toBeDisabled();
			await expect(pendingButton).toHaveAttribute("aria-busy", "true");
			const pendingWidth = await pendingButton.evaluate(
				(button) =>
					new Promise<number>((resolve) =>
						requestAnimationFrame(() =>
							requestAnimationFrame(() =>
								resolve(button.getBoundingClientRect().width)
							)
						)
					)
			);
			expect(Math.abs(pendingWidth - beforeWidth)).toBeLessThan(0.1);
			await pendingButton.click({ force: true });
			expect(requestCount).toBe(1);
			await testInfo.attach("pending-computed.json", {
				body: JSON.stringify(
					{
						beforeWidth,
						pendingWidth,
						delta: pendingWidth - beforeWidth,
						disabled: true,
						ariaBusy: true,
						requestCount,
					},
					null,
					2
				),
				contentType: "application/json",
			});
		} finally {
			releaseFirstSave();
		}
		await expect(row.getByRole("button")).toHaveCount(0);
		await page.reload();
		await expect(alertSwitch).toBeChecked();
		await expect(
			row.getByRole("spinbutton", { name: "Notify me at" })
		).toHaveValue("75");
		await page.screenshot({
			path: testInfo.outputPath("billing-controls-on.png"),
			fullPage: true,
		});

		await alertSwitch.click();
		await expect(row.getByRole("spinbutton")).toHaveCount(0);
		await row.getByRole("button", { name: "Turn off alert" }).click();
		await expect(row.getByRole("button")).toHaveCount(0);
		await page.reload();
		await expect(alertSwitch).not.toBeChecked();
		await expect(row.getByRole("spinbutton")).toHaveCount(0);
		expect(
			await row.evaluate((el) => el.getBoundingClientRect().height)
		).toBe(closedHeight);
		await alertSwitch.focus();
		await page.keyboard.press("Tab");
		await expect(
			page.getByRole("switch", {
				name: "Enable credit usage limit",
			})
		).toBeFocused();

		const spendSwitch = page.getByRole("switch", {
			name: "Enable credit usage limit",
		});
		const spendRow = page.locator("section").filter({ has: spendSwitch });
		await spendSwitch.click();
		await expect(spendRow).not.toContainText("USD");
		await expect(spendRow).not.toContainText("$");
		await spendRow.getByRole("spinbutton", { name: "Per month" }).fill("20");
		await spendRow
			.getByRole("button", { name: "Turn on", exact: true })
			.click();
		await expect(spendRow.getByRole("button")).toHaveCount(0);
		expect(savedFeatures).toEqual([
			"agent_credits",
		]);
	}
);

test("billing fixture rejects a missing test key", {
	tag: "@regression",
}, async ({ page }) => {
	const response = await page.goto("/public/e2e/billing-controls");
	expect(response?.status()).toBe(404);
	await expect(page.getByRole("switch")).toHaveCount(0);
});
