import { expect, test } from "@/test/e2e/fixtures";
import { apiKeyRow, createApiKey } from "@/test/e2e/utils/dashboard";

test(
	"creates and deletes an API key without leaving confirmation dialogs open",
	{ tag: ["@regression", "@core"] },
	async ({ authenticatedPage, e2eSession }) => {
		const keyName = `E2E key ${e2eSession.userId.slice(0, 8)}`;

		await authenticatedPage.goto("/organizations/settings");
		await expect(await createApiKey(authenticatedPage, keyName)).toBeVisible();
		await apiKeyRow(authenticatedPage, keyName).click();
		await expect(
			authenticatedPage.getByRole("heading", { name: keyName })
		).toBeVisible();

		await authenticatedPage
			.getByRole("button", { name: "Destructive actions" })
			.click();
		await authenticatedPage.getByRole("button", { name: "Delete" }).click();
		await expect(
			authenticatedPage.getByRole("heading", { name: "Delete API Key?" })
		).toBeVisible();
		await authenticatedPage
			.getByRole("dialog")
			.getByRole("button", { name: "Delete" })
			.click();

		await expect(
			authenticatedPage.getByRole("heading", { name: "Delete API Key?" })
		).toBeHidden();
		await expect(
			authenticatedPage.getByRole("heading", { name: keyName })
		).toBeHidden();
		await expect(apiKeyRow(authenticatedPage, keyName)).toBeHidden();
	}
);
