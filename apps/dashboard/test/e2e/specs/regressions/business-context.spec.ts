import type {
	BusinessContextSettings,
	BusinessTeamContext,
} from "@databuddy/shared/organization-business-context";
import type { Locator, Page, Route } from "@playwright/test";
import { test } from "@/test/e2e/business-context-stream";
import { expect, fulfillRpc } from "@/test/e2e/fixtures";

type Generation = NonNullable<BusinessContextSettings["generation"]>;

interface SaveInput {
	content: string;
	generationId?: string;
	revision: number;
	teamContext: BusinessTeamContext;
}

interface ContextApi {
	calls: string[];
	current: BusinessContextSettings;
	saved: SaveInput[];
}

const path = "/organizations/settings/business-context";
const savedContent =
	"Example makes scheduling software for independent studios.";
const generatedContent =
	"Example helps independent studios fill classes. Customers subscribe monthly.";
const timeoutError =
	"Generation took too long. Try again; your saved context is unchanged.";
const GENERATION_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_GENERATION_ID = "22222222-2222-4222-8222-222222222222";
const ADD_DETAILS_RE = /^Add \d+ more details?$/;
const SETTINGS_URL_RE = /organizations\/settings$/;
const BILLING_HREF_RE = /\/billing(?:#.*)?$/;
const VERSION_RE = /^Version/;

type Scope = Page | Locator;

const button = (scope: Scope, name: string) =>
	scope.getByRole("button", { name, exact: true });
const heading = (scope: Scope, name: string) =>
	scope.getByRole("heading", { name, exact: true });
const region = (scope: Scope, name: string) =>
	scope.getByRole("region", { name, exact: true });
const tab = (scope: Scope, name: string) =>
	scope.getByRole("tab", { name, exact: true });
const link = (scope: Scope, name: string) =>
	scope.getByRole("link", { name, exact: true });
const textbox = (scope: Scope, name: string) =>
	scope.getByRole("textbox", { name, exact: true });
const text = (scope: Scope, value: string) =>
	scope.getByText(value, { exact: true });

const allowedAccess = {
	status: "allowed",
	billingMode: "fixed",
	message: "Generate a business brief from your website.",
	action: "generate",
};

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

function generation(): Generation {
	return {
		id: GENERATION_ID,
		websiteId: "example-site",
		domain: "example.com",
		requestedBy: "example-admin",
		requestedAt: new Date().toISOString(),
		baseRevision: 1,
		status: "running",
		draft: null,
		error: null,
	};
}

function researching(): BusinessContextSettings & { generation: Generation } {
	return {
		...settings(),
		generation: { ...generation(), progress: { stage: "reading" } },
	};
}

function drafted(
	content = generatedContent,
	extra: Partial<Generation> = {}
): BusinessContextSettings & { generation: Generation } {
	return {
		...settings(),
		generation: {
			...generation(),
			status: "ready",
			draft: { content, sources: [] },
			...extra,
		},
	};
}

function failed(error: string, extra: Partial<Generation> = {}): Generation {
	return {
		...generation(),
		requestedAt: "2026-09-08T12:00:00Z",
		status: "failed",
		error,
		...extra,
	};
}

function profileOf(state: BusinessContextSettings) {
	if (!state.profile) {
		throw new Error("Expected a saved business profile in the fixture");
	}
	return state.profile;
}

function rpcError(
	page: Page,
	route: Route,
	status: number,
	code: string,
	message: string
) {
	return fulfillRpc(
		page,
		route,
		{ defined: false, code, status, message },
		status
	);
}

function methodOf(route: Route): string {
	return new URL(route.request().url()).pathname.split("/").at(-1) ?? "";
}

function inputOf<T = SaveInput>(route: Route): T {
	return route.request().postDataJSON().json as T;
}

async function mockContextApi(
	page: Page,
	initial: BusinessContextSettings,
	handled?: (method: string, route: Route) => Promise<boolean | undefined>
): Promise<ContextApi> {
	const api: ContextApi = { calls: [], current: initial, saved: [] };
	await page.route("**/rpc/businessContext/**", async (route) => {
		const method = methodOf(route);
		if (method !== "get" && method !== "generationAccess") {
			api.calls.push(method);
		}
		if (method === "generationAccess" || method === "generate") {
			await route.fallback();
			return;
		}
		if (await handled?.(method, route)) {
			return;
		}
		if (method === "cancel") {
			api.current = { ...api.current, generation: null };
		}
		if (method === "save") {
			const input = inputOf(route);
			api.saved.push(input);
			api.current = {
				...api.current,
				generation: null,
				profile: {
					...profileOf(api.current),
					content: input.content,
					teamContext: input.teamContext,
					revision: profileOf(api.current).revision + 1,
				},
			};
		}
		await fulfillRpc(page, route, api.current);
	});
	return api;
}

test.beforeEach(async ({ mockRpc }) => {
	await mockRpc("businessContext/generationAccess", allowedAccess);
});

async function editBrief(page: Page) {
	await tab(page, "Edit").click();
	return textbox(page, "Business brief");
}

async function sourcesInput(page: Page) {
	const options = button(page, "Research options");
	await expect(options).toBeEnabled();
	const input = page.getByRole("textbox", { name: /Additional pages/ });
	if (!(await input.isVisible())) {
		await options.click();
		await page
			.getByRole("menuitem", { name: "Add specific pages", exact: true })
			.click();
	}
	return input;
}

async function expectResearchWebsite(page: Page, name: string) {
	await button(page, "Research options").click();
	await expect(
		page.getByRole("menuitemradio", { name, exact: true })
	).toHaveAttribute("aria-checked", "true");
	await page.keyboard.press("Escape");
}

async function useGeneratedDraft(page: Page) {
	await button(page, "Review AI draft").click();
	await button(page, "Use AI draft").click();
}

async function goToGeneral(page: Page) {
	await link(page, "General").click();
	await expect(page).toHaveURL(SETTINGS_URL_RE);
	await link(page, "Business context").click();
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
	await page.getByRole("button", { name: ADD_DETAILS_RE }).click();
	const priority = textbox(page, "Current priority");
	await priority.fill("Improve production activation");
	await page.goto("/organizations/settings");
	await page.goto(path);
	await editBrief(page);
	await expect(editor).toHaveValue(unfinished);
	await page.reload();
	await editBrief(page);
	await expect(editor).toHaveValue(unfinished);
	await expect(priority).toHaveValue("Improve production activation");
	await button(page, "Save changes").click();
	await expect(text(page, "Changes saved")).toBeVisible();
	await editor.fill("A later saved revision");
	await priority.fill("A different priority");
	await button(page, "Save changes").click();
	await expect(text(page, "Changes saved")).toBeVisible();
	await button(page, "History").click();
	await page
		.getByRole("menuitem")
		.filter({ hasText: VERSION_RE })
		.first()
		.click();
	await expect(
		page.getByRole("heading", { name: /^Review version/ })
	).toBeFocused();
	await button(page, "Restore this version").click();
	await expect(text(page, "Version restored")).toBeVisible();
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
	let saveRequests = 0;
	page.on("request", (request) => {
		if (request.url().includes("/rpc/businessContext/save")) {
			saveRequests += 1;
		}
	});
	await editor.fill(brief);
	const saved = page.waitForResponse((response) =>
		response.url().includes("/rpc/businessContext/save")
	);
	await editor.press("ControlOrMeta+s");
	expect((await saved).ok()).toBe(true);
	await expect(text(page, "Changes saved")).toBeVisible();
	expect(saveRequests).toBe(1);
	await page.reload();
	await editBrief(page);
	await expect(editor).toHaveValue(brief);
	await expect(button(page, "Save changes")).toBeDisabled();
	await expect(button(page, "Regenerate with AI")).toBeEnabled();
});

test("opens an empty editable brief ready for typing", {
	tag: "@regression",
}, async ({ authenticatedPage: page, mockRpc }) => {
	await mockRpc("businessContext/get", { ...settings(), profile: null });
	await page.goto(path);
	await expect(tab(page, "Edit")).toHaveAttribute("aria-selected", "true");
	const editor = textbox(page, "Business brief");
	await expect(editor).toBeEditable();
	await expect(button(page, "Write a brief")).toBeHidden();
	await expect(button(page, "Save changes")).toBeDisabled();
	await editor.fill("A brief typed without an extra setup step.");
	await expect(button(page, "Save changes")).toBeEnabled();
});

test("saves distinct team fields even when their formatted prose matches", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	const initial = settings();
	profileOf(initial).teamContext = {
		priority: "Improve retention\n\nSuccess definition: Weekly bookings",
		successDefinition: "",
		exclusions: "",
	};
	const updatedTeam = {
		priority: "Improve retention",
		successDefinition: "Weekly bookings",
		exclusions: "",
	};
	const api = await mockContextApi(page, initial);
	await page.goto(path);
	await page.getByRole("button", { name: ADD_DETAILS_RE }).click();
	const priority = textbox(page, "Current priority");
	const success = textbox(page, "How you define success");
	await priority.fill(updatedTeam.priority);
	await success.fill(updatedTeam.successDefinition);
	await expect(button(page, "Save changes")).toBeEnabled();
	await button(page, "Save changes").click();
	await expect(text(page, "Changes saved")).toBeVisible();
	expect(api.saved.map((input) => input.teamContext)).toEqual([updatedTeam]);
	await page.reload();
	await expect(priority).toHaveValue(updatedTeam.priority);
	await expect(success).toHaveValue(updatedTeam.successDefinition);
	await expect(button(page, "Save changes")).toBeDisabled();
});

test("restores the submitted website and pages when retrying a failed generation", {
	tag: "@regression",
}, async ({ authenticatedPage: page, contextStream, mockRpc }) => {
	const sourceUrls = [
		"https://second.example.net/pricing",
		"https://second.example.net/docs",
	];
	await mockRpc("businessContext/get", {
		...settings(),
		websites: [
			...settings().websites,
			{
				id: "second-site",
				name: "Second studio",
				domain: "second.example.net",
			},
		],
		generation: failed(timeoutError, {
			websiteId: "second-site",
			domain: "second.example.net",
			sourceUrls,
		}),
	});
	await contextStream.intercept();
	await page.goto(path);
	const sources = await sourcesInput(page);
	await expect(sources).toHaveValue(sourceUrls.join("\n"));
	await expectResearchWebsite(page, "Second studio");
	await page.reload();
	await expect(sources).toHaveValue(sourceUrls.join("\n"));
	await button(page, "Regenerate with AI").click();
	await expect(button(page, "Cancel generation")).toBeVisible();
	await contextStream.connected;
	expect(contextStream.requests).toMatchObject([
		{ websiteId: "second-site", sourceUrls },
	]);
});

test("shows a loading state until the brief and generation access resolve", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	const brief = Promise.withResolvers<void>();
	const access = Promise.withResolvers<void>();
	await page.route("**/rpc/businessContext/get", async (route) => {
		await brief.promise;
		await fulfillRpc(page, route, settings());
	});
	await page.route("**/rpc/businessContext/generationAccess", async (route) => {
		await access.promise;
		await fulfillRpc(page, route, allowedAccess);
	});
	await page.goto(path, { waitUntil: "domcontentloaded" });
	const loading = page.getByRole("status", {
		name: "Loading business context",
		exact: true,
	});
	await expect(loading).toBeVisible();
	brief.resolve();
	await expect(loading).toBeHidden();
	await expect(text(page, savedContent)).toBeVisible();
	await expect(button(page, "Regenerate with AI")).toBeDisabled();
	access.resolve();
	await expect(button(page, "Regenerate with AI")).toBeEnabled();
});

test("keeps typing when AI finishes and saves only the reviewed draft", {
	tag: "@regression",
}, async ({ authenticatedPage: page, contextStream }) => {
	const api = await mockContextApi(page, settings());
	await contextStream.intercept();
	await page.goto(path);
	const editor = await editBrief(page);
	await expect(editor).toHaveValue(savedContent);
	await button(page, "Regenerate with AI").click();
	await contextStream.connected;
	api.current = { ...settings(), generation: generation() };
	contextStream.send(api.current);
	await expect(button(page, "Cancel generation")).toBeVisible();
	await editBrief(page);
	await editor.fill("My unfinished edits");
	api.current = drafted(generatedContent, {
		draft: {
			content: generatedContent,
			sources: [{ url: "https://example.com/pricing", title: "Pricing" }],
		},
	});
	contextStream.send(api.current);
	contextStream.end();
	await expect(button(page, "Review AI draft")).toBeVisible();
	await expect(editor).toHaveValue("My unfinished edits");
	await button(page, "Review AI draft").click();
	await expect(region(page, "Review AI draft")).toContainText(
		"Customers subscribe monthly."
	);
	await expect(heading(page, "Review AI draft")).toBeFocused();
	await expect(
		region(page, "Current version").getByRole("link", { name: /^Example/ })
	).toHaveAttribute("href", "https://example.com");
	await expect(
		region(page, "Proposed version").getByRole("link", { name: /^Pricing/ })
	).toHaveAttribute("href", "https://example.com/pricing");
	await button(page, "Use AI draft").click();
	await expect(tab(page, "Preview")).toBeFocused();
	await editBrief(page);
	await expect(editor).toHaveValue(generatedContent);
	expect(api.saved).toHaveLength(0);
	await editor.fill(`${generatedContent}\nFocus on paid signups.`);
	await editor.press("ControlOrMeta+s");
	await expect(text(page, "Changes saved")).toBeVisible();
	expect(api.saved).toMatchObject([
		{
			content: `${generatedContent}\nFocus on paid signups.`,
			revision: 1,
			generationId: GENERATION_ID,
		},
	]);
	await expect(button(page, "Save changes")).toBeDisabled();
});

test("discards an AI draft without restoring it on the next refresh", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	await mockContextApi(page, drafted());
	await page.goto(path);
	await useGeneratedDraft(page);
	const editor = await editBrief(page);
	await expect(editor).toHaveValue(generatedContent);
	await button(page, "Discard changes").click();
	await editBrief(page);
	await expect(editor).toHaveValue(savedContent);
	await page.reload();
	await expect(button(page, "Review AI draft")).toBeHidden();
	await expect(button(page, "Save changes")).toBeDisabled();
	await editBrief(page);
	await expect(editor).toHaveValue(savedContent);
});

test("dismisses a persisted generation failure without losing unsaved context", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	const cancelledIds: string[] = [];
	const api = await mockContextApi(
		page,
		{ ...settings(), generation: failed(timeoutError) },
		async (method, route) => {
			if (method !== "cancel") {
				return false;
			}
			cancelledIds.push(inputOf<{ generationId: string }>(route).generationId);
			if (cancelledIds.length > 1) {
				return false;
			}
			await rpcError(
				page,
				route,
				503,
				"SERVICE_UNAVAILABLE",
				"Could not dismiss this failure. Try again."
			);
			return true;
		}
	);
	await page.goto(path);
	const expiredError = text(page, timeoutError);
	await expect(expiredError).toBeVisible();
	await page.reload();
	await expect(expiredError).toBeVisible();
	expect(api.calls).toHaveLength(0);
	const editor = await editBrief(page);
	await editor.fill("Keep my unfinished business brief.");
	await page.getByRole("button", { name: ADD_DETAILS_RE }).click();
	const priority = textbox(page, "Current priority");
	await priority.fill("Keep my team priority too.");
	const dismiss = button(page, "Dismiss generation error");
	await dismiss.click();
	await expect(
		page.getByTestId("business-context-brief").getByRole("alert")
	).toContainText("Could not dismiss this failure. Try again.");
	await expect(expiredError).toBeVisible();
	await expect(editor).toHaveValue("Keep my unfinished business brief.");
	await expect(priority).toHaveValue("Keep my team priority too.");
	await expect(dismiss).toBeEnabled();
	await dismiss.click();
	await expect(text(page, "Generation error dismissed")).toBeVisible();
	await expect(expiredError).toBeHidden();
	await expect(dismiss).toBeHidden();
	await expect(editor).toHaveValue("Keep my unfinished business brief.");
	await expect(priority).toHaveValue("Keep my team priority too.");
	expect(cancelledIds).toEqual([GENERATION_ID, GENERATION_ID]);
	expect(api.calls).toEqual(["cancel", "cancel"]);
	expect(api.current.profile?.content).toBe(savedContent);
	await page.reload();
	await editBrief(page);
	await expect(expiredError).toBeHidden();
	await expect(dismiss).toBeHidden();
	await expect(editor).toHaveValue("Keep my unfinished business brief.");
	await expect(priority).toHaveValue("Keep my team priority too.");
	api.current = {
		...api.current,
		generation: failed("The source website could not be read.", {
			id: SECOND_GENERATION_ID,
			requestedAt: new Date().toISOString(),
		}),
	};
	await page.reload();
	await expect(
		text(page, "The source website could not be read.")
	).toBeVisible();
	await expect(dismiss).toBeVisible();
	await editBrief(page);
	await expect(editor).toHaveValue("Keep my unfinished business brief.");
	await expect(priority).toHaveValue("Keep my team priority too.");
	expect(api.calls).toEqual(["cancel", "cancel"]);
});

test("dismisses a failed generation when no website is configured", {
	tag: "@regression",
}, async ({ authenticatedPage: page, mockRpc }) => {
	await mockRpc("businessContext/generationAccess", {
		status: "not-configured",
		billingMode: null,
		message:
			"AI draft generation is not configured. Contact your administrator, or edit the context manually.",
		action: "contact-admin",
	});
	const cancelledIds: string[] = [];
	const api = await mockContextApi(
		page,
		{ ...settings(), websites: [], generation: failed(timeoutError) },
		async (method, route) => {
			if (method === "cancel") {
				cancelledIds.push(
					inputOf<{ generationId: string }>(route).generationId
				);
			}
			return false;
		}
	);
	await page.goto(path);
	const failure = text(page, timeoutError);
	await expect(failure).toBeVisible();
	await expect(link(page, "Add your website")).toBeVisible();
	const editor = await editBrief(page);
	await editor.fill("Keep this unfinished brief while dismissing the failure.");
	await button(page, "Dismiss generation error").click();
	await expect(failure).toBeHidden();
	await expect(editor).toHaveValue(
		"Keep this unfinished brief while dismissing the failure."
	);
	await page.reload();
	await editBrief(page);
	await expect(failure).toBeHidden();
	await expect(editor).toHaveValue(
		"Keep this unfinished brief while dismissing the failure."
	);
	expect(api.calls).toEqual(["cancel"]);
	expect(cancelledIds).toEqual([GENERATION_ID]);
});

test("requires conflict review before saving an AI draft based on an older brief", {
	tag: "@regression",
}, async ({ authenticatedPage: page, e2eSession }) => {
	const newerContent = "A teammate corrected the newer saved brief.";
	const storageKey = `business-context-draft:${e2eSession.userId}:${e2eSession.organizationId}`;
	const api = await mockContextApi(page, {
		...drafted(),
		profile: { ...profileOf(settings()), content: newerContent, revision: 2 },
	});
	await page.goto(path);
	await button(page, "Review AI draft").click();
	await expect(
		text(
			page,
			"This draft predates the latest saved version. Check any recent corrections before using it."
		)
	).toBeVisible();
	await button(page, "Use AI draft").click();
	const recoveredDraft = () =>
		page.evaluate((key) => {
			const value = sessionStorage.getItem(key);
			return value ? JSON.parse(value).draft : null;
		}, storageKey);
	await expect.poll(recoveredDraft).toMatchObject({
		revision: 1,
		content: generatedContent,
		generationId: GENERATION_ID,
	});
	const save = button(page, "Save changes");
	await expect(save).toBeDisabled();
	await page.keyboard.press("ControlOrMeta+s");
	expect(api.saved).toHaveLength(0);
	await page.reload();
	await expect(text(page, generatedContent)).toBeVisible();
	await expect(save).toBeDisabled();
	await expect
		.poll(recoveredDraft)
		.toMatchObject({ revision: 1, generationId: GENERATION_ID });
	await button(page, "Review update").click();
	const review = region(page, "Review saved changes");
	await expect(review).toContainText(newerContent);
	await expect(review).toContainText(generatedContent);
	expect(api.saved).toHaveLength(0);
	await button(page, "Keep editing my version").click();
	await expect
		.poll(recoveredDraft)
		.toMatchObject({ revision: 2, generationId: GENERATION_ID });
	await expect(save).toBeEnabled();
	await save.click();
	await expect(text(page, "Changes saved")).toBeVisible();
	expect(api.saved).toMatchObject([
		{ revision: 2, content: generatedContent, generationId: GENERATION_ID },
	]);
});

test("preserves edits on a revision conflict and requires reviewing the new brief", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	const savedRevisions: number[] = [];
	const api = await mockContextApi(page, settings(), async (method, route) => {
		if (method !== "save") {
			return false;
		}
		const input = inputOf(route);
		savedRevisions.push(input.revision);
		if (input.revision !== 1) {
			return false;
		}
		api.current = {
			...api.current,
			profile: {
				...profileOf(api.current),
				content: "A teammate's newer brief.",
				revision: 2,
			},
		};
		await rpcError(
			page,
			route,
			409,
			"CONFLICT",
			"The business brief was updated. Review the latest version."
		);
		return true;
	});
	await page.goto(path);
	const editor = await editBrief(page);
	await editor.fill("My local brief");
	await button(page, "Save changes").click();
	await expect(button(page, "Review update")).toBeVisible();
	await expect(editor).toHaveValue("My local brief");
	await expect(button(page, "Save changes")).toBeDisabled();
	await button(page, "Review update").click();
	await expect(text(page, "A teammate's newer brief.")).toBeVisible();
	await button(page, "Keep editing my version").click();
	await expect(editor).toBeFocused();
	await button(page, "Save changes").click();
	await expect(text(page, "Changes saved")).toBeVisible();
	expect(savedRevisions).toEqual([1, 2]);
});

test("shows the saved brief and sources to members without edit controls", {
	tag: "@regression",
}, async ({ authenticatedPage: page, mockRpc }) => {
	await mockRpc("businessContext/get", { ...settings(), canEdit: false });
	await page.goto(path);
	await expect(text(page, savedContent)).toBeVisible();
	await expect(tab(page, "Edit")).toBeHidden();
	await expect(textbox(page, "Business brief")).toBeHidden();
	await expect(
		page.getByRole("button", {
			name: /Generate with AI|Regenerate with AI|Save changes|Discard changes/,
		})
	).toBeHidden();
	await text(page, "1 source").click();
	await expect(page.getByRole("link", { name: /^Example/ })).toHaveAttribute(
		"href",
		"https://example.com"
	);
});

test("can save retained text after regenerating and declining the replacement", {
	tag: "@regression",
}, async ({ authenticatedPage: page, contextStream }) => {
	const first = drafted(generatedContent, { id: "first-generation" });
	const api = await mockContextApi(page, first);
	await contextStream.intercept();
	await page.goto(path);
	await useGeneratedDraft(page);
	const editor = await editBrief(page);
	await expect(editor).toHaveValue(generatedContent);
	await button(page, "Regenerate with AI").click();
	await contextStream.connected;
	api.current = {
		...first,
		previousDrafts: [first.generation],
		generation: {
			...first.generation,
			id: "second-generation",
			draft: { content: "A replacement brief.", sources: [] },
		},
	};
	contextStream.send(api.current);
	contextStream.end();
	await button(page, "Review AI draft").click();
	await button(page, "Keep current text").click();
	await expect(tab(page, "Preview")).toBeFocused();
	await editBrief(page);
	await expect(editor).toHaveValue(generatedContent);
	await button(page, "Save changes").click();
	await expect(text(page, "Changes saved")).toBeVisible();
	expect(api.saved).toMatchObject([
		{
			content: generatedContent,
			revision: 1,
			generationId: "first-generation",
		},
	]);
});

test("a late save cannot clear a newer draft written after navigation", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	const pending = Promise.withResolvers<void>();
	await mockContextApi(page, settings(), async (method) => {
		if (method === "save") {
			await pending.promise;
		}
		return false;
	});
	await page.goto(path);
	const editor = await editBrief(page);
	await editor.fill("Save A");
	await button(page, "Save changes").click();
	await goToGeneral(page);
	await editBrief(page);
	await expect(editor).toBeEditable();
	await editor.fill("Newer draft B");
	const response = page.waitForResponse((item) =>
		item.url().endsWith("/businessContext/save")
	);
	pending.resolve();
	await response;
	await expect(editor).toHaveValue("Newer draft B");
	await page.reload();
	await editBrief(page);
	await expect(editor).toHaveValue("Newer draft B");
	await expect(button(page, "Review update")).toBeVisible();
});

test("failed browser storage keeps newer text and discarded tombstones across in-app navigation", {
	tag: "@regression",
}, async ({ authenticatedPage: page, mockRpc }) => {
	await mockRpc("businessContext/get", settings());
	await page.goto(path);
	const editor = await editBrief(page);
	await editor.fill("Old persisted draft");
	await page.evaluate(() => {
		for (const method of ["setItem", "removeItem"] as const) {
			const original = Storage.prototype[method];
			Storage.prototype[method] = function (
				this: Storage,
				key: string,
				value = ""
			) {
				if (key.startsWith("business-context-draft:")) {
					throw new DOMException(
						"Synthetic quota failure",
						"QuotaExceededError"
					);
				}
				return original.call(this, key, value);
			};
		}
	});
	await editor.fill("Newer memory draft");
	const sources = await sourcesInput(page);
	await sources.fill("https://example.com/unfinished");
	await goToGeneral(page);
	await editBrief(page);
	await expect(editor).toHaveValue("Newer memory draft");
	await expect(sources).toHaveValue("https://example.com/unfinished");
	await button(page, "Discard changes").click();
	await editBrief(page);
	await goToGeneral(page);
	await editBrief(page);
	await expect(editor).toHaveValue(savedContent);
	await expect(sources).toHaveValue("https://example.com/unfinished");
});

test("choosing a saved version dismisses an available AI draft", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	const api = await mockContextApi(page, settings(), async (method, route) => {
		if (method !== "save") {
			return false;
		}
		api.current = {
			...drafted(generatedContent, { baseRevision: 2 }),
			profile: {
				...profileOf(api.current),
				content: "Teammate's saved choice",
				revision: 2,
			},
		};
		await rpcError(page, route, 409, "CONFLICT", "Review newer saved context");
		return true;
	});
	await page.goto(path);
	const editor = await editBrief(page);
	await editor.fill("My edits");
	await button(page, "Save changes").click();
	await button(page, "Review update").click();
	await button(page, "Use saved version").click();
	await editBrief(page);
	await expect(editor).toHaveValue("Teammate's saved choice");
	await page.reload();
	await editBrief(page);
	await expect(editor).toHaveValue("Teammate's saved choice");
	await expect(button(page, "Review AI draft")).toBeHidden();
});

test("renders the brief as Markdown and preserves exact text between edit and preview", {
	tag: "@regression",
}, async ({ authenticatedPage: page, mockRpc }) => {
	const markdown =
		"## Who we serve\n\n**Independent studios** use Example.\n\n- Schedule classes\n- [Read the guide](https://example.com/guide)";
	await mockRpc("businessContext/get", {
		...settings(),
		profile: { ...profileOf(settings()), content: markdown },
	});
	await page.goto(path);
	await expect(heading(page, "Who we serve")).toBeVisible();
	await expect(
		page.getByRole("listitem").filter({ hasText: "Schedule classes" })
	).toBeVisible();
	await button(page, "Read the guide").click();
	await expect(text(page, "https://example.com/guide")).toBeVisible();
	await button(page, "Close").click();
	await expect(textbox(page, "Business brief")).toBeHidden();
	const editor = await editBrief(page);
	await expect(editor).toHaveValue(markdown);
	const edited = `${markdown}\n\n### This quarter\n\nIncrease repeat bookings.`;
	await editor.fill(edited);
	await tab(page, "Preview").click();
	await expect(heading(page, "This quarter")).toBeVisible();
	await expect(button(page, "Save changes")).toBeEnabled();
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
	}, async ({ authenticatedPage: page, mockRpc }) => {
		await mockRpc("businessContext/generationAccess", access);
		const api = await mockContextApi(page, settings());
		await page.goto(path);
		await expect(text(page, access.message)).toBeVisible();
		await expect(button(page, "Regenerate with AI")).toBeHidden();
		if (access.action === "billing") {
			await expect(link(page, "Manage billing")).toHaveAttribute(
				"href",
				BILLING_HREF_RE
			);
		} else {
			await expect(button(page, "Check again")).toBeEnabled();
		}
		const editor = await editBrief(page);
		await editor.fill(
			"Our team can maintain this brief without AI generation."
		);
		await button(page, "Save changes").click();
		await expect(text(page, "Changes saved")).toBeVisible();
		expect(api.current.profile?.content).toBe(
			"Our team can maintain this brief without AI generation."
		);
		expect(api.calls).not.toContain("generate");
	});
}

test("streams a separate proposed brief without replacing local edits or enabling early acceptance", {
	tag: "@regression",
}, async ({ authenticatedPage: page, contextStream, mockRpc }) => {
	let current = settings();
	let reads = 0;
	await mockRpc("businessContext/get", () => {
		reads += 1;
		return current;
	});
	await contextStream.intercept();
	await page.goto(path);
	const editor = await editBrief(page);
	await editor.fill("My unfinished context stays here.");
	await button(page, "Regenerate with AI").click();
	await contextStream.connected;
	current = researching();
	contextStream.send(current);
	const readsAtStart = reads;
	const research = page.getByTestId("business-context-research");
	await expect(text(page, "Reading your sources")).toBeVisible();
	await expect(button(research, "Research options")).toBeDisabled();
	await expect(button(research, "Cancel generation")).toBeEnabled();
	current = {
		...current,
		generation: {
			...current.generation,
			progress: {
				stage: "writing",
				content:
					"## Proposed understanding\n\nExample serves independent studios.",
			},
		},
	};
	contextStream.send(current);
	await tab(page, "AI draft").click();
	await expect(heading(page, "Proposed understanding")).toBeVisible({
		timeout: 10_000,
	});
	await editBrief(page);
	await expect(editor).toHaveValue("My unfinished context stays here.");
	await expect(button(page, "Use AI draft")).toBeHidden();
	await expect(button(page, "Review AI draft")).toBeHidden();
	current = {
		...current,
		generation: {
			...current.generation,
			status: "ready",
			draft: {
				content: "## Proposed understanding\n\nA complete explanation.",
				sources: [],
			},
		},
	};
	expect(reads).toBe(readsAtStart);
	contextStream.send(current);
	contextStream.end();
	await expect(button(page, "Review AI draft")).toBeVisible({
		timeout: 10_000,
	});
	await editBrief(page);
	await expect(editor).toHaveValue("My unfinished context stays here.");
	await button(page, "Review AI draft").click();
	const review = region(page, "Review AI draft");
	await expect(heading(review, "Current version")).toBeVisible();
	await expect(heading(review, "Proposed version")).toBeVisible();
	await expect(review).toContainText("My unfinished context stays here.");
	await expect(review).toContainText("A complete explanation.");
	await expect(review.locator("ins, del")).toHaveCount(0);
});

test("keeps current and proposed documents readable in a narrow viewport", {
	tag: "@regression",
}, async ({ authenticatedPage: page, mockRpc }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await mockRpc(
		"businessContext/get",
		drafted("## Proposed business\n\nStudios sell monthly memberships.")
	);
	await page.goto(path);
	await button(page, "Review AI draft").click();
	const review = region(page, "Review AI draft");
	const versions = review.getByRole("radiogroup", {
		name: "Version to review",
		exact: true,
	});
	await expect(heading(page, "Review AI draft")).toBeFocused();
	await expect(
		review.getByRole("radio", { name: "Proposed version", exact: true })
	).toBeChecked();
	await expect(heading(review, "Proposed business")).toBeVisible();
	await expect(heading(review, "Current version")).toBeHidden();
	await text(versions, "Current version").click();
	await expect(
		review.getByRole("radio", { name: "Current version", exact: true })
	).toBeChecked();
	await expect(text(review, savedContent)).toBeVisible();
	await expect(heading(review, "Proposed business")).toBeHidden();
	await text(versions, "Proposed version").click();
	await expect(heading(review, "Proposed business")).toBeVisible();
	await expect(button(review, "Use AI draft")).toBeVisible();
});

test("cancels research before its first event without losing manual work", {
	tag: "@regression",
}, async ({ authenticatedPage: page, contextStream, mockRpc }) => {
	await mockRpc("businessContext/get", settings());
	await contextStream.intercept();
	await page.goto(path);
	const editor = await editBrief(page);
	await editor.fill("Keep this unfinished brief.");
	const sources = await sourcesInput(page);
	await sources.fill("https://example.com/docs");
	await button(page, "Regenerate with AI").click();
	await contextStream.connected;
	await expect(tab(page, "AI draft")).toHaveAttribute("aria-selected", "true");
	await button(page, "Cancel generation").click();
	await contextStream.disconnected;
	await expect(button(page, "Regenerate with AI")).toBeEnabled();
	await editBrief(page);
	await expect(editor).toHaveValue("Keep this unfinished brief.");
	await expect(sources).toHaveValue("https://example.com/docs");
	expect(contextStream.requests).toHaveLength(1);
});

test("saving manual edits stops the stream and ignores its late draft", {
	tag: "@regression",
}, async ({ authenticatedPage: page, contextStream }) => {
	const api = await mockContextApi(page, settings());
	await contextStream.intercept();
	await page.goto(path);
	await button(page, "Regenerate with AI").click();
	await contextStream.connected;
	api.current = researching();
	contextStream.send(api.current);
	const editor = await editBrief(page);
	await editor.fill("The manual correction must win.");
	await button(page, "Save changes").click();
	await contextStream.disconnected;
	contextStream.send(drafted("A late AI answer must not replace it."));
	await expect(text(page, "Changes saved")).toBeVisible();
	await expect(editor).toHaveValue("The manual correction must win.");
	await expect(button(page, "Review AI draft")).toBeHidden();
	await page.reload();
	await editBrief(page);
	await expect(editor).toHaveValue("The manual correction must win.");
	expect(api.current.profile?.revision).toBe(2);
});

test("an interrupted response preserves edits and does not restart generation on reload", {
	tag: "@regression",
}, async ({ authenticatedPage: page, contextStream, mockRpc }) => {
	let current = settings();
	await mockRpc("businessContext/get", () => current);
	await contextStream.intercept();
	await page.goto(path);
	const editor = await editBrief(page);
	await editor.fill("Keep the brief across a disconnected stream.");
	const sources = await sourcesInput(page);
	await sources.fill("https://example.com/pricing");
	await button(page, "Regenerate with AI").click();
	await contextStream.connected;
	current = {
		...researching(),
		generation: {
			...researching().generation,
			progress: {
				stage: "writing",
				content: "## Partial answer\n\nStill incomplete.",
			},
		},
	};
	contextStream.send(current);
	await expect(heading(page, "Partial answer")).toBeVisible();
	current = settings();
	contextStream.end();
	await expect(
		page.getByTestId("business-context-brief").getByRole("alert")
	).toContainText("Research could not be completed");
	await expect(button(page, "Review AI draft")).toBeHidden();
	await page.reload();
	await editBrief(page);
	await expect(editor).toHaveValue(
		"Keep the brief across a disconnected stream."
	);
	await expect(sources).toHaveValue("https://example.com/pricing");
	await expect(button(page, "Regenerate with AI")).toBeEnabled();
	expect(contextStream.requests).toHaveLength(1);
});

test("recovers unsubmitted research inputs independently of brief saving and legacy drafts", {
	tag: "@regression",
}, async ({ authenticatedPage: page, e2eSession }) => {
	const storageKey = `business-context-draft:${e2eSession.userId}:${e2eSession.organizationId}`;
	await page.addInitScript(
		({ storageKey }) => {
			if (!sessionStorage.getItem(storageKey)) {
				sessionStorage.setItem(
					storageKey,
					JSON.stringify({
						revision: 1,
						content: "A draft stored by an older tab.",
					})
				);
			}
		},
		{ storageKey }
	);
	await mockContextApi(page, {
		...settings(),
		websites: [
			...settings().websites,
			{
				id: "second-site",
				name: "Second studio",
				domain: "second.example.net",
			},
		],
	});
	await page.goto(path);
	const editor = await editBrief(page);
	await expect(editor).toHaveValue("A draft stored by an older tab.");
	await button(page, "Research options").click();
	await page
		.getByRole("menuitemradio", { name: "Second studio", exact: true })
		.click();
	const sources = await sourcesInput(page);
	const unfinished = "https://second.example.net/pricing\nhttps://";
	await sources.fill(unfinished);
	await page.reload();
	await expect(sources).toHaveValue(unfinished);
	await expectResearchWebsite(page, "Second studio");
	await editBrief(page);
	await expect(editor).toHaveValue("A draft stored by an older tab.");
	await button(page, "Save changes").click();
	await expect(text(page, "Changes saved")).toBeVisible();
	await page.reload();
	await expect(sources).toHaveValue(unfinished);
	await expect(button(page, "Save changes")).toBeDisabled();
	await goToGeneral(page);
	await expect(sources).toHaveValue(unfinished);
	await expectResearchWebsite(page, "Second studio");
});

test("leaving the page aborts active research without restarting it on return", {
	tag: "@regression",
}, async ({ authenticatedPage: page, contextStream, mockRpc }) => {
	let current = settings();
	await mockRpc("businessContext/get", () => current);
	await contextStream.intercept();
	await page.goto(path);
	const editor = await editBrief(page);
	await editor.fill("Keep this context when navigating away.");
	await button(page, "Regenerate with AI").click();
	await contextStream.connected;
	current = researching();
	contextStream.send(current);
	await expect(button(page, "Cancel generation")).toBeEnabled();
	await link(page, "General").click();
	await contextStream.disconnected;
	current = settings();
	await link(page, "Business context").click();
	await editBrief(page);
	await expect(editor).toHaveValue("Keep this context when navigating away.");
	await expect(button(page, "Regenerate with AI")).toBeEnabled();
	expect(contextStream.requests).toHaveLength(1);
});

test("shows research results without reusing the previous run or waiting for refresh", {
	tag: "@regression",
}, async ({ authenticatedPage: page, contextStream }) => {
	const oldQuestion = "Which old goal matters?";
	let current: BusinessContextSettings = drafted("The previous AI proposal.", {
		research: {
			startedAt: "2026-09-18T10:00:00Z",
			pages: [{ url: "https://example.com/old", status: "read" }],
		},
		draft: {
			content: "The previous AI proposal.",
			sources: [],
			followUpQuestions: [{ field: "priority", question: oldQuestion }],
		},
	});
	const refresh = Promise.withResolvers<void>();
	let holdRefresh = false;
	await page.route("**/rpc/businessContext/get", async (route) => {
		if (holdRefresh) {
			await refresh.promise;
		}
		await fulfillRpc(page, route, current);
	});
	await contextStream.intercept();
	await page.goto(path);
	await expect(text(page, oldQuestion)).toBeVisible();
	await button(page, "Regenerate with AI").click();
	await contextStream.connected;
	const panel = page.getByRole("tabpanel", { name: "AI draft", exact: true });
	await expect(panel).toContainText("Reading your sources");
	await expect(panel).not.toContainText("The previous AI proposal.");
	await expect(text(page, oldQuestion)).toBeHidden();
	const report = region(page, "Research report");
	await expect(link(report, "https://example.com/old")).toBeHidden();
	const priority = textbox(page, "Current priority");
	await expect(priority).toBeHidden();
	current = {
		...researching(),
		generation: {
			...researching().generation,
			id: SECOND_GENERATION_ID,
			research: {
				startedAt: "2026-09-18T11:00:00Z",
				pages: [
					{
						url: "https://example.com",
						title: "Studio homepage",
						status: "read",
					},
					{ url: "https://example.com/pricing", status: "failed" },
				],
				discoveryFailed: true,
			},
		},
	};
	contextStream.send(current);
	await expect(report).toContainText("1 page read · 1 could not be read");
	await expect(report).toContainText(
		"Additional page discovery was unavailable."
	);
	await expect(priority).toBeHidden();
	await button(report, "Pages checked (2)").click();
	await expect(link(report, "Studio homepage")).toHaveAttribute(
		"href",
		"https://example.com"
	);
	current = {
		...current,
		generation: {
			...(current.generation as Generation),
			status: "ready",
			draft: {
				content: "The new completed proposal.",
				sources: [],
				followUpQuestions: [
					{
						field: "successDefinition",
						question: "Which completed booking counts as success?",
					},
				],
			},
		},
	};
	holdRefresh = true;
	contextStream.send(current);
	contextStream.end();
	try {
		await expect(button(page, "Review AI draft")).toBeVisible();
		await expect(button(page, "Cancel generation")).toBeHidden();
		await expect(
			text(page, "Which completed booking counts as success?")
		).toBeVisible();
		await expect(report).toContainText("1 page read · 1 could not be read");
		await expect(text(page, oldQuestion)).toBeHidden();
	} finally {
		refresh.resolve();
	}
});

test("keeps a failed streamed research report and its explanation visible", {
	tag: "@regression",
}, async ({ authenticatedPage: page, contextStream, mockRpc }) => {
	let current = settings();
	await mockRpc("businessContext/get", () => current);
	await contextStream.intercept();
	await page.goto(path);
	const editor = await editBrief(page);
	await editor.fill("Keep this manual brief.");
	await button(page, "Regenerate with AI").click();
	await contextStream.connected;
	current = {
		...researching(),
		generation: failed("The source website could not be read.", {
			research: {
				startedAt: "2026-09-18T11:00:00Z",
				pages: [{ url: "https://example.com", status: "failed" }],
			},
		}),
	};
	contextStream.send(current);
	contextStream.end();
	const draftTab = tab(page, "AI draft");
	await expect(draftTab).toHaveAttribute("aria-selected", "true");
	await expect(draftTab).toBeFocused();
	const alert = page.getByTestId("business-context-brief").getByRole("alert");
	await expect(alert).toContainText("The source website could not be read.");
	await expect(alert).toBeInViewport();
	const report = region(page, "Research report");
	await expect(report).toContainText("0 pages read · 1 could not be read");
	await expect(button(page, "Review AI draft")).toBeHidden();
	await page.reload();
	await expect(report).toContainText("0 pages read · 1 could not be read");
	await editBrief(page);
	await expect(editor).toHaveValue("Keep this manual brief.");
});

test("answers research questions in existing team fields and saves them independently of the AI brief", {
	tag: "@regression",
}, async ({ authenticatedPage: page }) => {
	const priorityQuestion = "Which studio outcome should improve first?";
	const successQuestion = "What does a successfully activated studio do?";
	const exclusionQuestion =
		"Which internal studio accounts should be excluded?";
	const questions = [
		{ field: "priority" as const, question: priorityQuestion },
		{ field: "successDefinition" as const, question: successQuestion },
		{ field: "exclusions" as const, question: exclusionQuestion },
	];
	const research = {
		startedAt: "2026-09-18T11:00:00Z",
		pages: [{ url: "https://example.com", status: "read" as const }],
	};
	const api = await mockContextApi(
		page,
		drafted(generatedContent, {
			research,
			draft: {
				content: generatedContent,
				sources: [],
				followUpQuestions: questions,
			},
		}),
		async (method, route) => {
			if (method !== "save") {
				return false;
			}
			const input = inputOf(route);
			api.saved.push(input);
			api.current = {
				...api.current,
				generation: null,
				profile: {
					...profileOf(api.current),
					content: input.content,
					revision: 2,
					teamContext: input.teamContext,
					research,
					followUpQuestions: questions.filter(
						({ field }) => !input.teamContext[field].trim()
					),
				},
			};
			await fulfillRpc(page, route, api.current);
			return true;
		}
	);
	await page.goto(path);
	const priority = textbox(page, "Current priority");
	await expect(priority).toHaveAccessibleDescription(priorityQuestion);
	await priority.fill("Improve first paid bookings.");
	await expect(priority).toBeFocused();
	await expect(priority).toHaveAccessibleDescription(priorityQuestion);
	await expect(text(page, "Answer not saved")).toBeVisible();
	await page.reload();
	await expect(priority).toHaveValue("Improve first paid bookings.");
	await expect(priority).toHaveAccessibleDescription(priorityQuestion);
	await button(page, "Save changes").click();
	await expect(text(page, "Changes saved")).toBeVisible();
	expect(api.saved).toHaveLength(1);
	expect(api.saved[0]?.content).toBe(savedContent);
	expect(api.saved[0]?.generationId).toBeUndefined();
	await expect(text(page, priorityQuestion)).toBeHidden();
	await expect(text(page, successQuestion)).toBeVisible();
	await expect(text(page, exclusionQuestion)).toBeVisible();
	await expect(region(page, "Last research")).toContainText("1 page read");
	await page.reload();
	await expect(priority).toHaveValue("Improve first paid bookings.");
	await expect(text(page, successQuestion)).toBeVisible();
});

test("does not attach newer research metadata to an adopted legacy draft", {
	tag: "@regression",
}, async ({ authenticatedPage: page, e2eSession, mockRpc }) => {
	const adopted = drafted("The older draft I selected.").generation;
	await page.addInitScript(
		({ key, generationId, content }) => {
			sessionStorage.setItem(
				key,
				JSON.stringify({ revision: 1, generationId, content })
			);
		},
		{
			key: `business-context-draft:${e2eSession.userId}:${e2eSession.organizationId}`,
			generationId: adopted.id,
			content: "The older draft I selected.",
		}
	);
	await mockRpc("businessContext/get", {
		...settings(),
		previousDrafts: [adopted],
		generation: {
			...adopted,
			id: SECOND_GENERATION_ID,
			research: {
				startedAt: "2026-09-18T11:00:00Z",
				pages: [{ url: "https://example.com/new", status: "read" }],
			},
			draft: {
				content: "The new proposal I have not selected.",
				sources: [],
				followUpQuestions: [
					{ field: "priority", question: "A question from the newer run?" },
				],
			},
		},
	});
	await page.goto(path);
	await expect(page.getByTestId("business-context-document")).toContainText(
		"The older draft I selected."
	);
	await expect(region(page, "Research report")).toBeHidden();
	await expect(text(page, "A question from the newer run?")).toBeHidden();
});
