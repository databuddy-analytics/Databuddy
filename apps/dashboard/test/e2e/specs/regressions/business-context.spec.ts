import type { BusinessContextSettings } from "@databuddy/shared/organization-business-context";
import type { Page } from "@playwright/test";
import { expect, test } from "@/test/e2e/fixtures";

const path = "/organizations/settings/business-context";
const savedContent =
	"Example makes scheduling software for independent studios.";
const generatedContent =
	"Example helps independent studios fill classes. Customers subscribe monthly.";

const allowedAccess = {
	status: "allowed",
	billingMode: "fixed",
	message: "Generate a business brief from your website.",
	action: "generate",
};

test.beforeEach(async ({ page }) => {
	await page.route("**/rpc/businessContext/generationAccess", (route) =>
		route.fulfill({ json: { json: allowedAccess } })
	);
});

async function editBrief(page: Page) {
	await page.getByRole("tab", { name: "Edit", exact: true }).click();
	return page.getByRole("textbox", { name: "Business brief", exact: true });
}

async function useGeneratedDraft(page: Page) {
	await page
		.getByRole("button", { name: "Review AI draft", exact: true })
		.click();
	await page.getByRole("button", { name: "Use AI draft", exact: true }).click();
}

test("recovers unfinished brief and team inputs across navigation and reload, then restores a saved version", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	await page.goto(path);
	const editor = await editBrief(page);
	await expect(editor).toBeEditable();
	const original = await editor.inputValue();
	const unfinished = `Recover this draft ${crypto.randomUUID()}`;
	await editor.fill(unfinished);
	const priority = page.getByRole("textbox", { name: "Current priority" });
	await priority.fill("Improve production activation");
	await page.goto("/organizations/settings");
	await page.goto(path);
	await editBrief(page);
	await expect(editor).toHaveValue(unfinished);
	await page.reload();
	await editBrief(page);
	await expect(editor).toHaveValue(unfinished);
	await expect(priority).toHaveValue("Improve production activation");
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByText("Changes saved", { exact: true })).toBeVisible();
	await editor.fill("A later saved revision");
	await priority.fill("A different priority");
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByText("Changes saved", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "History", exact: true }).click();
	await page
		.getByRole("menuitem")
		.filter({ hasText: /^Version/ })
		.first()
		.click();
	await expect(
		page.getByRole("heading", { name: /^Review version/ })
	).toBeFocused();
	await page.getByRole("button", { name: "Restore this version" }).click();
	await expect(
		page.getByText("Version restored", { exact: true })
	).toBeVisible();
	await editBrief(page);
	await expect(editor).toHaveValue(unfinished);
	await expect(priority).toHaveValue("Improve production activation");
	await page.reload();
	await editBrief(page);
	await expect(editor).toHaveValue(unfinished);
	expect(unfinished).not.toBe(original);
});

test("persists a manually edited business brief through the real API", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	const brief = `Example sells scheduling software. Prioritize completed bookings, not calendar views. Ignore staff rehearsals. Test reference: ${crypto.randomUUID()}.`;
	await page.goto(path);
	const editor = await editBrief(page);
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
	await editBrief(page);
	await expect(editor).toHaveValue(brief);
	await expect(
		page.getByRole("button", { name: "Save changes", exact: true })
	).toBeDisabled();
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
		if (new URL(route.request().url()).pathname.endsWith("/generationAccess")) {
			await route.fallback();
			return;
		}
		const method = new URL(route.request().url()).pathname.split("/").at(-1);
		if (method === "generate") {
			current = {
				...current,
				generation: {
					id: "11111111-1111-4111-8111-111111111111",
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
				generation: null,
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
	const editor = await editBrief(page);
	await expect(editor).toHaveValue(savedContent);
	await page.getByRole("button", { name: "Regenerate with AI" }).click();
	await expect(
		page.getByRole("button", { name: "Cancel generation", exact: true })
	).toBeVisible();
	await editBrief(page);
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
	await expect(
		page.getByRole("region", { name: "Review AI draft", exact: true })
	).toContainText("Customers subscribe monthly.");
	await expect(
		page.getByRole("heading", { name: "Review AI draft" })
	).toBeFocused();
	await page.getByRole("button", { name: "Use AI draft" }).click();
	await editBrief(page);
	await expect(editor).toHaveValue(generatedContent);
	expect(saved).toBeUndefined();
	await editor.fill(`${generatedContent}\nFocus on paid signups.`);
	await editor.press("ControlOrMeta+s");
	await expect(page.getByText("Changes saved", { exact: true })).toBeVisible();
	expect(saved).toMatchObject({
		content: `${generatedContent}\nFocus on paid signups.`,
		revision: 1,
		generationId: "11111111-1111-4111-8111-111111111111",
	});
	await expect(
		page.getByRole("button", { name: "Save changes" })
	).toBeDisabled();
});

test("discards an AI draft without restoring it on the next refresh", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	let current: BusinessContextSettings = {
		...settings(),
		generation: {
			id: "11111111-1111-4111-8111-111111111111",
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
	await page.route("**/rpc/businessContext/**", async (route) => {
		if (new URL(route.request().url()).pathname.endsWith("/generationAccess")) {
			await route.fallback();
			return;
		}
		if (new URL(route.request().url()).pathname.endsWith("/cancel"))
			current = { ...current, generation: null };
		await route.fulfill({ json: { json: current } });
	});
	await page.goto(path);
	await useGeneratedDraft(page);
	const editor = await editBrief(page);
	await expect(editor).toHaveValue(generatedContent);
	await page.getByRole("button", { name: "Discard changes" }).click();
	await editBrief(page);
	await expect(editor).toHaveValue(savedContent);
	await page.reload();
	await expect(
		page.getByRole("button", { name: "Review AI draft" })
	).toBeHidden();
	await expect(
		page.getByRole("button", { name: "Save changes" })
	).toBeDisabled();
	await editBrief(page);
	await expect(editor).toHaveValue(savedContent);
});

test("preserves edits on a revision conflict and requires reviewing the new brief", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	let current = settings();
	const savedRevisions: number[] = [];
	await page.route("**/rpc/businessContext/**", async (route) => {
		if (new URL(route.request().url()).pathname.endsWith("/generationAccess")) {
			await route.fallback();
			return;
		}
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
	const editor = await editBrief(page);
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
	await expect(
		page.getByText("A teammate's newer brief.", { exact: true })
	).toBeVisible();
	await page.getByRole("button", { name: "Keep editing my version" }).click();
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
	await expect(page.getByText(savedContent, { exact: true })).toBeVisible();
	await expect(
		page.getByRole("tab", { name: "Edit", exact: true })
	).toBeHidden();
	await expect(
		page.getByRole("textbox", { name: "Business brief" })
	).toBeHidden();
	await expect(
		page.getByRole("button", {
			name: /Generate with AI|Regenerate with AI|Save changes|Discard changes/,
		})
	).toBeHidden();
	await expect(page.getByRole("link", { name: /^Example/ })).toHaveAttribute(
		"href",
		"https://example.com"
	);
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
		if (new URL(route.request().url()).pathname.endsWith("/generationAccess")) {
			await route.fallback();
			return;
		}
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
		if (method === "cancel") {
			current = { ...current, generation: null };
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
	await useGeneratedDraft(page);
	const editor = await editBrief(page);
	await expect(editor).toHaveValue(generatedContent);
	await page.getByRole("button", { name: "Regenerate with AI" }).click();
	await page.getByRole("button", { name: "Review AI draft" }).click();
	await page.getByRole("button", { name: "Keep current text" }).click();
	await editBrief(page);
	await expect(editor).toHaveValue(generatedContent);
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByText("Changes saved", { exact: true })).toBeVisible();
	expect(saved).toMatchObject({
		content: generatedContent,
		revision: 1,
		generationId: "first-generation",
	});
});

test("a late save cannot clear a newer draft written after navigation", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	let current = settings();
	let release: () => void = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/rpc/businessContext/**", async (route) => {
		if (new URL(route.request().url()).pathname.endsWith("/generationAccess")) {
			await route.fallback();
			return;
		}
		if (new URL(route.request().url()).pathname.endsWith("/save")) {
			const input = route.request().postDataJSON().json;
			await pending;
			current = {
				...current,
				profile: { ...current.profile!, content: input.content, revision: 2 },
			};
		}
		await route.fulfill({ json: { json: current } });
	});
	await page.goto(path);
	const editor = await editBrief(page);
	await editor.fill("Save A");
	await page.getByRole("button", { name: "Save changes" }).click();
	await page.getByRole("link", { name: "General", exact: true }).click();
	await expect(page).toHaveURL(/organizations\/settings$/);
	await expect(editor).toBeHidden();
	await page
		.getByRole("link", { name: "Business Context", exact: true })
		.click();
	await editBrief(page);
	await expect(editor).toBeEditable();
	await editor.fill("Newer draft B");
	const response = page.waitForResponse((item) =>
		item.url().endsWith("/businessContext/save")
	);
	release();
	await response;
	await expect(editor).toHaveValue("Newer draft B");
	await page.reload();
	await editBrief(page);
	await expect(editor).toHaveValue("Newer draft B");
	await expect(
		page.getByRole("button", { name: "Review update" })
	).toBeVisible();
});

test("failed browser storage keeps newer text and discarded tombstones across in-app navigation", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	await page.route("**/rpc/businessContext/get", (route) =>
		route.fulfill({ json: { json: settings() } })
	);
	await page.goto(path);
	const editor = await editBrief(page);
	await editor.fill("Old persisted draft");
	await page.evaluate(() => {
		for (const method of ["setItem", "removeItem"] as const) {
			const original = Storage.prototype[method];
			Storage.prototype[method] = function (
				this: Storage,
				key: string,
				value: string = ""
			) {
				if (key.startsWith("business-context-draft:"))
					throw new DOMException(
						"Synthetic quota failure",
						"QuotaExceededError"
					);
				return original.call(this, key, value);
			};
		}
	});
	await editor.fill("Newer memory draft");
	await page.getByRole("link", { name: "General", exact: true }).click();
	await expect(page).toHaveURL(/organizations\/settings$/);
	await expect(editor).toBeHidden();
	await page
		.getByRole("link", { name: "Business Context", exact: true })
		.click();
	await editBrief(page);
	await expect(editor).toHaveValue("Newer memory draft");
	await page.getByRole("button", { name: "Discard changes" }).click();
	await editBrief(page);
	await page.getByRole("link", { name: "General", exact: true }).click();
	await expect(page).toHaveURL(/organizations\/settings$/);
	await expect(editor).toBeHidden();
	await page
		.getByRole("link", { name: "Business Context", exact: true })
		.click();
	await editBrief(page);
	await expect(editor).toHaveValue(savedContent);
});

test("choosing a saved version dismisses an available AI draft", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	let current = settings();
	await page.route("**/rpc/businessContext/**", async (route) => {
		if (new URL(route.request().url()).pathname.endsWith("/generationAccess")) {
			await route.fallback();
			return;
		}
		const method = new URL(route.request().url()).pathname.split("/").at(-1);
		if (method === "save") {
			current = {
				...current,
				profile: {
					...current.profile!,
					content: "Teammate's saved choice",
					revision: 2,
				},
				generation: {
					id: "11111111-1111-4111-8111-111111111111",
					websiteId: "example-site",
					domain: "example.com",
					requestedBy: "example-admin",
					requestedAt: new Date().toISOString(),
					baseRevision: 2,
					status: "ready",
					draft: { content: generatedContent, sources: [] },
					error: null,
				},
			};
			await route.fulfill({
				status: 409,
				json: {
					json: {
						defined: false,
						code: "CONFLICT",
						status: 409,
						message: "Review newer saved context",
					},
				},
			});
			return;
		}
		if (method === "cancel") current = { ...current, generation: null };
		await route.fulfill({ json: { json: current } });
	});
	await page.goto(path);
	const editor = await editBrief(page);
	await editor.fill("My edits");
	await page.getByRole("button", { name: "Save changes" }).click();
	await page.getByRole("button", { name: "Review update" }).click();
	await page.getByRole("button", { name: "Use saved version" }).click();
	await editBrief(page);
	await expect(editor).toHaveValue("Teammate's saved choice");
	await page.reload();
	await editBrief(page);
	await expect(editor).toHaveValue("Teammate's saved choice");
	await expect(
		page.getByRole("button", { name: "Review AI draft" })
	).toBeHidden();
});

test("renders the brief as Markdown and preserves exact text between edit and preview", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	const markdown =
		"## Who we serve\n\n**Independent studios** use Example.\n\n- Schedule classes\n- [Read the guide](https://example.com/guide)";
	await page.route("**/rpc/businessContext/get", (route) =>
		route.fulfill({
			json: {
				json: {
					...settings(),
					profile: { ...settings().profile!, content: markdown },
				},
			},
		})
	);
	await page.goto(path);
	await expect(
		page.getByRole("heading", { name: "Who we serve", exact: true })
	).toBeVisible();
	await expect(
		page.getByRole("listitem").filter({ hasText: "Schedule classes" })
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: "Read the guide", exact: true })
	).toHaveAttribute("href", "https://example.com/guide");
	await expect(
		page.getByRole("textbox", { name: "Business brief" })
	).toBeHidden();
	const editor = await editBrief(page);
	await expect(editor).toHaveValue(markdown);
	const edited = `${markdown}\n\n### This quarter\n\nIncrease repeat bookings.`;
	await editor.fill(edited);
	await page.getByRole("tab", { name: "Preview", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: "This quarter", exact: true })
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Save changes", exact: true })
	).toBeEnabled();
	await editBrief(page);
	await expect(editor).toHaveValue(edited);
});

for (const access of [
	{
		status: "credits-required",
		billingMode: "legacy",
		message:
			"Add AI credits to generate a business brief. Manual editing is available.",
		action: "billing",
	},
	{
		status: "not-configured",
		billingMode: null,
		message:
			"AI generation is not configured. You can still write and save your brief.",
		action: "contact-admin",
	},
	{
		status: "unavailable",
		billingMode: null,
		message: "Generation is temporarily unavailable. Try again shortly.",
		action: "retry",
	},
] as const) {
	test(`explains ${access.status} before generation while keeping manual editing available`, {
		tag: "@regression",
	}, async ({ authenticatedPage: page }) => {
		let current = settings();
		let generationRequests = 0;
		await page.route("**/rpc/businessContext/**", async (route) => {
			const method = new URL(route.request().url()).pathname.split("/").at(-1);
			if (method === "generationAccess") {
				await route.fulfill({ json: { json: access } });
				return;
			}
			if (method === "generate") generationRequests++;
			if (method === "save") {
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
		await expect(page.getByText(access.message, { exact: true })).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Regenerate with AI", exact: true })
		).toBeDisabled();
		if (access.action === "billing") {
			await expect(
				page.getByRole("link", { name: /billing|credits/i })
			).toHaveAttribute("href", /\/billing(?:#.*)?$/);
		}
		const editor = await editBrief(page);
		await editor.fill(
			"Our team can maintain this brief without AI generation."
		);
		await page
			.getByRole("button", { name: "Save changes", exact: true })
			.click();
		await expect(
			page.getByText("Changes saved", { exact: true })
		).toBeVisible();
		expect(current.profile?.content).toBe(
			"Our team can maintain this brief without AI generation."
		);
		expect(generationRequests).toBe(0);
	});
}

test("streams a separate proposed brief without replacing local edits or enabling early acceptance", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	let current: BusinessContextSettings = {
		...settings(),
		generation: {
			id: "11111111-1111-4111-8111-111111111111",
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
	await page.route("**/rpc/businessContext/get", (route) =>
		route.fulfill({ json: { json: current } })
	);
	await page.goto(path);
	const editor = await editBrief(page);
	await editor.fill("My unfinished context stays here.");
	const writing = {
		...current.generation!,
		progress: {
			stage: "writing",
			content:
				"## Proposed understanding\n\nExample serves independent studios.",
		},
	};
	current = { ...current, generation: writing };
	await page.getByRole("tab", { name: "AI draft", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: "Proposed understanding", exact: true })
	).toBeVisible({ timeout: 10_000 });
	await editBrief(page);
	await expect(editor).toHaveValue("My unfinished context stays here.");
	await expect(
		page.getByRole("button", { name: "Use AI draft", exact: true })
	).toBeHidden();
	await expect(
		page.getByRole("button", { name: "Review AI draft", exact: true })
	).toBeHidden();
	current = {
		...current,
		generation: {
			...current.generation!,
			status: "ready",
			draft: {
				content: "## Proposed understanding\n\nA complete explanation.",
				sources: [],
			},
		},
	};
	await expect(
		page.getByRole("button", { name: "Review AI draft", exact: true })
	).toBeVisible({ timeout: 10_000 });
	await editBrief(page);
	await expect(editor).toHaveValue("My unfinished context stays here.");
	await page
		.getByRole("button", { name: "Review AI draft", exact: true })
		.click();
	const review = page.getByRole("region", {
		name: "Review AI draft",
		exact: true,
	});
	await expect(
		review.getByRole("heading", { name: "Current version", exact: true })
	).toBeVisible();
	await expect(
		review.getByRole("heading", { name: "Proposed version", exact: true })
	).toBeVisible();
	await expect(review).toContainText("My unfinished context stays here.");
	await expect(review).toContainText("A complete explanation.");
	await expect(review.locator("ins, del")).toHaveCount(0);
});

test("keeps current and proposed documents readable in a narrow viewport", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const current: BusinessContextSettings = {
		...settings(),
		generation: {
			id: "11111111-1111-4111-8111-111111111111",
			websiteId: "example-site",
			domain: "example.com",
			requestedBy: "example-admin",
			requestedAt: new Date().toISOString(),
			baseRevision: 1,
			status: "ready",
			draft: {
				content: "## Proposed business\n\nStudios sell monthly memberships.",
				sources: [],
			},
			error: null,
		},
	};
	await page.route("**/rpc/businessContext/get", (route) =>
		route.fulfill({ json: { json: current } })
	);
	await page.goto(path);
	await page
		.getByRole("button", { name: "Review AI draft", exact: true })
		.click();
	const review = page.getByRole("region", {
		name: "Review AI draft",
		exact: true,
	});
	await expect(
		page.getByRole("heading", { name: "Review AI draft", exact: true })
	).toBeFocused();
	await expect(
		review.getByRole("heading", { name: "Current version", exact: true })
	).toBeVisible();
	await expect(
		review.getByRole("heading", { name: "Proposed version", exact: true })
	).toBeVisible();
	await expect(
		review.getByRole("heading", { name: "Proposed business", exact: true })
	).toBeVisible();
	await expect(
		review.getByRole("button", { name: "Use AI draft", exact: true })
	).toBeVisible();
	expect(
		await review.evaluate(
			(element) => element.scrollWidth <= element.clientWidth
		)
	).toBe(true);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth
		)
	).toBe(true);
});
