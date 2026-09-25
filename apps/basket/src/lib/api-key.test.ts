import { describe, expect, test, vi } from "vitest";

vi.mock("@databuddy/api-keys/resolve", () => ({
	extractSecret: vi.fn(),
	getAccessibleWebsiteIds: vi.fn(),
	getApiKeyFromHeader: vi.fn(),
	hasGlobalAccess: vi.fn(),
	hasKeyScope: vi.fn(),
	hasWebsiteScope: vi.fn(),
}));

import { hasWebsiteScope } from "@databuddy/api-keys/resolve";
import { type ApiKeyRow, denyApiKeyWebsiteAccess } from "./api-key";

describe("denyApiKeyWebsiteAccess", () => {
	const orgKey = { id: "key_1", organizationId: "org_1" } as ApiKeyRow;
	const website = { organizationId: "org_1", status: "ACTIVE" };
	const scopeMock = vi.mocked(hasWebsiteScope);

	test("requires a websiteId", () => {
		expect(denyApiKeyWebsiteAccess(orgKey, undefined, null)).toBe(
			"missing_website_id"
		);
	});

	test("requires the track:events scope for the website", () => {
		scopeMock.mockReturnValueOnce(false);
		expect(denyApiKeyWebsiteAccess(orgKey, "site_1", website)).toBe(
			"missing_scope"
		);
		expect(scopeMock).toHaveBeenCalledWith(orgKey, "site_1", "track:events");
	});

	test("requires the website to exist", () => {
		scopeMock.mockReturnValueOnce(true);
		expect(denyApiKeyWebsiteAccess(orgKey, "site_1", null)).toBe(
			"website_not_found"
		);
	});

	test("rejects websites from another organization", () => {
		scopeMock.mockReturnValueOnce(true);
		expect(
			denyApiKeyWebsiteAccess(orgKey, "site_1", {
				organizationId: "org_2",
				status: "ACTIVE",
			})
		).toBe("website_scope_mismatch");
	});

	test("rejects websites that are not active", () => {
		scopeMock.mockReturnValueOnce(true);
		expect(
			denyApiKeyWebsiteAccess(orgKey, "site_1", {
				organizationId: "org_1",
				status: "INACTIVE",
			})
		).toBe("website_not_active");
	});

	test("rejects keys without an organization", () => {
		scopeMock.mockReturnValueOnce(true);
		const userKey = { id: "key_2", organizationId: null } as ApiKeyRow;
		expect(denyApiKeyWebsiteAccess(userKey, "site_1", website)).toBe(
			"website_scope_mismatch"
		);
	});

	test("allows in-org websites with the right scope", () => {
		scopeMock.mockReturnValueOnce(true);
		expect(denyApiKeyWebsiteAccess(orgKey, "site_1", website)).toBeNull();
	});
});
