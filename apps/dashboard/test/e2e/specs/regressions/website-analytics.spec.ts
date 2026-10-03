import { expect, test } from "@/test/e2e/fixtures";

const count = (value: number) => new Intl.NumberFormat("en-US").format(value);

test("shows seeded analytics, switches range, and applies a filter", {
	tag: ["@regression", "@core"],
}, async ({ authenticatedPage: page, e2eSession, seededAnalytics: seed }) => {
	await page.goto(`/demo/${e2eSession.websiteId}`);

	const topbar = page.getByRole("toolbar", { name: "Dashboard top bar" });
	await expect(topbar.getByRole("radio", { name: "Hourly" })).toBeVisible();
	await topbar.getByRole("button", { name: "7d" }).click();
	await expect(page).toHaveURL(/startDate=/);

	await expect(page.getByText(count(seed.screenViews)).first()).toBeVisible({
		timeout: 20_000,
	});
	const [topPath] = Object.entries(seed.screenViewsByPath).sort(
		([, a], [, b]) => b - a
	)[0] ?? ["/"];
	await expect(page.getByText(topPath).first()).toBeVisible();

	await topbar.getByRole("button", { name: "Filter" }).click();
	const filter = page.getByRole("dialog", { name: "Add Filter" });
	await filter.getByPlaceholder("Search fields…").fill("Country");
	await filter.getByText("Country", { exact: true }).click();
	await filter.getByPlaceholder("Enter country…").fill("US");
	await filter.getByRole("button", { exact: true, name: "Add filter" }).click();
	await expect(filter).toBeHidden();

	const main = page.getByRole("main");
	await expect(
		main.getByRole("group", { name: "Country = US filter" })
	).toBeVisible();
	await expect(
		main.getByText(count(seed.screenViewsByCountry.US ?? 0)).first()
	).toBeVisible({ timeout: 20_000 });

	await page.goto(`/websites/${e2eSession.websiteId}/audience`);
	await expect(topbar.getByRole("button", { name: "Filter" })).toBeEnabled();
	await expect(
		page.getByRole("heading", { name: "Geographic Distribution" })
	).toBeVisible();
	await expect(main.getByText("United States").first()).toBeVisible({
		timeout: 20_000,
	});
});
