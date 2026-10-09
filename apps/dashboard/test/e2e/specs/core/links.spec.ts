import { expect, test } from "@/test/e2e/fixtures";
import {
	createLinkFolder,
	createShortLink,
	escapedText,
	LINK_PATH_RE,
	linkRow,
	openLinkActions,
	scopeSuffix,
	SHORT_LINK_LABEL_RE,
} from "@/test/e2e/utils/dashboard";

const SLUG_CONFLICT_RE = /slug.*(taken|exists)/i;
const INVALID_SLUGS = [
	{ error: "Slug must be at least 3 characters", value: "ab" },
	{
		error: "Only letters, numbers, hyphens, and underscores",
		value: "bad/slug",
	},
];

test("validates, creates, filters, updates, opens, and deletes short links", {
	tag: "@core",
}, async ({ authenticatedPage: page, e2eSession }) => {
	const suffix = scopeSuffix(e2eSession);
	const folderName = `Folder ${suffix}`;
	const primaryName = `Link primary-${suffix}`;
	const secondaryName = `Link other ${suffix}`;
	const renamed = `${primaryName} renamed`;
	const primarySlug = `e2e-primary-${suffix}`;
	const targetUrl = `e2e-${suffix}.local/start`;

	await page.goto("/links");
	await expect(page.getByRole("heading", { name: "Links" })).toBeVisible();
	await createLinkFolder(page, folderName);

	await page.getByRole("button", { name: "New Link" }).click();
	await page.getByRole("menuitem", { name: "Short Link" }).click();
	const dialog = page.getByRole("dialog", { name: "Create Link" });
	const slugField = dialog.getByRole("textbox", { name: SHORT_LINK_LABEL_RE });
	await dialog
		.getByRole("textbox", { name: "Destination URL" })
		.fill(targetUrl);
	await dialog.getByRole("textbox", { name: "Name" }).fill(primaryName);
	for (const { error, value } of INVALID_SLUGS) {
		await slugField.fill(value);
		await expect(dialog.getByText(error)).toBeVisible();
		await expect(
			dialog.getByRole("button", { name: "Create Link" })
		).toBeDisabled();
	}
	await slugField.fill(primarySlug);
	await dialog.getByRole("button", { name: "Folder: Unfiled" }).click();
	await page.getByRole("menuitem", { name: folderName }).click();
	await dialog.getByRole("button", { name: "Create Link" }).click();
	await expect(linkRow(page, primaryName)).toBeVisible();
	await expect(page.getByText(escapedText(primarySlug))).toBeVisible();
	await expect(page.getByText(folderName, { exact: true })).toBeVisible();

	await createShortLink(page, {
		name: `${primaryName} duplicate`,
		slug: primarySlug,
		targetUrl: `duplicate-${targetUrl}`,
	});
	await expect(page.getByText(SLUG_CONFLICT_RE).first()).toBeVisible();
	await expect(linkRow(page, `${primaryName} duplicate`)).toBeHidden();
	await page.keyboard.press("Escape");

	await expect(
		await createShortLink(page, {
			name: secondaryName,
			slug: `e2e-other-${suffix}`,
			targetUrl: `other-${targetUrl}`,
		})
	).toBeVisible();

	await page.getByRole("button", { name: "All folders" }).click();
	await page.getByRole("menuitemradio", { name: "Unfiled" }).click();
	await expect(linkRow(page, secondaryName)).toBeVisible();
	await expect(linkRow(page, primaryName)).toBeHidden();
	await page.getByRole("button", { name: "Unfiled" }).click();
	await page.getByRole("menuitemradio", { name: "All folders" }).click();
	await expect(linkRow(page, primaryName)).toBeVisible();

	await page
		.getByRole("textbox", { name: "Search links" })
		.fill(`primary-${suffix}`);
	await expect(linkRow(page, primaryName)).toBeVisible();
	await expect(linkRow(page, secondaryName)).toBeHidden();
	await page.getByRole("button", { name: "Clear search" }).click();
	await expect(linkRow(page, secondaryName)).toBeVisible();

	await linkRow(page, primaryName).click();
	await expect(page).toHaveURL(LINK_PATH_RE, { timeout: 15_000 });
	await expect(page.getByText(primaryName)).toBeVisible();
	await expect(page.getByText("Total Clicks")).toBeVisible();

	await page.goto("/links");
	await openLinkActions(page, primaryName);
	await page.getByRole("menuitem", { name: "Edit" }).click();
	const edit = page.getByRole("dialog", { name: "Edit Link" });
	await edit
		.getByRole("textbox", { name: "Destination URL" })
		.fill(`${targetUrl}-updated`);
	await edit.getByRole("textbox", { name: "Name" }).fill(renamed);
	await edit.getByRole("button", { name: "Save Changes" }).click();
	await expect(edit).toBeHidden();
	await expect(linkRow(page, renamed)).toBeVisible();
	await expect(page.getByText(primaryName, { exact: true })).toBeHidden();

	await openLinkActions(page, renamed);
	await page.getByRole("menuitem", { name: "Delete" }).click();
	await page
		.getByRole("dialog", { name: "Delete Link" })
		.getByRole("button", { name: "Delete Link" })
		.click();
	await expect(linkRow(page, renamed)).toBeHidden();
	await expect(linkRow(page, secondaryName)).toBeVisible();
});

test("creates deep links without a feature flag", { tag: "@core" }, async ({
	authenticatedPage: page,
	e2eSession,
}) => {
	const suffix = scopeSuffix(e2eSession);
	const name = `Instagram ${suffix}`;

	await page.goto("/links");
	await page.getByRole("button", { name: "New Link" }).click();
	await page.getByRole("menuitem", { name: "Deep Link" }).click();
	await expect(
		page.getByRole("heading", { name: "Create Deep Link" })
	).toBeVisible();
	await page.getByRole("button", { name: /Instagram/ }).click();
	await page
		.getByRole("textbox", { name: "Instagram URL" })
		.fill(`instagram.com/e2e-${suffix}`);
	await page.getByRole("textbox", { name: "Name" }).fill(name);
	await page
		.getByRole("textbox", { name: SHORT_LINK_LABEL_RE })
		.fill(`e2e-instagram-${suffix}`);
	await page.getByRole("button", { name: "Create Deep Link" }).click();

	const row = linkRow(page, name);
	await expect(row).toBeVisible();
	await expect(row.getByText("Instagram", { exact: true })).toBeVisible();
});
