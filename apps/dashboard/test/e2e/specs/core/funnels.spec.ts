import { expect, test, TRACKING_VERIFIED } from "@/test/e2e/fixtures";
import { scopeSuffix } from "@/test/e2e/utils/dashboard";

test.beforeEach(({ mockRpc }) =>
	mockRpc("websites/isTrackingSetup", TRACKING_VERIFIED)
);

test("creates a three-step funnel and deletes it", { tag: "@core" }, async ({
	authenticatedPage: page,
	e2eSession,
}) => {
	const name = `Checkout ${scopeSuffix(e2eSession)}`;
	await page.goto(`/websites/${e2eSession.websiteId}/funnels`);

	await page
		.getByRole("button", { name: "Create Funnel", exact: true })
		.click();
	const sheet = page.getByRole("dialog", { name: "New Funnel" });
	await sheet.getByPlaceholder("e.g., Sign Up Flow").fill(name);
	await expect(sheet.getByPlaceholder("Step name")).toHaveCount(2);
	await sheet.getByRole("button", { name: "Add Step" }).click();
	await sheet.getByPlaceholder("Step name").nth(2).fill("Paid");
	await sheet.getByPlaceholder("/path").nth(2).fill("/thank-you");
	await sheet.getByRole("button", { name: "Create Funnel" }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByText(name, { exact: true })).toBeVisible();

	await page.getByRole("button", { name: "Funnel actions" }).click();
	await page.getByRole("menuitem", { name: "Delete" }).click();
	await page
		.getByRole("dialog", { name: "Delete Funnel" })
		.getByRole("button", { name: "Delete Funnel" })
		.click();
	await expect(page.getByText(name, { exact: true })).toBeHidden();
});
