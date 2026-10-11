import {
	expect,
	fulfillRpc,
	test,
	TRACKING_VERIFIED,
} from "@/test/e2e/fixtures";

test("finishes verified onboarding without waiting on Insights access", {
	tag: ["@regression", "@selfhost"],
}, async ({ authenticatedPage: page, e2eSession, mockRpc }) => {
	const billingContext = Promise.withResolvers<void>();
	await mockRpc("websites/isTrackingSetup", TRACKING_VERIFIED);
	await page.route("**/rpc/organizations/getBillingContext", async (route) => {
		await billingContext.promise;
		await fulfillRpc(page, route, { aiConfigured: true });
	});

	await page.goto("/onboarding?want=analytics");
	await expect(
		page.getByText("Tracking verified", { exact: true })
	).toBeVisible();
	const open = page.getByRole("button", {
		name: "Open dashboard",
		exact: true,
	});
	await expect(open).toBeEnabled();
	billingContext.resolve();

	await open.click();
	await expect(page).toHaveURL(
		`${new URL(page.url()).origin}/websites/${e2eSession.websiteId}`
	);
});
