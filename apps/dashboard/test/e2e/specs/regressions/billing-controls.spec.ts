import type { UseCustomerResult } from "autumn-js/react";
import { expect, test, testKey } from "@/test/e2e/fixtures";

type Customer = NonNullable<UseCustomerResult["data"]>;

const PATH = "/public/e2e/billing-controls";

test("billing switches collapse and persist for agent credits", {
	tag: "@regression",
}, async ({ page, mockRpc }) => {
	await page.setExtraHTTPHeaders({ "x-e2e-test-key": testKey() });
	const customer: Customer = {
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
	const savedFeatures: string[] = [];
	const firstSave = Promise.withResolvers<void>();
	let requestCount = 0;
	await page.route("**/api/autumn/**", (route) =>
		route.fulfill({ json: customer })
	);
	await mockRpc("billing/setUsageAlert", async (input) => {
		requestCount += 1;
		if (requestCount === 1) {
			await firstSave.promise;
		}
		const { enabled, threshold } = input as {
			enabled: boolean;
			threshold: number;
		};
		customer.billingControls.usageAlerts = [
			{
				featureId: "events",
				thresholdType: "usage_percentage",
				enabled,
				threshold,
			},
		];
		return input;
	});
	await mockRpc("billing/setSpendLimit", (input) => {
		const { enabled, featureId, overageLimit } = input as {
			enabled: boolean;
			featureId: string;
			overageLimit: number;
		};
		savedFeatures.push(featureId);
		customer.billingControls.spendLimits = [
			{ featureId, enabled, overageLimit },
		];
		return input;
	});

	await page.goto(PATH);
	const alertSwitch = page.getByRole("switch", { name: "Enable usage alert" });
	const spendSwitch = page.getByRole("switch", {
		name: "Enable credit usage limit",
	});
	await expect(alertSwitch).not.toBeChecked();
	await expect(
		page.getByRole("switch", { name: "Enable credit auto top-up" })
	).toHaveCount(1);
	const row = page.locator("section").filter({ has: alertSwitch });
	await expect(row.getByRole("spinbutton")).toHaveCount(0);
	await expect(row.getByRole("button")).toHaveCount(0);

	await alertSwitch.click();
	await expect(alertSwitch).toBeChecked();
	const threshold = row.getByRole("spinbutton", { name: "Notify me at" });
	await expect(threshold).toHaveValue("80");
	await threshold.fill("75");
	await row.getByRole("button", { name: "Turn on", exact: true }).click();
	const pendingButton = row.getByRole("button", {
		name: "Saving…",
		exact: true,
	});
	try {
		await expect(pendingButton).toBeDisabled();
		await expect(pendingButton).toHaveAttribute("aria-busy", "true");
		await pendingButton.click({ force: true });
		expect(requestCount).toBe(1);
	} finally {
		firstSave.resolve();
	}
	await expect(row.getByRole("button")).toHaveCount(0);
	await page.reload();
	await expect(alertSwitch).toBeChecked();
	await expect(threshold).toHaveValue("75");

	await alertSwitch.click();
	await expect(row.getByRole("spinbutton")).toHaveCount(0);
	await row.getByRole("button", { name: "Turn off alert" }).click();
	await expect(row.getByRole("button")).toHaveCount(0);
	await page.reload();
	await expect(alertSwitch).not.toBeChecked();
	await alertSwitch.focus();
	await page.keyboard.press("Tab");
	await expect(spendSwitch).toBeFocused();

	const spendRow = page.locator("section").filter({ has: spendSwitch });
	await spendSwitch.click();
	await expect(spendRow).not.toContainText("USD");
	await expect(spendRow).not.toContainText("$");
	await spendRow.getByRole("spinbutton", { name: "Per month" }).fill("20");
	await spendRow.getByRole("button", { name: "Turn on", exact: true }).click();
	await expect(spendRow.getByRole("button")).toHaveCount(0);
	expect(savedFeatures).toEqual(["agent_credits"]);
});

test("billing fixture rejects a missing test key", {
	tag: "@regression",
}, async ({ page }) => {
	const response = await page.goto(PATH);
	expect(response?.status()).toBe(404);
	await expect(page.getByRole("switch")).toHaveCount(0);
});
