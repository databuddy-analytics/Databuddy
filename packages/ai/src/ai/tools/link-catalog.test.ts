import { describe, expect, it } from "bun:test";
import {
	type LinkFolder,
	fetchLinkCatalogPage,
	fetchLinkSummary,
	resolveLinkFolderFromList,
} from "./link-catalog";

const folders: LinkFolder[] = [
	{
		id: "folder-growth",
		name: "Growth",
		organizationId: "org-1",
		slug: "growth",
	},
	{
		id: "folder-launches",
		name: "Launches",
		organizationId: "org-1",
		slug: "launches",
	},
];

describe("resolveLinkFolderFromList", () => {
	it("resolves an existing folder by slug when folderId is omitted", () => {
		const result = resolveLinkFolderFromList(folders, {
			folderSlug: "launches",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.folderId).toBe("folder-launches");
			expect(result.folder?.name).toBe("Launches");
		}
	});

	it("resolves an existing folder by id", () => {
		const result = resolveLinkFolderFromList(folders, {
			folderId: "folder-growth",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.folderId).toBe("folder-growth");
		}
	});

	it("treats null folderId as an explicit unfiled selection", () => {
		const result = resolveLinkFolderFromList(folders, {
			folderId: null,
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.folderId).toBeNull();
			expect(result.folder).toBeNull();
		}
	});

	it("rejects unknown folders instead of inventing one", () => {
		const result = resolveLinkFolderFromList(folders, {
			folderSlug: "new-campaigns",
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.message).toContain("couldn't find");
			expect(result.message).toContain("Growth");
			expect(result.message).toContain("Launches");
		}
	});

	it("rejects ambiguous id plus slug selection", () => {
		const result = resolveLinkFolderFromList(folders, {
			folderId: "folder-growth",
			folderSlug: "growth",
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.message).toContain("either folderId or folderSlug");
		}
	});
});

describe("paginated link catalog", () => {
	it("uses one bounded server-side search beyond the legacy 1,000-row cap", async () => {
		const source = Array.from({ length: 1001 }, (_, index) => ({
			id: `link-${index}`,
			name: `Example ${index}`,
			slug: `example-${index}`,
			targetUrl: `https://example.com/${index}`,
		}));
		const calls: Array<{ limit: number; offset: number; search?: string }> = [];

		const page = await fetchLinkCatalogPage(async (input) => {
			calls.push(input);
			const matches = source.filter((link) =>
				link.name.toLowerCase().includes(input.search?.toLowerCase() ?? "")
			);
			const items = matches.slice(input.offset, input.offset + input.limit);
			return {
				hasMore: input.offset + items.length < matches.length,
				items,
			};
		}, { search: "Example 1000" });

		expect(page.items).toHaveLength(1);
		expect(page.items[0]?.id).toBe("link-1000");
		expect(page.total).toBeUndefined();
		expect(calls).toEqual([
			{ limit: 50, offset: 0, search: "Example 1000" },
		]);
	});

	it("loads exact catalog and unfiled totals from paginated counts", async () => {
		const calls: Array<{
			folderId?: null;
			includeTotal?: boolean;
			limit: number;
			offset: number;
			search?: string;
		}> = [];
		const summary = await fetchLinkSummary(async (input) => {
			calls.push(input);
			return {
				hasMore: false,
				items: [],
				total: input.folderId === null ? 3 : 7,
			};
		}, "campaign");

		expect(summary).toEqual({ total: 7, unfiledTotal: 3 });
		expect(calls).toEqual([
			{ includeTotal: true, limit: 1, offset: 0, search: "campaign" },
			{
				folderId: null,
				includeTotal: true,
				limit: 1,
				offset: 0,
				search: "campaign",
			},
		]);
	});
});
