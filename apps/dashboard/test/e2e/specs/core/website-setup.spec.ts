import { expect, test, TRACKING_VERIFIED } from "@/test/e2e/fixtures";
import {
	expectDashboardReady,
	idFromPath,
	scopeSuffix,
	WEBSITE_PATH_RE,
} from "@/test/e2e/utils/dashboard";

const GATE_TITLE = "No events yet. Two steps to your dashboard.";

test("gates a new website behind setup until its first page view", {
	tag: "@core",
}, async ({ authenticatedPage: page, e2eSession, mockRpc }) => {
	const suffix = scopeSuffix(e2eSession);
	await mockRpc("businessContext/generationAccess", {
		status: "not-configured",
		message: "AI draft generation is not configured.",
		action: "contact-admin",
	});

	await page.goto("/websites");
	await expectDashboardReady(page);
	await page.getByRole("button", { name: "New Website" }).click();
	const dialog = page.getByRole("dialog", { name: "Create website" });
	await dialog.getByRole("textbox", { name: "Name" }).fill(`Gate ${suffix}`);
	await dialog
		.getByRole("textbox", { name: "Domain" })
		.fill(`gate-${suffix}.local`);
	await dialog.getByRole("button", { name: "Create website" }).click();

	await expect(page).toHaveURL(WEBSITE_PATH_RE, { timeout: 15_000 });
	const websiteId = idFromPath(page.url(), "websites");
	await expect(page.getByText(GATE_TITLE)).toBeVisible();
	await expect(page.getByText("Connect your app")).toBeVisible();
	await expect(
		page.getByText("First page view", { exact: true })
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Cursor" })).toBeVisible();
	await page.getByRole("button", { name: "Or install it yourself" }).click();
	await expect(page.getByRole("tab", { name: "Script tag" })).toBeVisible();
	await expect(page.getByText(`data-client-id="${websiteId}"`)).toBeVisible();

	await page.getByRole("link", { name: "All install options" }).click();
	await expect(page).toHaveURL(/\/settings\/tracking$/);
	await expect(
		page.getByRole("heading", { name: "Install it yourself" })
	).toBeVisible();

	await mockRpc("websites/isTrackingSetup", TRACKING_VERIFIED);
	await page.goto(`/websites/${websiteId}`);
	await expect(
		page.getByRole("toolbar", { name: "Dashboard top bar" })
	).toBeVisible();
	await expect(page.getByText(GATE_TITLE)).toHaveCount(0);
});
