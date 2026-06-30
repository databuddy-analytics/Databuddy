import { expect, test } from "@/test/e2e/fixtures";
import {
	createWebsite,
	expectDashboardReady,
	idFromPath,
	scopeSuffix,
	websiteCard,
} from "@/test/e2e/utils/dashboard";

const DUPLICATE_DOMAIN_RE = /domain.*already exists/i;

test(
	"creates, updates, and deletes a website",
	{ tag: "@core" },
	async ({ authenticatedPage, e2eSession }) => {
		const suffix = scopeSuffix(e2eSession);
		const websiteName = `E2E Website ${suffix}`;
		const updatedName = `${websiteName} Updated`;
		const domain = `e2e-${suffix}.local`;

		await authenticatedPage.goto("/websites");
		await expectDashboardReady(authenticatedPage);

		const createdWebsite = await createWebsite(authenticatedPage, {
			domain,
			name: websiteName,
		});
		await expect(createdWebsite).toBeVisible();
		await expect(authenticatedPage.getByText(domain)).toBeVisible();

		await createdWebsite.click();
		await expect(authenticatedPage).toHaveURL(/\/websites\/[A-Za-z0-9_-]+/);
		const websiteId = idFromPath(authenticatedPage.url(), "websites");

		await authenticatedPage.goto(`/websites/${websiteId}/settings/general`);
		await expect(authenticatedPage.getByText(websiteName)).toBeVisible();
		await expect(authenticatedPage.getByText(domain)).toBeVisible();

		await authenticatedPage.getByRole("button", { name: "Edit" }).first().click();
		await expect(
			authenticatedPage.getByRole("heading", { name: "Edit Website" })
		).toBeVisible();
		await authenticatedPage
			.getByRole("textbox", { name: "Name" })
			.fill(updatedName);
		await authenticatedPage.getByRole("button", { name: "Save changes" }).click();
		await expect(
			authenticatedPage.getByRole("heading", { name: "Edit Website" })
		).toBeHidden();
		await authenticatedPage.reload();
		await expect(authenticatedPage.getByText(updatedName)).toBeVisible();

		await authenticatedPage
			.getByRole("button", { exact: true, name: "Delete" })
			.click();
		await expect(
			authenticatedPage.getByRole("heading", { name: "Delete Website" })
		).toBeVisible();
		await authenticatedPage
			.getByRole("dialog")
			.getByRole("button", { name: "Delete Website" })
			.click();

		await expect(authenticatedPage).toHaveURL(/\/websites$/);
		await expect(authenticatedPage.getByText(updatedName)).toBeHidden();
	}
);

test(
	"validates, normalizes, and rejects duplicate website domains",
	{ tag: "@core" },
	async ({ authenticatedPage, e2eSession }) => {
		const suffix = scopeSuffix(e2eSession);
		const domain = `edge-${suffix}.local`;
		const firstName = `Edge Website ${suffix}`;
		const duplicateName = `Duplicate Website ${suffix}`;

		await authenticatedPage.goto("/websites");
		await expectDashboardReady(authenticatedPage);
		await authenticatedPage.getByRole("button", { name: "New Website" }).click();

		const dialog = authenticatedPage.getByRole("dialog", {
			name: "Create a new website",
		});
		await dialog.getByRole("textbox", { name: "Name" }).fill("Bad !");
		await dialog.getByRole("textbox", { name: "Domain" }).fill("not-a-domain");
		await expect(dialog.getByText("Use alphanumeric, spaces, -, _")).toBeVisible();
		await expect(dialog.getByText("Invalid domain format")).toBeVisible();
		await expect(
			dialog.getByRole("button", { name: "Create website" })
		).toBeDisabled();

		await dialog.getByRole("textbox", { name: "Name" }).fill(firstName);
		await dialog
			.getByRole("textbox", { name: "Domain" })
			.fill(`https://www.${domain}/ignored-path?utm=e2e`);
		await expect(dialog.getByRole("textbox", { name: "Domain" })).toHaveValue(
			domain
		);
		await dialog.getByRole("button", { name: "Create website" }).click();
		await expect(websiteCard(authenticatedPage, firstName)).toBeVisible();
		await expect(authenticatedPage.getByText(domain)).toBeVisible();

		await authenticatedPage.getByRole("button", { name: "New Website" }).click();
		await authenticatedPage
			.getByRole("dialog", { name: "Create a new website" })
			.getByRole("textbox", { name: "Name" })
			.fill(duplicateName);
		await authenticatedPage
			.getByRole("dialog", { name: "Create a new website" })
			.getByRole("textbox", { name: "Domain" })
			.fill(domain);
		await authenticatedPage
			.getByRole("dialog", { name: "Create a new website" })
			.getByRole("button", { name: "Create website" })
			.click();
		await expect(
			authenticatedPage.getByText(DUPLICATE_DOMAIN_RE).first()
		).toBeVisible();
		await expect(websiteCard(authenticatedPage, duplicateName)).toBeHidden();
	}
);
