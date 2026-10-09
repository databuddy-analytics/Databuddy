import { expect, test } from "@/test/e2e/fixtures";
import { scopeSuffix } from "@/test/e2e/utils/dashboard";

const MONITOR_PATH_RE = /\/monitors\/[A-Za-z0-9_-]+$/;

test("creates, pauses, and deletes an uptime monitor", {
	tag: "@core",
}, async ({ authenticatedPage: page, e2eSession }) => {
	const suffix = scopeSuffix(e2eSession);
	const name = `Monitor ${suffix}`;
	await page.goto("/monitors");

	await page.getByRole("button", { name: "Start monitoring" }).first().click();
	const sheet = page.getByRole("dialog", { name: "Start monitoring" });
	await sheet.getByPlaceholder("e.g. Production API").fill(name);
	await sheet
		.getByPlaceholder("https://api.example.com/health")
		.fill(`https://monitor-${suffix}.local/health`);
	await sheet.getByRole("button", { name: "Start monitoring" }).click();
	await expect(sheet).toBeHidden();

	await page.getByText(name, { exact: true }).click();
	await expect(page).toHaveURL(MONITOR_PATH_RE);
	await page.getByRole("button", { name: "Pause", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Resume", exact: true })
	).toBeVisible();
	await page.getByRole("button", { name: "Delete monitor" }).click();
	await page
		.getByRole("dialog", { name: "Delete Monitor" })
		.getByRole("button", { name: "Delete" })
		.click();
	await expect(page).toHaveURL(/\/monitors$/);
	await expect(
		page.getByRole("main").getByText(name, { exact: true })
	).toBeHidden();
});
