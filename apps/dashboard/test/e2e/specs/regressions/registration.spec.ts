import { expect, test } from "@/test/e2e/fixtures";

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
