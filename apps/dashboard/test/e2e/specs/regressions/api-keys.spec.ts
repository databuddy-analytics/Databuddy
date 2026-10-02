import { expect, test } from "@/test/e2e/fixtures";
import {
	apiKeyRow,
	createApiKey,
	scopeSuffix,
} from "@/test/e2e/utils/dashboard";

test("creates and deletes an API key without leaving confirmation dialogs open", {
	tag: ["@regression", "@core"],
}, async ({ authenticatedPage: page, e2eSession }) => {
	const keyName = `E2E key ${scopeSuffix(e2eSession)}`;

	await page.goto("/organizations/settings");
	await expect(await createApiKey(page, keyName)).toBeVisible();
	await apiKeyRow(page, keyName).click();
	await expect(page.getByRole("heading", { name: keyName })).toBeVisible();

	await page.getByRole("button", { name: "Destructive actions" }).click();
	await page.getByRole("button", { name: "Delete" }).click();
	const confirm = page.getByRole("dialog", { name: "Delete API Key?" });
	await confirm.getByRole("button", { name: "Delete" }).click();
	await expect(confirm).toBeHidden();
	await expect(page.getByRole("heading", { name: keyName })).toBeHidden();
	await expect(apiKeyRow(page, keyName)).toBeHidden();
});
