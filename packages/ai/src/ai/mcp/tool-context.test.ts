import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { RequestPrincipal } from "./tool-context";
import type { WebsiteSummary } from "../../lib/accessible-websites";

const permission = mock(async () => ({ success: true }));
const discoveryMembership = mock(
	async (): Promise<{ role: string } | null> => ({ role: "viewer" })
);
const memberRole = mock(async () => "viewer" as string | null);
let cachedWebsites: string | null = null;
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
}));
mock.module("@databuddy/rpc/organization", () => ({
	getMemberRole: memberRole,
}));
mock.module("@databuddy/api-keys/resolve", () => ({
	hasKeyScope: () => true,
	hasWebsiteScopeForOrganization: () => true,
}));
const realDb = await import("@databuddy/db");
mock.module("@databuddy/db", () => ({
	...realDb,
	db: { query: { member: { findFirst: discoveryMembership } } },
}));
const realRedis = await import("@databuddy/redis");
mock.module("@databuddy/redis", () => ({
	...realRedis,
	getRedisCache: () =>
		cachedWebsites
			? { get: async () => cachedWebsites, setex: async () => {} }
			: null,
}));

const {
	buildRpcContext,
	ensureWebsiteAccess,
	getCachedAccessibleWebsites,
	resolveOrganizationId,
	resolveWebsiteId,
} = await import("./tool-context");

beforeEach(() => {
	cachedWebsites = null;
	memberRole.mockClear();
	discoveryMembership.mockClear();
});

describe("OAuth selected website grants", () => {
	const principal = {
		apiKey: null,
		oauth: {
			grant: { organizationId: "org-other", websiteIds: ["site"] },
			scopes: ["read:data"],
			user: {
				id: "user",
				name: "User",
				email: "user@example.com",
				emailVerified: true,
				image: null,
				createdAt: new Date("2026-01-01"),
				updatedAt: new Date("2026-01-01"),
			},
		},
		userId: null,
	} satisfies RequestPrincipal;

	it("carries the same OAuth principal into RPC without session identity or active organization", () => {
		const context = buildRpcContext({
			...principal,
			requestHeaders: new Headers(),
		});
		expect(context.userId).toBe("user");
		expect(context.organizationId).toBe("org-other");
		expect(context.serviceAuth?.oauth).toBe(principal.oauth);
		expect(context.serviceAuth?.session).toBeNull();
	});

	it("filters website discovery and selectors even when the cache contains more sites", async () => {
		cachedWebsites = JSON.stringify(sites);
		expect(
			(await getCachedAccessibleWebsites(principal)).map((site) => site.id)
		).toEqual(["site"]);
		expect(discoveryMembership).toHaveBeenCalledWith({
			where: { userId: "user", organizationId: "org-other" },
			columns: { role: true },
		});
		expect(await resolveWebsiteId({ websiteName: "Reports" }, principal)).toBe(
			"site"
		);
		expect(
			await resolveWebsiteId({ websiteDomain: "www.example.com" }, principal)
		).toBeInstanceOf(Error);
	});

	it("does not reuse discovery results after membership or scope access is removed", async () => {
		cachedWebsites = JSON.stringify(sites);
		discoveryMembership.mockResolvedValueOnce(null);
		expect(await getCachedAccessibleWebsites(principal)).toEqual([]);
		expect(
			await getCachedAccessibleWebsites({
				...principal,
				oauth: { ...principal.oauth, scopes: [] },
			})
		).toEqual([]);
	});

	it("requires a selected website, read scope, and current membership for direct data access", async () => {
		const authorized = { ...principal, requestHeaders: new Headers() };
		expect(await ensureWebsiteAccess("www-site", authorized)).toBeInstanceOf(
			Error
		);
		expect(
			await ensureWebsiteAccess("site", {
				...authorized,
				oauth: { ...authorized.oauth, scopes: [] },
			})
		).toBeInstanceOf(Error);
		expect(memberRole).not.toHaveBeenCalled();
		expect(await ensureWebsiteAccess("site", authorized)).not.toBeInstanceOf(
			Error
		);
		memberRole.mockResolvedValueOnce(null);
		expect(await ensureWebsiteAccess("site", authorized)).toBeInstanceOf(Error);
	});

	it("requires a website selector for aggregate organization data", async () => {
		expect(await resolveOrganizationId(principal)).toBeInstanceOf(Error);
		expect(
			await resolveOrganizationId({
				...principal,
				oauth: {
					...principal.oauth,
					grant: { organizationId: "org-other", websiteIds: null },
				},
			})
		).toBe("org-other");
	});

	it("rejects a deleted selected website before checking membership", async () => {
		expect(
			await ensureWebsiteAccess("deleted-site", {
				...principal,
				oauth: {
					...principal.oauth,
					grant: { organizationId: "org-other", websiteIds: ["deleted-site"] },
				},
				requestHeaders: new Headers(),
			})
		).toMatchObject({ code: "not_found", message: "Website not found" });
		expect(memberRole).not.toHaveBeenCalled();
	});
});

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
});
