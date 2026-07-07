import { describe, expect, it } from "bun:test";
import {
	createLinkFolderSchema,
	deleteLinkFolderSchema,
	linkFolderOutputSchema,
	listLinkFoldersSchema,
	slugifyFolderName,
	updateLinkFolderSchema,
} from "./links.schemas";

describe("link folder schemas", () => {
	it("accepts folder creation with a name only", () => {
		const result = createLinkFolderSchema.safeParse({
			organizationId: "org-123",
			name: "Posts",
		});
		expect(result.success).toBe(true);
	});

	it("accepts valid explicit slugs", () => {
		for (const slug of ["posts", "social_posts", "campaign-2026"]) {
			const result = createLinkFolderSchema.safeParse({
				name: "Posts",
				slug,
			});
			expect(result.success).toBe(true);
		}
	});

	it("rejects invalid explicit slugs", () => {
		for (const slug of ["Posts", "social posts", "posts/team", ""]) {
			const result = createLinkFolderSchema.safeParse({
				name: "Posts",
				slug,
			});
			expect(result.success).toBe(false);
		}
	});

	it("accepts update and delete inputs", () => {
		expect(
			updateLinkFolderSchema.safeParse({
				id: "folder-123",
				name: "Product Posts",
			}).success
		).toBe(true);
		expect(deleteLinkFolderSchema.safeParse({ id: "folder-123" }).success).toBe(
			true
		);
	});

	it("accepts empty list input", () => {
		const result = listLinkFoldersSchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({});
		}
	});

	it("accepts folder rows returned by the router", () => {
		const result = linkFolderOutputSchema.safeParse({
			id: "folder-123",
			organizationId: "org-123",
			createdBy: "user-123",
			name: "Posts",
			slug: "posts",
			deletedAt: null,
			createdAt: "2025-01-01T00:00:00.000Z",
			updatedAt: "2025-01-02T00:00:00.000Z",
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.createdAt).toBeInstanceOf(Date);
		}
	});
});

describe("folder slug generation", () => {
	it("normalizes names into stable lowercase slugs", () => {
		expect(slugifyFolderName("Social Posts")).toBe("social-posts");
		expect(slugifyFolderName("  Q2_Campaigns  ")).toBe("q2-campaigns");
		expect(slugifyFolderName("Partner / Creator Links")).toBe(
			"partner-creator-links"
		);
	});

	it("falls back when the name has no slug-safe characters", () => {
		expect(slugifyFolderName("!!!")).toBe("folder");
	});
});
