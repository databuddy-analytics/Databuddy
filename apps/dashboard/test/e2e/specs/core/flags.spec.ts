import { expect, test, TRACKING_VERIFIED } from "@/test/e2e/fixtures";
import { scopeSuffix } from "@/test/e2e/utils/dashboard";

test.beforeEach(({ mockRpc }) =>
	mockRpc("websites/isTrackingSetup", TRACKING_VERIFIED)
);

test("creates a target group, a flag from a template, and a manual flag, then toggles and deletes", {
	tag: "@core",
}, async ({ authenticatedPage: page, e2eSession }) => {
	const suffix = scopeSuffix(e2eSession);
	const groupName = `Testers ${suffix}`;
	const flagName = `Beta ${suffix}`;
	const flags = `/websites/${e2eSession.websiteId}/flags`;

	await page.goto(`${flags}/groups`);
	await page.getByRole("button", { name: "Create Group", exact: true }).click();
	const groupSheet = page.getByRole("dialog", { name: "Create Group" });
	await groupSheet
		.getByPlaceholder("Beta testers", { exact: true })
		.fill(groupName);
	await groupSheet.getByRole("button", { name: "Create Group" }).click();
	await expect(groupSheet).toBeHidden();
	await expect(page.getByText(groupName, { exact: true })).toBeVisible();

	await page.goto(`${flags}/templates`);
	await page.getByRole("button", { name: "Use Template" }).first().click();
	const templateSheet = page.getByRole("dialog", { name: /^Create from / });
	const templateKey = await templateSheet
		.getByPlaceholder("new-feature")
		.inputValue();
	await templateSheet.getByRole("button", { name: "Create Flag" }).click();
	await expect(templateSheet).toBeHidden();

	await page.goto(flags);
	await expect(page.getByText(templateKey, { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Create Flag", exact: true }).click();
	const sheet = page.getByRole("dialog", { name: "Create Flag" });
	await sheet.getByPlaceholder("New feature", { exact: true }).fill(flagName);
	await expect(sheet.getByPlaceholder("new-feature")).toHaveValue(
		`beta-${suffix}`
	);
	await sheet.getByRole("button", { name: "Create Flag" }).click();
	await expect(sheet).toBeHidden();
	const row = page.locator("[data-slot=list-row]", { hasText: flagName });
	await expect(row.getByText(`beta-${suffix}`, { exact: true })).toBeVisible();

	await row.getByRole("switch", { name: "Disable flag" }).click();
	await expect(row.getByRole("switch", { name: "Enable flag" })).toBeVisible();

	await row.getByRole("button", { name: "Flag actions" }).click();
	await page.getByRole("menuitem", { name: "Delete Flag" }).click();
	await page
		.getByRole("dialog", { name: "Delete Feature Flag" })
		.getByRole("button", { name: "Delete" })
		.click();
	await expect(row).toHaveCount(0);

	await page.goto(`${flags}/groups`);
	await page.getByRole("button", { name: "Group actions" }).click();
	await page.getByRole("menuitem", { name: "Delete" }).click();
	await expect(page.getByText(groupName, { exact: true })).toBeHidden();
});
