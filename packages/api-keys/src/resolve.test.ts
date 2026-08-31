import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { ApiKeyRow } from "./resolve";

const calls: string[] = [];
const findApiKey = mock((_input?: unknown): Promise<unknown> =>
	Promise.resolve(null)
);
const redisSet = mock((): Promise<string | null> => Promise.resolve("OK"));

let configuredQueryTimeoutMs: number | undefined;
let queryTimeoutOverrideMs: number | undefined;

mock.module("@databuddy/db", () => ({
	db: {
		query: {
			apikey: {
				findFirst: (...args: unknown[]) => {
					calls.push("lookup");
					return findApiKey(args[0]);
				},
			},
		},
		update: () => ({
			set: () => ({ where: () => Promise.resolve() }),
		}),
	},
	eq: (left: unknown, right: unknown) => [left, right],
}));

mock.module("@databuddy/db/schema", () => ({
	apikey: { id: "id" },
}));

mock.module("@databuddy/redis", () => ({
	cacheNamespaces: { apiKeyByHash: "api-key-by-hash" },
	cacheable: (
		lookup: (...args: string[]) => Promise<unknown>,
		options: { queryTimeoutMs?: number }
	) => {
		configuredQueryTimeoutMs = options.queryTimeoutMs;
		const inFlight = new Map<string, Promise<unknown>>();
		const cached = (...args: string[]): Promise<unknown> => {
			const key = JSON.stringify(args);
			const existing = inFlight.get(key);
			if (existing) {
				return existing;
			}

			const raw = lookup(...args);
			const timeoutMs = queryTimeoutOverrideMs ?? options.queryTimeoutMs;
			let timer: ReturnType<typeof setTimeout> | undefined;
			const bounded =
				timeoutMs === undefined
					? raw
					: Promise.race([
							raw,
							new Promise<never>((_, reject) => {
								timer = setTimeout(
									() => reject(new Error("Query timeout")),
									timeoutMs
								);
							}),
						]);
			const shared = bounded.finally(() => {
				if (timer) {
					clearTimeout(timer);
				}
				inFlight.delete(key);
			});
			inFlight.set(key, shared);
			return shared;
		};
		return Object.assign(cached, {
			invalidate: () => Promise.resolve(),
		});
	},
	redis: { set: redisSet },
}));

const {
	API_KEY_LOOKUP_TIMEOUT_MS,
	collectScopes,
	extractSecret,
	getAccessibleWebsiteIds,
	hasGlobalAccess,
	hasWebsiteScopeForOrganization,
	resolveApiKey,
	resolveApiKeySecret,
} = await import("./resolve");

describe("API key database deadline", () => {
	beforeEach(() => {
		calls.length = 0;
		findApiKey.mockReset();
		findApiKey.mockResolvedValue(null);
		queryTimeoutOverrideMs = undefined;
	});

	afterAll(() => {
		mock.restore();
	});

	test("resolves the key with a single lookup query", async () => {
		await expect(
			resolveApiKeySecret("dbdy_valid_test_key")
		).resolves.toMatchObject({ outcome: "invalid" });

		expect(API_KEY_LOOKUP_TIMEOUT_MS).toBe(5000);
		expect(configuredQueryTimeoutMs).toBe(API_KEY_LOOKUP_TIMEOUT_MS);
		expect(calls).toEqual(["lookup"]);
		expect(findApiKey).toHaveBeenCalledTimes(1);
	});

	test("releases the shared lookup after PostgreSQL cancels the statement", async () => {
		const timeout = Object.assign(
			new Error("canceling statement due to statement timeout"),
			{ code: "57014" }
		);
		findApiKey.mockRejectedValueOnce(timeout);

		const first = resolveApiKeySecret("dbdy_stalled_lookup");
		const shared = resolveApiKeySecret("dbdy_stalled_lookup");

		const results = await Promise.allSettled([first, shared]);
		expect(results).toEqual([
			{ status: "rejected", reason: timeout },
			{ status: "rejected", reason: timeout },
		]);
		expect(findApiKey).toHaveBeenCalledTimes(1);

		await expect(
			resolveApiKeySecret("dbdy_stalled_lookup")
		).resolves.toMatchObject({ outcome: "invalid" });
		expect(findApiKey).toHaveBeenCalledTimes(2);
	});

	test("bounds a stalled lookup with the query timeout and retries", async () => {
		queryTimeoutOverrideMs = 10;
		findApiKey.mockImplementationOnce(
			() => new Promise<never>(() => undefined)
		);

		await expect(
			resolveApiKeySecret("dbdy_waiting_for_pool")
		).rejects.toThrow("Query timeout");
		expect(findApiKey).toHaveBeenCalledTimes(1);

		await expect(
			resolveApiKeySecret("dbdy_waiting_for_pool")
		).resolves.toMatchObject({ outcome: "invalid" });
		expect(findApiKey).toHaveBeenCalledTimes(2);
	});
});

describe("secret extraction", () => {
	test("prefers a valid x-api-key header over authorization", () => {
		const headers = new Headers({
			authorization: "Bearer dbdy_from_bearer",
			"x-api-key": "dbdy_from_header",
		});

		expect(extractSecret(headers)).toBe("dbdy_from_header");
	});

	test("falls back to a bearer token when x-api-key is absent or malformed", () => {
		expect(
			extractSecret(new Headers({ authorization: "bearer dbdy_from_bearer" }))
		).toBe("dbdy_from_bearer");
		expect(
			extractSecret(
				new Headers({
					authorization: "Bearer dbdy_from_bearer",
					"x-api-key": "not-our-prefix",
				})
			)
		).toBe("dbdy_from_bearer");
	});

	test.each([
		["wrong prefix", "sk_live_1234567890"],
		["too short", "dbdy_1"],
		["too long", `dbdy_${"x".repeat(200)}`],
	])("rejects a token with %s", (_label, token) => {
		expect(extractSecret(new Headers({ "x-api-key": token }))).toBeNull();
	});

	test("distinguishes a missing credential from a malformed one", async () => {
		findApiKey.mockClear();

		await expect(resolveApiKey(new Headers())).resolves.toEqual({
			key: null,
			outcome: "missing",
		});
		await expect(
			resolveApiKey(new Headers({ "x-api-key": "not-a-key" }))
		).resolves.toEqual({ key: null, outcome: "invalid" });
		expect(findApiKey).not.toHaveBeenCalled();
	});
});

describe("resolve outcomes", () => {
	const baseKey = {
		enabled: true,
		expiresAt: null as Date | null,
		id: "key-1",
		metadata: null,
		organizationId: "org-1",
		revokedAt: null as Date | null,
		scopes: [] as string[],
	};

	test("returns the key with prefix and start for a live credential", async () => {
		findApiKey.mockResolvedValueOnce({ ...baseKey });

		const result = await resolveApiKeySecret("dbdy_live_credential");

		expect(result.outcome).toBe("ok");
		expect(result.key).toMatchObject({ id: "key-1" });
		expect(result.prefix).toBe("dbdy");
		expect(result.start).toBe("dbdy_liv");
	});

	test.each([
		["disabled", { enabled: false }],
		["revoked", { revokedAt: new Date("2026-01-01T00:00:00Z") }],
		["expired", { expiresAt: new Date("2020-01-01T00:00:00Z") }],
	])("maps a %s key to that outcome without returning it", async (
		outcome,
		overrides
	) => {
		findApiKey.mockResolvedValueOnce({ ...baseKey, ...overrides });

		await expect(
			resolveApiKeySecret(`dbdy_${outcome}_credential`)
		).resolves.toMatchObject({ key: null, outcome });
	});
});

describe("scope collection", () => {
	const keyWith = (overrides: Record<string, unknown>): ApiKeyRow =>
		({
			metadata: null,
			organizationId: "org-1",
			scopes: [],
			...overrides,
		}) as unknown as ApiKeyRow;

	test("merges base, global, and resource scopes without duplicates", () => {
		const key = keyWith({
			metadata: {
				resources: {
					global: ["read:links"],
					"website:site-1": ["manage:config", "read:data"],
				},
			},
			scopes: ["read:data"],
		});

		expect(collectScopes(key, "website:site-1").sort()).toEqual([
			"manage:config",
			"read:data",
			"read:links",
		]);
		expect(collectScopes(key).sort()).toEqual(["read:data", "read:links"]);
	});

	test("lists only website resource entries as accessible website ids", () => {
		const key = keyWith({
			metadata: {
				resources: {
					global: ["read:data"],
					"website:site-1": [],
					"website:site-2": ["read:data"],
				},
			},
		});

		expect(getAccessibleWebsiteIds(key).sort()).toEqual(["site-1", "site-2"]);
		expect(getAccessibleWebsiteIds(keyWith({}))).toEqual([]);
		expect(getAccessibleWebsiteIds(null)).toEqual([]);
	});

	test("grants global access only when global resource scopes exist", () => {
		expect(
			hasGlobalAccess(
				keyWith({ metadata: { resources: { global: ["read:data"] } } })
			)
		).toBe(true);
		expect(
			hasGlobalAccess(keyWith({ metadata: { resources: { global: [] } } }))
		).toBe(false);
		expect(hasGlobalAccess(keyWith({}))).toBe(false);
		expect(hasGlobalAccess(null)).toBe(false);
	});
});

describe("website-scoped API keys", () => {
	test("cannot use a resource entry to cross an organization boundary", () => {
		const key = {
			organizationId: "org-a",
			scopes: [],
			metadata: { resources: { "website:site-b": ["read:data"] } },
		} as unknown as ApiKeyRow;

		expect(
			hasWebsiteScopeForOrganization(
				key,
				{ id: "site-b", organizationId: "org-b" },
				"read:data"
			)
		).toBe(false);
	});

	test("accepts a resource entry for the key's own organization", () => {
		const key = {
			organizationId: "org-a",
			scopes: [],
			metadata: { resources: { "website:site-a": ["read:data"] } },
		} as unknown as ApiKeyRow;

		expect(
			hasWebsiteScopeForOrganization(
				key,
				{ id: "site-a", organizationId: "org-a" },
				"read:data"
			)
		).toBe(true);
	});

	test("preserves global scopes within the key's own organization", () => {
		const key = {
			organizationId: "org-a",
			scopes: ["read:data"],
			metadata: {},
		} as unknown as ApiKeyRow;

		expect(
			hasWebsiteScopeForOrganization(
				key,
				{ id: "site-a", organizationId: "org-a" },
				"read:data"
			)
		).toBe(true);
	});
});
