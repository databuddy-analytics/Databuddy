import { describe, expect, it } from "bun:test";
import {
	type LinkFolder,
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
