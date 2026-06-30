import { expect, type Locator, type Page } from "@playwright/test";

interface ScopedSession {
	userId: string;
}

const SAFE_SCOPE_CHARS_RE = /[^a-z0-9]/gi;
const SHORT_LINK_LABEL_RE = /Short Link/;
const CREATE_API_KEY_BUTTON_RE = /Create (your first )?key/i;
const ORGANIZATION_TRIGGER_RE = /^Organization:/;
export function scopeSuffix(session: ScopedSession): string {
	return session.userId
		.replaceAll(SAFE_SCOPE_CHARS_RE, "")
		.slice(0, 8)
		.toLowerCase();
}

export function escapedText(value: string): RegExp {
	return new RegExp(value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

export function apiKeyRow(page: Page, name: string): Locator {
	return page.getByText(name, { exact: true });
}

export function linkRow(page: Page, name: string): Locator {
	return page.getByRole("link", { name: escapedText(name) });
}

export function websiteCard(page: Page, name: string): Locator {
	return page.getByRole("link", { name: `Open ${name} analytics` });
}

export function idFromPath(url: string, segment: "links" | "websites"): string {
	const match = new URL(url).pathname.match(new RegExp(`/${segment}/([^/]+)`));
	if (!match?.[1]) {
		throw new Error(`Could not read ${segment} id from URL: ${url}`);
	}
	return match[1];
}

export function organizationSelector(page: Page): Locator {
	return page.getByRole("button", { name: ORGANIZATION_TRIGGER_RE });
}

export async function expectDashboardReady(page: Page): Promise<void> {
	await organizationSelector(page).waitFor({ state: "visible" });
}

export async function createOrganization(
	page: Page,
	input: { name: string; slug: string }
): Promise<void> {
	await organizationSelector(page).click();
	await page.getByRole("menu").waitFor();
	await page.getByRole("menuitem", { name: "Create Organization" }).click();
	await page
		.getByRole("heading", { name: "Create New Organization" })
		.waitFor();
	await page
		.getByRole("textbox", { name: "Organization Name" })
		.fill(input.name);
	await page
		.getByRole("textbox", { name: "Organization Slug" })
		.fill(input.slug);
	await page.getByRole("button", { name: "Create Organization" }).click();
	await organizationSelector(page).filter({ hasText: input.name }).waitFor();
}

export async function switchOrganization(
	page: Page,
	organizationName: string
): Promise<void> {
	await organizationSelector(page).click();
	await page.getByRole("menu").waitFor();
	await page.getByRole("menuitem", { name: organizationName }).click();
	await organizationSelector(page)
		.filter({ hasText: organizationName })
		.waitFor();
}

export async function createWebsite(
	page: Page,
	input: { domain: string; name: string }
): Promise<Locator> {
	await page.getByRole("button", { name: "New Website" }).click();
	const dialog = page.getByRole("dialog", { name: "Create a new website" });
	await dialog.waitFor();
	await dialog.getByRole("textbox", { name: "Name" }).fill(input.name);
	await dialog.getByRole("textbox", { name: "Domain" }).fill(input.domain);
	const submitButton = dialog.getByRole("button", { name: "Create website" });
	await expect(submitButton).toBeEnabled();
	await submitButton.click();
	await expect(dialog).toBeHidden({ timeout: 15_000 });
	return websiteCard(page, input.name);
}

export async function createApiKey(
	page: Page,
	keyName: string
): Promise<Locator> {
	await expect(
		page.getByRole("heading", { exact: true, name: "API Keys" })
	).toBeVisible({ timeout: 15_000 });
	await page
		.getByRole("button", { name: CREATE_API_KEY_BUTTON_RE })
		.first()
		.click();

	const dialog = page.getByRole("dialog", { name: "Create API Key" });
	await dialog.waitFor();
	await dialog
		.getByRole("textbox", { exact: true, name: "Name" })
		.fill(keyName);
	await dialog.getByRole("button", { name: "Create Key" }).click();
	await expect(page.getByText("Secret key", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Done" }).click();
	await expect(dialog).toBeHidden();
	return apiKeyRow(page, keyName);
}

export async function createLinkFolder(
	page: Page,
	folderName: string
): Promise<void> {
	await page.getByRole("button", { name: "Folder" }).click();
	await page.getByRole("heading", { name: "Create Folder" }).waitFor();
	await page.getByRole("textbox", { name: "Folder Name" }).fill(folderName);
	await page.getByRole("button", { name: "Create Folder" }).click();
	await page.getByRole("button", { name: escapedText(folderName) }).waitFor();
}

export async function createShortLink(
	page: Page,
	input: {
		folderName?: string;
		name: string;
		slug: string;
		targetUrl: string;
	}
): Promise<Locator> {
	await page.getByRole("button", { name: "New Link" }).click();
	const dialog = page.getByRole("dialog", { name: "Create Link" });
	await dialog.waitFor();
	await dialog
		.getByRole("textbox", { name: "Destination URL" })
		.fill(input.targetUrl);
	await dialog.getByRole("textbox", { name: "Name" }).fill(input.name);
	await dialog
		.getByRole("textbox", { name: SHORT_LINK_LABEL_RE })
		.fill(input.slug);

	if (input.folderName) {
		await dialog.getByRole("button", { name: "Folder: Unfiled" }).click();
		await page.getByRole("menuitem", { name: input.folderName }).click();
	}

	await dialog.getByRole("button", { name: "Create Link" }).click();
	return linkRow(page, input.name);
}

export async function openLinkActions(page: Page, name: string): Promise<void> {
	await linkRow(page, name).hover();
	await page.getByRole("button", { name: `Actions for ${name}` }).click();
}
