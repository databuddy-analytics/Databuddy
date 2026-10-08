import type { useListPlans } from "autumn-js/react";
import { expect, test } from "@/test/e2e/fixtures";
import { scopeSuffix } from "@/test/e2e/utils/dashboard";

const WEBSITE_PATH_RE = /\/websites\/[A-Za-z0-9_-]+\/goals$/;
const NO_AI = {
	status: "not-configured",
	message: "AI draft generation is not configured.",
	action: "contact-admin",
};

const PLAN: NonNullable<ReturnType<typeof useListPlans>["data"]>[number] = {
	id: "hobby",
	name: "Hobby",
	description: null,
	group: null,
	version: 1,
	addOn: false,
	autoEnable: false,
	price: { amount: 9.99, interval: "month", intervalCount: 1 },
	items: [
		{
			featureId: "events",
			included: 25_000,
			unlimited: false,
			reset: { interval: "month", intervalCount: 1 },
			price: null,
		},
	],
	createdAt: 0,
	env: "sandbox",
	archived: false,
	baseVariantId: null,
	config: { ignorePastDue: false },
};

test.use({ withWebsite: false });

test("sets up a fresh account from the onboarding checklist", {
	tag: "@core",
}, async ({ authenticatedPage: page, e2eSession, mockRpc }) => {
	const suffix = scopeSuffix(e2eSession);
	const name = `Onboard ${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`;
	await mockRpc("businessContext/generationAccess", NO_AI);
	await page.route("**/api/autumn/**", (route) =>
		route.fulfill({ json: null })
	);
	await page.route("**/api/autumn/listPlans", (route) =>
		route.fulfill({ json: { list: [PLAN] } })
	);

	await page.goto("/onboarding");
	await expect(
		page.getByRole("heading", { name: "What do you want from Databuddy?" })
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Skip setup", exact: true })
	).toHaveCount(0);
	await page.getByRole("button", { name: /Sign-ups and revenue/ }).click();
	await expect(
		page.getByRole("button", { name: /Sign-ups and revenue/ })
	).toHaveAttribute("aria-pressed", "true");
	await page.screenshot({
		path: test.info().outputPath("feature-selector.png"),
	});
	await page.getByRole("button", { name: "Continue" }).click();
	await expect(
		page.getByRole("heading", { name: "Set up Databuddy" })
	).toBeVisible();

	const domain = page.getByRole("textbox", { name: "Domain" });
	await domain.fill(`https://www.onboard-${suffix}.local/pricing?utm=e2e`);
	await expect(domain).toHaveValue(`onboard-${suffix}.local`);
	await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue(name);
	await page.getByRole("button", { name: "Create website" }).click();

	await expect(
		page.getByRole("heading", { name: `Set up ${name}` })
	).toBeVisible();
	await expect(page.getByText("Not available", { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Claude Code" })).toBeVisible();
	await page.getByRole("button", { name: "Skip for now" }).click();
	await expect(page.getByText("Skipped", { exact: true })).toBeVisible();

	if (process.env.SELFHOST?.trim().toLowerCase() !== "true") {
		await page.getByRole("button", { name: "Continue", exact: true }).click();
		await expect(
			page.getByRole("heading", { name: "Pick a plan" })
		).toBeVisible();
		await expect(page.getByText("Hobby", { exact: true })).toBeVisible();
		await page.screenshot({
			path: test.info().outputPath("choose-plan.png"),
		});
		await page.getByRole("button", { name: "Back to setup" }).click();
		await expect(
			page.getByRole("heading", { name: `Set up ${name}` })
		).toBeVisible();
		await page.getByRole("button", { name: "Continue", exact: true }).click();
		await page.reload();
		await expect(
			page.getByRole("heading", { name: "Pick a plan" })
		).toBeVisible();
	}
	await page.getByRole("button", { name: "Open dashboard" }).click();
	await expect(page).toHaveURL(WEBSITE_PATH_RE);
});

if (process.env.SELFHOST?.trim().toLowerCase() !== "true") {
	test.describe("plan step", () => {
		test.use({ withWebsite: true });

		test("recovers billing and returns checkout to the plan step", {
			tag: "@core",
		}, async ({ authenticatedPage: page, e2eSession }) => {
			let plansAvailable = false;
			await page.route("**/api/autumn/**", async (route) => {
				const path = new URL(route.request().url()).pathname;
				if (path.endsWith("/listPlans")) {
					await route.fulfill(
						plansAvailable
							? { json: { list: [PLAN] } }
							: {
									status: 503,
									json: { message: "Billing is temporarily unavailable" },
								}
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
					const body = route.request().postDataJSON() as { successUrl: string };
					await route.fulfill({ json: { paymentUrl: body.successUrl } });
				} else {
					await route.fulfill({ json: null });
				}
			});
			await page.goto(
				`/onboarding?want=analytics,performance&website=${e2eSession.websiteId}&step=plan`
			);
			await expect(
				page.getByRole("heading", { name: "Pick a plan" })
			).toBeVisible();
			await expect(
				page.getByRole("heading", { name: "Failed to load plans" })
			).toBeVisible();
			plansAvailable = true;
			await page
				.getByRole("button", { name: "Try again", exact: true })
				.click();
			await expect(page.getByText("Hobby", { exact: true })).toBeVisible();
			await page
				.getByRole("button", { name: "Get started", exact: true })
				.click();
			await expect(page.getByRole("dialog")).toBeVisible();
			await page.getByRole("button", { name: /Confirm subscription/ }).click();
			await expect(
				page.getByRole("heading", { name: "Pick a plan" })
			).toBeVisible();
			await expect(page).toHaveURL(
				new RegExp(
					`/onboarding\\?want=analytics(?:%2C|,)performance&website=${e2eSession.websiteId}&step=plan$`
				)
			);
			await page.getByRole("button", { name: "Open dashboard" }).click();
			await expect(page).toHaveURL(
				new RegExp(`/websites/${e2eSession.websiteId}`)
			);
		});
	});
}
