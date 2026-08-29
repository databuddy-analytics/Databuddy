import { describe, expect, it } from "bun:test";
import {
	createLinkSchema,
	linkOutputSchema,
	listLinksPageSchema,
	updateLinkSchema,
} from "./links.schemas";

describe("createLinkSchema validation", () => {
	it("rejects invalid required fields", () => {
		expect(
			createLinkSchema.safeParse({
				organizationId: "org-123",
				name: "",
				targetUrl: "https://example.com",
			}).success
		).toBe(false);
		expect(
			createLinkSchema.safeParse({
				organizationId: "org-123",
				name: "a".repeat(256),
				targetUrl: "https://example.com",
			}).success
		).toBe(false);
		expect(
			createLinkSchema.safeParse({
				organizationId: "org-123",
				name: "My Link",
				targetUrl: "not-a-url",
			}).success
		).toBe(false);
	});

	it("rejects unsafe URL schemes and unknown deep-link apps", () => {
		const httpUrlFields = [
			"targetUrl",
			"expiredRedirectUrl",
			"iosUrl",
			"androidUrl",
			"ogImageUrl",
			"ogVideoUrl",
		] as const;

		for (const url of [
			"javascript:alert(1)",
			"data:text/html,hello",
			"file:///etc/passwd",
			"exampleapp://open/profile",
		]) {
			for (const field of httpUrlFields) {
				expect(
					createLinkSchema.safeParse({
						name: "My Link",
						targetUrl: "https://example.com",
						[field]: url,
					}).success
				).toBe(false);
			}
		}

		expect(
			createLinkSchema.safeParse({
				name: "My Link",
				targetUrl: "https://example.com",
				deepLinkApp: "example",
			}).success
		).toBe(false);
	});

	it("validates slug length and characters", () => {
		const validSlugs = [
			"my-slug",
			"my_slug",
			"MySlug123",
			"123-abc",
			"ABC_xyz_123",
		];
		const invalidSlugs = [
			"ab",
			"a".repeat(51),
			"slug with spaces",
			"slug.with.dots",
			"slug@special",
			"slug/slash",
		];

		for (const slug of validSlugs) {
			expect(
				createLinkSchema.safeParse({
					organizationId: "org-123",
					name: "My Link",
					targetUrl: "https://example.com",
					slug,
				}).success
			).toBe(true);
		}

		for (const slug of invalidSlugs) {
			expect(
				createLinkSchema.safeParse({
					organizationId: "org-123",
					name: "My Link",
					targetUrl: "https://example.com",
					slug,
				}).success
			).toBe(false);
		}
	});

	it("validates social metadata limits", () => {
		expect(
			createLinkSchema.safeParse({
				organizationId: "org-123",
				name: "My Link",
				targetUrl: "https://example.com",
				ogTitle: "a".repeat(200),
				ogDescription: "b".repeat(500),
			}).success
		).toBe(true);
		expect(
			createLinkSchema.safeParse({
				organizationId: "org-123",
				name: "My Link",
				targetUrl: "https://example.com",
				ogTitle: "a".repeat(201),
			}).success
		).toBe(false);
		expect(
			createLinkSchema.safeParse({
				organizationId: "org-123",
				name: "My Link",
				targetUrl: "https://example.com",
				ogDescription: "a".repeat(501),
			}).success
		).toBe(false);
	});
});

describe("updateLinkSchema validation", () => {
	it("rejects missing id and invalid datetime", () => {
		expect(updateLinkSchema.safeParse({ name: "Updated Name" }).success).toBe(
			false
		);
		expect(
			updateLinkSchema.safeParse({
				id: "link-123",
				expiresAt: "not-a-date",
			}).success
		).toBe(false);
	});

	it("rejects unsafe URL schemes in partial updates", () => {
		for (const field of [
			"targetUrl",
			"expiredRedirectUrl",
			"iosUrl",
			"androidUrl",
			"ogImageUrl",
			"ogVideoUrl",
		] as const) {
			expect(
				updateLinkSchema.safeParse({
					id: "link-123",
					[field]: "javascript:alert(1)",
				}).success
			).toBe(false);
		}
	});
});

describe("listLinksPageSchema validation", () => {
	it("applies pagination and filter defaults", () => {
		const result = listLinksPageSchema.safeParse({});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.includeTotal).toBe(false);
			expect(result.data.limit).toBe(50);
			expect(result.data.offset).toBe(0);
			expect(result.data.sort).toBe("newest");
			expect(result.data.type).toBe("all");
		}
	});

	it("rejects out-of-range pagination and unknown enums", () => {
		expect(listLinksPageSchema.safeParse({ limit: 0 }).success).toBe(false);
		expect(listLinksPageSchema.safeParse({ limit: 101 }).success).toBe(false);
		expect(listLinksPageSchema.safeParse({ offset: -1 }).success).toBe(false);
		expect(listLinksPageSchema.safeParse({ sort: "random" }).success).toBe(
			false
		);
		expect(listLinksPageSchema.safeParse({ type: "medium" }).success).toBe(
			false
		);
	});
});

describe("linkOutputSchema validation", () => {
	it("coerces serialized timestamp fields", () => {
		const result = linkOutputSchema.safeParse({
			id: "link-123",
			organizationId: "org-456",
			createdBy: "user-789",
			folderId: null,
			slug: "campaign-2025",
			name: "Marketing Campaign",
			targetUrl: "https://example.com/landing",
			targetDomain: "example.com",
			sourceType: null,
			sourceId: null,
			sourceOwnerId: null,
			expiresAt: "2025-12-31T00:00:00.000Z",
			expiredRedirectUrl: null,
			ogTitle: null,
			ogDescription: null,
			ogImageUrl: null,
			ogVideoUrl: null,
			iosUrl: null,
			androidUrl: null,
			externalId: null,
			deepLinkApp: null,
			deletedAt: null,
			createdAt: "2025-01-01T00:00:00.000Z",
			updatedAt: "2025-01-02T00:00:00.000Z",
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.createdAt).toBeInstanceOf(Date);
			expect(result.data.expiresAt).toBeInstanceOf(Date);
		}
	});
});
