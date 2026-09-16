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

const contextViewports = [
	{ name: "desktop", width: 1440, height: 1000 },
	{ name: "mobile", width: 390, height: 844 },
];

function requestGate() {
	let resolve!: () => void;
	const promise = new Promise<void>((release) => {
		resolve = release;
	});
	return { promise, resolve };
}

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

for (const viewport of contextViewports) {
	for (const access of [
		allowedAccess,
		{
			status: "credits-required",
			billingMode: "fixed",
			message:
				"Investigation access is required to generate a draft. Review your investigation allowance and spending limit, or edit the context manually.",
			action: "billing",
		},
	]) {
		test(
			`keeps ${viewport.name} ${access.status} context stable through sequential loading`,
			{
				tag: "@regression",
			},
			async ({ authenticatedPage: page }, testInfo) => {
				await page.setViewportSize(viewport);
				const organizationGate = requestGate();
				const briefGate = requestGate();
				const accessGate = requestGate();
				const organizationRequest = page.waitForRequest(
					"**/api/auth/organization/list*"
				);
				const briefRequest = page.waitForRequest("**/rpc/businessContext/get");
				const accessRequest = page.waitForRequest(
					"**/rpc/businessContext/generationAccess"
				);
				await page.route("**/api/auth/organization/list*", async (route) => {
					await organizationGate.promise;
					await route.continue();
				});
				await page.route("**/rpc/businessContext/get", async (route) => {
					await briefGate.promise;
					await route.fulfill({ json: { json: settings() } });
				});
				await page.route(
					"**/rpc/businessContext/generationAccess",
					async (route) => {
						await accessGate.promise;
						await route.fulfill({ json: { json: access } });
					}
				);

				const regions = ["page", "brief", "document", "research"] as const;
				const readBounds = async () => {
					const bounds = [];
					for (const region of regions) {
						const element = page.getByTestId(`business-context-${region}`);
						await expect(element).toBeVisible();
						const rect = await element.boundingBox();
						if (!rect) {
							throw new Error(`Missing ${region} bounds`);
						}
						bounds.push({ region, ...rect });
					}
					return bounds;
				};

				try {
					await page.goto(path, { waitUntil: "domcontentloaded" });
					await organizationRequest;
					await page.evaluate(() => document.fonts.ready.then(() => undefined));
					const loading = page.getByRole("status", {
						name: "Loading business context",
						exact: true,
					});
					await expect(loading).toBeVisible();
					const initial = await readBounds();
					expect(initial[2]!.height).toBe(320);
					await page.screenshot({
						animations: "disabled",
						path: testInfo.outputPath("organization-loading.png"),
					});
					const expectStableBounds = async (phase: string) => {
						const current = await readBounds();
						for (const [index, before] of initial.entries()) {
							const after = current[index]!;
							const dimensions =
								before.region === "brief" || before.region === "document"
									? (["x", "y", "width", "height"] as const)
									: (["x", "y", "width"] as const);
							for (const dimension of dimensions) {
								expect(
									Math.abs(after[dimension] - before[dimension]),
									`${phase}: ${before.region} ${dimension}`
								).toBeLessThanOrEqual(1);
							}
						}
						return current;
					};

					organizationGate.resolve();
					await briefRequest;
					await expect(loading).toBeVisible();
					await expectStableBounds("business context loading");

					briefGate.resolve();
					await accessRequest;
					await expect(loading).toBeHidden();
					await expect(
						page.getByText(savedContent, { exact: true })
					).toBeVisible();
					const generate = page.getByRole("button", {
						name: "Regenerate with AI",
						exact: true,
					});
					await expect(generate).toBeDisabled();
					const pendingAccess = await expectStableBounds(
						"generation access loading"
					);

					accessGate.resolve();
					if (access.status === "allowed") {
						await expect(generate).toBeEnabled();
					} else {
						await expect(
							page.getByRole("link", { name: "Manage billing", exact: true })
						).toBeVisible();
						await expect(generate).toBeHidden();
					}
					const ready = await expectStableBounds("generation access ready");
					expect(
						Math.abs(ready[3]!.height - pendingAccess[3]!.height),
						"generation access must not resize research controls"
					).toBeLessThanOrEqual(1);
					expect(
						await page.evaluate(
							() => document.documentElement.scrollWidth > window.innerWidth
						)
					).toBe(false);
					await page.screenshot({
						animations: "disabled",
						path: testInfo.outputPath("loaded.png"),
					});
					await testInfo.attach("loading-bounds", {
						body: JSON.stringify({ initial, pendingAccess, ready }, null, 2),
						contentType: "application/json",
					});
				} finally {
					organizationGate.resolve();
					briefGate.resolve();
					accessGate.resolve();
				}
			}
		);
	}
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
			draft: {
				content: generatedContent,
				sources: [{ url: "https://example.com/pricing", title: "Pricing" }],
			},
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
	await expect(
		page
			.getByRole("region", { name: "Current version", exact: true })
			.getByRole("link", { name: /^Example/ })
	).toHaveAttribute("href", "https://example.com");
	await expect(
		page
			.getByRole("region", { name: "Proposed version", exact: true })
			.getByRole("link", { name: /^Pricing/ })
	).toHaveAttribute("href", "https://example.com/pricing");
	await page.getByRole("button", { name: "Use AI draft" }).click();
	await expect(
		page.getByRole("tab", { name: "Preview", exact: true })
	).toBeFocused();
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

test("requires conflict review before saving an AI draft based on an older brief", {
	tag: "@regression",
}, async ({ authenticatedPage: page, e2eSession }) => {
	const newerContent = "A teammate corrected the newer saved brief.";
	const generationId = "11111111-1111-4111-8111-111111111111";
	const storageKey = `business-context-draft:${e2eSession.userId}:${e2eSession.organizationId}`;
	const saved: unknown[] = [];
	let current: BusinessContextSettings = {
		...settings(),
		profile: { ...settings().profile!, content: newerContent, revision: 2 },
		generation: {
			id: generationId,
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
		const method = new URL(route.request().url()).pathname.split("/").at(-1);
		if (method === "generationAccess") {
			await route.fallback();
			return;
		}
		if (method === "save") {
			const input = route.request().postDataJSON().json;
			saved.push(input);
			current = {
				...current,
				profile: { ...current.profile!, content: input.content, revision: 3 },
				generation: null,
			};
		}
		await route.fulfill({ json: { json: current } });
	});
	await page.goto(path);
	await page
		.getByRole("button", { name: "Review AI draft", exact: true })
		.click();
	await expect(
		page.getByText(
			"This draft predates the latest saved version. Check any recent corrections before using it.",
			{ exact: true }
		)
	).toBeVisible();
	await page.getByRole("button", { name: "Use AI draft", exact: true }).click();
	const recoveredDraft = () =>
		page.evaluate((key) => {
			const value = sessionStorage.getItem(key);
			return value ? JSON.parse(value) : null;
		}, storageKey);
	await expect.poll(recoveredDraft).toMatchObject({
		revision: 1,
		content: generatedContent,
		generationId,
	});
	const save = page.getByRole("button", { name: "Save changes", exact: true });
	await expect(save).toBeDisabled();
	await page.keyboard.press("ControlOrMeta+s");
	expect(saved).toHaveLength(0);
	await page.reload();
	await expect(page.getByText(generatedContent, { exact: true })).toBeVisible();
	await expect(save).toBeDisabled();
	await expect
		.poll(recoveredDraft)
		.toMatchObject({ revision: 1, generationId });
	await page
		.getByRole("button", { name: "Review update", exact: true })
		.click();
	const review = page.getByRole("region", {
		name: "Review saved changes",
		exact: true,
	});
	await expect(review).toContainText(newerContent);
	await expect(review).toContainText(generatedContent);
	expect(saved).toHaveLength(0);
	await page
		.getByRole("button", { name: "Keep editing my version", exact: true })
		.click();
	await expect
		.poll(recoveredDraft)
		.toMatchObject({ revision: 2, generationId });
	await expect(save).toBeEnabled();
	await save.click();
	await expect(page.getByText("Changes saved", { exact: true })).toBeVisible();
	expect(saved).toHaveLength(1);
	expect(saved[0]).toMatchObject({
		revision: 2,
		content: generatedContent,
		generationId,
	});
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
	await expect(editor).toBeFocused();
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
	await expect(
		page.getByRole("tab", { name: "Preview", exact: true })
	).toBeFocused();
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
	await page
		.getByRole("button", { name: "Read the guide", exact: true })
		.click();
	await expect(
		page.getByText("https://example.com/guide", { exact: true })
	).toBeVisible();
	await page.getByRole("button", { name: "Close", exact: true }).click();
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
		).toBeHidden();
		if (access.action === "billing") {
			await expect(
				page.getByRole("link", { name: "Manage billing", exact: true })
			).toHaveAttribute("href", /\/billing(?:#.*)?$/);
		} else {
			await expect(
				page.getByRole("button", { name: "Check again", exact: true })
			).toBeEnabled();
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

for (const viewport of contextViewports) {
	test(
		`keeps ${viewport.name} queued and running drafts compact and stable`,
		{
			tag: "@regression",
		},
		async ({ authenticatedPage: page }, testInfo) => {
			await page.setViewportSize(viewport);
			await page.addInitScript(() => localStorage.setItem("theme", "dark"));
			let current: BusinessContextSettings = {
				...settings(),
				generation: {
					id: "11111111-1111-4111-8111-111111111111",
					websiteId: "example-site",
					domain: "example.com",
					requestedBy: "example-admin",
					requestedAt: new Date().toISOString(),
					baseRevision: 1,
					status: "queued",
					draft: null,
					error: null,
				},
			};
			await page.route("**/rpc/businessContext/get", (route) =>
				route.fulfill({ json: { json: current } })
			);
			await page.goto(path);
			await page.getByRole("tab", { name: "AI draft", exact: true }).click();
			const panel = page.locator('[aria-label="AI draft preview"]');
			const brief = page.getByTestId("business-context-brief");
			const research = page.getByTestId("business-context-research");
			const queued = panel.getByText("Your draft is queued", { exact: true });
			await expect(queued).toBeVisible();
			const initialPanel = await panel.boundingBox();
			const initialBrief = await brief.boundingBox();
			const queuedTitle = await queued.boundingBox();
			expect(initialPanel).not.toBeNull();
			expect(initialBrief).not.toBeNull();
			expect(queuedTitle).not.toBeNull();
			expect(initialPanel!.height).toBe(320);
			expect(queuedTitle!.y - initialPanel!.y).toBeLessThanOrEqual(32);
			await expect(research.getByRole("button")).toHaveCount(1);
			await expect(
				research.getByRole("button", { name: "Cancel generation", exact: true })
			).toBeEnabled();
			await page.screenshot({
				animations: "disabled",
				path: testInfo.outputPath("queued.png"),
			});

			current = {
				...current,
				generation: {
					...current.generation!,
					status: "running",
					progress: { stage: "reading" },
				},
			};
			await expect(
				panel.getByText("Reading your sources", { exact: true })
			).toBeVisible({ timeout: 10_000 });
			await page.screenshot({
				animations: "disabled",
				path: testInfo.outputPath("reading.png"),
			});
			current = {
				...current,
				generation: {
					...current.generation!,
					progress: {
						stage: "writing",
						content:
							"## Proposed understanding\n\nExample serves independent studios.",
					},
				},
			};
			await expect(
				panel.getByRole("heading", {
					name: "Proposed understanding",
					exact: true,
				})
			).toBeVisible({ timeout: 10_000 });
			const writingPanel = await panel.boundingBox();
			const writingBrief = await brief.boundingBox();
			expect(writingPanel).toEqual(initialPanel);
			expect(writingBrief).toEqual(initialBrief);
			await expect(research.getByRole("button")).toHaveCount(1);
			await expect(
				page.getByRole("button", { name: "Use AI draft", exact: true })
			).toBeHidden();
			await page.screenshot({
				animations: "disabled",
				path: testInfo.outputPath("writing.png"),
			});
			await testInfo.attach("generation-bounds", {
				body: JSON.stringify(
					{ initialPanel, initialBrief, writingPanel, writingBrief },
					null,
					2
				),
				contentType: "application/json",
			});
		}
	);
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
			stage: "writing" as const,
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
		review.getByRole("radio", { name: "Proposed version", exact: true })
	).toBeChecked();
	await expect(
		review.getByRole("heading", { name: "Proposed business", exact: true })
	).toBeVisible();
	await expect(
		review.getByRole("heading", { name: "Current version", exact: true })
	).toBeHidden();
	await review
		.getByRole("radiogroup", { name: "Version to review", exact: true })
		.getByText("Current version", { exact: true })
		.click();
	await expect(
		review.getByRole("radio", { name: "Current version", exact: true })
	).toBeChecked();
	await expect(review.getByText(savedContent, { exact: true })).toBeVisible();
	await expect(
		review.getByRole("heading", { name: "Proposed business", exact: true })
	).toBeHidden();
	await review
		.getByRole("radiogroup", { name: "Version to review", exact: true })
		.getByText("Proposed version", { exact: true })
		.click();
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
