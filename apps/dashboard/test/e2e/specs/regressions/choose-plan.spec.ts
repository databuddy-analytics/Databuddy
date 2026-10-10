import type { useListPlans } from "autumn-js/react";
import { expect, test, testKey } from "@/test/e2e/fixtures";

type Plan = NonNullable<ReturnType<typeof useListPlans>["data"]>[number];

const PATH = "/public/e2e/choose-plan";
const SUCCESS_PATH = "/onboarding?want=analytics&website=e2e-site&step=plan";

function plan(
	id: string,
	name: string,
	amount: number,
	items: Plan["items"]
): Plan {
	return {
		id,
		name,
		description: null,
		group: null,
		version: 1,
		addOn: false,
		autoEnable: false,
		price: { amount, interval: "month", intervalCount: 1 },
		items,
		createdAt: 0,
		env: "sandbox",
		archived: false,
		baseVariantId: null,
		config: { ignorePastDue: false },
	};
}

const PLANS: Plan[] = [
	plan("intelligence", "Business", 299, [
		{
			featureId: "events",
			included: 1_000_000,
			unlimited: false,
			reset: { interval: "month", intervalCount: 1 },
			price: null,
		},
		{
			featureId: "investigation_runs",
			included: 100,
			unlimited: false,
			reset: { interval: "month", intervalCount: 1 },
			price: null,
		},
	]),
	plan("hobby", "Hobby", 9.99, [
		{
			featureId: "events",
			included: 25_000,
			unlimited: false,
			reset: { interval: "month", intervalCount: 1 },
			price: null,
		},
	]),
];

test("plan step lists allowances and returns checkout to onboarding", {
	tag: "@regression",
}, async ({ page }) => {
	await page.setExtraHTTPHeaders({ "x-e2e-test-key": testKey() });
	let plansAvailable = false;
	let successUrl: string | null = null;
	await page.route("**/api/autumn/**", async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path.endsWith("/listPlans")) {
			await route.fulfill(
				plansAvailable
					? { json: { list: PLANS } }
					: { status: 503, json: { message: "Billing is unavailable" } }
			);
		} else if (path.endsWith("/previewAttach")) {
			await route.fulfill({
				json: {
					currency: "USD",
					lineItems: [],
					subtotal: 9.99,
					total: 9.99,
					nextCycle: null,
				},
			});
		} else if (path.endsWith("/attach")) {
			successUrl = (route.request().postDataJSON() as { successUrl: string })
				.successUrl;
			await route.fulfill({ json: { paymentUrl: successUrl } });
		} else {
			await route.fulfill({ json: null });
		}
	});

	await page.goto(PATH);
	await expect(
		page.getByRole("heading", { name: "Failed to load plans" })
	).toBeVisible();
	plansAvailable = true;
	await page.getByRole("button", { name: "Try again", exact: true }).click();

	const rows = page.getByText(/events \/ month/);
	await expect(rows).toHaveText([
		"25,000 events / month",
		"1,000,000 events / month · 100 investigations / month",
	]);
	await expect(page.getByText("$9.99 / month")).toBeVisible();

	await page.getByRole("button", { name: "Get started" }).first().click();
	await expect(page.getByRole("dialog")).toBeVisible();
	await page.getByRole("button", { name: /Confirm subscription/ }).click();
	const expected = new URL(SUCCESS_PATH, page.url()).href;
	await expect.poll(() => successUrl).toBe(expected);
});

test("plan step fixture rejects a missing test key", {
	tag: "@regression",
}, async ({ page }) => {
	const response = await page.goto(PATH);
	expect(response?.status()).toBe(404);
});
