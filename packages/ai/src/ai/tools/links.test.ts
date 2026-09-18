import { afterEach, expect, mock, test } from "bun:test";
import { asSchema, type ToolExecutionOptions } from "ai";
import type { callRPCProcedure } from "./utils/rpc";

const invoke = mock<typeof callRPCProcedure>(async () => undefined);
mock.module("./utils/rpc", () => ({ callRPCProcedure: invoke }));

mock.module("../../lib/website-utils", () => ({
	getCachedWebsite: async () => ({ organizationId: "org-1" }),
}));

const { createLinksTools } = await import("./links");

afterEach(() => invoke.mockReset());

const folder = {
	id: "folder-1",
	name: "Launches",
	slug: "launches",
	organizationId: "org-1",
};
const updates = {
	name: "Updated example",
	slug: "updated-example",
	targetUrl: "https://www.instagram.com/example/",
	expiresAt: "2026-10-01T20:00:00Z",
	expiredRedirectUrl: "https://example.com/expired",
	ogTitle: "New title",
	ogDescription: "New description",
	ogImageUrl: "https://example.com/new.png",
	externalId: "campaign-1",
	deepLinkApp: "instagram",
};
const clears = {
	expiresAt: null,
	expiredRedirectUrl: null,
	ogTitle: null,
	ogDescription: null,
	ogImageUrl: null,
	externalId: null,
	deepLinkApp: null,
	folderId: null,
};

test.each(
	[
		{
			name: "all fields and exact timestamps",
			input: { ...updates, folderSlug: folder.slug },
			expected: { ...updates, folderId: folder.id },
		},
		{ name: "explicit clears", input: clears, expected: clears },
		{ name: "empty updates", input: {}, expected: {} },
	].flatMap((testCase) =>
		[false, true].map((confirmed) => ({ ...testCase, confirmed }))
	)
)("link update $name, confirmed=$confirmed", async ({
	input,
	expected,
	confirmed,
}) => {
	const current = {
		id: "link-1",
		name: "Example",
		slug: "example",
		targetUrl: "https://example.com",
		expiresAt: "2026-10-01T08:00:00Z",
	};
	invoke.mockImplementation(async (router) =>
		router === "linkFolders" ? [folder] : current
	);
	const definition = createLinksTools().update_link;
	const schema = asSchema(definition.inputSchema);
	const options: ToolExecutionOptions = {
		toolCallId: "link-update",
		messages: [],
		experimental_context: { mutationMode: "allow" },
	};
	if (!(schema.validate && definition.execute)) {
		throw new Error("Missing link tool validator or executor");
	}

	const parsed = await schema.validate({
		id: current.id,
		websiteId: "site-1",
		...input,
		confirmed,
	});
	if (!parsed.success) {
		throw parsed.error;
	}
	const result = await definition.execute(parsed.value, options);
	const mutations = invoke.mock.calls.filter(
		([, method]) => method === "update"
	);
	const hasUpdates = Object.keys(expected).length > 0;
	if (confirmed && hasUpdates) {
		expect(mutations).toEqual([
			[
				"links",
				"update",
				{ id: current.id, ...expected },
				options.experimental_context,
			],
		]);
	} else {
		expect(mutations).toEqual([]);
		expect(result).toMatchObject({
			preview: true,
			updates: expected,
			confirmationRequired: hasUpdates,
		});
	}
});

test.each(
	[
		{ name: "unknown folder id", updates: { folderId: "missing-folder" } },
		{ name: "unknown folder slug", updates: { folderSlug: "missing-folder" } },
		{
			name: "target incompatible with the current deep-link app",
			updates: { targetUrl: "https://example.com" },
		},
		{
			name: "deep-link app incompatible with the current target",
			updates: { deepLinkApp: "youtube" },
		},
	].flatMap((testCase) =>
		[false, true].map((confirmed) => ({ ...testCase, confirmed }))
	)
)("invalid link updates do not mutate: $name, confirmed=$confirmed", async ({
	updates,
	confirmed,
}) => {
	const current = {
		id: "link-1",
		name: "Example",
		slug: "example",
		targetUrl: "https://www.instagram.com/example/",
		deepLinkApp: "instagram",
	};
	invoke.mockImplementation(async (router) =>
		router === "linkFolders" ? [] : current
	);
	const definition = createLinksTools().update_link;
	const schema = asSchema(definition.inputSchema);
	if (!(schema.validate && definition.execute)) {
		throw new Error("Missing link tool validator or executor");
	}

	const parsed = await schema.validate({
		id: current.id,
		websiteId: "site-1",
		...updates,
		confirmed,
	});
	if (!parsed.success) {
		throw parsed.error;
	}
	const result = await definition.execute(parsed.value, {
		toolCallId: "invalid-link-update",
		messages: [],
		experimental_context: { mutationMode: "allow" },
	});
	expect(result).toMatchObject({ success: false });
	expect(invoke.mock.calls.filter(([, method]) => method === "update")).toEqual(
		[]
	);
});
