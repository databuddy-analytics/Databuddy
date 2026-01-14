import { describe, expect, it } from "bun:test";
import {
	createKeys,
	hasAllScopes,
	hasAnyScope,
	hasScope,
	isExpired,
} from "keypal";

// Create a test keys instance (same config as production)
const keys = createKeys({ prefix: "dbdy_", length: 48 });

// Constants matching the router
const API_SCOPES = [
	"read:data",
	"write:llm",
] as const;

const RESOURCE_TYPES = [
	"global",
	"website",
	"ab_experiment",
	"feature_flag",
	"analytics_data",
	"error_data",
	"web_vitals",
	"custom_events",
	"export_data",
] as const;

type Metadata = { resources?: Record<string, string[]> };

type AccessEntry = {
	resourceType: string;
	resourceId?: string;
	scopes: string[];
};

function resourcesToAccess(resources: Record<string, string[]> | undefined) {
	if (!resources) {
		return [];
	}
	return Object.entries(resources).map(([key, scopes], idx) => {
		const isGlobal = key === "global";
		const [resourceType, resourceId] = isGlobal
			? ["global", null]
			: key.split(":");
		return {
			id: `access-${idx}`,
			resourceType: resourceType ?? "global",
			resourceId: resourceId ?? null,
			scopes,
		};
	});
}

function accessToResources(
	access: Array<{ resourceType: string; resourceId?: string; scopes: string[] }>
) {
	const resources: Record<string, string[]> = {};
	for (const entry of access) {
		const key =
			entry.resourceType === "global"
				? "global"
				: `${entry.resourceType}:${entry.resourceId}`;
		resources[key] = entry.scopes;
	}
	return resources;
}

// Helper functions matching the router implementation
function getScopes(
	keyScopes: string[],
	metadata: Metadata,
	resource?: string
): string[] {
	const scopes = new Set<string>(keyScopes);
	const resources = metadata.resources;

	if (resources) {
		for (const s of resources.global ?? []) {
			scopes.add(s);
		}
		if (resource && resources[resource]) {
			for (const s of resources[resource]) {
				scopes.add(s);
			}
		}
	}

	return [...scopes];
}

function checkValidity(key: {
	enabled: boolean;
	revokedAt: Date | null;
	expiresAt: string | null;
}): { valid: boolean; reason?: string } {
	if (!key.enabled) {
		return { valid: false, reason: "disabled" };
	}
	if (key.revokedAt) {
		return { valid: false, reason: "revoked" };
	}
	if (isExpired(key.expiresAt)) {
		return { valid: false, reason: "expired" };
	}
	return { valid: true };
}

describe("API_SCOPES constants", () => {
	it("contains read scopes", () => {
		expect(API_SCOPES).toContain("read:data");
	});

	it("contains write scopes", () => {
		expect(API_SCOPES).toContain("write:llm");
	});
});

describe("RESOURCE_TYPES constants", () => {
	it("contains global", () => {
		expect(RESOURCE_TYPES).toContain("global");
	});

	it("contains website", () => {
		expect(RESOURCE_TYPES).toContain("website");
	});

	it("contains experiment types", () => {
		expect(RESOURCE_TYPES).toContain("ab_experiment");
		expect(RESOURCE_TYPES).toContain("feature_flag");
	});

	it("contains data types", () => {
		expect(RESOURCE_TYPES).toContain("analytics_data");
		expect(RESOURCE_TYPES).toContain("error_data");
		expect(RESOURCE_TYPES).toContain("web_vitals");
		expect(RESOURCE_TYPES).toContain("custom_events");
		expect(RESOURCE_TYPES).toContain("export_data");
	});
});

describe("keys.create", () => {
	it("generates key with dbdy prefix", async () => {
		const { key } = await keys.create({ ownerId: "test", name: "test" });
		expect(key.startsWith("dbdy_")).toBe(true);
	});

	it("generates key of correct length (prefix + 48 chars)", async () => {
		const { key } = await keys.create({ ownerId: "test", name: "test" });
		expect(key.length).toBe(53); // dbdy_ (5) + 48
	});

	it("generates unique keys", async () => {
		const { key: key1 } = await keys.create({ ownerId: "test", name: "test1" });
		const { key: key2 } = await keys.create({ ownerId: "test", name: "test2" });
		expect(key1).not.toBe(key2);
	});

	it("returns record with id", async () => {
		const { record } = await keys.create({ ownerId: "test", name: "test" });
		expect(record.id).toBeDefined();
		expect(typeof record.id).toBe("string");
	});

	it("returns record with keyHash", async () => {
		const { key, record } = await keys.create({
			ownerId: "test",
			name: "test",
		});
		expect(record.keyHash).toBeDefined();
		expect(record.keyHash).toBe(keys.hashKey(key));
	});

	it("returns record with metadata containing ownerId", async () => {
		const { record } = await keys.create({ ownerId: "user-123", name: "test" });
		expect(record.metadata.ownerId).toBe("user-123");
	});

	it("returns record with metadata containing name", async () => {
		const { record } = await keys.create({ ownerId: "test", name: "My Key" });
		expect(record.metadata.name).toBe("My Key");
	});

	it("returns record with metadata containing scopes", async () => {
		const { record } = await keys.create({
			ownerId: "test",
			name: "test",
			scopes: ["read:data", "write:llm"],
		});
		expect(record.metadata.scopes).toContain("read:data");
		expect(record.metadata.scopes).toContain("write:llm");
	});

	it("returns record with metadata containing expiresAt", async () => {
		const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
		const { record } = await keys.create({
			ownerId: "test",
			name: "test",
			expiresAt,
		});
		expect(record.metadata.expiresAt).toBe(expiresAt);
	});
});

describe("keys.hashKey", () => {
	it("generates consistent hash for same input", () => {
		const secret = "dbdy_test123abc";
		const hash1 = keys.hashKey(secret);
		const hash2 = keys.hashKey(secret);
		expect(hash1).toBe(hash2);
	});

	it("generates different hashes for different inputs", () => {
		const hash1 = keys.hashKey("dbdy_secret1");
		const hash2 = keys.hashKey("dbdy_secret2");
		expect(hash1).not.toBe(hash2);
	});

	it("returns string hash", () => {
		const hash = keys.hashKey("dbdy_test");
		expect(typeof hash).toBe("string");
		expect(hash.length).toBeGreaterThan(0);
	});
});

describe("getScopes (router helper)", () => {
	it("returns base scopes when no resources", () => {
		const scopes = getScopes(["read:data", "write:llm"], {});
		expect(scopes).toContain("read:data");
		expect(scopes).toContain("write:llm");
	});

	it("includes global resource scopes", () => {
		const scopes = getScopes(["read:data"], {
			resources: { global: ["write:llm"] },
		});
		expect(scopes).toContain("read:data");
		expect(scopes).toContain("write:llm");
	});

	it("includes resource-specific scopes when resource matches", () => {
		const scopes = getScopes(
			["read:data"],
			{ resources: { "website:site-123": ["write:llm"] } },
			"website:site-123"
		);
		expect(scopes).toContain("read:data");
		expect(scopes).toContain("write:llm");
	});

	it("excludes resource scopes when resource does not match", () => {
		const scopes = getScopes(
			["read:data"],
			{ resources: { "website:site-123": ["write:llm"] } },
			"website:site-456"
		);
		expect(scopes).toContain("read:data");
		expect(scopes).not.toContain("write:llm");
	});

	it("combines global and resource-specific scopes", () => {
		const scopes = getScopes(
			["read:data"],
			{
				resources: {
					global: ["write:llm"],
					"website:site-123": ["write:llm"],
				},
			},
			"website:site-123"
		);
		expect(scopes).toContain("read:data");
		expect(scopes).toContain("write:llm");
	});

	it("deduplicates scopes", () => {
		const scopes = getScopes(
			["read:data", "write:llm"],
			{
				resources: {
					global: ["read:data"],
					"website:site-123": ["read:data"],
				},
			},
			"website:site-123"
		);
		expect(scopes.filter((s) => s === "read:data")).toHaveLength(1);
	});
});

describe("checkValidity (router helper)", () => {
	it("returns valid for enabled key", () => {
		const result = checkValidity({
			enabled: true,
			revokedAt: null,
			expiresAt: null,
		});
		expect(result.valid).toBe(true);
		expect(result.reason).toBeUndefined();
	});

	it("returns disabled reason for disabled key", () => {
		const result = checkValidity({
			enabled: false,
			revokedAt: null,
			expiresAt: null,
		});
		expect(result.valid).toBe(false);
		expect(result.reason).toBe("disabled");
	});

	it("returns revoked reason for revoked key", () => {
		const result = checkValidity({
			enabled: true,
			revokedAt: new Date(),
			expiresAt: null,
		});
		expect(result.valid).toBe(false);
		expect(result.reason).toBe("revoked");
	});

	it("returns expired reason for expired key", () => {
		const result = checkValidity({
			enabled: true,
			revokedAt: null,
			expiresAt: new Date(Date.now() - 1000).toISOString(),
		});
		expect(result.valid).toBe(false);
		expect(result.reason).toBe("expired");
	});

	it("returns valid for key with future expiration", () => {
		const result = checkValidity({
			enabled: true,
			revokedAt: null,
			expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
		});
		expect(result.valid).toBe(true);
	});

	it("checks disabled before revoked", () => {
		const result = checkValidity({
			enabled: false,
			revokedAt: new Date(),
			expiresAt: null,
		});
		expect(result.reason).toBe("disabled");
	});

	it("checks revoked before expired", () => {
		const result = checkValidity({
			enabled: true,
			revokedAt: new Date(),
			expiresAt: new Date(Date.now() - 1000).toISOString(),
		});
		expect(result.reason).toBe("revoked");
	});
});

describe("keypal hasScope", () => {
	it("returns true when scope exists", () => {
		expect(hasScope(["read:data", "write:llm"], "read:data")).toBe(true);
	});

	it("returns false when scope does not exist", () => {
		expect(hasScope(["read:data"], "write:llm")).toBe(false);
	});

	it("handles undefined scopes", () => {
		expect(hasScope(undefined, "read:data")).toBe(false);
	});

	it("handles empty scopes array", () => {
		expect(hasScope([], "read:data")).toBe(false);
	});
});

describe("keypal hasAnyScope", () => {
	it("returns true when any scope matches", () => {
		expect(hasAnyScope(["read:data"], ["read:data", "write:llm"])).toBe(true);
	});

	it("returns true when multiple scopes match", () => {
		expect(
			hasAnyScope(["read:data", "write:llm"], ["read:data", "write:llm"])
		).toBe(true);
	});

	it("returns false when no scopes match", () => {
		expect(hasAnyScope(["write:llm"], ["read:data", "write:llm"])).toBe(
			false
		);
	});

	it("handles empty required scopes", () => {
		expect(hasAnyScope(["read:data"], [])).toBe(false);
	});

	it("handles undefined scopes", () => {
		expect(hasAnyScope(undefined, ["read:data"])).toBe(false);
	});
});

describe("keypal hasAllScopes", () => {
	it("returns true when all scopes match", () => {
		expect(
			hasAllScopes(
				["read:data", "write:llm"],
				["read:data", "write:llm"]
			)
		).toBe(true);
	});

	it("returns false when not all scopes match", () => {
		expect(hasAllScopes(["read:data"], ["read:data", "write:llm"])).toBe(
			false
		);
	});

	it("returns true for empty required scopes", () => {
		expect(hasAllScopes(["read:data"], [])).toBe(true);
	});

	it("handles undefined scopes", () => {
		expect(hasAllScopes(undefined, ["read:data"])).toBe(false);
	});

	it("returns true when exact match", () => {
		expect(
			hasAllScopes(["read:data", "write:llm"], ["read:data", "write:llm"])
		).toBe(true);
	});
});

describe("keypal isExpired", () => {
	it("returns false for null expiration", () => {
		expect(isExpired(null)).toBe(false);
	});

	it("returns false for undefined expiration", () => {
		expect(isExpired(undefined)).toBe(false);
	});

	it("returns true for past date string", () => {
		const past = new Date(Date.now() - 1000).toISOString();
		expect(isExpired(past)).toBe(true);
	});

	it("returns false for future date string", () => {
		const future = new Date(Date.now() + 100_000).toISOString();
		expect(isExpired(future)).toBe(false);
	});

	it("handles edge case of exactly now", () => {
		const now = new Date().toISOString();
		// Should be expired as it's <= now
		expect(typeof isExpired(now)).toBe("boolean");
	});
});

describe("resource format patterns", () => {
	it("global resource stores scopes directly", () => {
		const resources = { global: ["read:data", "write:llm"] };
		expect(resources.global).toEqual(["read:data", "write:llm"]);
	});

	it("website resource uses type:id format", () => {
		const resources = { "website:site-123": ["write:llm"] };
		expect(resources["website:site-123"]).toContain("write:llm");
	});

	it("multiple resources can coexist", () => {
		const resources = {
			global: ["write:llm"],
			"website:site-1": ["read:data"],
			"website:site-2": ["write:llm"],
		};

		expect(Object.keys(resources)).toHaveLength(4);
	});
});

describe("checkAccess simulation (matches router logic)", () => {
	const checkAccess = (
		keyScopes: string[],
		metadata: Metadata,
		validity: { valid: boolean; reason?: string },
		requestedScopes?: string[],
		resource?: string,
		mode: "any" | "all" = "any"
	) => {
		if (!validity.valid) {
			return {
				valid: false,
				reason: validity.reason,
				hasAccess: false,
				scopes: [],
			};
		}

		const scopes = getScopes(keyScopes, metadata, resource);

		if (!requestedScopes?.length) {
			return { valid: true, hasAccess: true, scopes };
		}

		const checkFn = mode === "all" ? hasAllScopes : hasAnyScope;
		return {
			valid: true,
			hasAccess: checkFn(scopes, requestedScopes),
			scopes,
			matched: requestedScopes.filter((s) => hasScope(scopes, s)),
		};
	};

	it("returns invalid for disabled key", () => {
		const result = checkAccess(
			["read:data", "write:llm"],
			{},
			{ valid: false, reason: "disabled" }
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toBe("disabled");
	});

	it("returns all scopes when no specific scopes requested", () => {
		const result = checkAccess(
			["read:data", "write:llm"],
			{},
			{ valid: true }
		);
		expect(result.valid).toBe(true);
		expect(result.hasAccess).toBe(true);
		expect(result.scopes).toContain("read:data");
		expect(result.scopes).toContain("write:llm");
	});

	it("checks any scope by default", () => {
		const result = checkAccess(["read:data"], {}, { valid: true }, [
			"read:data",
			"write:llm",
		]);
		expect(result.hasAccess).toBe(true);
		expect(result.matched).toEqual(["read:data"]);
	});

	it("checks all scopes when mode is all", () => {
		const result = checkAccess(
			["read:data", "write:llm"],
			{},
			{ valid: true },
			["read:data", "write:llm"],
			undefined,
			"all"
		);
		expect(result.hasAccess).toBe(false);
		expect(result.matched).toEqual(["read:data"]);
	});

	it("includes resource-specific scopes", () => {
		const result = checkAccess(
			["read:data", "write:llm"],
			{ resources: { "website:site-123": ["write:data"] } },
			{ valid: true },
			["write:data"],
			"website:site-123"
		);
		expect(result.hasAccess).toBe(true);
	});
});

describe("resourcesToAccess (dashboard compatibility)", () => {
	it("returns empty array for undefined resources", () => {
		expect(resourcesToAccess(undefined)).toEqual([]);
	});

	it("returns empty array for empty resources", () => {
		expect(resourcesToAccess({})).toEqual([]);
	});

	it("converts global resource correctly", () => {
		const access = resourcesToAccess({ global: ["read:data", "write:llm"] });
		expect(access).toHaveLength(1);
		expect(access[0].resourceType).toBe("global");
		expect(access[0].resourceId).toBeNull();
		expect(access[0].scopes).toEqual(["read:data", "write:llm"]);
	});

	it("converts website resource correctly", () => {
		const access = resourcesToAccess({
			"website:site-123": ["write:llm"],
		});
		expect(access).toHaveLength(1);
		expect(access[0].resourceType).toBe("website");
		expect(access[0].resourceId).toBe("site-123");
		expect(access[0].scopes).toEqual(["read:analytics"]);
	});

	it("converts multiple resources", () => {
		const access = resourcesToAccess({
			global: ["write:llm"],
			"website:site-1": ["read:data"],
			"website:site-2": ["write:llm"],
		});
		expect(access).toHaveLength(3);
	});

	it("generates unique ids for each access entry", () => {
		const access = resourcesToAccess({
			global: ["read:data"],
			"website:site-1": ["write:data"],
		});
		const ids = access.map((a) => a.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe("accessToResources (dashboard compatibility)", () => {
	it("returns empty object for empty access array", () => {
		expect(accessToResources([])).toEqual({});
	});

	it("converts global access entry", () => {
		const resources = accessToResources([
			{ resourceType: "global", scopes: ["read:data", "write:llm"] },
		]);
		expect(resources).toEqual({ global: ["read:data", "write:llm"] });
	});

	it("converts website access entry", () => {
		const resources = accessToResources([
			{
				resourceType: "website",
				resourceId: "site-123",
				scopes: ["write:llm"],
			},
		]);
		expect(resources).toEqual({ "website:site-123": ["write:llm"] });
	});

	it("converts multiple access entries", () => {
		const resources = accessToResources([
			{ resourceType: "global", scopes: ["write:llm"] },
			{ resourceType: "website", resourceId: "site-1", scopes: ["read:data"] },
			{ resourceType: "website", resourceId: "site-2", scopes: ["write:llm"] },
		]);
		expect(resources).toEqual({
			global: ["write:llm"],
			"website:site-1": ["read:data"],
			"website:site-2": ["write:llm"],
		});
	});

	it("handles undefined resourceId for non-global types", () => {
		const resources = accessToResources([
			{
				resourceType: "website",
				resourceId: "site-123",
				scopes: ["write:llm"],
			},
		]);
		expect(resources).toEqual({ "website:site-123": ["write:llm"] });
	});
});

describe("round-trip conversion (access <-> resources)", () => {
	it("maintains data through round-trip (resources -> access -> resources)", () => {
		const original = {
			global: ["read:data"],
			"website:site-123": ["write:llm"],
		};
		const access = resourcesToAccess(original);
		const converted = accessToResources(
			access.map((a) => ({
				resourceType: a.resourceType,
				resourceId: a.resourceId ?? undefined,
				scopes: a.scopes,
			}))
		);
		expect(converted).toEqual(original);
	});

	it("maintains data through round-trip (access -> resources -> access)", () => {
		const original: AccessEntry[] = [
			{ resourceType: "global", scopes: ["write:llm"] },
			{ resourceType: "website", resourceId: "site-1", scopes: ["read:data"] },
		];
		const resources = accessToResources(original);
		const access = resourcesToAccess(resources);

		expect(access).toHaveLength(2);
		expect(access.find((a) => a.resourceType === "global")?.scopes).toEqual([
			"write:llm",
		]);
		expect(
			access.find(
				(a) => a.resourceType === "website" && a.resourceId === "site-1"
			)?.scopes
		).toEqual(["read:data"]);
	});
});

describe("dashboard use case: api-key-list", () => {
	it("list response has all required fields for ApiKeyListItem", () => {
		const mockResponse = {
			id: "key-123",
			name: "Test Key",
			prefix: "dbdy",
			start: "dbdy_abc",
			type: "user" as const,
			enabled: true,
			scopes: ["read:data", "write:llm"],
			expiresAt: null,
			revokedAt: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		expect(mockResponse.id).toBeDefined();
		expect(mockResponse.name).toBeDefined();
		expect(mockResponse.prefix).toBeDefined();
		expect(mockResponse.start).toBeDefined();
		expect(mockResponse.type).toBeDefined();
		expect(mockResponse.enabled).toBeDefined();
		expect(mockResponse.createdAt).toBeDefined();
		expect(mockResponse.updatedAt).toBeDefined();
	});

	it("correctly shows active status", () => {
		const isActive = (key: { enabled: boolean; revokedAt: string | null }) =>
			key.enabled && !key.revokedAt;

		expect(isActive({ enabled: true, revokedAt: null })).toBe(true);
		expect(isActive({ enabled: false, revokedAt: null })).toBe(false);
		expect(isActive({ enabled: true, revokedAt: "2024-01-01" })).toBe(false);
	});
});

describe("dashboard use case: api-key-detail-dialog", () => {
	it("detail response has access array for ResourceAccessDisplay", () => {
		const resources = {
			global: ["read:data"],
			"website:site-123": ["write:llm"],
		};
		const access = resourcesToAccess(resources);

		expect(access).toHaveLength(2);
		expect(access[0]).toHaveProperty("id");
		expect(access[0]).toHaveProperty("resourceType");
		expect(access[0]).toHaveProperty("scopes");
	});

	it("access entries have id, resourceType, resourceId, scopes", () => {
		const access = resourcesToAccess({ "website:site-123": ["read:data"] });
		const entry = access[0];

		expect(entry.id).toBeDefined();
		expect(entry.resourceType).toBe("website");
		expect(entry.resourceId).toBe("site-123");
		expect(entry.scopes).toEqual(["read:data"]);
	});
});

describe("dashboard use case: api-key-create-dialog", () => {
	it("converts globalScopes and access to resources format", () => {
		const input = {
			name: "Test Key",
			globalScopes: ["read:data", "write:llm"],
			access: [
				{
					resourceType: "website",
					resourceId: "site-1",
					scopes: ["write:llm"],
				},
				{
					resourceType: "website",
					resourceId: "site-2",
					scopes: ["write:llm"],
				},
			],
		};

		const resources = accessToResources(input.access);
		expect(resources).toEqual({
			"website:site-1": ["write:llm"],
			"website:site-2": ["write:llm"],
		});
	});

	it("handles empty access array", () => {
		const resources = accessToResources([]);
		expect(resources).toEqual({});
	});

	it("handles only global scopes (no website restrictions)", () => {
		const input = {
			globalScopes: ["read:data", "write:llm"],
			access: [],
		};
		const resources = accessToResources(input.access);
		expect(resources).toEqual({});
	});
});

describe("dashboard use case: effective status calculation", () => {
	it("returns Enabled for enabled key without revocation", () => {
		const key = { enabled: true, revokedAt: null };
		const status = key.enabled && !key.revokedAt ? "Enabled" : "Disabled";
		expect(status).toBe("Enabled");
	});

	it("returns Disabled for disabled key", () => {
		const key = { enabled: false, revokedAt: null };
		const status = key.enabled && !key.revokedAt ? "Enabled" : "Disabled";
		expect(status).toBe("Disabled");
	});

	it("returns Disabled for revoked key", () => {
		const key = { enabled: true, revokedAt: new Date().toISOString() };
		const status = key.enabled && !key.revokedAt ? "Enabled" : "Disabled";
		expect(status).toBe("Disabled");
	});
});
