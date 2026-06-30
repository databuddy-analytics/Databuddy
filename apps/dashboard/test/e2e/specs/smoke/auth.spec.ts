import { expect, test } from "@/test/e2e/fixtures";

test(
	"redirects unauthenticated visitors to sign in",
	{ tag: "@smoke" },
	async ({ page }) => {
		await page.goto("/settings/account");
		await expect(page).toHaveURL(/sign-in|login|auth/);
	}
);

test(
	"boots an authenticated browser session",
	{ tag: "@smoke" },
	async ({ authenticatedPage, e2eSession }) => {
		await authenticatedPage.goto("/settings/account");

		await expect(
			authenticatedPage.getByRole("heading", { name: "Basic Information" })
		).toBeVisible();
		await expect(authenticatedPage.locator('input[type="email"]')).toHaveValue(
			e2eSession.email
		);
		await expect(authenticatedPage.getByPlaceholder("Your name…")).toHaveValue(
			e2eSession.name
		);
	}
);

test(
	"signs out and protects authenticated routes",
	{ tag: ["@smoke", "@core"] },
	async ({ authenticatedPage }) => {
		await authenticatedPage.goto("/settings/account");
		await expect(
			authenticatedPage.getByRole("heading", { name: "Basic Information" })
		).toBeVisible();

		await authenticatedPage.getByLabel("Account", { exact: true }).click();
		await authenticatedPage.getByRole("menuitem", { name: "Sign out" }).click();
		await expect(authenticatedPage).toHaveURL(/login|sign-in|auth/);

		await authenticatedPage.goto("/settings/account");
		await expect(authenticatedPage).toHaveURL(/login|sign-in|auth/);
	}
);
