import type { Page } from "@playwright/test";
import { expect, test } from "@/test/e2e/fixtures";
import {
	apiKeyRow,
	createApiKey,
	createOrganization,
	createShortLink,
	createWebsite,
	expectDashboardReady,
	idFromPath,
	linkRow,
	scopeSuffix,
	switchOrganization,
	websiteCard,
} from "@/test/e2e/utils/dashboard";

const SEEDED_WEBSITE_NAME = "E2E Website";
const WEBSITE_PATH_RE = /\/websites\/[A-Za-z0-9_-]+/;
const LINK_PATH_RE = /\/links\/[A-Za-z0-9_-]+/;

function assets(label: "Primary" | "Secondary", suffix: string) {
	const token = label.toLowerCase();
	return {
		apiKeyName: `${label} API Key ${suffix}`,
		link: {
			name: `${label} Link ${suffix}`,
			slug: `${token}-link-${suffix}`,
			targetUrl: `${token}-link-${suffix}.local/start`,
		},
		name: `E2E ${label} ${suffix}`,
		slug: `e2e-${token}-${suffix}`,
		website: {
			domain: `${token}-${suffix}.local`,
			name: `${label} Website ${suffix}`,
		},
	};
}

async function expectOnlyVisible(
	page: Page,
	visible: ReturnType<typeof assets>,
	hidden: ReturnType<typeof assets>,
	seededWebsiteVisible: boolean
): Promise<void> {
	await page.goto("/websites");
	await expect(websiteCard(page, visible.website.name)).toBeVisible();
	await expect(websiteCard(page, hidden.website.name)).toBeHidden();
	await expect(websiteCard(page, SEEDED_WEBSITE_NAME)).toHaveCount(
		seededWebsiteVisible ? 1 : 0
	);
	await page.goto("/links");
	await expect(linkRow(page, visible.link.name)).toBeVisible();
	await expect(linkRow(page, hidden.link.name)).toBeHidden();
	await page.goto("/organizations/settings");
	await expect(apiKeyRow(page, visible.apiKeyName)).toBeVisible();
	await expect(apiKeyRow(page, hidden.apiKeyName)).toBeHidden();
}

test("isolates websites, links, and API keys between organizations", {
	tag: "@core",
}, async ({ authenticatedPage: page, e2eSession }) => {
	const suffix = scopeSuffix(e2eSession);
	const primary = assets("Primary", suffix);
	const secondary = assets("Secondary", suffix);

	await page.goto("/websites");
	await expectDashboardReady(page);
	await expect(websiteCard(page, SEEDED_WEBSITE_NAME)).toBeVisible();
	await (await createWebsite(page, primary.website)).click();
	await expect(page).toHaveURL(WEBSITE_PATH_RE);
	const primaryWebsiteId = idFromPath(page.url(), "websites");
	await page.goto("/links");
	await (await createShortLink(page, primary.link)).click();
	await expect(page).toHaveURL(LINK_PATH_RE);
	const primaryLinkId = idFromPath(page.url(), "links");
	await page.goto("/organizations/settings");
	await expect(await createApiKey(page, primary.apiKeyName)).toBeVisible();

	await createOrganization(page, {
		name: secondary.name,
		slug: secondary.slug,
	});
	await page.goto("/websites");
	await expect(websiteCard(page, SEEDED_WEBSITE_NAME)).toBeHidden();
	await expect(await createWebsite(page, secondary.website)).toBeVisible();
	await page.goto("/links");
	await expect(await createShortLink(page, secondary.link)).toBeVisible();
	await page.goto("/organizations/settings");
	await expect(await createApiKey(page, secondary.apiKeyName)).toBeVisible();
	await expectOnlyVisible(page, secondary, primary, false);

	for (const path of [
		`/websites/${primaryWebsiteId}`,
		`/links/${primaryLinkId}`,
	]) {
		await page.goto(path);
		await expect(
			page.getByRole("heading", { name: "Resource unavailable" })
		).toBeVisible();
		await expect(page.getByText("current organization")).toBeVisible();
	}

	await switchOrganization(page, e2eSession.organizationName);
	await expectOnlyVisible(page, primary, secondary, true);
	await switchOrganization(page, secondary.name);
	await expectOnlyVisible(page, secondary, primary, false);
});
