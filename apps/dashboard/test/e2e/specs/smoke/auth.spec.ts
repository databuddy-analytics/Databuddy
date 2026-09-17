import { expect, test } from "@/test/e2e/fixtures";

test("redirects unauthenticated visitors to sign in", {
	tag: "@smoke",
}, async ({ page }) => {
	await page.goto("/settings/account");
	await expect(page).toHaveURL(/sign-in|login|auth/);
});

test("boots an authenticated browser session", { tag: "@smoke" }, async ({
	authenticatedPage,
	e2eSession,
}) => {
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
});

test("signs out and protects authenticated routes", {
	tag: ["@smoke", "@core"],
}, async ({ authenticatedPage }) => {
	await authenticatedPage.goto("/settings/account");
	await expect(
		authenticatedPage.getByRole("heading", { name: "Basic Information" })
	).toBeVisible();

	await authenticatedPage.getByLabel("Account", { exact: true }).click();
	await authenticatedPage.getByRole("menuitem", { name: "Sign out" }).click();
	await expect(authenticatedPage).toHaveURL(/login|sign-in|auth/);

	await authenticatedPage.goto("/settings/account");
	await expect(authenticatedPage).toHaveURL(/login|sign-in|auth/);
});

test("keeps registration completion specific to the deployment mode", {
	tag: "@regression",
}, async ({ page }) => {
	await page.route("**/api/auth/sign-up/email", (route) =>
		route.fulfill({
			json: {
				token: null,
				user: {
					id: "synthetic-registration",
					name: "Example User",
					email: "registration@example.com",
					emailVerified: false,
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
				},
			},
		})
	);
	await page.goto("/register");
	await page.getByLabel(/^Full name/).fill("Example User");
	await page.getByLabel(/^Email address/).fill("registration@example.com");
	await page.getByLabel(/^Password/).fill("Example-password-123!");
	await page.getByLabel(/^Confirm password/i).fill("Example-password-123!");
	await page.getByRole("button", { name: "Create account" }).click();

	const selfHosted = process.env.SELFHOST?.trim().toLowerCase() === "true";
	await expect(
		page.getByRole("heading", {
			name: selfHosted ? "Account created" : "Verify your email",
		})
	).toBeVisible();
	const signIn = page.getByRole("link", { name: "Sign in", exact: true });
	if (selfHosted) {
		await expect(signIn).toBeVisible();
	} else {
		await expect(signIn).toHaveCount(0);
		await expect(page.getByText(/check your spam folder/)).toBeVisible();
	}
});
