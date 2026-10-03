import {
	expect,
	fulfillRpc,
	test,
	TRACKING_VERIFIED,
} from "@/test/e2e/fixtures";

const selfHosted = process.env.SELFHOST?.trim().toLowerCase() === "true";
const CAPABILITY_STALE_MS = 180_000;

const cases = selfHosted
	? (["ready", "delayed", "failed", "cached-failed"] as const).flatMap(
			(capability) =>
				[false, true].map((aiConfigured) => ({ aiConfigured, capability }))
		)
	: [{ aiConfigured: false, capability: "ready" as const }];

for (const { aiConfigured, capability } of cases) {
	test(`finishes verified onboarding with AI ${aiConfigured}, capability ${capability}`, {
		tag: ["@regression", "@selfhost"],
	}, async ({ authenticatedPage: page, e2eSession, mockRpc }) => {
		const hasFailure =
			capability === "failed" || capability === "cached-failed";
		const failureAttempt = capability === "cached-failed" ? 2 : 1;
		const gate = {
			capability: Promise.withResolvers<void>(),
			retry: Promise.withResolvers<void>(),
		};
		let attempt = 0;
		await mockRpc("websites/isTrackingSetup", TRACKING_VERIFIED);
		await page.route(
			"**/rpc/organizations/getBillingContext",
			async (route) => {
				if (capability === "delayed") {
					await gate.capability.promise;
				}
				attempt += 1;
				if (hasFailure && attempt > failureAttempt) {
					await gate.retry.promise;
				}
				await fulfillRpc(
					page,
					route,
					{ aiConfigured },
					hasFailure && attempt === failureAttempt ? 503 : 200
				);
			}
		);

		await page.goto("/onboarding");
		await expect(
			page.getByText("Tracking verified", { exact: true })
		).toBeVisible();
		const open = page.getByRole("button", {
			name: aiConfigured && selfHosted ? "Open Insights" : "Open dashboard",
			exact: true,
		});

		if (capability === "delayed") {
			await expect(
				page.getByRole("button", { name: "Checking Insights" })
			).toBeDisabled();
			gate.capability.resolve();
		}
		if (capability === "cached-failed") {
			await expect(open).toBeEnabled();
			await page.clock.setFixedTime(new Date(Date.now() + CAPABILITY_STALE_MS));
			await page.evaluate(() => {
				window.dispatchEvent(new Event("offline"));
				window.dispatchEvent(new Event("online"));
			});
		}
		if (hasFailure) {
			await expect(page.getByText("We couldn't check Insights.")).toBeVisible();
			if (!aiConfigured) {
				await page.getByRole("button", { name: "Open dashboard" }).click();
				await expect(page).toHaveURL(
					`${new URL(page.url()).origin}/websites/${e2eSession.websiteId}`
				);
				return;
			}
			await page.getByRole("button", { name: "Try again" }).click();
			await expect(
				page.getByRole("button", { name: "Checking Insights" })
			).toBeDisabled();
			gate.retry.resolve();
		}

		await open.click();
		await expect(page).toHaveURL(
			`${new URL(page.url()).origin}${
				aiConfigured && selfHosted
					? `/insights?firstReview=${e2eSession.websiteId}`
					: `/websites/${e2eSession.websiteId}`
			}`
		);
	});
}
