import { describe, expect, it } from "bun:test";
import { hasScope, isExpired } from "keypal";
import {
    type ApiKeyRow,
    extractSecret,
    getAccessibleWebsiteIds,
    getEffectiveScopes,
    hasGlobalAccess,
    hasKeyAllScopes,
    hasKeyAnyScope,
    hasKeyScope,
    hasWebsiteAllScopes,
    hasWebsiteAnyScope,
    hasWebsiteScope,
    isApiKeyPresent,
    resolveEffectiveScopesForWebsite,
} from "./api-key";

const createMockKey = (overrides: Partial<ApiKeyRow> = {}): ApiKeyRow =>
    ({
        id: "key-123",
        name: "Test Key",
        prefix: "dbdy",
        start: "dbdy_abc",
        keyHash: "hashed",
        userId: "user-1",
        organizationId: null,
        type: "user",
        scopes: ["read:data", "write:data"],
        enabled: true,
        revokedAt: null,
        expiresAt: null,
        rateLimitEnabled: true,
        rateLimitMax: null,
        rateLimitTimeWindow: null,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    }) as ApiKeyRow;

describe("isApiKeyPresent", () => {
    it("returns true when x-api-key header is present", () => {
        const headers = new Headers({ "x-api-key": "dbdy_test123" });
        expect(isApiKeyPresent(headers)).toBe(true);
    });

    it("returns true when Bearer token is present", () => {
        const headers = new Headers({ authorization: "Bearer dbdy_test123" });
        expect(isApiKeyPresent(headers)).toBe(true);
    });

    it("returns false when no API key headers", () => {
        const headers = new Headers({});
        expect(isApiKeyPresent(headers)).toBe(false);
    });

    it("returns false for non-Bearer authorization", () => {
        const headers = new Headers({ authorization: "Basic dXNlcjpwYXNz" });
        expect(isApiKeyPresent(headers)).toBe(false);
    });

    it("returns true for lowercase bearer", () => {
        const headers = new Headers({ authorization: "bearer dbdy_test123" });
        expect(isApiKeyPresent(headers)).toBe(true);
    });

    it("returns false for empty x-api-key", () => {
        const headers = new Headers({ "x-api-key": "" });
        expect(isApiKeyPresent(headers)).toBe(false);
    });
});

describe("extractSecret", () => {
    it("extracts x-api-key header", () => {
        const headers = new Headers({ "x-api-key": "dbdy_test123" });
        expect(extractSecret(headers)).toBe("dbdy_test123");
    });

    it("extracts Bearer token from authorization", () => {
        const headers = new Headers({ authorization: "Bearer dbdy_test123" });
        expect(extractSecret(headers)).toBe("dbdy_test123");
    });

    it("prefers x-api-key over Bearer", () => {
        const headers = new Headers({
            "x-api-key": "dbdy_xapikey",
            authorization: "Bearer dbdy_bearer",
        });
        expect(extractSecret(headers)).toBe("dbdy_xapikey");
    });

    it("returns null when no API key present", () => {
        const headers = new Headers({});
        expect(extractSecret(headers)).toBeNull();
    });

    it("returns null for non-Bearer authorization", () => {
        const headers = new Headers({ authorization: "Basic dXNlcjpwYXNz" });
        expect(extractSecret(headers)).toBeNull();
    });

    it("trims whitespace from x-api-key", () => {
        const headers = new Headers({ "x-api-key": "  dbdy_test123  " });
        expect(extractSecret(headers)).toBe("dbdy_test123");
    });

    it("trims whitespace from Bearer token", () => {
        const headers = new Headers({ authorization: "Bearer   dbdy_test123  " });
        expect(extractSecret(headers)).toBe("dbdy_test123");
    });

    it("handles case-insensitive Bearer", () => {
        const headers = new Headers({ authorization: "bearer dbdy_test123" });
        expect(extractSecret(headers)).toBe("dbdy_test123");
    });

    it("returns null for empty x-api-key after trim", () => {
        const headers = new Headers({ "x-api-key": "   " });
        expect(extractSecret(headers)).toBeNull();
    });

    it("handles BEARER in uppercase", () => {
        const headers = new Headers({ authorization: "BEARER dbdy_test123" });
        expect(extractSecret(headers)).toBe("dbdy_test123");
    });
});

describe("getEffectiveScopes", () => {
    it("returns empty array for null key", () => {
        expect(getEffectiveScopes(null)).toEqual([]);
    });

    it("returns key scopes when no resources", () => {
        const key = createMockKey({ scopes: ["read:data", "write:data"] });
        const scopes = getEffectiveScopes(key);
        expect(scopes).toContain("read:data");
        expect(scopes).toContain("write:data");
        expect(scopes).toHaveLength(2);
    });

    it("returns key scopes when resources is empty", () => {
        const key = createMockKey({
            scopes: ["read:data"],
            metadata: { resources: {} },
        });
        const scopes = getEffectiveScopes(key);
        expect(scopes).toEqual(["read:data"]);
    });

    it("includes global resource scopes", () => {
        const key = createMockKey({
            scopes: ["read:data"],
            metadata: { resources: { global: ["admin:apikeys"] } },
        });
        const scopes = getEffectiveScopes(key);
        expect(scopes).toContain("read:data");
        expect(scopes).toContain("admin:apikeys");
    });

    it("includes resource-specific scopes when resource matches", () => {
        const key = createMockKey({
            scopes: ["read:data"],
            metadata: {
                resources: {
                    "website:site-123": ["write:data", "read:analytics"],
                },
            },
        });

        const scopes = getEffectiveScopes(key, "website:site-123");
        expect(scopes).toContain("read:data");
        expect(scopes).toContain("write:data");
        expect(scopes).toContain("read:analytics");
    });

    it("does not include resource scopes when resource does not match", () => {
        const key = createMockKey({
            scopes: ["read:data"],
            metadata: {
                resources: {
                    "website:site-123": ["write:data"],
                },
            },
        });

        const scopes = getEffectiveScopes(key, "website:site-456");
        expect(scopes).toContain("read:data");
        expect(scopes).not.toContain("write:data");
    });

    it("combines global and resource-specific scopes", () => {
        const key = createMockKey({
            scopes: ["read:data"],
            metadata: {
                resources: {
                    global: ["track:events"],
                    "website:site-123": ["write:data"],
                },
            },
        });

        const scopes = getEffectiveScopes(key, "website:site-123");
        expect(scopes).toContain("read:data");
        expect(scopes).toContain("track:events");
        expect(scopes).toContain("write:data");
    });

    it("deduplicates scopes", () => {
        const key = createMockKey({
            scopes: ["read:data"],
            metadata: {
                resources: {
                    global: ["read:data"],
                    "website:site-123": ["read:data"],
                },
            },
        });

        const scopes = getEffectiveScopes(key, "website:site-123");
        expect(scopes.filter((s) => s === "read:data")).toHaveLength(1);
    });

    it("handles key with empty scopes array", () => {
        const key = createMockKey({
            scopes: [],
            metadata: { resources: { global: ["read:data"] } },
        });
        const scopes = getEffectiveScopes(key);
        expect(scopes).toEqual(["read:data"]);
    });

    it("handles null metadata", () => {
        const key = createMockKey({
            scopes: ["read:data"],
            metadata: null as unknown as Record<string, unknown>,
        });
        const scopes = getEffectiveScopes(key);
        expect(scopes).toEqual(["read:data"]);
    });
});

describe("hasKeyScope", () => {
    it("returns false for null key", () => {
        expect(hasKeyScope(null, "read:data")).toBe(false);
    });

    it("returns true when key has scope in base scopes", () => {
        const key = createMockKey({ scopes: ["read:data", "write:data"] });
        expect(hasKeyScope(key, "read:data")).toBe(true);
    });

    it("returns false when key does not have scope", () => {
        const key = createMockKey({ scopes: ["read:data"] });
        expect(hasKeyScope(key, "admin:apikeys")).toBe(false);
    });

    it("checks resource-specific scopes with matching resource", () => {
        const key = createMockKey({
            scopes: [],
            metadata: {
                resources: { "website:site-123": ["read:analytics"] },
            },
        });

        expect(hasKeyScope(key, "read:analytics", "website:site-123")).toBe(true);
    });

    it("returns false for resource-specific scopes with non-matching resource", () => {
        const key = createMockKey({
            scopes: [],
            metadata: {
                resources: { "website:site-123": ["read:analytics"] },
            },
        });

        expect(hasKeyScope(key, "read:analytics", "website:site-456")).toBe(false);
    });

    it("checks global scopes even when resource is specified", () => {
        const key = createMockKey({
            scopes: ["read:data"],
            metadata: {},
        });

        expect(hasKeyScope(key, "read:data", "website:site-123")).toBe(true);
    });
});

describe("hasKeyAnyScope", () => {
    it("returns false for null key", () => {
        expect(hasKeyAnyScope(null, ["read:data"])).toBe(false);
    });

    it("returns true when key has any of the scopes", () => {
        const key = createMockKey({ scopes: ["read:data"] });
        expect(hasKeyAnyScope(key, ["read:data", "write:data"])).toBe(true);
    });

    it("returns false when key has none of the scopes", () => {
        const key = createMockKey({ scopes: ["track:events"] });
        expect(hasKeyAnyScope(key, ["read:data", "write:data"])).toBe(false);
    });

    it("checks resource-specific scopes", () => {
        const key = createMockKey({
            scopes: [],
            metadata: { resources: { "website:site-123": ["read:analytics"] } },
        });
        expect(
            hasKeyAnyScope(key, ["read:analytics", "write:data"], "website:site-123")
        ).toBe(true);
    });
});

describe("hasKeyAllScopes", () => {
    it("returns false for null key", () => {
        expect(hasKeyAllScopes(null, ["read:data"])).toBe(false);
    });

    it("returns true when key has all scopes", () => {
        const key = createMockKey({ scopes: ["read:data", "write:data"] });
        expect(hasKeyAllScopes(key, ["read:data", "write:data"])).toBe(true);
    });

    it("returns false when key is missing a scope", () => {
        const key = createMockKey({ scopes: ["read:data"] });
        expect(hasKeyAllScopes(key, ["read:data", "write:data"])).toBe(false);
    });

    it("combines base and resource scopes", () => {
        const key = createMockKey({
            scopes: ["read:data"],
            metadata: { resources: { "website:site-123": ["write:data"] } },
        });
        expect(
            hasKeyAllScopes(key, ["read:data", "write:data"], "website:site-123")
        ).toBe(true);
    });
});

describe("resolveEffectiveScopesForWebsite", () => {
    it("returns empty set for null key", () => {
        const scopes = resolveEffectiveScopesForWebsite(null, "site-123");
        expect(scopes.size).toBe(0);
    });

    it("returns scopes for website resource", () => {
        const key = createMockKey({
            scopes: ["read:data"],
            metadata: {
                resources: { "website:site-123": ["write:data"] },
            },
        });

        const scopes = resolveEffectiveScopesForWebsite(key, "site-123");
        expect(scopes.has("read:data")).toBe(true);
        expect(scopes.has("write:data")).toBe(true);
    });

    it("formats websiteId with website: prefix", () => {
        const key = createMockKey({
            scopes: [],
            metadata: {
                resources: { "website:my-site": ["read:analytics"] },
            },
        });

        const scopes = resolveEffectiveScopesForWebsite(key, "my-site");
        expect(scopes.has("read:analytics")).toBe(true);
    });

    it("includes global scopes", () => {
        const key = createMockKey({
            scopes: [],
            metadata: {
                resources: { global: ["track:events"] },
            },
        });

        const scopes = resolveEffectiveScopesForWebsite(key, "site-123");
        expect(scopes.has("track:events")).toBe(true);
    });
});

describe("hasWebsiteScope", () => {
    it("returns false for null key", () => {
        expect(hasWebsiteScope(null, "site-123", "read:data")).toBe(false);
    });

    it("returns true when key has website-specific scope", () => {
        const key = createMockKey({
            scopes: [],
            metadata: {
                resources: { "website:site-123": ["read:analytics"] },
            },
        });

        expect(hasWebsiteScope(key, "site-123", "read:analytics")).toBe(true);
    });

    it("returns true when key has scope in base scopes", () => {
        const key = createMockKey({ scopes: ["read:data"] });
        expect(hasWebsiteScope(key, "site-123", "read:data")).toBe(true);
    });

    it("returns true when key has scope in global resources", () => {
        const key = createMockKey({
            scopes: [],
            metadata: { resources: { global: ["track:events"] } },
        });
        expect(hasWebsiteScope(key, "site-123", "track:events")).toBe(true);
    });

    it("returns false when key lacks required scope", () => {
        const key = createMockKey({ scopes: ["read:data"] });
        expect(hasWebsiteScope(key, "site-123", "admin:apikeys")).toBe(false);
    });

    it("returns false when scope exists for different website", () => {
        const key = createMockKey({
            scopes: [],
            metadata: {
                resources: { "website:site-456": ["read:analytics"] },
            },
        });

        expect(hasWebsiteScope(key, "site-123", "read:analytics")).toBe(false);
    });
});

describe("hasWebsiteAnyScope", () => {
    it("returns false for null key", () => {
        expect(hasWebsiteAnyScope(null, "site-123", ["read:data"])).toBe(false);
    });

    it("returns true when key has any of the scopes for website", () => {
        const key = createMockKey({
            scopes: [],
            metadata: { resources: { "website:site-123": ["read:analytics"] } },
        });
        expect(
            hasWebsiteAnyScope(key, "site-123", ["read:analytics", "write:data"])
        ).toBe(true);
    });

    it("returns false when key has none of the scopes", () => {
        const key = createMockKey({ scopes: ["track:events"] });
        expect(
            hasWebsiteAnyScope(key, "site-123", ["read:analytics", "write:data"])
        ).toBe(false);
    });
});

describe("hasWebsiteAllScopes", () => {
    it("returns false for null key", () => {
        expect(hasWebsiteAllScopes(null, "site-123", ["read:data"])).toBe(false);
    });

    it("returns true when key has all scopes for website", () => {
        const key = createMockKey({
            scopes: ["read:data"],
            metadata: { resources: { "website:site-123": ["write:data"] } },
        });
        expect(
            hasWebsiteAllScopes(key, "site-123", ["read:data", "write:data"])
        ).toBe(true);
    });

    it("returns false when key is missing a scope", () => {
        const key = createMockKey({
            scopes: [],
            metadata: { resources: { "website:site-123": ["read:analytics"] } },
        });
        expect(
            hasWebsiteAllScopes(key, "site-123", ["read:analytics", "write:data"])
        ).toBe(false);
    });
});

describe("key validity simulation (matches getApiKeyFromHeader logic)", () => {
    const isKeyValid = (key: ApiKeyRow | null): boolean => {
        if (!key?.enabled || key.revokedAt || isExpired(key.expiresAt)) {
            return false;
        }
        return true;
    };

    it("returns false for null key", () => {
        expect(isKeyValid(null)).toBe(false);
    });

    it("returns false for disabled key", () => {
        const key = createMockKey({ enabled: false });
        expect(isKeyValid(key)).toBe(false);
    });

    it("returns false for revoked key", () => {
        const key = createMockKey({ revokedAt: new Date() });
        expect(isKeyValid(key)).toBe(false);
    });

    it("returns false for expired key", () => {
        const key = createMockKey({
            expiresAt: new Date(Date.now() - 1000).toISOString(),
        });
        expect(isKeyValid(key)).toBe(false);
    });

    it("returns true for valid enabled key", () => {
        const key = createMockKey({
            enabled: true,
            revokedAt: null,
            expiresAt: null,
        });
        expect(isKeyValid(key)).toBe(true);
    });

    it("returns true for key with future expiration", () => {
        const key = createMockKey({
            enabled: true,
            expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        });
        expect(isKeyValid(key)).toBe(true);
    });

    it("returns false for disabled key even with valid expiration", () => {
        const key = createMockKey({
            enabled: false,
            expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        });
        expect(isKeyValid(key)).toBe(false);
    });

    it("returns false for revoked key even if enabled", () => {
        const key = createMockKey({
            enabled: true,
            revokedAt: new Date(),
        });
        expect(isKeyValid(key)).toBe(false);
    });
});

describe("hasGlobalAccess", () => {
    it("returns false for null key", () => {
        expect(hasGlobalAccess(null)).toBe(false);
    });

    it("returns false when no resources", () => {
        const key = createMockKey({ metadata: {} });
        expect(hasGlobalAccess(key)).toBe(false);
    });

    it("returns false when no global resource", () => {
        const key = createMockKey({
            metadata: { resources: { "website:site-123": ["read:data"] } },
        });
        expect(hasGlobalAccess(key)).toBe(false);
    });

    it("returns false when global resource is empty", () => {
        const key = createMockKey({
            metadata: { resources: { global: [] } },
        });
        expect(hasGlobalAccess(key)).toBe(false);
    });

    it("returns true when global resource has scopes", () => {
        const key = createMockKey({
            metadata: { resources: { global: ["read:data"] } },
        });
        expect(hasGlobalAccess(key)).toBe(true);
    });
});

describe("getAccessibleWebsiteIds", () => {
    it("returns empty array for null key", () => {
        expect(getAccessibleWebsiteIds(null)).toEqual([]);
    });

    it("returns empty array when no resources", () => {
        const key = createMockKey({ metadata: {} });
        expect(getAccessibleWebsiteIds(key)).toEqual([]);
    });

    it("returns empty array when no website resources", () => {
        const key = createMockKey({
            metadata: { resources: { global: ["read:data"] } },
        });
        expect(getAccessibleWebsiteIds(key)).toEqual([]);
    });

    it("returns website ids from resources", () => {
        const key = createMockKey({
            metadata: {
                resources: {
                    "website:site-1": ["read:data"],
                    "website:site-2": ["write:data"],
                    global: ["track:events"],
                },
            },
        });
        const ids = getAccessibleWebsiteIds(key);
        expect(ids).toContain("site-1");
        expect(ids).toContain("site-2");
        expect(ids).toHaveLength(2);
    });

    it("extracts id correctly from website:id format", () => {
        const key = createMockKey({
            metadata: {
                resources: { "website:my-long-id-123": ["read:data"] },
            },
        });
        expect(getAccessibleWebsiteIds(key)).toEqual(["my-long-id-123"]);
    });
});

describe("keypal utilities used in implementation", () => {
    it("hasScope returns true when scope exists", () => {
        expect(hasScope(["read:data", "write:data"], "read:data")).toBe(true);
    });

    it("hasScope returns false when scope does not exist", () => {
        expect(hasScope(["read:data"], "write:data")).toBe(false);
    });

    it("hasScope handles undefined scopes", () => {
        expect(hasScope(undefined, "read:data")).toBe(false);
    });

    it("isExpired returns false for null", () => {
        expect(isExpired(null)).toBe(false);
    });

    it("isExpired returns false for undefined", () => {
        expect(isExpired(undefined)).toBe(false);
    });

    it("isExpired returns true for past date", () => {
        const past = new Date(Date.now() - 1000).toISOString();
        expect(isExpired(past)).toBe(true);
    });

    it("isExpired returns false for future date", () => {
        const future = new Date(Date.now() + 100_000).toISOString();
        expect(isExpired(future)).toBe(false);
    });
});
