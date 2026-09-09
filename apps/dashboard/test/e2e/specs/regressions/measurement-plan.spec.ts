import { expect, test } from "@/test/e2e/fixtures";

test("saves activation definitions through oRPC, recovers unfinished edits, and restores history", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	await page.goto("/organizations/settings/business-context");
	await page.getByRole("button", { name: /^Add definition for/ }).click();
	const outcome = page.getByRole("textbox", {
		name: "Business outcome",
		exact: true,
	});
	const activation = page.getByRole("combobox", {
		name: "Activation event",
		exact: true,
	});
	const returning = page.getByRole("combobox", {
		name: "Return event",
		exact: true,
	});
	await outcome.fill("Reports shared again");
	await expect(
		page.getByRole("button", { name: "Save changes", exact: true })
	).toBeDisabled();
	await page.reload();
	await expect(outcome).toHaveValue("Reports shared again");
	await activation.fill("report_shared");
	await returning.fill("report_opened");
	await returning.press("Escape");
	const saved = page.waitForResponse((response) =>
		response.url().endsWith("/rpc/businessContext/save")
	);
	await page.getByRole("button", { name: "Save changes", exact: true }).click();
	expect((await saved).ok()).toBe(true);
	await expect(page.getByText("Changes saved", { exact: true })).toBeVisible();
	await page.reload();
	await expect(activation).toHaveValue("report_shared");
	await expect(returning).toHaveValue("report_opened");
	await page.getByRole("button", { name: "Return window: 7 days" }).click();
	await page
		.getByRole("menuitemradio", { name: "30 days", exact: true })
		.click();
	await page.getByRole("button", { name: "Save changes", exact: true }).click();
	await expect(page.getByText("Changes saved", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "History", exact: true }).click();
	await page
		.getByRole("menuitem")
		.filter({ hasText: /^Version/ })
		.first()
		.click();
	await expect(page.getByRole("dialog").locator("ins")).toContainText("7");
	await page
		.getByRole("button", { name: "Restore this version", exact: true })
		.click();
	await expect(
		page.getByText("Version restored", { exact: true })
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Return window: 7 days" })
	).toBeVisible();
	await page.getByRole("button", { name: /^Remove definition for/ }).click();
	await page.getByRole("button", { name: "Save changes", exact: true }).click();
	await expect(page.getByText("Changes saved", { exact: true })).toBeVisible();
	await page.reload();
	await expect(
		page.getByRole("button", { name: /^Add definition for/ })
	).toBeVisible();
});
