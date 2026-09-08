import { describe, expect, it, mock } from "bun:test";

const permission = mock(async () => ({ success: true }));
mock.module("@databuddy/auth", () => ({
	websitesApi: { hasPermission: permission },
}));
mock.module("../../lib/website-utils", () => ({
	validateWebsite: async (id: string) => ({
		success: true,
		website: { id, organizationId: "org-other", domain: "other.example.com" },
	}),
	getCachedWebsite: async () => null,
}));
mock.module("../../lib/accessible-websites", () => ({
	getAccessibleWebsites: async () => [],
}));
mock.module("@databuddy/api-keys/resolve", () => ({
	hasKeyScope: () => true,
	hasWebsiteScopeForOrganization: () => true,
}));
mock.module("@databuddy/redis", () => ({ getRedisCache: () => null }));

const { ensureWebsiteAccess } = await import("./tool-context");

describe("shared agent's business-context organization boundary", () => {
	it("rejects a site in another organization even if the session could read both", async () => {
		permission.mockClear();
		const result = await ensureWebsiteAccess(
			"foreign-site",
			new Headers(),
			null,
			"org-current"
		);
		expect(result).toBeInstanceOf(Error);
		expect(permission).not.toHaveBeenCalled();
	});
	it("continues checking website authorization inside the context organization", async () => {
		const result = await ensureWebsiteAccess(
			"same-org-site",
			new Headers(),
			null,
			"org-other"
		);
		expect(result).toEqual({ domain: "other.example.com" });
		expect(permission).toHaveBeenCalledWith(
			expect.objectContaining({
				body: {
					organizationId: "org-other",
					permissions: { website: ["read"] },
				},
			})
		);
	});
	it("preserves denial from website authorization", async () => {
		permission.mockResolvedValueOnce({ success: false });
		expect(
			await ensureWebsiteAccess("denied-site", new Headers(), null, "org-other")
		).toBeInstanceOf(Error);
	});
});
