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

interface OrganizationAssets {
	apiKeyName: string;
	link: { name: string; slug: string; targetUrl: string };
	name: string;
	slug: string;
	website: { domain: string; name: string };
}

function organizationAssets(label: "Primary" | "Secondary", suffix: string) {
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
	} satisfies OrganizationAssets;
}

async function expectScopedWebsitesAndLinks(
	page: Page,
	visible: OrganizationAssets,
	hidden: OrganizationAssets,
	options: { seededWebsiteVisible: boolean }
): Promise<void> {
	await page.goto("/websites");
	await expect(websiteCard(page, visible.website.name)).toBeVisible();
	await expect(page.getByText(visible.website.domain)).toBeVisible();
	await expect(websiteCard(page, hidden.website.name)).toBeHidden();
	await expect(page.getByText(hidden.website.domain)).toBeHidden();
	if (options.seededWebsiteVisible) {
		await expect(websiteCard(page, SEEDED_WEBSITE_NAME)).toBeVisible();
	} else {
		await expect(websiteCard(page, SEEDED_WEBSITE_NAME)).toBeHidden();
	}

	await page.goto("/links");
	await expect(linkRow(page, visible.link.name)).toBeVisible();
	await expect(linkRow(page, hidden.link.name)).toBeHidden();
}

async function expectScopedApiKeys(
	page: Page,
	visibleName: string,
	hiddenName: string
): Promise<void> {
	await page.goto("/organizations/settings");
	await expect(apiKeyRow(page, visibleName)).toBeVisible();
	await expect(apiKeyRow(page, hiddenName)).toBeHidden();
}

test(
	"isolates websites and links between organizations",
	{ tag: "@core" },
	async ({ authenticatedPage, e2eSession }) => {
		const suffix = scopeSuffix(e2eSession);
		const primary = organizationAssets("Primary", suffix);
		const secondary = organizationAssets("Secondary", suffix);

		await authenticatedPage.goto("/websites");
		await expectDashboardReady(authenticatedPage);
		await expect(websiteCard(authenticatedPage, SEEDED_WEBSITE_NAME)).toBeVisible();
		const primaryWebsiteCard = await createWebsite(
			authenticatedPage,
			primary.website
		);
		await expect(primaryWebsiteCard).toBeVisible();
		await primaryWebsiteCard.click();
		await expect(authenticatedPage).toHaveURL(/\/websites\/[A-Za-z0-9_-]+/);
		const primaryWebsiteId = idFromPath(authenticatedPage.url(), "websites");

		await authenticatedPage.goto("/links");
		const primaryLinkRow = await createShortLink(authenticatedPage, primary.link);
		await expect(primaryLinkRow).toBeVisible();
		await primaryLinkRow.click();
		await expect(authenticatedPage).toHaveURL(/\/links\/[A-Za-z0-9_-]+/);
		const primaryLinkId = idFromPath(authenticatedPage.url(), "links");

		await createOrganization(authenticatedPage, {
			name: secondary.name,
			slug: secondary.slug,
		});

		await authenticatedPage.goto("/websites");
		await expect(websiteCard(authenticatedPage, primary.website.name)).toBeHidden();
		await expect(websiteCard(authenticatedPage, SEEDED_WEBSITE_NAME)).toBeHidden();
		await expect(authenticatedPage.getByText(primary.website.domain)).toBeHidden();
		await expect(
			await createWebsite(authenticatedPage, secondary.website)
		).toBeVisible();

		await authenticatedPage.goto("/links");
		await expect(linkRow(authenticatedPage, primary.link.name)).toBeHidden();
		await expect(
			await createShortLink(authenticatedPage, secondary.link)
		).toBeVisible();
		await expectScopedWebsitesAndLinks(authenticatedPage, secondary, primary, {
			seededWebsiteVisible: false,
		});

		await authenticatedPage.goto(`/websites/${primaryWebsiteId}`);
		await expect(
			authenticatedPage.getByRole("heading", {
				name: "Resource unavailable",
			})
		).toBeVisible();
		await expect(
			authenticatedPage.getByText("current workspace")
		).toBeVisible();
		await expect(authenticatedPage.getByText(primary.website.domain)).toBeHidden();
		await authenticatedPage.goto(`/links/${primaryLinkId}`);
		await expect(
			authenticatedPage.getByRole("heading", {
				name: "Resource unavailable",
			})
		).toBeVisible();
		await expect(
			authenticatedPage.getByText("current workspace")
		).toBeVisible();
		await expect(linkRow(authenticatedPage, primary.link.name)).toBeHidden();

		await switchOrganization(authenticatedPage, e2eSession.organizationName);
		await expectScopedWebsitesAndLinks(authenticatedPage, primary, secondary, {
			seededWebsiteVisible: true,
		});

		await switchOrganization(authenticatedPage, secondary.name);
		await expectScopedWebsitesAndLinks(authenticatedPage, secondary, primary, {
			seededWebsiteVisible: false,
		});
	}
);

test(
	"isolates organization API keys between organizations",
	{ tag: "@core" },
	async ({ authenticatedPage, e2eSession }) => {
		const suffix = scopeSuffix(e2eSession);
		const primary = organizationAssets("Primary", suffix);
		const secondary = organizationAssets("Secondary", suffix);

		await authenticatedPage.goto("/organizations/settings");
		await expect(
			await createApiKey(authenticatedPage, primary.apiKeyName)
		).toBeVisible();

		await createOrganization(authenticatedPage, {
			name: secondary.name,
			slug: secondary.slug,
		});

		await authenticatedPage.goto("/organizations/settings");
		await expect(apiKeyRow(authenticatedPage, primary.apiKeyName)).toBeHidden();
		await expect(
			await createApiKey(authenticatedPage, secondary.apiKeyName)
		).toBeVisible();

		await switchOrganization(authenticatedPage, e2eSession.organizationName);
		await expectScopedApiKeys(
			authenticatedPage,
			primary.apiKeyName,
			secondary.apiKeyName
		);

		await switchOrganization(authenticatedPage, secondary.name);
		await expectScopedApiKeys(
			authenticatedPage,
			secondary.apiKeyName,
			primary.apiKeyName
		);
	}
);
