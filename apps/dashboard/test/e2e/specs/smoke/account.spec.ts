import { expect, test } from "@/test/e2e/fixtures";

test(
	"updates the signed-in user's profile name",
	{ tag: "@smoke" },
	async ({ authenticatedPage, e2eSession }) => {
		await authenticatedPage.goto("/settings/account");

		const nameInput = authenticatedPage.getByPlaceholder("Your name…");
		await expect(nameInput).toHaveValue(e2eSession.name);

		const updatedName = `${e2eSession.name} Updated`;
		await nameInput.fill(updatedName);
		await expect(
			authenticatedPage.getByText("You have unsaved changes")
		).toBeVisible();
		await authenticatedPage.getByRole("button", { name: "Save Changes" }).click();

		await expect(
			authenticatedPage.getByText("You have unsaved changes")
		).toBeHidden();
		await authenticatedPage.reload();
		await expect(authenticatedPage.getByPlaceholder("Your name…")).toHaveValue(
			updatedName
		);
	}
);
