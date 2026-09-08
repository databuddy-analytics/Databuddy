import type { BusinessContextSettings } from "@databuddy/shared/organization-business-context";
import { expect, test } from "@/test/e2e/fixtures";

const path = "/organizations/settings/business-context";
const savedContent =
	"Example makes scheduling software for independent studios.";
const generatedContent =
	"Example helps independent studios fill classes. Customers subscribe monthly.";

test("persists a manually edited business brief through the real API", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	const brief = `Example sells scheduling software. Prioritize completed bookings, not calendar views. Ignore staff rehearsals. Test reference: ${crypto.randomUUID()}.`;
	await page.goto(path);
	const editor = page.getByRole("textbox", { name: "Business brief" });
	await expect(editor).toBeEditable();
	const saveRequests: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/rpc/businessContext/save")) {
			saveRequests.push(request.url());
		}
	});
	await editor.fill(brief);
	const saved = page.waitForResponse((response) =>
		response.url().includes("/rpc/businessContext/save")
	);
	await editor.press("ControlOrMeta+s");
	expect((await saved).ok()).toBe(true);
	await expect(page.getByText("Changes saved", { exact: true })).toBeVisible();
	expect(saveRequests).toHaveLength(1);
	await page.reload();
	await expect(editor).toHaveValue(brief);
	await expect(page.getByRole("button", { name: /^Save changes/ })).toHaveCount(
		0
	);
	await expect(
		page.getByRole("button", { name: "Regenerate with AI", exact: true })
	).toBeEnabled();
});

function settings(): BusinessContextSettings {
	return {
		canEdit: true,
		websites: [{ id: "example-site", name: "Example", domain: "example.com" }],
		profile: {
			content: savedContent,
			origin: "team",
			sources: [{ url: "https://example.com", title: "Example" }],
			revision: 1,
			updatedAt: "2026-09-08T12:00:00Z",
			updatedBy: "example-admin",
			sourceWebsiteId: "example-site",
		},
		generation: null,
	};
}

test("keeps typing when AI finishes and saves only the reviewed draft", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	let current = settings();
	let saved: unknown;
	await page.route("**/rpc/businessContext/**", async (route) => {
		const method = new URL(route.request().url()).pathname.split("/").at(-1);
		if (method === "generate") {
			current = {
				...current,
				generation: {
					id: "example-generation",
					websiteId: "example-site",
					domain: "example.com",
					requestedBy: "example-admin",
					requestedAt: new Date().toISOString(),
					baseRevision: 1,
					status: "running",
					draft: null,
					error: null,
				},
			};
		}
		if (method === "save") {
			saved = route.request().postDataJSON().json;
			current = {
				...current,
				profile: {
					...current.profile!,
					content: route.request().postDataJSON().json.content,
					revision: 2,
				},
			};
		}
		await route.fulfill({ json: { json: current } });
	});
	await page.goto(path);
	const editor = page.getByRole("textbox", { name: "Business brief" });
	await expect(editor).toHaveValue(savedContent);
	await page.getByRole("button", { name: "Regenerate with AI" }).click();
	await expect(
		page.getByText(
			"Reading your website and preparing a draft. You can keep writing."
		)
	).toBeVisible();
	await editor.fill("My unfinished edits");
	current = {
		...current,
		generation: {
			...current.generation!,
			status: "ready",
			draft: { content: generatedContent, sources: [] },
		},
	};
	await expect(
		page.getByRole("button", { name: "Review AI draft" })
	).toBeVisible();
	await expect(editor).toHaveValue("My unfinished edits");
	await page.getByRole("button", { name: "Review AI draft" }).click();
	await expect(page.getByRole("dialog")).toContainText(generatedContent);
	await page.getByRole("button", { name: "Use AI draft" }).click();
	await expect(editor).toHaveValue(generatedContent);
	expect(saved).toBeUndefined();
	await editor.fill(`${generatedContent}\nFocus on paid signups.`);
	await editor.press("ControlOrMeta+s");
	await expect(page.getByText("Changes saved", { exact: true })).toBeVisible();
	expect(saved).toMatchObject({
		content: `${generatedContent}\nFocus on paid signups.`,
		revision: 1,
		generationId: "example-generation",
	});
	await expect(page.getByRole("button", { name: "Save changes" })).toBeHidden();
});

test("discards an AI draft without restoring it on the next refresh", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	const current: BusinessContextSettings = {
		...settings(),
		generation: {
			id: "example-generation",
			websiteId: "example-site",
			domain: "example.com",
			requestedBy: "example-admin",
			requestedAt: new Date().toISOString(),
			baseRevision: 1,
			status: "ready",
			draft: { content: generatedContent, sources: [] },
			error: null,
		},
	};
	await page.route("**/rpc/businessContext/get", (route) =>
		route.fulfill({ json: { json: current } })
	);
	await page.goto(path);
	const editor = page.getByRole("textbox", { name: "Business brief" });
	await expect(editor).toHaveValue(generatedContent);
	await page.getByRole("button", { name: "Discard changes" }).click();
	await expect(editor).toHaveValue(savedContent);
	// Restore visibility to exercise the normal query refetch without remounting the editor.
	await Promise.all([
		page.waitForResponse((response) =>
			response.url().endsWith("/rpc/businessContext/get")
		),
		page.evaluate(() => {
			Object.defineProperty(document, "visibilityState", {
				configurable: true,
				value: "hidden",
			});
			window.dispatchEvent(new Event("visibilitychange"));
			Object.defineProperty(document, "visibilityState", {
				configurable: true,
				value: "visible",
			});
			window.dispatchEvent(new Event("visibilitychange"));
		}),
	]);
	await expect(
		page.getByRole("button", { name: "Review AI draft" })
	).toBeHidden();
	await expect(page.getByRole("button", { name: "Save changes" })).toBeHidden();
	await expect(editor).toHaveValue(savedContent);
});

test("preserves edits on a revision conflict and requires reviewing the new brief", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	let current = settings();
	const savedRevisions: number[] = [];
	await page.route("**/rpc/businessContext/**", async (route) => {
		if (new URL(route.request().url()).pathname.endsWith("/save")) {
			const input = route.request().postDataJSON().json;
			savedRevisions.push(input.revision);
			if (input.revision === 1) {
				current = {
					...current,
					profile: {
						...current.profile!,
						content: "A teammate's newer brief.",
						revision: 2,
					},
				};
				await route.fulfill({
					status: 409,
					json: {
						json: {
							defined: false,
							code: "CONFLICT",
							status: 409,
							message:
								"The business brief was updated. Review the latest version.",
						},
					},
				});
				return;
			}
			current = {
				...current,
				profile: { ...current.profile!, content: input.content, revision: 3 },
			};
		}
		await route.fulfill({ json: { json: current } });
	});
	await page.goto(path);
	const editor = page.getByRole("textbox", { name: "Business brief" });
	await editor.fill("My local brief");
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(
		page.getByRole("button", { name: "Review update" })
	).toBeVisible();
	await expect(editor).toHaveValue("My local brief");
	await expect(
		page.getByRole("button", { name: "Save changes" })
	).toBeDisabled();
	await page.getByRole("button", { name: "Review update" }).click();
	await expect(page.getByRole("dialog")).toContainText(
		"A teammate's newer brief."
	);
	await page.getByRole("button", { name: "Keep my edits" }).click();
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByText("Changes saved", { exact: true })).toBeVisible();
	expect(savedRevisions).toEqual([1, 2]);
});

test("shows the saved brief and sources to members without edit controls", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	await page.route("**/rpc/businessContext/get", (route) =>
		route.fulfill({ json: { json: { ...settings(), canEdit: false } } })
	);
	await page.goto(path);
	const editor = page.getByRole("textbox", { name: "Business brief" });
	await expect(editor).toHaveValue(savedContent);
	await expect(editor).not.toBeEditable();
	await expect(
		page.getByRole("button", {
			name: /Generate with AI|Regenerate with AI|Save changes|Discard changes/,
		})
	).toBeHidden();
	await expect(
		page.getByRole("link", { name: "Example", exact: true })
	).toHaveAttribute("href", "https://example.com");
});

test("can save retained text after regenerating and declining the replacement", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	let current: BusinessContextSettings = {
		...settings(),
		generation: {
			id: "first-generation",
			websiteId: "example-site",
			domain: "example.com",
			requestedBy: "example-admin",
			requestedAt: new Date().toISOString(),
			baseRevision: 1,
			status: "ready",
			draft: { content: generatedContent, sources: [] },
			error: null,
		},
	};
	let saved: unknown;
	await page.route("**/rpc/businessContext/**", async (route) => {
		const method = new URL(route.request().url()).pathname.split("/").at(-1);
		if (method === "generate") {
			current = {
				...current,
				previousDrafts: [current.generation!],
				generation: {
					...current.generation!,
					id: "second-generation",
					status: "ready",
					draft: { content: "A replacement brief.", sources: [] },
				},
			};
		}
		if (method === "save") {
			saved = route.request().postDataJSON().json;
			current = {
				...current,
				profile: {
					...current.profile!,
					content: generatedContent,
					revision: 2,
				},
			};
		}
		await route.fulfill({ json: { json: current } });
	});
	await page.goto(path);
	const editor = page.getByRole("textbox", { name: "Business brief" });
	await expect(editor).toHaveValue(generatedContent);
	await page.getByRole("button", { name: "Regenerate with AI" }).click();
	await page.getByRole("button", { name: "Review AI draft" }).click();
	await page.getByRole("button", { name: "Keep current text" }).click();
	await expect(editor).toHaveValue(generatedContent);
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByText("Changes saved", { exact: true })).toBeVisible();
	expect(saved).toMatchObject({
		content: generatedContent,
		revision: 1,
		generationId: "first-generation",
	});
});
