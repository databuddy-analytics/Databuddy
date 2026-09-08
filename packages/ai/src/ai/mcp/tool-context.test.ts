import { describe, expect, it, mock } from "bun:test";
import type { WebsiteSummary } from "../../lib/accessible-websites";

const permission = mock(async () => ({ success: true }));
const sites: WebsiteSummary[] = [
	{
		id: "site",
		domain: "Reports.Example.com",
		name: "Reports",
		createdAt: null,
		isPublic: false,
	},
	{
		id: "www-site",
		domain: "WWW.Example.com",
		name: "WWW",
		createdAt: null,
		isPublic: false,
	},
	{
		id: "port-site",
		domain: "Reports.Example.com:8443",
		name: "Port",
		createdAt: null,
		isPublic: false,
	},
];
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
	getAccessibleWebsites: async () => sites,
}));
mock.module("@databuddy/api-keys/resolve", () => ({
	hasKeyScope: () => true,
	hasWebsiteScopeForOrganization: () => true,
}));
mock.module("@databuddy/redis", () => ({ getRedisCache: () => null }));

const { ensureWebsiteAccess, resolveWebsiteId } = await import("./tool-context");

describe("MCP domain selector compatibility", () => {
	it.each([
		["reports.example.com", "site"],
		["REPORTS.EXAMPLE.COM", "site"],
		["http://reports.example.com", "site"],
		["HTTPS://REPORTS.EXAMPLE.COM", "site"],
		["https://www.example.com", "www-site"],
		["HtTpS://reports.example.com:8443", "port-site"],
	])("resolves %s to %s", async (websiteDomain, expected) => {
		expect(
			await resolveWebsiteId({ websiteDomain }, { apiKey: null, userId: null })
		).toBe(expected);
	});
	it.each([
		"www.reports.example.com",
		"reports.example.com/",
		" https://reports.example.com",
		"https://reports.example.com/path",
		"https://reports.example.com.evil.example",
		"//reports.example.com",
		"reports.example.com:443",
		"ftp://reports.example.com",
	])("does not rewrite unsupported selector %s", async (websiteDomain) => {
		expect(
			await resolveWebsiteId({ websiteDomain }, { apiKey: null, userId: null })
		).toBeInstanceOf(Error);
	});
});

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
