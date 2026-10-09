import { expect, test, TRACKING_VERIFIED } from "@/test/e2e/fixtures";
import { scopeSuffix } from "@/test/e2e/utils/dashboard";

test.beforeEach(({ mockRpc }) =>
	mockRpc("websites/isTrackingSetup", TRACKING_VERIFIED)
);

test("creates, edits, and deletes a goal", { tag: "@core" }, async ({
	authenticatedPage: page,
	e2eSession,
}) => {
	const name = `Pricing viewed ${scopeSuffix(e2eSession)}`;
	const renamed = `${name} renamed`;
	await page.goto(`/websites/${e2eSession.websiteId}/goals`);

	await page.getByRole("button", { name: "Create goal", exact: true }).click();
	const sheet = page.getByRole("dialog", { name: "New Goal" });
	await sheet.getByPlaceholder("e.g., Newsletter Signup").fill(name);
	await sheet.getByPlaceholder("/path").fill("/pricing");
	await sheet.getByRole("button", { name: "Create Goal" }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByText(name, { exact: true })).toBeVisible();

	await page.getByRole("button", { name: "Goal actions" }).click();
	await page.getByRole("menuitem", { name: "Edit" }).click();
	const edit = page.getByRole("dialog", { name });
	await edit.getByPlaceholder("e.g., Newsletter Signup").fill(renamed);
	await edit.getByRole("button", { name: "Save Changes" }).click();
	await expect(edit).toBeHidden();
	await expect(page.getByText(renamed, { exact: true })).toBeVisible();

	await page.getByRole("button", { name: "Goal actions" }).click();
	await page.getByRole("menuitem", { name: "Delete" }).click();
	await page
		.getByRole("dialog", { name: `Delete ${renamed}` })
		.getByRole("button", { name: "Delete Goal" })
		.click();
	await expect(page.getByText(renamed, { exact: true })).toBeHidden();
});
