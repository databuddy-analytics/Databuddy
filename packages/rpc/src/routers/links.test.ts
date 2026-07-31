import { describe, expect, it } from "bun:test";
import {
	createLinkSchema,
	deleteLinkSchema,
	getLinkSchema,
	linkOutputSchema,
	listLinksPageSchema,
	listLinksSchema,
	updateLinkSchema,
} from "./links.schemas";

describe("createLinkSchema validation", () => {
	it("accepts valid minimal input", () => {
		const result = createLinkSchema.safeParse({
			organizationId: "org-123",
			name: "My Link",
			targetUrl: "https://example.com",
		});

		expect(result.success).toBe(true);
	});

	it("accepts valid input with optional fields", () => {
		const result = createLinkSchema.safeParse({
			organizationId: "org-123",
			name: "My Link",
			targetUrl: "https://instagram.com/example?query=value",
			slug: "my-custom-slug",
			folderId: "folder-posts",
			expiresAt: new Date("2025-12-31"),
			expiredRedirectUrl: "https://example.com/expired",
			ogTitle: "Custom Title",
			ogDescription: "Custom description for social sharing",
			ogImageUrl: "https://example.com/image.png",
			ogVideoUrl: "https://example.com/video.mp4",
			iosUrl: "https://apps.apple.com/app/example",
			androidUrl: "https://play.google.com/store/apps/details?id=example",
			externalId: "company-123",
			sourceType: "post",
			sourceId: "post_123",
			sourceOwnerId: "user_456",
			targetDomain: "instagram.com",
			deepLinkApp: "instagram",
		});

		expect(result.success).toBe(true);
	});

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

	it("accepts HTTPS device fallbacks for known deep-link apps", () => {
		expect(
			createLinkSchema.safeParse({
				name: "Instagram profile",
				targetUrl: "https://instagram.com/databuddy",
				iosUrl: "https://apps.apple.com/app/instagram/id389801252",
				androidUrl:
					"https://play.google.com/store/apps/details?id=com.instagram.android",
				deepLinkApp: "instagram",
			}).success
		).toBe(true);
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
	it("accepts partial updates", () => {
		expect(updateLinkSchema.safeParse({ id: "link-123" }).success).toBe(true);
		expect(
			updateLinkSchema.safeParse({
				id: "link-123",
				name: "Updated Name",
				targetUrl: "https://new-destination.com",
				slug: "new-slug",
				expiresAt: "2025-12-31T00:00:00.000Z",
				ogTitle: "New Title",
			}).success
		).toBe(true);
		expect(
			updateLinkSchema.safeParse({
				id: "link-123",
				expiresAt: null,
			}).success
		).toBe(true);
	});

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

describe("listLinksSchema validation", () => {
	it("accepts empty input for active organization fallback", () => {
		const result = listLinksSchema.safeParse({});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({});
		}
	});

	it("accepts organization and source filters", () => {
		expect(
			listLinksSchema.safeParse({
				organizationId: "org-123",
				externalId: "company_acme",
				folderId: "folder-posts",
				sourceType: "post",
				sourceId: "post_123",
				sourceOwnerId: "user_456",
				targetDomain: "example.com",
			}).success
		).toBe(true);
		expect(
			listLinksSchema.safeParse({
				organizationId: "org-123",
				folderId: null,
			}).success
		).toBe(true);
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

	it("accepts search, sort, type, and pagination bounds", () => {
		expect(
			listLinksPageSchema.safeParse({
				organizationId: "org-123",
				folderId: null,
				includeTotal: true,
				search: "campaign",
				sort: "name-asc",
				type: "deep",
				limit: 100,
				offset: 200,
			}).success
		).toBe(true);
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

describe("id input schemas", () => {
	it("accept valid ids and reject missing ids", () => {
		expect(getLinkSchema.safeParse({ id: "link-123" }).success).toBe(true);
		expect(deleteLinkSchema.safeParse({ id: "link-123" }).success).toBe(true);
		expect(getLinkSchema.safeParse({}).success).toBe(false);
		expect(deleteLinkSchema.safeParse({}).success).toBe(false);
	});
});

describe("linkOutputSchema validation", () => {
	it("accepts link rows returned by the router", () => {
		const result = linkOutputSchema.safeParse({
			id: "link-123",
			organizationId: "org-456",
			createdBy: "user-789",
			folderId: "folder-posts",
			slug: "campaign-2025",
			name: "Marketing Campaign",
			targetUrl: "https://example.com/landing?utm_source=twitter",
			targetDomain: "example.com",
			sourceType: "post",
			sourceId: "post_123",
			sourceOwnerId: "user_456",
			expiresAt: null,
			expiredRedirectUrl: null,
			ogTitle: "Special Offer",
			ogDescription: "Check out our deal",
			ogImageUrl: "https://example.com/og-image.png",
			ogVideoUrl: null,
			iosUrl: null,
			androidUrl: null,
			externalId: "external-123",
			deepLinkApp: null,
			deletedAt: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		expect(result.success).toBe(true);
	});

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
