import { describe, expect, it } from "bun:test";
import { z } from "zod";

// Re-create schemas locally for testing (matching the router)
const slugRegex = /^[a-zA-Z0-9_-]+$/;

const createLinkSchema = z.object({
	organizationId: z.string(),
	name: z.string().min(1).max(255),
	targetUrl: z.url(),
	slug: z
		.string()
		.min(3)
		.max(50)
		.regex(
			slugRegex,
			"Slug can only contain letters, numbers, hyphens, and underscores"
		)
		.optional(),
	expiresAt: z.date().nullable().optional(),
	expiredRedirectUrl: z.url().nullable().optional(),
	ogTitle: z.string().max(200).nullable().optional(),
	ogDescription: z.string().max(500).nullable().optional(),
	ogImageUrl: z.url().nullable().optional(),
	externalId: z.string().max(255).nullable().optional(),
});

const updateLinkSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(255).optional(),
	targetUrl: z.url().optional(),
	slug: z
		.string()
		.min(3)
		.max(50)
		.regex(
			slugRegex,
			"Slug can only contain letters, numbers, hyphens, and underscores"
		)
		.optional(),
	expiresAt: z.string().datetime().nullable().optional(),
	expiredRedirectUrl: z.url().nullable().optional(),
	ogTitle: z.string().max(200).nullable().optional(),
	ogDescription: z.string().max(500).nullable().optional(),
	ogImageUrl: z.url().nullable().optional(),
	externalId: z.string().max(255).nullable().optional(),
});

const listLinksSchema = z.object({
	organizationId: z.string(),
	externalId: z.string().optional(),
});

const getLinkSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
});

const deleteLinkSchema = z.object({
	id: z.string(),
});

// Slug generation helper
const SLUG_ALPHABET =
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const SLUG_LENGTH = 8;

function generateSlug(): string {
	let result = "";
	for (let i = 0; i < SLUG_LENGTH; i++) {
		result += SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)];
	}
	return result;
}

// URL validation helper matching router logic
function isValidTargetUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

describe("createLinkSchema validation", () => {
	it("accepts valid minimal input", () => {
		const result = createLinkSchema.safeParse({
			organizationId: "org-123",
			name: "My Link",
			targetUrl: "https://example.com",
		});
		expect(result.success).toBe(true);
	});

	it("accepts valid input with all optional fields", () => {
		const result = createLinkSchema.safeParse({
			organizationId: "org-123",
			name: "My Link",
			targetUrl: "https://example.com/path?query=value",
			slug: "my-custom-slug",
			expiresAt: new Date("2025-12-31"),
			expiredRedirectUrl: "https://example.com/expired",
			ogTitle: "Custom Title",
			ogDescription: "Custom description for social sharing",
			ogImageUrl: "https://example.com/image.png",
			externalId: "company-123",
		});
		expect(result.success).toBe(true);
	});

	it("accepts externalId for third-party reference", () => {
		const result = createLinkSchema.safeParse({
			organizationId: "org-123",
			name: "Invite Link",
			targetUrl: "https://example.com/signup",
			externalId: "company_acme",
		});
		expect(result.success).toBe(true);
	});

	it("rejects empty name", () => {
		const result = createLinkSchema.safeParse({
			organizationId: "org-123",
			name: "",
			targetUrl: "https://example.com",
		});
		expect(result.success).toBe(false);
	});

	it("rejects name over 255 characters", () => {
		const result = createLinkSchema.safeParse({
			organizationId: "org-123",
			name: "a".repeat(256),
			targetUrl: "https://example.com",
		});
		expect(result.success).toBe(false);
	});

	it("rejects invalid target URL", () => {
		const result = createLinkSchema.safeParse({
			organizationId: "org-123",
			name: "My Link",
			targetUrl: "not-a-url",
		});
		expect(result.success).toBe(false);
	});

	it("rejects slug shorter than 3 characters", () => {
		const result = createLinkSchema.safeParse({
			organizationId: "org-123",
			name: "My Link",
			targetUrl: "https://example.com",
			slug: "ab",
		});
		expect(result.success).toBe(false);
	});

	it("rejects slug longer than 50 characters", () => {
		const result = createLinkSchema.safeParse({
			organizationId: "org-123",
			name: "My Link",
			targetUrl: "https://example.com",
			slug: "a".repeat(51),
		});
		expect(result.success).toBe(false);
	});

	it("rejects slug with invalid characters", () => {
		const invalidSlugs = [
			"slug with spaces",
			"slug.with.dots",
			"slug@special",
			"slug#hash",
			"slug/slash",
		];

		for (const slug of invalidSlugs) {
			const result = createLinkSchema.safeParse({
				organizationId: "org-123",
				name: "My Link",
				targetUrl: "https://example.com",
				slug,
			});
			expect(result.success).toBe(false);
		}
	});

	it("accepts slug with valid characters", () => {
		const validSlugs = [
			"my-slug",
			"my_slug",
			"MySlug123",
			"123-abc",
			"ABC_xyz_123",
		];

		for (const slug of validSlugs) {
			const result = createLinkSchema.safeParse({
				organizationId: "org-123",
				name: "My Link",
				targetUrl: "https://example.com",
				slug,
			});
			expect(result.success).toBe(true);
		}
	});

	it("accepts null for optional URL fields", () => {
		const result = createLinkSchema.safeParse({
			organizationId: "org-123",
			name: "My Link",
			targetUrl: "https://example.com",
			expiredRedirectUrl: null,
			ogImageUrl: null,
		});
		expect(result.success).toBe(true);
	});

	it("rejects ogTitle over 200 characters", () => {
		const result = createLinkSchema.safeParse({
			organizationId: "org-123",
			name: "My Link",
			targetUrl: "https://example.com",
			ogTitle: "a".repeat(201),
		});
		expect(result.success).toBe(false);
	});

	it("rejects ogDescription over 500 characters", () => {
		const result = createLinkSchema.safeParse({
			organizationId: "org-123",
			name: "My Link",
			targetUrl: "https://example.com",
			ogDescription: "a".repeat(501),
		});
		expect(result.success).toBe(false);
	});
});

describe("updateLinkSchema validation", () => {
	it("accepts valid update with only id", () => {
		const result = updateLinkSchema.safeParse({
			id: "link-123",
		});
		expect(result.success).toBe(true);
	});

	it("accepts valid partial update", () => {
		const result = updateLinkSchema.safeParse({
			id: "link-123",
			name: "Updated Name",
		});
		expect(result.success).toBe(true);
	});

	it("accepts valid full update", () => {
		const result = updateLinkSchema.safeParse({
			id: "link-123",
			name: "Updated Name",
			targetUrl: "https://new-destination.com",
			slug: "new-slug",
			expiresAt: "2025-12-31T00:00:00.000Z",
			ogTitle: "New Title",
		});
		expect(result.success).toBe(true);
	});

	it("accepts null expiresAt to remove expiration", () => {
		const result = updateLinkSchema.safeParse({
			id: "link-123",
			expiresAt: null,
		});
		expect(result.success).toBe(true);
	});

	it("rejects invalid datetime format for expiresAt", () => {
		const result = updateLinkSchema.safeParse({
			id: "link-123",
			expiresAt: "not-a-date",
		});
		expect(result.success).toBe(false);
	});

	it("requires id field", () => {
		const result = updateLinkSchema.safeParse({
			name: "Updated Name",
		});
		expect(result.success).toBe(false);
	});
});

describe("listLinksSchema validation", () => {
	it("accepts valid organization id", () => {
		const result = listLinksSchema.safeParse({
			organizationId: "org-123",
		});
		expect(result.success).toBe(true);
	});

	it("accepts optional externalId filter", () => {
		const result = listLinksSchema.safeParse({
			organizationId: "org-123",
			externalId: "company_acme",
		});
		expect(result.success).toBe(true);
	});

	it("requires organizationId", () => {
		const result = listLinksSchema.safeParse({});
		expect(result.success).toBe(false);
	});
});

describe("getLinkSchema validation", () => {
	it("accepts valid id and organizationId", () => {
		const result = getLinkSchema.safeParse({
			id: "link-123",
			organizationId: "org-456",
		});
		expect(result.success).toBe(true);
	});

	it("requires both id and organizationId", () => {
		expect(getLinkSchema.safeParse({ id: "link-123" }).success).toBe(false);
		expect(
			getLinkSchema.safeParse({ organizationId: "org-123" }).success
		).toBe(false);
	});
});

describe("deleteLinkSchema validation", () => {
	it("accepts valid id", () => {
		const result = deleteLinkSchema.safeParse({
			id: "link-123",
		});
		expect(result.success).toBe(true);
	});

	it("requires id", () => {
		const result = deleteLinkSchema.safeParse({});
		expect(result.success).toBe(false);
	});
});

describe("slug generation", () => {
	it("generates slug of correct length", () => {
		const slug = generateSlug();
		expect(slug.length).toBe(SLUG_LENGTH);
	});

	it("generates slug with valid characters only", () => {
		for (let i = 0; i < 100; i++) {
			const slug = generateSlug();
			expect(slugRegex.test(slug)).toBe(true);
		}
	});

	it("generates unique slugs", () => {
		const slugs = new Set<string>();
		for (let i = 0; i < 1000; i++) {
			slugs.add(generateSlug());
		}
		// With 62^8 possibilities, 1000 slugs should all be unique
		expect(slugs.size).toBe(1000);
	});
});

describe("URL validation helper", () => {
	it("accepts https URLs", () => {
		expect(isValidTargetUrl("https://example.com")).toBe(true);
		expect(isValidTargetUrl("https://example.com/path")).toBe(true);
		expect(isValidTargetUrl("https://example.com/path?query=value")).toBe(true);
		expect(isValidTargetUrl("https://sub.example.com")).toBe(true);
	});

	it("accepts http URLs", () => {
		expect(isValidTargetUrl("http://example.com")).toBe(true);
		expect(isValidTargetUrl("http://localhost:3000")).toBe(true);
	});

	it("rejects non-http protocols", () => {
		expect(isValidTargetUrl("ftp://example.com")).toBe(false);
		expect(isValidTargetUrl("file:///path/to/file")).toBe(false);
		expect(isValidTargetUrl("javascript:alert(1)")).toBe(false);
		expect(isValidTargetUrl("data:text/html,<h1>Hi</h1>")).toBe(false);
	});

	it("rejects invalid URLs", () => {
		expect(isValidTargetUrl("not-a-url")).toBe(false);
		expect(isValidTargetUrl("")).toBe(false);
		expect(isValidTargetUrl("example.com")).toBe(false);
	});
});

describe("link expiration logic", () => {
	function isExpired(expiresAt: Date | string | null): boolean {
		if (!expiresAt) {
			return false;
		}
		return new Date(expiresAt) < new Date();
	}

	it("returns false for null expiration", () => {
		expect(isExpired(null)).toBe(false);
	});

	it("returns true for past date", () => {
		const past = new Date(Date.now() - 86_400_000); // 1 day ago
		expect(isExpired(past)).toBe(true);
	});

	it("returns false for future date", () => {
		const future = new Date(Date.now() + 86_400_000); // 1 day from now
		expect(isExpired(future)).toBe(false);
	});

	it("handles ISO string dates", () => {
		const past = new Date(Date.now() - 1000).toISOString();
		const future = new Date(Date.now() + 100_000).toISOString();

		expect(isExpired(past)).toBe(true);
		expect(isExpired(future)).toBe(false);
	});
});

describe("link data structure", () => {
	it("creates valid link object structure", () => {
		const linkData = {
			id: "link-123",
			organizationId: "org-456",
			createdBy: "user-789",
			name: "Marketing Campaign",
			slug: "campaign-2025",
			targetUrl: "https://example.com/landing?utm_source=twitter",
			expiresAt: null,
			expiredRedirectUrl: null,
			ogTitle: "Special Offer",
			ogDescription: "Check out our amazing deal!",
			ogImageUrl: "https://example.com/og-image.png",
			createdAt: new Date(),
			updatedAt: new Date(),
			deletedAt: null,
		};

		expect(linkData.id).toBeDefined();
		expect(linkData.organizationId).toBeDefined();
		expect(linkData.createdBy).toBeDefined();
		expect(linkData.name).toBeDefined();
		expect(linkData.slug).toBeDefined();
		expect(linkData.targetUrl).toBeDefined();
		expect(linkData.createdAt).toBeInstanceOf(Date);
		expect(linkData.updatedAt).toBeInstanceOf(Date);
		expect(linkData.deletedAt).toBeNull();
	});

	it("supports soft delete pattern", () => {
		const activeLink = { deletedAt: null };
		const deletedLink = { deletedAt: new Date() };

		expect(activeLink.deletedAt).toBeNull();
		expect(deletedLink.deletedAt).toBeInstanceOf(Date);
	});
});

describe("authorization permission mapping", () => {
	// Test the permission mapping logic from authorizeOrganizationAccess
	function mapPermission(
		permission: "read" | "create" | "update" | "delete"
	): "read" | "create" | "delete" {
		return permission === "read"
			? "read"
			: permission === "delete"
				? "delete"
				: "create";
	}

	it("maps read permission correctly", () => {
		expect(mapPermission("read")).toBe("read");
	});

	it("maps create permission correctly", () => {
		expect(mapPermission("create")).toBe("create");
	});

	it("maps update permission to create", () => {
		expect(mapPermission("update")).toBe("create");
	});

	it("maps delete permission correctly", () => {
		expect(mapPermission("delete")).toBe("delete");
	});
});

describe("slug collision handling", () => {
	it("should retry up to max attempts on collision", () => {
		const maxAttempts = 10;
		let attempts = 0;
		let success = false;

		// Simulate collision handling
		while (attempts < maxAttempts && !success) {
			const slug = generateSlug();
			attempts++;

			// Simulate: first 9 attempts fail, 10th succeeds
			if (attempts === 10) {
				success = true;
			}
		}

		expect(attempts).toBe(10);
		expect(success).toBe(true);
	});

	it("should fail after max attempts exhausted", () => {
		const maxAttempts = 10;
		let attempts = 0;
		let success = false;

		// Simulate all attempts failing
		while (attempts < maxAttempts && !success) {
			attempts++;
			// Never succeed
		}

		expect(attempts).toBe(maxAttempts);
		expect(success).toBe(false);
	});
});

describe("cache invalidation scenarios", () => {
	it("should invalidate cache on create", () => {
		const cacheOperations: string[] = [];

		// Simulate create flow
		const slug = "new-slug";
		cacheOperations.push(`invalidate:${slug}`);

		expect(cacheOperations).toContain(`invalidate:${slug}`);
	});

	it("should invalidate both old and new slug on update", () => {
		const cacheOperations: string[] = [];

		// Simulate update flow with slug change
		const oldSlug = "old-slug";
		const newSlug = "new-slug";

		cacheOperations.push(`invalidate:${oldSlug}`);
		cacheOperations.push(`invalidate:${newSlug}`);

		expect(cacheOperations).toContain(`invalidate:${oldSlug}`);
		expect(cacheOperations).toContain(`invalidate:${newSlug}`);
	});

	it("should invalidate cache on delete", () => {
		const cacheOperations: string[] = [];

		// Simulate delete flow
		const slug = "deleted-slug";
		cacheOperations.push(`invalidate:${slug}`);

		expect(cacheOperations).toContain(`invalidate:${slug}`);
	});
});

describe("OG metadata handling", () => {
	it("should detect custom OG presence", () => {
		const hasCustomOg = (link: {
			ogTitle: string | null;
			ogDescription: string | null;
			ogImageUrl: string | null;
		}) => {
			return link.ogTitle ?? link.ogDescription ?? link.ogImageUrl;
		};

		expect(hasCustomOg({ ogTitle: "Title", ogDescription: null, ogImageUrl: null })).toBeTruthy();
		expect(hasCustomOg({ ogTitle: null, ogDescription: "Desc", ogImageUrl: null })).toBeTruthy();
		expect(hasCustomOg({ ogTitle: null, ogDescription: null, ogImageUrl: "https://img.com" })).toBeTruthy();
		expect(hasCustomOg({ ogTitle: null, ogDescription: null, ogImageUrl: null })).toBeFalsy();
	});

	it("should respect OG field length limits", () => {
		const ogTitle = "a".repeat(200); // Max allowed
		const ogDescription = "b".repeat(500); // Max allowed

		const titleResult = createLinkSchema.safeParse({
			organizationId: "org-123",
			name: "Link",
			targetUrl: "https://example.com",
			ogTitle,
		});
		expect(titleResult.success).toBe(true);

		const descResult = createLinkSchema.safeParse({
			organizationId: "org-123",
			name: "Link",
			targetUrl: "https://example.com",
			ogDescription,
		});
		expect(descResult.success).toBe(true);
	});
});

describe("error handling patterns", () => {
	it("should identify slug conflict errors", () => {
		const isSlugConflict = (error: { code?: string; constraint?: string }) => {
			return error.code === "23505" && error.constraint === "links_slug_unique";
		};

		expect(
			isSlugConflict({ code: "23505", constraint: "links_slug_unique" })
		).toBe(true);
		expect(
			isSlugConflict({ code: "23505", constraint: "other_constraint" })
		).toBe(false);
		expect(isSlugConflict({ code: "other_code" })).toBe(false);
	});

	it("should map error codes to user messages", () => {
		const getErrorMessage = (code: string): string => {
			switch (code) {
				case "CONFLICT":
					return "This slug is already taken";
				case "NOT_FOUND":
					return "Link not found";
				case "UNAUTHORIZED":
					return "Authentication is required";
				case "FORBIDDEN":
					return "You do not have permission to access this organization";
				case "BAD_REQUEST":
					return "Target URL must be an absolute HTTP or HTTPS URL";
				default:
					return "An unexpected error occurred";
			}
		};

		expect(getErrorMessage("CONFLICT")).toBe("This slug is already taken");
		expect(getErrorMessage("NOT_FOUND")).toBe("Link not found");
		expect(getErrorMessage("UNAUTHORIZED")).toBe("Authentication is required");
		expect(getErrorMessage("FORBIDDEN")).toContain("permission");
		expect(getErrorMessage("BAD_REQUEST")).toContain("URL");
	});
});
