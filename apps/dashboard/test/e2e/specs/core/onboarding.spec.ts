import { expect, test } from "@/test/e2e/fixtures";
import { scopeSuffix } from "@/test/e2e/utils/dashboard";

const WEBSITE_PATH_RE = /\/websites\/[A-Za-z0-9_-]+\/goals$/;
const NO_AI = {
	status: "not-configured",
	message: "AI draft generation is not configured.",
	action: "contact-admin",
};

test.use({ withWebsite: false });

test("sets up a fresh account from the onboarding checklist", {
	tag: "@core",
}, async ({ authenticatedPage: page, e2eSession, mockRpc }) => {
	const suffix = scopeSuffix(e2eSession);
	const name = `Onboard ${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`;
	await mockRpc("businessContext/generationAccess", NO_AI);

	await page.goto("/onboarding");
	await expect(
		page.getByRole("heading", { name: "Set up Databuddy" })
	).toBeVisible();

	const domain = page.getByRole("textbox", { name: "Domain" });
	await domain.fill(`https://www.onboard-${suffix}.local/pricing?utm=e2e`);
	await expect(domain).toHaveValue(`onboard-${suffix}.local`);
	await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue(name);
	await page.getByRole("button", { name: "Create website" }).click();

	await expect(
		page.getByRole("heading", { name: `Set up ${name}` })
	).toBeVisible();
	await expect(page.getByText("Not available", { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Claude Code" })).toBeVisible();
	await page.getByRole("button", { name: "Skip for now" }).click();
	await expect(page.getByText("Skipped", { exact: true })).toBeVisible();

	await page.getByRole("button", { name: "Whether they convert" }).click();
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Saved", exact: true })
	).toBeDisabled();

	await page.getByRole("button", { name: "Open dashboard" }).click();
	await expect(page).toHaveURL(WEBSITE_PATH_RE);
});
