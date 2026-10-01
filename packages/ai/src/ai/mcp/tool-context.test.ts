import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { RequestPrincipal } from "./tool-context";
import type { WebsiteSummary } from "../../lib/accessible-websites";
import { createRedisModuleMock } from "../test-redis-mock";

const permission = mock(async () => ({ success: true }));
const readableOrganizations = mock(async () => ["org-other"]);
const memberRole = mock(async () => "viewer" as string | null);
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
	getCachedWebsite: async (id: string) =>
		id === "missing-site"
			? null
			: {
					id,
					organizationId: "org-other",
					domain: "other.example.com",
					deletedAt: id === "deleted-site" ? new Date("2026-01-01") : null,
				},
}));
mock.module("../../lib/accessible-websites", () => ({
	getAccessibleWebsites: async () => sites,
	getMemberWebsites: async () => sites,
	getReadableOrganizationIds: readableOrganizations,
}));
mock.module("@databuddy/rpc/organization", () => ({
	getMemberRole: memberRole,
}));
mock.module("@databuddy/api-keys/resolve", () => ({
	hasKeyScope: () => true,
	hasWebsiteScopeForOrganization: () => true,
}));
mock.module("@databuddy/redis", () => createRedisModuleMock({}));

const {
	ensureWebsiteAccess,
	getCachedAccessibleWebsites,
	resolveOrganizationId,
	resolveWebsiteId,
} = await import("./tool-context");

beforeEach(() => {
	memberRole.mockClear();
});

describe("OAuth selected website grants", () => {
	const principal: RequestPrincipal = {
		apiKey: null,
		oauthGrant: { organizationId: "org-other", websiteIds: ["site"] },
		oauthScopes: ["read:data"],
		oauthUserId: "user",
		organizationId: "org-other",
		userId: "user",
	};

	it("filters website discovery and selectors to the granted websites", async () => {
		expect(
			(await getCachedAccessibleWebsites(principal)).map((site) => site.id)
		).toEqual(["site"]);
		expect(await resolveWebsiteId({ websiteName: "Reports" }, principal)).toBe(
			"site"
		);
		expect(
			await resolveWebsiteId({ websiteDomain: "www.example.com" }, principal)
		).toBeInstanceOf(Error);
	});

	it("checks membership and scope before returning discovery results", async () => {
		readableOrganizations.mockResolvedValueOnce([]);
		expect(await getCachedAccessibleWebsites(principal)).toEqual([]);
		expect(
			await getCachedAccessibleWebsites({ ...principal, oauthScopes: [] })
		).toEqual([]);
	});

	it("requires a selected website, read scope, and current membership for direct data access", async () => {
		const authorized = { ...principal, requestHeaders: new Headers() };
		expect(await ensureWebsiteAccess("www-site", authorized)).toBeInstanceOf(
			Error
		);
		expect(
			await ensureWebsiteAccess("site", { ...authorized, oauthScopes: [] })
		).toBeInstanceOf(Error);
		expect(memberRole).not.toHaveBeenCalled();
		expect(await ensureWebsiteAccess("site", authorized)).not.toBeInstanceOf(
			Error
		);
		memberRole.mockResolvedValueOnce(null);
		expect(await ensureWebsiteAccess("site", authorized)).toBeInstanceOf(Error);
	});

	it("requires a website selector for aggregate organization data", async () => {
		expect(await resolveOrganizationId(principal)).toMatchObject({
			code: "invalid_input",
			message: expect.stringMatching(
				/organization-wide flags.*Pass websiteId, websiteName, or websiteDomain from list_websites/
			),
		});
		expect(
			await resolveOrganizationId({
				...principal,
				oauthGrant: { organizationId: "org-other", websiteIds: null },
			})
		).toBe("org-other");
	});

	it("rejects a deleted selected website before checking membership", async () => {
		expect(
			await ensureWebsiteAccess("deleted-site", {
				...principal,
				oauthGrant: {
					organizationId: "org-other",
					websiteIds: ["deleted-site"],
				},
				requestHeaders: new Headers(),
			})
		).toMatchObject({ code: "not_found", message: "Website not found" });
		expect(memberRole).not.toHaveBeenCalled();
	});
});

describe("MCP domain selector compatibility", () => {
	const sessionPrincipal: RequestPrincipal = {
		apiKey: null,
		organizationId: "org-other",
		userId: "user",
	};
	it.each([
		["reports.example.com", "site"],
		["REPORTS.EXAMPLE.COM", "site"],
		["http://reports.example.com", "site"],
		["HTTPS://REPORTS.EXAMPLE.COM", "site"],
		["https://www.example.com", "www-site"],
		["HtTpS://reports.example.com:8443", "port-site"],
	])("resolves %s to %s", async (websiteDomain, expected) => {
		expect(await resolveWebsiteId({ websiteDomain }, sessionPrincipal)).toBe(
			expected
		);
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
			await resolveWebsiteId({ websiteDomain }, sessionPrincipal)
		).toBeInstanceOf(Error);
	});
});

describe("shared agent's business-context organization boundary", () => {
	it("rejects a missing website before checking permissions", async () => {
		permission.mockClear();
		const access = await ensureWebsiteAccess("missing-site", {
			apiKey: null,
			organizationId: "org-other",
			requestHeaders: new Headers(),
			userId: null,
		});
		expect(access).toBeInstanceOf(Error);
		expect(access).toMatchObject({
			code: "not_found",
			message: "Website not found",
		});
		expect(permission).not.toHaveBeenCalled();
	});
	it("rejects a site in another organization even if the session could read both", async () => {
		permission.mockClear();
		const result = await ensureWebsiteAccess("foreign-site", {
			apiKey: null,
			organizationId: "org-current",
			requestHeaders: new Headers(),
			userId: null,
		});
		expect(result).toBeInstanceOf(Error);
		expect(permission).not.toHaveBeenCalled();
	});
	it("continues checking website authorization inside the context organization", async () => {
		const result = await ensureWebsiteAccess("same-org-site", {
			apiKey: null,
			organizationId: "org-other",
			requestHeaders: new Headers(),
			userId: null,
		});
		expect(result).toEqual({
			domain: "other.example.com",
			organizationId: "org-other",
		});
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
			await ensureWebsiteAccess("denied-site", {
				apiKey: null,
				organizationId: "org-other",
				requestHeaders: new Headers(),
				userId: null,
			})
		).toBeInstanceOf(Error);
	});
	it("denies a session user outside the website's organization instead of failing", async () => {
		const sessionWithoutOrganization = {
			apiKey: null,
			requestHeaders: new Headers(),
			userId: "user",
		};
		permission.mockRejectedValueOnce(
			Object.assign(new Error("User is not a member of the organization"), {
				statusCode: 401,
			})
		);
		expect(
			await ensureWebsiteAccess("foreign-site", sessionWithoutOrganization)
		).toMatchObject({
			code: "unauthorized",
			message: "Access denied to this website",
		});
		permission.mockRejectedValueOnce(new Error("connection reset"));
		await expect(
			ensureWebsiteAccess("foreign-site", sessionWithoutOrganization)
		).rejects.toThrow("connection reset");
	});
});
