import { expect, test } from "@/test/e2e/fixtures";
import {
	createLinkFolder,
	createShortLink,
	escapedText,
	idFromPath,
	linkRow,
	openLinkActions,
	scopeSuffix,
} from "@/test/e2e/utils/dashboard";

const SHORT_LINK_LABEL_RE = /Short Link/;
const SLUG_CONFLICT_RE = /slug.*(taken|exists)/i;

test(
	"creates, filters, updates, opens, and deletes short links",
	{ tag: "@core" },
	async ({ authenticatedPage, e2eSession }) => {
		const suffix = scopeSuffix(e2eSession);
		const folderName = `E2E Folder ${suffix}`;
		const primaryToken = `primary-${suffix}`;
		const primaryName = `E2E Link ${primaryToken}`;
		const secondaryName = `E2E Other ${suffix}`;
		const updatedName = `${primaryName} Updated`;
		const primarySlug = `e2e-${primaryToken}`;
		const secondarySlug = `e2e-other-${suffix}`;
		const targetUrl = `e2e-${suffix}.local/start`;
		const updatedTargetUrl = `e2e-${suffix}.local/updated`;

		await authenticatedPage.goto("/links");
		await expect(
			authenticatedPage.getByRole("heading", { name: "Links" })
		).toBeVisible();

		await createLinkFolder(authenticatedPage, folderName);
		await expect(
			authenticatedPage.getByRole("button", { name: new RegExp(folderName) })
		).toBeVisible();

		const primaryRow = await createShortLink(authenticatedPage, {
			folderName,
			name: primaryName,
			slug: primarySlug,
			targetUrl,
		});
		await expect(primaryRow).toBeVisible();
		await expect(authenticatedPage.getByText(escapedText(primarySlug))).toBeVisible();
		await expect(
			authenticatedPage.getByRole("button", {
				name: new RegExp(`${folderName}\\s+1`),
			})
		).toBeVisible();

		const secondaryRow = await createShortLink(authenticatedPage, {
			name: secondaryName,
			slug: secondarySlug,
			targetUrl: `other-${targetUrl}`,
		});
		await expect(secondaryRow).toBeVisible();
		await expect(
			authenticatedPage.getByRole("button", { name: /Unfiled\s+1/ })
		).toBeVisible();

		await authenticatedPage
			.getByRole("textbox", { name: "Search links" })
			.fill(primaryToken);
		await expect(linkRow(authenticatedPage, primaryName)).toBeVisible();
		await expect(linkRow(authenticatedPage, secondaryName)).toBeHidden();
		await authenticatedPage.getByRole("button", { name: "Clear search" }).click();
		await expect(linkRow(authenticatedPage, secondaryName)).toBeVisible();

		await linkRow(authenticatedPage, primaryName).click();
		await expect(authenticatedPage).toHaveURL(/\/links\/[A-Za-z0-9_-]+/);
		expect(idFromPath(authenticatedPage.url(), "links")).toBeTruthy();
		await expect(authenticatedPage.getByText(primaryName)).toBeVisible();
		await expect(authenticatedPage.getByText("Total Clicks")).toBeVisible();

		await authenticatedPage.goto("/links");
		await openLinkActions(authenticatedPage, primaryName);
		await authenticatedPage.getByRole("menuitem", { name: "Edit" }).click();
		await expect(
			authenticatedPage.getByRole("heading", { name: "Edit Link" })
		).toBeVisible();
		await authenticatedPage
			.getByRole("textbox", { name: "Destination URL" })
			.fill(updatedTargetUrl);
		await authenticatedPage
			.getByRole("textbox", { name: "Name" })
			.fill(updatedName);
		await authenticatedPage.getByRole("button", { name: "Save Changes" }).click();
		await expect(
			authenticatedPage.getByRole("heading", { name: "Edit Link" })
		).toBeHidden();
		await expect(linkRow(authenticatedPage, updatedName)).toBeVisible();
		await expect(
			authenticatedPage.getByText(primaryName, { exact: true })
		).toBeHidden();

		await openLinkActions(authenticatedPage, updatedName);
		await authenticatedPage.getByRole("menuitem", { name: "Delete" }).click();
		await expect(
			authenticatedPage.getByRole("heading", { name: "Delete Link" })
		).toBeVisible();
		await authenticatedPage
			.getByRole("dialog")
			.getByRole("button", { name: "Delete Link" })
			.click();

		await expect(linkRow(authenticatedPage, updatedName)).toBeHidden();
		await expect(linkRow(authenticatedPage, secondaryName)).toBeVisible();
	}
);

test(
	"validates short link slugs and rejects duplicates",
	{ tag: "@core" },
	async ({ authenticatedPage, e2eSession }) => {
		const suffix = scopeSuffix(e2eSession);
		const name = `Slug Edge ${suffix}`;
		const slug = `slug-edge-${suffix}`;
		const targetUrl = `slug-edge-${suffix}.local/start`;

		await authenticatedPage.goto("/links");
		await authenticatedPage.getByRole("button", { name: "New Link" }).click();
		const dialog = authenticatedPage.getByRole("dialog", { name: "Create Link" });
		await dialog.getByRole("textbox", { name: "Destination URL" }).fill(targetUrl);
		await dialog.getByRole("textbox", { name: "Name" }).fill(name);

		const invalidCases = [
			{ error: "Slug must be at least 3 characters", value: "ab" },
			{ error: "Only letters, numbers, hyphens, and underscores", value: "bad/slug" },
		];
		for (const { error, value } of invalidCases) {
			await dialog
				.getByRole("textbox", { name: SHORT_LINK_LABEL_RE })
				.fill(value);
			await expect(dialog.getByText(error)).toBeVisible();
			await expect(dialog.getByRole("button", { name: "Create Link" })).toBeDisabled();
		}

		await dialog.getByRole("textbox", { name: SHORT_LINK_LABEL_RE }).fill(slug);
		await dialog.getByRole("button", { name: "Create Link" }).click();
		await expect(linkRow(authenticatedPage, name)).toBeVisible();

		await authenticatedPage.getByRole("button", { name: "New Link" }).click();
		const duplicateDialog = authenticatedPage.getByRole("dialog", {
			name: "Create Link",
		});
		await duplicateDialog
			.getByRole("textbox", { name: "Destination URL" })
			.fill(`duplicate-${targetUrl}`);
		await duplicateDialog
			.getByRole("textbox", { name: "Name" })
			.fill(`${name} duplicate`);
		await duplicateDialog
			.getByRole("textbox", { name: SHORT_LINK_LABEL_RE })
			.fill(slug);
		await duplicateDialog.getByRole("button", { name: "Create Link" }).click();
		await expect(
			authenticatedPage.getByText(SLUG_CONFLICT_RE).first()
		).toBeVisible();
		await expect(linkRow(authenticatedPage, `${name} duplicate`)).toBeHidden();
	}
);
