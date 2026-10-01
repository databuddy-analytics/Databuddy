import { expect, test } from "@/test/e2e/fixtures";

test("approves only selected MCP access and resets websites when changing organizations", {
	tag: "@regression",
}, async ({ page, baseURL }) => {
	const scopes = "openid profile offline_access read:data manage:flags";
	const oauthQuery = new URLSearchParams({
		client_id: "https://example.com/mcp-client.json",
		redirect_uri: "https://example.com/callback",
		scope: scopes,
	});
	const consentBodies: unknown[] = [];
	await page.route("**/api/auth/get-session**", (route) =>
		route.fulfill({ json: null })
	);
	await page.route("**/api/auth/oauth2/public-client?*", (route) =>
		route.fulfill({ json: { name: "Example MCP client" } })
	);
	await page.route("**/api/auth/organization/list*", (route) =>
		route.fulfill({
			json: [
				{ id: "example-org-one", name: "Example Org One" },
				{ id: "example-org-two", name: "Example Org Two" },
			],
		})
	);
	await page.route("**/rpc/websites/list", (route) =>
		route.fulfill({
			json: {
				json: [
					{ id: "example-site", name: "Example Site", domain: "example.com" },
				],
			},
		})
	);
	await page.route("**/api/auth/oauth2/consent", async (route) => {
		consentBodies.push(route.request().postDataJSON());
		await route.fulfill({
			status: 400,
			json: { message: "Synthetic consent error" },
		});
	});

	// The auth proxy checks cookie presence before browser request mocks run.
	await page.context().addCookies([
		{
			name: "databuddy-dev.session_token",
			value: "synthetic-consent-session",
			url: baseURL ?? "http://localhost:3000",
		},
	]);
	await page.goto(`/consent?${oauthQuery}`);
	const allow = page.getByRole("button", { name: "Allow access" });
	await expect(allow).toBeDisabled();
	await expect(page.getByRole("checkbox", { name: "Read Data" })).toBeChecked();
	await expect(
		page.getByRole("checkbox", { name: "Manage Flags" })
	).not.toBeChecked();
	await expect(
		page.getByText("Your name and email address", { exact: true })
	).toBeVisible();
	await expect(
		page.getByText("Stay connected until you disconnect it", { exact: true })
	).toBeVisible();

	await page.getByLabel("Organization", { exact: true }).click();
	await page
		.getByRole("menuitemradio", { name: "Example Org One", exact: true })
		.click();
	await expect(allow).toBeEnabled();
	await page.getByText("Choose websites", { exact: true }).click();
	await expect(allow).toBeDisabled();
	await page
		.getByRole("checkbox", { name: "Example Site", exact: true })
		.check();
	await allow.click();
	await expect(allow).toBeEnabled();
	expect(consentBodies[0]).toEqual({
		accept: true,
		oauth_query: oauthQuery.toString(),
		organizationId: "example-org-one",
		websiteIds: ["example-site"],
		scope: "openid profile offline_access read:data",
	});

	await page.getByLabel("Organization", { exact: true }).click();
	await page
		.getByRole("menuitemradio", { name: "Example Org Two", exact: true })
		.click();
	await expect(
		page.getByRole("radio", { name: "All websites", exact: true })
	).toBeChecked();
	await page.getByRole("checkbox", { name: "Manage Flags" }).check();
	await expect(allow).toBeEnabled();
	await allow.click();
	await expect(allow).toBeEnabled();
	expect(consentBodies[1]).toEqual({
		accept: true,
		oauth_query: oauthQuery.toString(),
		organizationId: "example-org-two",
		websiteIds: null,
		scope: "openid profile offline_access read:data manage:flags",
	});

	await page.getByRole("button", { name: "Deny", exact: true }).click();
	await expect(allow).toBeEnabled();
	expect(consentBodies[2]).toEqual({
		accept: false,
		oauth_query: oauthQuery.toString(),
	});
});
