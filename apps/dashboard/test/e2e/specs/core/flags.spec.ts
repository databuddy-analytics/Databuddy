import { expect, test, TRACKING_VERIFIED } from "@/test/e2e/fixtures";
import { scopeSuffix } from "@/test/e2e/utils/dashboard";

test.beforeEach(({ mockRpc }) =>
	mockRpc("websites/isTrackingSetup", TRACKING_VERIFIED)
);

test("creates a flag, toggles it off, and deletes it", {
	tag: "@core",
}, async ({ authenticatedPage: page, e2eSession }) => {
	const suffix = scopeSuffix(e2eSession);
	const name = `Beta ${suffix}`;
	await page.goto(`/websites/${e2eSession.websiteId}/flags`);

	await page.getByRole("button", { name: "Create Flag", exact: true }).click();
	const sheet = page.getByRole("dialog", { name: "Create Flag" });
	await sheet.getByPlaceholder("New Feature…").fill(name);
	await expect(sheet.getByPlaceholder("new-feature")).toHaveValue(
		`beta-${suffix}`
	);
	await sheet.getByRole("button", { name: "Create Flag" }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByText(name, { exact: true })).toBeVisible();
	await expect(page.getByText(`beta-${suffix}`, { exact: true })).toBeVisible();

	await page.getByRole("switch", { name: "Disable flag" }).click();
	await expect(page.getByRole("switch", { name: "Enable flag" })).toBeVisible();

	await page.getByRole("button", { name: "Flag actions" }).click();
	await page.getByRole("menuitem", { name: "Delete Flag" }).click();
	await page
		.getByRole("dialog", { name: "Delete Feature Flag" })
		.getByRole("button", { name: "Delete" })
		.click();
	await expect(page.getByText(name, { exact: true })).toBeHidden();
});
