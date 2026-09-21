import { expect, test } from "@/test/e2e/fixtures";

for (const aiConfigured of [false, true]) {
	for (const capabilityState of ["ready", "delayed", "failed"]) {
		test(`finishes verified onboarding with AI ${aiConfigured}, capability ${capabilityState}`, {
			tag: "@regression",
		}, async ({ authenticatedPage: page, e2eSession }) => {
			let releaseCapability: (() => void) | undefined;
			const capabilityReady = new Promise<void>((resolve) => {
				releaseCapability = resolve;
			});
			let failed = false;
			await page.route(
				/\/rpc\/(organizations\/getBillingContext|websites\/isTrackingSetup)/,
				async (route) => {
					const tracking = route.request().url().includes("isTrackingSetup");
					if (!tracking && capabilityState === "delayed") {
						await capabilityReady;
					}
					const fail = !tracking && capabilityState === "failed" && !failed;
					failed ||= fail;
					await route.fulfill({
						status: fail ? 503 : 200,
						json: {
							json: tracking ? { tracking_setup: true } : { aiConfigured },
						},
						headers: {
							"access-control-allow-origin": new URL(page.url()).origin,
							"access-control-allow-credentials": "true",
							"access-control-allow-headers": "content-type,x-e2e-test-key",
							"access-control-allow-methods": "GET,POST,OPTIONS",
						},
					});
				}
			);
			await page.goto("/onboarding");
			await expect(page).toHaveURL(/step=team$/);
			await page.getByRole("button", { name: "Continue", exact: true }).click();
			await expect(
				page.getByText("Tracking verified", { exact: true })
			).toBeVisible();

			const selfHosted = process.env.SELFHOST?.trim().toLowerCase() === "true";
			try {
				if (selfHosted && capabilityState === "delayed") {
					await expect(
						page.getByRole("heading", { name: "Checking Insights" })
					).toBeVisible();
					await expect(
						page.getByRole("button", { name: "Checking Insights" })
					).toBeDisabled();
					await expect(
						page.getByRole("heading", { name: "You're all set" })
					).toHaveCount(0);
					await expect(page).toHaveURL(/step=explore$/);
				}
			} finally {
				releaseCapability?.();
			}

			if (selfHosted && capabilityState === "failed") {
				await expect(
					page.getByText(
						"We couldn't check Insights. Try again, or open your analytics below."
					)
				).toBeVisible();
				await expect(
					page.getByRole("heading", { name: "You're all set" })
				).toHaveCount(0);
				await expect(
					page.getByRole("button", { name: "Go to dashboard" })
				).toBeEnabled();
				if (!aiConfigured) {
					await page.getByRole("button", { name: "Go to dashboard" }).click();
					await expect(page).toHaveURL(
						`${new URL(page.url()).origin}/websites/${e2eSession.websiteId}`
					);
					return;
				}
				await page.getByRole("button", { name: "Try again" }).click();
			}

			const opensInsights = !selfHosted || aiConfigured;
			await expect(
				page.getByRole("heading", {
					name: opensInsights
						? "Your first review is set up"
						: "You're all set",
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
}
