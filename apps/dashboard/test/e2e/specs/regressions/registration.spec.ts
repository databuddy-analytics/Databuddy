import { expect, test } from "@/test/e2e/fixtures";

const selfHosted = process.env.SELFHOST?.trim().toLowerCase() === "true";
const verifyEmail =
	!selfHosted ||
	process.env.REQUIRE_EMAIL_VERIFICATION?.trim().toLowerCase() === "true";
// The Playwright web server supplies synthetic credentials when omitted.
const emailEnabled =
	!selfHosted || Boolean(process.env.RESEND_API_KEY ?? "e2e");
const githubEnabled =
	!selfHosted ||
	Boolean(
		(process.env.GITHUB_CLIENT_ID ?? "e2e") &&
			(process.env.GITHUB_CLIENT_SECRET ?? "e2e")
	);
const googleEnabled =
	!selfHosted ||
	Boolean(
		(process.env.GOOGLE_CLIENT_ID ?? "e2e") &&
			(process.env.GOOGLE_CLIENT_SECRET ?? "e2e")
	);

test.beforeEach(async ({ page }) => {
	await page.route("**/api/auth/get-session**", (route) =>
		route.fulfill({ json: null })
	);
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

	await expect(
		page.getByRole("heading", {
			name: verifyEmail ? "Verify your email" : "Account created",
		})
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Resend verification email" })
	).toHaveCount(emailEnabled && verifyEmail ? 1 : 0);
	const signIn = page.getByRole("link", { name: "Sign in", exact: true });
	if (selfHosted) {
		await expect(signIn).toBeVisible();
	} else {
		await expect(signIn).toHaveCount(0);
		await expect(page.getByText(/check your spam folder/)).toBeVisible();
	}
});

test("shows only configured self-host sign-in methods", {
	tag: "@regression",
}, async ({ page }) => {
	await page.goto("/login");
	await expect(
		page.getByRole("button", { name: "Sign in with GitHub" })
	).toHaveCount(githubEnabled ? 1 : 0);
	await expect(
		page.getByRole("button", { name: "Sign in with Google" })
	).toHaveCount(googleEnabled ? 1 : 0);
	await expect(
		page.getByRole("link", { name: "Sign in with Magic Link" })
	).toHaveCount(emailEnabled ? 1 : 0);
	await expect(
		page.getByRole("link", { name: "Forgot password?" })
	).toHaveCount(emailEnabled ? 1 : 0);
	await expect(
		page.getByRole("button", { name: "Sign in", exact: true })
	).toBeVisible();
	await page.goto("/register");
	await expect(
		page.getByRole("button", { name: "Sign up with GitHub" })
	).toHaveCount(githubEnabled ? 1 : 0);
	await expect(
		page.getByRole("button", { name: "Sign up with Google" })
	).toHaveCount(googleEnabled ? 1 : 0);
});

for (const route of ["magic", "magic-sent", "forgot", "verification-needed"]) {
	test(`explains unavailable email on /login/${route}`, {
		tag: "@regression",
	}, async ({ page }) => {
		test.skip(emailEnabled, "Email is configured for this deployment.");
		await page.goto(`/login/${route}?callback=%2Fwebsites`);
		await expect(
			page.getByRole("heading", { name: "Email isn't set up" })
		).toBeVisible();
		await expect(page.locator("form")).toHaveCount(0);
		await expect(
			page.getByRole("link", { name: "Back to sign in" })
		).toHaveAttribute("href", "/login?callback=%2Fwebsites");
	});
}
