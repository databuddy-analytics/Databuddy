import { expect, test } from "@/test/e2e/fixtures";
import { apiKeyRow, scopeSuffix } from "@/test/e2e/utils/dashboard";

const CREATE_KEY_RE = /Create (your first )?key/i;
const API_URL = `http://localhost:${process.env.DATABUDDY_E2E_API_PORT ?? 3001}`;

test("creates an API key that authenticates, then deletes it and the key stops working", {
	tag: ["@regression", "@core"],
}, async ({ authenticatedPage: page, e2eSession, request }) => {
	const keyName = `E2E key ${scopeSuffix(e2eSession)}`;

	await page.goto("/organizations/settings");
	await page.getByRole("button", { name: CREATE_KEY_RE }).first().click();
	const dialog = page.getByRole("dialog", { name: "Create API Key" });
	await dialog
		.getByRole("textbox", { exact: true, name: "Name" })
		.fill(keyName);
	await dialog.getByRole("button", { name: "Create API key" }).click();
	await expect(dialog.getByText("Secret key", { exact: true })).toBeVisible();
	const secret = (await dialog.locator("code").innerText()).trim();
	await dialog.getByRole("button", { name: "Done" }).click();
	await expect(dialog).toBeHidden();

	const listWebsites = () =>
		request.post(`${API_URL}/websites/list`, {
			data: {},
			headers: { "x-api-key": secret },
		});
	const authorized = await listWebsites();
	expect(authorized.status()).toBe(200);
	expect(JSON.stringify(await authorized.json())).toContain("E2E Website");

	await apiKeyRow(page, keyName).click();
	await expect(page.getByRole("heading", { name: keyName })).toBeVisible();
	await page.getByRole("button", { name: "Destructive actions" }).click();
	await page.getByRole("button", { name: "Delete" }).click();
	const confirm = page.getByRole("dialog", { name: "Delete API key" });
	await confirm.getByRole("button", { name: "Delete" }).click();
	await expect(confirm).toBeHidden();
	await expect(apiKeyRow(page, keyName)).toBeHidden();
	expect((await listWebsites()).status()).toBe(401);
});
