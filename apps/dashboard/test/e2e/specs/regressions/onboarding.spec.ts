import { expect, test } from "@/test/e2e/fixtures";

for (const aiConfigured of [false, true]) {
	test(`finishes verified onboarding with AI configured: ${aiConfigured}`, {
		tag: "@regression",
	}, async ({ authenticatedPage: page, e2eSession }) => {
		await page.route(
			/\/rpc\/(organizations\/getBillingContext|websites\/isTrackingSetup)/,
			(route) =>
				route.fulfill({
					json: {
						json: route.request().url().includes("isTrackingSetup")
							? { tracking_setup: true }
							: { aiConfigured },
					},
					headers: {
						"access-control-allow-origin": new URL(page.url()).origin,
						"access-control-allow-credentials": "true",
						"access-control-allow-headers": "content-type,x-e2e-test-key",
						"access-control-allow-methods": "GET,POST,OPTIONS",
					},
				})
		);
		await page.goto("/onboarding");
		await expect(page).toHaveURL(/step=team$/);
		await page.getByRole("button", { name: "Continue", exact: true }).click();
		await expect(
			page.getByText("Tracking verified", { exact: true })
		).toBeVisible();

		const selfHosted = process.env.SELFHOST?.trim().toLowerCase() === "true";
		const opensInsights = !selfHosted || aiConfigured;
		await expect(
			page.getByRole("heading", {
				name: opensInsights ? "Your first review is set up" : "You're all set",
			})
		).toBeVisible();
		await page
			.getByRole("button", {
				name: opensInsights ? "Open Insights" : "Go to dashboard",
				exact: true,
			})
			.click();
		await expect(page).toHaveURL(
			`${new URL(page.url()).origin}${opensInsights ? `/insights?firstReview=${e2eSession.websiteId}` : `/websites/${e2eSession.websiteId}`}`
		);
	});
}
