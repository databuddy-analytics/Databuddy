import { expect, test } from "@/test/e2e/fixtures";
import { scopeSuffix } from "@/test/e2e/utils/dashboard";

test("invites a member as admin, cancels the invitation, and clears it", {
	tag: "@core",
}, async ({ authenticatedPage: page, e2eSession }) => {
	const email = `invitee-${scopeSuffix(e2eSession)}@e2e.databuddy.local`;
	await page.goto("/organizations/members");

	await page
		.getByRole("button", { name: "Invite", exact: true })
		.first()
		.click();
	const dialog = page.getByRole("dialog", { name: "Invite Member" });
	await dialog.getByPlaceholder("email@company.com").fill(email);
	await dialog.getByRole("button", { name: "Member", exact: true }).click();
	await page.getByRole("menuitemradio", { name: "Admin" }).click();
	await dialog.getByRole("button", { name: "Send Invite" }).click();
	await expect(dialog).toBeHidden();

	await expect(page.getByText(email, { exact: true })).toBeVisible();
	await expect(page.getByText("Pending", { exact: true })).toBeVisible();
	await expect(page.getByText(/^admin ·/)).toBeVisible();

	await page.getByRole("button", { name: "Invitation actions" }).click();
	await page.getByRole("menuitem", { name: "Cancel invitation" }).click();
	await page
		.getByRole("dialog", { name: "Cancel Invitation" })
		.getByRole("button", { name: "Cancel Invitation" })
		.click();
	await expect(page.getByText("0 pending of 1 total")).toBeVisible();
	await expect(page.getByText("Canceled", { exact: true })).toBeVisible();
	await expect(page.getByText("admin", { exact: true })).toBeVisible();
	await expect(page.getByText("Pending", { exact: true })).toBeHidden();
	await expect(page.getByText(/Expire/)).toHaveCount(0);
	await page.getByRole("button", { name: "Clear expired" }).click();
	await expect(page.getByText(email, { exact: true })).toBeHidden();
});
