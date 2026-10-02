import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { RequestPrincipal } from "./tool-context";
import type { WebsiteSummary } from "../../lib/accessible-websites";
import { createRedisModuleMock } from "../test-redis-mock";

const permission = mock(async () => ({ success: true }));
const memberRole = mock(async () => "viewer" as string | null);
let cachedWebsiteList: WebsiteSummary[] | null = null;
const sites: WebsiteSummary[] = [
	{
		id: "site",
		domain: "Reports.Example.com",
		name: "Reports",
		createdAt: null,
		isPublic: false,
		organizationId: "org-other",
		organizationName: "Other org",
	},
	{
		id: "www-site",
		domain: "WWW.Example.com",
		name: "WWW",
		createdAt: null,
		isPublic: false,
		organizationId: "org-other",
		organizationName: "Other org",
	},
	{
		id: "port-site",
		domain: "Reports.Example.com:8443",
		name: "Port",
		createdAt: null,
		isPublic: false,
		organizationId: "org-other",
		organizationName: "Other org",
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
	getOrganizationWebsites: async () => sites,
}));
mock.module("@databuddy/rpc/organization", () => ({
	getMemberRole: memberRole,
}));
mock.module("@databuddy/api-keys/resolve", () => ({
	hasKeyScope: () => true,
	hasWebsiteScopeForOrganization: () => true,
}));
mock.module("@databuddy/redis", () =>
	createRedisModuleMock({
		cacheable:
			(load: (...args: unknown[]) => Promise<unknown>) =>
			async (...args: unknown[]) =>
				cachedWebsiteList ?? load(...args),
	})
);

const {
	buildRpcContext,
	ensureWebsiteAccess,
	getCachedAccessibleWebsites,
	resolveOrganizationId,
	resolveWebsiteId,
} = await import("./tool-context");

beforeEach(() => {
	cachedWebsiteList = null;
	memberRole.mockClear();
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
		cachedWebsiteList = sites;
		expect(
			(await getCachedAccessibleWebsites(principal)).map((site) => site.id)
		).toEqual(["site"]);
		expect(memberRole).toHaveBeenCalledWith("user", "org-other");
		expect(await resolveWebsiteId({ websiteName: "Reports" }, principal)).toBe(
			"site"
		);
		await expect(
			resolveWebsiteId({ websiteDomain: "www.example.com" }, principal)
		).rejects.toBeInstanceOf(Error);
	});

	it("does not reuse discovery results after membership or scope access is removed", async () => {
		cachedWebsiteList = sites;
		memberRole.mockResolvedValueOnce(null);
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
		await expect(
			ensureWebsiteAccess("www-site", authorized)
		).rejects.toBeInstanceOf(Error);
		await expect(
			ensureWebsiteAccess("site", {
				...authorized,
				oauth: { ...authorized.oauth, scopes: [] },
			})
		).rejects.toBeInstanceOf(Error);
		expect(memberRole).not.toHaveBeenCalled();
		await expect(
			ensureWebsiteAccess("site", authorized)
		).resolves.toMatchObject({
			organizationId: "org-other",
		});
		memberRole.mockResolvedValueOnce(null);
		await expect(
			ensureWebsiteAccess("site", authorized)
		).rejects.toBeInstanceOf(Error);
	});

	it("requires a website selector for aggregate organization data", () => {
		expect(() => resolveOrganizationId(principal)).toThrow(
			expect.objectContaining({
				code: "invalid_input",
				message: expect.stringMatching(
					/organization-wide flags.*Pass websiteId, websiteName, or websiteDomain from list_websites/
				),
			})
		);
		expect(
			resolveOrganizationId({
				...principal,
				oauth: {
					...principal.oauth,
					grant: { organizationId: "org-other", websiteIds: null },
				},
			})
		).toBe("org-other");
	});

	it("rejects a deleted selected website before checking membership", async () => {
		await expect(
			ensureWebsiteAccess("deleted-site", {
				...principal,
				oauth: {
					...principal.oauth,
					grant: { organizationId: "org-other", websiteIds: ["deleted-site"] },
				},
				requestHeaders: new Headers(),
			})
		).rejects.toMatchObject({
			code: "not_found",
			message: "Website not found",
		});
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
		await expect(
			resolveWebsiteId({ websiteDomain }, sessionPrincipal)
		).rejects.toBeInstanceOf(Error);
	});
	it("names each matching website's organization when a selector is ambiguous", async () => {
		const [first] = sites;
		if (!first) {
			throw new Error("Expected a website fixture");
		}
		cachedWebsiteList = [
			first,
			{
				...first,
				id: "acme-site",
				organizationId: "org-acme",
				organizationName: "Acme",
			},
		];
		await expect(
			resolveWebsiteId({ websiteName: "Reports" }, sessionPrincipal)
		).rejects.toMatchObject({
			code: "invalid_input",
			message:
				'2 accessible websites match name "Reports": site in Other org, acme-site in Acme. Pass websiteId to choose one.',
		});
	});
});

describe("shared agent's business-context organization boundary", () => {
	it("rejects a missing website before checking permissions", async () => {
		permission.mockClear();
		await expect(
			ensureWebsiteAccess("missing-site", {
				apiKey: null,
				organizationId: "org-other",
				requestHeaders: new Headers(),
				userId: null,
			})
		).rejects.toMatchObject({
			code: "not_found",
			message: "Website not found",
		});
		expect(permission).not.toHaveBeenCalled();
	});
	it("rejects a site in another organization even if the session could read both", async () => {
		permission.mockClear();
		await expect(
			ensureWebsiteAccess("foreign-site", {
				apiKey: null,
				organizationId: "org-current",
				requestHeaders: new Headers(),
				userId: null,
			})
		).rejects.toBeInstanceOf(Error);
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
		await expect(
			ensureWebsiteAccess("denied-site", {
				apiKey: null,
				organizationId: "org-other",
				requestHeaders: new Headers(),
				userId: null,
			})
		).rejects.toBeInstanceOf(Error);
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
		await expect(
			ensureWebsiteAccess("foreign-site", sessionWithoutOrganization)
		).rejects.toMatchObject({
			code: "unauthorized",
			message: "Access denied to this website",
		});
		permission.mockRejectedValueOnce(new Error("connection reset"));
		await expect(
			ensureWebsiteAccess("foreign-site", sessionWithoutOrganization)
		).rejects.toThrow("connection reset");
	});
});
