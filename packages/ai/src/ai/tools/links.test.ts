import { expect, mock, spyOn, test } from "bun:test";
import { asSchema, type ToolExecutionOptions } from "ai";
import * as rpc from "./utils/rpc";

mock.module("../../lib/website-utils", () => ({
	getCachedWebsite: async () => ({ organizationId: "org-1" }),
}));

const { createLinksTools } = await import("./links");

test("link update previews contain every applied field, exact timestamps, and explicit clears", async () => {
	const current = {
		id: "link-1",
		name: "Example",
		slug: "example",
		targetUrl: "https://example.com",
		expiresAt: "2026-10-01T08:00:00Z",
	};
	const folder = {
		id: "folder-1",
		name: "Launches",
		slug: "launches",
		organizationId: "org-1",
	};
	const invoke = spyOn(rpc, "callRPCProcedure").mockImplementation(
		async (router) => (router === "linkFolders" ? [folder] : current)
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

	try {
		for (const [input, expected] of [
			[
				{ ...updates, folderSlug: folder.slug },
				{ ...updates, folderId: folder.id },
			],
			[clears, clears],
			[{}, {}],
		]) {
			for (const confirmed of [false, true]) {
				invoke.mockClear();
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
			}
		}
	} finally {
		invoke.mockRestore();
	}
});

test.each([
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
])("invalid link updates do not mutate: $name", async ({ updates }) => {
	const current = {
		id: "link-1",
		name: "Example",
		slug: "example",
		targetUrl: "https://www.instagram.com/example/",
		deepLinkApp: "instagram",
	};
	const invoke = spyOn(rpc, "callRPCProcedure").mockImplementation(
		async (router) => (router === "linkFolders" ? [] : current)
	);
	const definition = createLinksTools().update_link;
	const schema = asSchema(definition.inputSchema);
	if (!(schema.validate && definition.execute)) {
		throw new Error("Missing link tool validator or executor");
	}

	try {
		for (const confirmed of [false, true]) {
			invoke.mockClear();
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
			expect(
				invoke.mock.calls.filter(([, method]) => method === "update")
			).toEqual([]);
		}
	} finally {
		invoke.mockRestore();
	}
});
