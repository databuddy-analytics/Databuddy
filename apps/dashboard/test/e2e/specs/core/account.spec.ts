import { expect, test } from "@/test/e2e/fixtures";
import { expectDashboardReady, scopeSuffix } from "@/test/e2e/utils/dashboard";

const CURRENT_PASSWORD = "DatabuddyE2E!123";
const LOGIN_PASSWORD_LABEL_RE = /^Password\*?$/;

test("renames the account, changes the password, and signs back in", {
	tag: "@core",
}, async ({ authenticatedPage: page, e2eSession }) => {
	const suffix = scopeSuffix(e2eSession);
	const name = `Renamed ${suffix}`;
	const password = `Rotated-${suffix}-1!`;
	await page.goto("/settings/account");

	const fullName = page.getByRole("textbox", { name: "Full Name" });
	await fullName.fill(name);
	await page.getByRole("button", { name: "Save Changes" }).click();
	await expect(page.getByText("Profile updated")).toBeVisible();
	await page.reload();
	await expect(fullName).toHaveValue(name);

	await page.getByRole("button", { name: "Change", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "Change Password" });
	await dialog.getByLabel("Current Password").fill(CURRENT_PASSWORD);
	await dialog.getByLabel("New Password", { exact: true }).fill(password);
	await dialog.getByLabel("Confirm New Password").fill(password);
	await dialog.getByRole("button", { name: "Change Password" }).click();
	await expect(page.getByText("Password changed")).toBeVisible();

	await page
		.getByRole("button", { name: "Account", exact: true })
		.filter({ hasText: e2eSession.email })
		.click();
	await page.getByRole("menuitem", { name: "Sign out" }).click();
	await expect(page).toHaveURL(/\/login/);
	await page.getByRole("textbox", { name: "Email" }).fill(e2eSession.email);
	await page.getByLabel(LOGIN_PASSWORD_LABEL_RE).fill(password);
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await expectDashboardReady(page);
});
