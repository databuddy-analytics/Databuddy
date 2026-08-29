import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	findFirst: vi.fn(async () => state.row),
	lastUsedWrites: 0,
	lockReply: "OK" as "OK" | null,
	redisSet: vi.fn(async () => state.lockReply),
	row: null as unknown,
}));

vi.mock("@databuddy/db", () => ({
	db: {
		transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
			fn({
				execute: async () => undefined,
				query: { apikey: { findFirst: state.findFirst } },
			}),
		update: () => ({
			set: () => ({
				where: async () => {
					state.lastUsedWrites += 1;
				},
			}),
		}),
	},
	eq: vi.fn(),
	sql: () => "",
}));

vi.mock("@databuddy/db/schema", () => ({ apikey: {} }));

vi.mock("@databuddy/redis", () => ({
	cacheNamespaces: { apiKeyByHash: "api-key-by-hash" },
	cacheable: (fn: (...args: never[]) => unknown) =>
		Object.assign(fn, { invalidate: vi.fn(async () => undefined) }),
	redis: { set: state.redisSet },
}));

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
	resolveApiKeySecret,
	resolveEffectiveScopesForWebsite,
} from "@databuddy/api-keys/resolve";

const VALID_SECRET = "dbdy_test123";

function createMockKey(overrides: Partial<ApiKeyRow> = {}): ApiKeyRow {
	const now = new Date("2026-08-01T00:00:00.000Z");
	return {
		createdAt: now,
		enabled: true,
		expiresAt: null,
		id: "key-123",
		keyHash: "hashed",
		lastUsedAt: null,
		metadata: {},
		name: "Test Key",
		organizationId: null,
		prefix: "dbdy",
		rateLimitEnabled: true,
		rateLimitMax: null,
		rateLimitTimeWindow: null,
		revokedAt: null,
		scopes: ["read:data", "write:data"],
		start: "dbdy_abc",
		type: "user",
		updatedAt: now,
		userId: "user-1",
		...overrides,
	};
}

beforeEach(() => {
	state.findFirst.mockClear();
	state.lastUsedWrites = 0;
	state.lockReply = "OK";
	state.redisSet.mockClear();
	state.row = null;
});

describe("isApiKeyPresent", () => {
	it.each([
		["x-api-key header", { "x-api-key": VALID_SECRET }, true],
		["Bearer token", { authorization: `Bearer ${VALID_SECRET}` }, true],
		["lowercase bearer", { authorization: `bearer ${VALID_SECRET}` }, true],
		["no headers", {}, false],
		["Basic authorization", { authorization: "Basic dXNlcjpwYXNz" }, false],
		["empty x-api-key", { "x-api-key": "" }, false],
	])("%s -> %s", (_name, headers, expected) => {
		expect(isApiKeyPresent(new Headers(headers))).toBe(expected);
	});
});

describe("extractSecret", () => {
	it.each([
		["x-api-key header", { "x-api-key": VALID_SECRET }, VALID_SECRET],
		[
			"Bearer token",
			{ authorization: `Bearer ${VALID_SECRET}` },
			VALID_SECRET,
		],
		[
			"x-api-key over Bearer",
			{
				authorization: "Bearer dbdy_bearer_token",
				"x-api-key": "dbdy_xapikey_token",
			},
			"dbdy_xapikey_token",
		],
		[
			"whitespace around x-api-key",
			{ "x-api-key": `  ${VALID_SECRET}  ` },
			VALID_SECRET,
		],
		[
			"whitespace around Bearer token",
			{ authorization: `Bearer   ${VALID_SECRET}  ` },
			VALID_SECRET,
		],
		[
			"case-insensitive Bearer",
			{ authorization: `BEARER ${VALID_SECRET}` },
			VALID_SECRET,
		],
		["no headers", {}, null],
		["Basic authorization", { authorization: "Basic dXNlcjpwYXNz" }, null],
		["whitespace-only x-api-key", { "x-api-key": "   " }, null],
		["empty Bearer token", { authorization: "Bearer    " }, null],
		[
			"Bearer token without dbdy_ prefix",
			{ authorization: "Bearer invalid_token" },
			null,
		],
		["Bearer token below minimum length", { authorization: "Bearer dbdy_" }, null],
		[
			"Bearer token above maximum length",
			{ authorization: `Bearer dbdy_${"a".repeat(200)}` },
			null,
		],
		["x-api-key without dbdy_ prefix", { "x-api-key": "invalid_token" }, null],
		["x-api-key below minimum length", { "x-api-key": "dbdy_" }, null],
		[
			"x-api-key above maximum length",
			{ "x-api-key": `dbdy_${"a".repeat(200)}` },
			null,
		],
	])("%s", (_name, headers, expected) => {
		expect(extractSecret(new Headers(headers))).toBe(expected);
	});
});

describe("resolveApiKeySecret", () => {
	it.each([
		["wrong prefix", `sk_live_${"a".repeat(20)}`],
		["below minimum length", "dbdy_a"],
		["above maximum length", `dbdy_${"a".repeat(200)}`],
	])("rejects %s without hitting the database", async (_name, secret) => {
		await expect(resolveApiKeySecret(secret)).resolves.toEqual({
			key: null,
			outcome: "invalid",
		});
		expect(state.findFirst).not.toHaveBeenCalled();
	});

	it("reports unknown secrets as invalid with prefix diagnostics", async () => {
		const secret = "dbdy_unknown_secret_value";

		await expect(resolveApiKeySecret(secret)).resolves.toEqual({
			key: null,
			outcome: "invalid",
			prefix: "dbdy",
			start: secret.slice(0, 8),
		});
		expect(state.findFirst).toHaveBeenCalledTimes(1);
	});

	it("resolves an enabled key with a future expiration", async () => {
		state.row = createMockKey({
			expiresAt: new Date(Date.now() + 86_400_000),
		});

		const result = await resolveApiKeySecret(VALID_SECRET);

		expect(result.outcome).toBe("ok");
		expect(result.key?.id).toBe("key-123");
		expect(result.prefix).toBe("dbdy");
		expect(result.start).toBe(VALID_SECRET.slice(0, 8));
	});

	it("records last-used once per debounce window without blocking resolution", async () => {
		state.row = createMockKey();

		await resolveApiKeySecret(VALID_SECRET);
		await vi.waitFor(() => expect(state.lastUsedWrites).toBe(1));
		expect(state.redisSet).toHaveBeenCalledWith(
			"api-key:last-used-lock:key-123",
			"1",
			"EX",
			expect.any(Number),
			"NX"
		);

		state.lockReply = null;
		await resolveApiKeySecret(VALID_SECRET);
		await vi.waitFor(() => expect(state.redisSet).toHaveBeenCalledTimes(2));
		expect(state.lastUsedWrites).toBe(1);
	});
});

describe("getEffectiveScopes", () => {
	it("handles null metadata", () => {
		const key = createMockKey({
			metadata: null as unknown as Record<string, unknown>,
			scopes: ["read:data"],
		});
		expect(getEffectiveScopes(key)).toEqual(["read:data"]);
	});

	it("combines base, global, and matching resource scopes", () => {
		const key = createMockKey({
			metadata: {
				resources: {
					global: ["track:events"],
					"website:site-123": ["write:data", "read:analytics"],
				},
			},
			scopes: ["read:data"],
		});

		expect(getEffectiveScopes(key, "website:site-123").sort()).toEqual([
			"read:analytics",
			"read:data",
			"track:events",
			"write:data",
		]);
	});

	it("excludes scopes of non-matching resources", () => {
		const key = createMockKey({
			metadata: { resources: { "website:site-123": ["write:data"] } },
			scopes: ["read:data"],
		});

		expect(getEffectiveScopes(key, "website:site-456")).toEqual(["read:data"]);
	});

	it("deduplicates scopes repeated across base and resources", () => {
		const key = createMockKey({
			metadata: {
				resources: {
					global: ["read:data"],
					"website:site-123": ["read:data"],
				},
			},
			scopes: ["read:data"],
		});

		expect(getEffectiveScopes(key, "website:site-123")).toEqual(["read:data"]);
	});
});

describe("scope predicates", () => {
	it("all predicates deny a null key", () => {
		expect(hasKeyScope(null, "read:data")).toBe(false);
		expect(hasKeyAnyScope(null, ["read:data"])).toBe(false);
		expect(hasKeyAllScopes(null, ["read:data"])).toBe(false);
		expect(hasWebsiteScope(null, "site-123", "read:data")).toBe(false);
		expect(hasWebsiteAnyScope(null, "site-123", ["read:data"])).toBe(false);
		expect(hasWebsiteAllScopes(null, "site-123", ["read:data"])).toBe(false);
		expect(hasGlobalAccess(null)).toBe(false);
		expect(resolveEffectiveScopesForWebsite(null, "site-123").size).toBe(0);
		expect(getAccessibleWebsiteIds(null)).toEqual([]);
	});

	it("hasKeyScope checks base, resource, and global scopes", () => {
		const base = createMockKey({ scopes: ["read:data"] });
		expect(hasKeyScope(base, "read:data")).toBe(true);
		expect(hasKeyScope(base, "admin:apikeys")).toBe(false);
		expect(hasKeyScope(base, "read:data", "website:site-123")).toBe(true);

		const scoped = createMockKey({
			metadata: { resources: { "website:site-123": ["read:analytics"] } },
			scopes: [],
		});
		expect(hasKeyScope(scoped, "read:analytics", "website:site-123")).toBe(
			true
		);
		expect(hasKeyScope(scoped, "read:analytics", "website:site-456")).toBe(
			false
		);
	});

	it("hasKeyAllScopes requires every scope across base and resources", () => {
		const key = createMockKey({
			metadata: { resources: { "website:site-123": ["write:data"] } },
			scopes: ["read:data"],
		});
		expect(
			hasKeyAllScopes(key, ["read:data", "write:data"], "website:site-123")
		).toBe(true);
		expect(hasKeyAllScopes(key, ["read:data", "write:data"])).toBe(false);
	});
});

describe("website scope helpers", () => {
	it("hasWebsiteScope resolves the website resource prefix", () => {
		const key = createMockKey({
			metadata: { resources: { "website:site-123": ["read:analytics"] } },
			scopes: [],
		});
		expect(hasWebsiteScope(key, "site-123", "read:analytics")).toBe(true);
		expect(hasWebsiteScope(key, "site-456", "read:analytics")).toBe(false);
	});

	it("hasWebsiteScope accepts base and global scopes for any website", () => {
		expect(
			hasWebsiteScope(
				createMockKey({ scopes: ["read:data"] }),
				"site-123",
				"read:data"
			)
		).toBe(true);
		expect(
			hasWebsiteScope(
				createMockKey({
					metadata: { resources: { global: ["track:events"] } },
					scopes: [],
				}),
				"site-123",
				"track:events"
			)
		).toBe(true);
	});

	it("hasWebsiteAnyScope and hasWebsiteAllScopes evaluate against the website resource", () => {
		const key = createMockKey({
			metadata: { resources: { "website:site-123": ["read:analytics"] } },
			scopes: ["read:data"],
		});
		expect(
			hasWebsiteAnyScope(key, "site-123", ["read:analytics", "write:data"])
		).toBe(true);
		expect(hasWebsiteAnyScope(key, "site-456", ["read:analytics"])).toBe(false);
		expect(
			hasWebsiteAllScopes(key, "site-123", ["read:data", "read:analytics"])
		).toBe(true);
		expect(
			hasWebsiteAllScopes(key, "site-123", ["read:analytics", "write:data"])
		).toBe(false);
	});

	it("resolveEffectiveScopesForWebsite returns the combined scope set", () => {
		const key = createMockKey({
			metadata: {
				resources: {
					global: ["track:events"],
					"website:site-123": ["write:data"],
				},
			},
			scopes: ["read:data"],
		});

		expect(resolveEffectiveScopesForWebsite(key, "site-123")).toEqual(
			new Set(["read:data", "track:events", "write:data"])
		);
	});
});

describe("hasGlobalAccess", () => {
	it.each([
		["no resources", {}, false],
		["only website resources", { resources: { "website:site-123": ["read:data"] } }, false],
		["empty global resource", { resources: { global: [] } }, false],
		["populated global resource", { resources: { global: ["read:data"] } }, true],
	])("%s -> %s", (_name, metadata, expected) => {
		expect(hasGlobalAccess(createMockKey({ metadata }))).toBe(expected);
	});
});

describe("getAccessibleWebsiteIds", () => {
	it("returns empty array when no website resources exist", () => {
		expect(getAccessibleWebsiteIds(createMockKey({ metadata: {} }))).toEqual(
			[]
		);
		expect(
			getAccessibleWebsiteIds(
				createMockKey({ metadata: { resources: { global: ["read:data"] } } })
			)
		).toEqual([]);
	});

	it("extracts ids from website resources only", () => {
		const key = createMockKey({
			metadata: {
				resources: {
					global: ["track:events"],
					"website:site-1": ["read:data"],
					"website:site-2": ["write:data"],
				},
			},
		});

		expect(getAccessibleWebsiteIds(key).sort()).toEqual(["site-1", "site-2"]);
	});
});
