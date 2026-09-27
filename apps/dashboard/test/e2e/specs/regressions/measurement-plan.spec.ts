import { expect, test } from "@/test/e2e/fixtures";

test.beforeEach(async ({ page }) => {
	await page.route("**/rpc/businessContext/generationAccess", (route) =>
		route.fulfill({
			json: {
				json: {
					status: "allowed",
					billingMode: "fixed",
					message: "Generate a business brief.",
					action: "generate",
				},
			},
		})
	);
});

test("saves activation definitions through oRPC, recovers unfinished edits, and restores history", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	await page.goto("/organizations/settings/business-context");
	await page.getByRole("button", { name: /^Add definition for/ }).click();
	const outcome = page.getByRole("textbox", {
		name: "Business outcome",
		exact: true,
	});
	const activation = page.getByRole("combobox", {
		name: "Activation event",
		exact: true,
	});
	const returning = page.getByRole("combobox", {
		name: "Return event",
		exact: true,
	});
	await outcome.fill("Reports shared again");
	await expect(
		page.getByRole("button", { name: "Save changes", exact: true })
	).toBeDisabled();
	await page.reload();
	await expect(outcome).toHaveValue("Reports shared again");
	await activation.fill("report_shared");
	await returning.fill("report_opened");
	await returning.press("Escape");
	const saved = page.waitForResponse((response) =>
		response.url().endsWith("/rpc/businessContext/save")
	);
	await page.getByRole("button", { name: "Save changes", exact: true }).click();
	expect((await saved).ok()).toBe(true);
	await expect(page.getByText("Changes saved", { exact: true })).toBeVisible();
	await page.reload();
	await expect(activation).toHaveValue("report_shared");
	await expect(returning).toHaveValue("report_opened");
	await page.getByRole("button", { name: "Return window: 7 days" }).click();
	await page
		.getByRole("menuitemradio", { name: "30 days", exact: true })
		.click();
	await page.getByRole("button", { name: "Save changes", exact: true }).click();
	await expect(page.getByText("Changes saved", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "History", exact: true }).click();
	await page
		.getByRole("menuitem")
		.filter({ hasText: /^Version/ })
		.first()
		.click();
	const review = page.getByRole("region", { name: /^Review version/ });
	await expect(
		review.getByRole("heading", { name: "Current version", exact: true })
	).toBeVisible();
	await expect(
		review.getByRole("heading", { name: "Proposed version", exact: true })
	).toBeVisible();
	await expect(review).toContainText("within 7 days");
	await expect(review).toContainText("within 30 days");
	await expect(review.locator("ins, del")).toHaveCount(0);
	await page
		.getByRole("button", { name: "Restore this version", exact: true })
		.click();
	await expect(
		page.getByText("Version restored", { exact: true })
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Return window: 7 days" })
	).toBeVisible();
	await page.getByRole("button", { name: /^Remove definition for/ }).click();
	await page.getByRole("button", { name: "Save changes", exact: true }).click();
	await expect(page.getByText("Changes saved", { exact: true })).toBeVisible();
	await page.reload();
	await expect(
		page.getByRole("button", { name: /^Add definition for/ })
	).toBeVisible();
});

test("keeps measurement inputs and their geometry stable while saving", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	let current = {
		canEdit: true,
		websites: [{ id: "example-site", name: "Example", domain: "example.com" }],
		profile: {
			content: "Example makes scheduling software.",
			origin: "team",
			sources: [],
			revision: 1,
			updatedAt: "2026-09-08T12:00:00Z",
			updatedBy: "example-admin",
			sourceWebsiteId: "example-site",
			measurementPlans: [
				{
					websiteId: "example-site",
					domain: "example.com",
					name: "Repeat bookings",
					activationEvent: "booking_completed",
					returnEvent: "booking_completed",
					horizonDays: 7,
				},
			],
		},
		generation: null,
	};
	let release: () => void = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/rpc/autocomplete/get", (route) =>
		route.fulfill({ json: { json: { customEvents: ["booking_completed"] } } })
	);
	await page.route("**/rpc/businessContext/**", async (route) => {
		const method = new URL(route.request().url()).pathname.split("/").at(-1);
		if (method === "generationAccess") {
			await route.fallback();
			return;
		}
		if (method === "save") {
			const input = route.request().postDataJSON().json;
			await pending;
			current = {
				...current,
				profile: {
					...current.profile,
					measurementPlans: input.measurementPlans,
					revision: 2,
				},
			};
		}
		await route.fulfill({ json: { json: current } });
	});
	await page.goto("/organizations/settings/business-context");
	const outcome = page.getByRole("textbox", {
		name: "Business outcome",
		exact: true,
	});
	const activation = page.getByRole("combobox", {
		name: "Activation event",
		exact: true,
	});
	const returning = page.getByRole("combobox", {
		name: "Return event",
		exact: true,
	});
	await outcome.fill("Repeat paid bookings");
	await expect(activation).toHaveValue("booking_completed");
	await expect(
		page.getByText("Seen in the recent event catalog.", { exact: true }).first()
	).toBeVisible();
	const before = await Promise.all([
		outcome.boundingBox(),
		activation.boundingBox(),
		returning.boundingBox(),
	]);
	await page.getByRole("button", { name: "Save changes", exact: true }).click();
	try {
		await expect(outcome).toBeVisible();
		await expect(activation).toBeVisible();
		await expect(returning).toBeVisible();
		await expect(outcome).toBeDisabled();
		const during = await Promise.all([
			outcome.boundingBox(),
			activation.boundingBox(),
			returning.boundingBox(),
		]);
		for (let index = 0; index < before.length; index++) {
			expect(before[index]).not.toBeNull();
			expect(during[index]).not.toBeNull();
			for (const dimension of ["x", "y", "width", "height"] as const) {
				expect(during[index]![dimension]).toBeCloseTo(
					before[index]![dimension],
					0
				);
			}
		}
	} finally {
		release();
	}
	await expect(page.getByText("Changes saved", { exact: true })).toBeVisible();
	await expect(outcome).toBeEnabled();
	await expect(outcome).toHaveValue("Repeat paid bookings");
});
