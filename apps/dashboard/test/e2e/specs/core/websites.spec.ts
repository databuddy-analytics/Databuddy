import { expect, test } from "@/test/e2e/fixtures";
import {
	expectDashboardReady,
	idFromPath,
	scopeSuffix,
	WEBSITE_PATH_RE,
	websiteCard,
} from "@/test/e2e/utils/dashboard";

const DUPLICATE_DOMAIN_RE = /domain.*already exists/i;

test("validates, creates, renames, rejects a duplicate domain, and deletes a website", {
	tag: "@core",
}, async ({ authenticatedPage: page, e2eSession }) => {
	const suffix = scopeSuffix(e2eSession);
	const name = `Site ${suffix}`;
	const renamed = `${name} renamed`;
	const domain = `site-${suffix}.local`;

	await page.goto("/websites");
	await expectDashboardReady(page);
	await page.getByRole("button", { name: "New Website" }).click();
	const dialog = page.getByRole("dialog", { name: "Create a new website" });
	const nameField = dialog.getByRole("textbox", { name: "Name" });
	const domainField = dialog.getByRole("textbox", { name: "Domain" });
	const create = dialog.getByRole("button", { name: "Create website" });
	await nameField.fill("Bad !");
	await domainField.fill("not-a-domain");
	await expect(
		dialog.getByText("Use alphanumeric, spaces, -, _")
	).toBeVisible();
	await expect(dialog.getByText("Invalid domain format")).toBeVisible();
	await expect(create).toBeDisabled();

	await nameField.fill(name);
	await domainField.fill(`https://www.${domain}/ignored-path?utm=e2e`);
	await expect(domainField).toHaveValue(domain);
	await create.click();
	await expect(page).toHaveURL(WEBSITE_PATH_RE, { timeout: 15_000 });
	const websiteId = idFromPath(page.url(), "websites");

	await page.goto("/websites");
	await expect(websiteCard(page, name)).toBeVisible();
	await expect(page.getByText(domain)).toBeVisible();
	await page.getByRole("button", { name: "New Website" }).click();
	await nameField.fill(`${name} duplicate`);
	await domainField.fill(domain);
	await create.click();
	await expect(page.getByText(DUPLICATE_DOMAIN_RE).first()).toBeVisible();

	await page.goto(`/websites/${websiteId}/settings/general`);
	const settingsName = page.getByRole("textbox", { name: "Name" });
	await expect(settingsName).toHaveValue(name);
	await expect(page.getByRole("textbox", { name: "Domain" })).toHaveValue(
		domain
	);
	await settingsName.fill(renamed);
	const save = page.getByRole("button", { name: "Save Changes" });
	await save.click();
	await expect(save).toBeHidden();
	await page.reload();
	await expect(settingsName).toHaveValue(renamed);

	await page.getByRole("button", { exact: true, name: "Delete" }).click();
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Delete Website" })
		.click();
	await expect(page).toHaveURL(/\/websites$/);
	await expect(websiteCard(page, renamed)).toBeHidden();
});
