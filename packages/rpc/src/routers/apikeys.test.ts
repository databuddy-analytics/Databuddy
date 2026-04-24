import { describe, expect, it } from "bun:test";
import { API_SCOPES, type ApiScope } from "@databuddy/api-keys/scopes";
import {
	createKeys,
	hasAllScopes,
	hasAnyScope,
	hasScope,
	isExpired,
} from "keypal";

const keys = createKeys({ prefix: "dbdy_", length: 48 });

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

function mulberry32(seed: number) {
	let a = seed;
	return () => {
		a |= 0;
		a = (a + 0x6d_2b_79_f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
	};
}

function randomSubset<T>(rng: () => number, items: readonly T[]): T[] {
	return items.filter(() => rng() < 0.5);
}

function randomElement<T>(rng: () => number, items: readonly T[]): T {
	return items[Math.floor(rng() * items.length)] as T;
}

function powerSet<T>(items: readonly T[]): T[][] {
	const out: T[][] = [[]];
	for (const item of items) {
		const len = out.length;
		for (let i = 0; i < len; i++) {
			out.push([...(out[i] as T[]), item]);
		}
	}
	return out;
}

function pairs<T>(items: readonly T[]): Array<[T, T]> {
	const out: Array<[T, T]> = [];
	for (let i = 0; i < items.length; i++) {
		for (let j = 0; j < items.length; j++) {
			out.push([items[i] as T, items[j] as T]);
		}
	}
	return out;
}

const SEED = 0xd1_5e_a5_e;
const PROPERTY_ITERATIONS = 200;
const SCOPE_POWER_SET = powerSet(API_SCOPES);

describe("API_SCOPES registry", () => {
	it("is non-empty", () => {
		expect(API_SCOPES.length).toBeGreaterThan(0);
	});

	it("has no duplicates", () => {
		expect(new Set(API_SCOPES).size).toBe(API_SCOPES.length);
	});

	it("every scope is a non-empty string", () => {
		for (const s of API_SCOPES) {
			expect(typeof s).toBe("string");
			expect(s.length).toBeGreaterThan(0);
		}
	});

	it("every scope matches action:resource format", () => {
		for (const s of API_SCOPES) {
			expect(s).toMatch(/^[a-z]+:[a-z_]+$/);
		}
	});
});

describe("keypal hasScope — for every scope", () => {
	for (const scope of API_SCOPES) {
		it(`returns true when key has only '${scope}'`, () => {
			expect(hasScope([scope], scope)).toBe(true);
		});

		it(`returns false when key is missing '${scope}'`, () => {
			const without = API_SCOPES.filter((s) => s !== scope);
			expect(hasScope(without, scope)).toBe(false);
		});
	}

	it("returns false for any scope when key list is empty", () => {
		for (const s of API_SCOPES) {
			expect(hasScope([], s)).toBe(false);
		}
	});

	it("returns false for any scope when key list is undefined", () => {
		for (const s of API_SCOPES) {
			expect(hasScope(undefined, s)).toBe(false);
		}
	});
});

describe("keypal hasAnyScope — pairwise", () => {
	const sample = pairs(API_SCOPES);
	for (const [owned, required] of sample) {
		it(`owned=[${owned}] required=[${required}] → ${owned === required}`, () => {
			expect(hasAnyScope([owned], [required])).toBe(owned === required);
		});
	}

	it("is true when required ⊆ owned (property)", () => {
		const rng = mulberry32(SEED);
		for (let i = 0; i < PROPERTY_ITERATIONS; i++) {
			const owned = randomSubset(rng, API_SCOPES);
			if (owned.length === 0) {
				continue;
			}
			const required = [randomElement(rng, owned)];
			expect(hasAnyScope(owned, required)).toBe(true);
		}
	});

	it("is false when required ∩ owned = ∅ (property)", () => {
		const rng = mulberry32(SEED + 1);
		for (let i = 0; i < PROPERTY_ITERATIONS; i++) {
			const owned = randomSubset(rng, API_SCOPES);
			const required = API_SCOPES.filter((s) => !owned.includes(s));
			if (required.length === 0) {
				continue;
			}
			expect(hasAnyScope(owned, required)).toBe(false);
		}
	});

	it("returns false for empty required regardless of owned", () => {
		for (const subset of SCOPE_POWER_SET) {
			expect(hasAnyScope(subset, [])).toBe(false);
		}
	});
});

describe("keypal hasAllScopes — property invariants", () => {
	it("is true when required ⊆ owned (power set)", () => {
		for (const subset of SCOPE_POWER_SET) {
			expect(hasAllScopes(API_SCOPES as unknown as string[], subset)).toBe(
				true
			);
		}
	});

	it("is false when owned is missing any required scope", () => {
		const rng = mulberry32(SEED + 2);
		for (let i = 0; i < PROPERTY_ITERATIONS; i++) {
			const missing = randomElement(rng, API_SCOPES);
			const owned = API_SCOPES.filter((s) => s !== missing);
			const required = [...randomSubset(rng, owned), missing];
			expect(hasAllScopes(owned, required)).toBe(false);
		}
	});

	it("is permutation-invariant in required", () => {
		const rng = mulberry32(SEED + 3);
		for (let i = 0; i < PROPERTY_ITERATIONS; i++) {
			const owned = randomSubset(rng, API_SCOPES);
			const required = randomSubset(rng, owned);
			const shuffled = [...required].sort(() => rng() - 0.5);
			expect(hasAllScopes(owned, required)).toBe(
				hasAllScopes(owned, shuffled)
			);
		}
	});

	it("is true for empty required when owned is non-empty", () => {
		for (const subset of SCOPE_POWER_SET) {
			if (subset.length === 0) {
				continue;
			}
			expect(hasAllScopes(subset, [])).toBe(true);
		}
	});

	it("is false for empty required when owned is empty or undefined", () => {
		expect(hasAllScopes([], [])).toBe(false);
		expect(hasAllScopes(undefined, [])).toBe(false);
	});
});

describe("keypal isExpired", () => {
	it("returns false for null/undefined", () => {
		expect(isExpired(null)).toBe(false);
		expect(isExpired(undefined)).toBe(false);
	});

	it("returns true for any past timestamp", () => {
		const rng = mulberry32(SEED + 4);
		for (let i = 0; i < 50; i++) {
			const past = new Date(Date.now() - Math.floor(rng() * 1e9) - 1000);
			expect(isExpired(past.toISOString())).toBe(true);
		}
	});

	it("returns false for any future timestamp", () => {
		const rng = mulberry32(SEED + 5);
		for (let i = 0; i < 50; i++) {
			const future = new Date(Date.now() + Math.floor(rng() * 1e9) + 60_000);
			expect(isExpired(future.toISOString())).toBe(false);
		}
	});
});

describe("keys.create invariants (property)", () => {
	it("emits keys of length 53 with dbdy_ prefix", async () => {
		const rng = mulberry32(SEED + 6);
		for (let i = 0; i < 20; i++) {
			const scopes = randomSubset(rng, API_SCOPES);
			const { key, record } = await keys.create({
				ownerId: `owner-${i}`,
				name: `name-${i}`,
				scopes,
			});
			expect(key.length).toBe(53);
			expect(key.startsWith("dbdy_")).toBe(true);
			expect(record.keyHash).toBe(keys.hashKey(key));
			expect(record.metadata.scopes).toEqual(scopes);
		}
	});

	it("produces unique keys across many invocations", async () => {
		const seen = new Set<string>();
		for (let i = 0; i < 50; i++) {
			const { key } = await keys.create({ ownerId: "o", name: "n" });
			expect(seen.has(key)).toBe(false);
			seen.add(key);
		}
	});

	it("hashKey is deterministic and injective over random inputs", () => {
		const rng = mulberry32(SEED + 7);
		const hashes = new Map<string, string>();
		for (let i = 0; i < 100; i++) {
			const secret = `dbdy_${Math.floor(rng() * 1e12).toString(36)}`;
			const h = keys.hashKey(secret);
			expect(keys.hashKey(secret)).toBe(h);
			const prior = hashes.get(secret);
			if (prior) {
				expect(prior).toBe(h);
			}
			hashes.set(secret, h);
		}
		expect(new Set(hashes.values()).size).toBe(hashes.size);
	});
});

describe("getScopes (router helper) — property invariants", () => {
	it("always includes every base scope", () => {
		const rng = mulberry32(SEED + 8);
		for (let i = 0; i < PROPERTY_ITERATIONS; i++) {
			const base = randomSubset(rng, API_SCOPES);
			const globalScopes = randomSubset(rng, API_SCOPES);
			const scoped = getScopes(base, { resources: { global: globalScopes } });
			for (const s of base) {
				expect(scoped).toContain(s);
			}
		}
	});

	it("includes global resource scopes regardless of resource arg", () => {
		const rng = mulberry32(SEED + 9);
		for (let i = 0; i < PROPERTY_ITERATIONS; i++) {
			const base = randomSubset(rng, API_SCOPES);
			const globalScopes = randomSubset(rng, API_SCOPES);
			const resource = `website:site-${Math.floor(rng() * 100)}`;
			const scoped = getScopes(
				base,
				{ resources: { global: globalScopes } },
				resource
			);
			for (const s of globalScopes) {
				expect(scoped).toContain(s);
			}
		}
	});

	it("does NOT leak scopes from unrelated resources", () => {
		const rng = mulberry32(SEED + 10);
		for (let i = 0; i < PROPERTY_ITERATIONS; i++) {
			const base: ApiScope[] = [];
			const otherScopes = randomSubset(rng, API_SCOPES);
			if (otherScopes.length === 0) {
				continue;
			}
			const resources = {
				"website:site-A": otherScopes as string[],
			};
			const scoped = getScopes(base, { resources }, "website:site-B");
			for (const s of otherScopes) {
				expect(scoped).not.toContain(s);
			}
		}
	});

	it("unions base, global, and matched resource (no duplicates)", () => {
		const rng = mulberry32(SEED + 11);
		for (let i = 0; i < PROPERTY_ITERATIONS; i++) {
			const base = randomSubset(rng, API_SCOPES);
			const globalScopes = randomSubset(rng, API_SCOPES);
			const resScopes = randomSubset(rng, API_SCOPES);
			const scoped = getScopes(
				base,
				{
					resources: {
						global: globalScopes,
						"website:site-1": resScopes,
					},
				},
				"website:site-1"
			);
			const expected = new Set([...base, ...globalScopes, ...resScopes]);
			expect(new Set(scoped)).toEqual(expected);
			expect(scoped.length).toBe(expected.size);
		}
	});
});

describe("checkValidity priority (disabled > revoked > expired)", () => {
	const states = [
		{ enabled: false, revoked: false, expired: false, want: "disabled" },
		{ enabled: false, revoked: true, expired: false, want: "disabled" },
		{ enabled: false, revoked: false, expired: true, want: "disabled" },
		{ enabled: false, revoked: true, expired: true, want: "disabled" },
		{ enabled: true, revoked: true, expired: false, want: "revoked" },
		{ enabled: true, revoked: true, expired: true, want: "revoked" },
		{ enabled: true, revoked: false, expired: true, want: "expired" },
	];
	for (const s of states) {
		it(`enabled=${s.enabled} revoked=${s.revoked} expired=${s.expired} → ${s.want}`, () => {
			const result = checkValidity({
				enabled: s.enabled,
				revokedAt: s.revoked ? new Date() : null,
				expiresAt: s.expired
					? new Date(Date.now() - 1000).toISOString()
					: null,
			});
			expect(result.valid).toBe(false);
			expect(result.reason).toBe(s.want);
		});
	}

	it("valid when enabled, not revoked, not expired", () => {
		const result = checkValidity({
			enabled: true,
			revokedAt: null,
			expiresAt: new Date(Date.now() + 1e6).toISOString(),
		});
		expect(result.valid).toBe(true);
	});
});

describe("RESOURCE_TYPES registry", () => {
	it("has no duplicates", () => {
		expect(new Set(RESOURCE_TYPES).size).toBe(RESOURCE_TYPES.length);
	});

	it("contains 'global' exactly once", () => {
		expect(RESOURCE_TYPES.filter((r) => r === "global")).toHaveLength(1);
	});

	it("every type is snake_case", () => {
		for (const r of RESOURCE_TYPES) {
			expect(r).toMatch(/^[a-z][a-z_]*$/);
		}
	});
});

describe("access ↔ resources round-trip (property)", () => {
	it("resources → access → resources is identity for random inputs", () => {
		const rng = mulberry32(SEED + 12);
		for (let i = 0; i < PROPERTY_ITERATIONS; i++) {
			const resources: Record<string, string[]> = {};
			if (rng() < 0.5) {
				resources.global = randomSubset(rng, API_SCOPES);
			}
			const count = Math.floor(rng() * 5);
			for (let j = 0; j < count; j++) {
				const resType = randomElement(
					rng,
					RESOURCE_TYPES.filter((r) => r !== "global")
				);
				const id = `id-${j}-${Math.floor(rng() * 1000)}`;
				resources[`${resType}:${id}`] = randomSubset(rng, API_SCOPES);
			}
			const access = resourcesToAccess(resources);
			const back = accessToResources(
				access.map((a) => ({
					resourceType: a.resourceType,
					resourceId: a.resourceId ?? undefined,
					scopes: a.scopes,
				}))
			);
			expect(back).toEqual(resources);
		}
	});

	it("every access entry has a unique id", () => {
		const rng = mulberry32(SEED + 13);
		for (let i = 0; i < 50; i++) {
			const entries: Record<string, string[]> = {};
			const count = 1 + Math.floor(rng() * 8);
			for (let j = 0; j < count; j++) {
				entries[`website:site-${j}`] = randomSubset(rng, API_SCOPES);
			}
			const access = resourcesToAccess(entries);
			const ids = access.map((a) => a.id);
			expect(new Set(ids).size).toBe(ids.length);
		}
	});
});

describe("checkAccess simulation — end-to-end property", () => {
	const checkAccess = (
		keyScopes: string[],
		metadata: Metadata,
		validity: { valid: boolean; reason?: string },
		requestedScopes?: string[],
		resource?: string,
		mode: "any" | "all" = "any"
	) => {
		if (!validity.valid) {
			return { valid: false, reason: validity.reason, hasAccess: false };
		}
		const scopes = getScopes(keyScopes, metadata, resource);
		if (!requestedScopes?.length) {
			return { valid: true, hasAccess: true, scopes };
		}
		const checkFn = mode === "all" ? hasAllScopes : hasAnyScope;
		return { valid: true, hasAccess: checkFn(scopes, requestedScopes) };
	};

	it("denies invalid keys regardless of requested scopes", () => {
		const rng = mulberry32(SEED + 14);
		for (let i = 0; i < PROPERTY_ITERATIONS; i++) {
			const requested = randomSubset(rng, API_SCOPES);
			const result = checkAccess(
				API_SCOPES as unknown as string[],
				{ resources: { global: API_SCOPES as unknown as string[] } },
				{ valid: false, reason: "disabled" },
				requested
			);
			expect(result.valid).toBe(false);
			expect(result.hasAccess).toBe(false);
		}
	});

	it("'any' mode grants when at least one scope overlaps (property)", () => {
		const rng = mulberry32(SEED + 15);
		for (let i = 0; i < PROPERTY_ITERATIONS; i++) {
			const owned = randomSubset(rng, API_SCOPES);
			if (owned.length === 0) {
				continue;
			}
			const required = [
				randomElement(rng, owned),
				...randomSubset(rng, API_SCOPES),
			];
			const result = checkAccess(
				owned as string[],
				{},
				{ valid: true },
				required,
				undefined,
				"any"
			);
			expect(result.hasAccess).toBe(true);
		}
	});

	it("'all' mode denies when any required scope is missing (property)", () => {
		const rng = mulberry32(SEED + 16);
		for (let i = 0; i < PROPERTY_ITERATIONS; i++) {
			const missing = randomElement(rng, API_SCOPES);
			const owned = API_SCOPES.filter((s) => s !== missing);
			const required = [missing, ...randomSubset(rng, owned)];
			const result = checkAccess(
				owned as string[],
				{},
				{ valid: true },
				required,
				undefined,
				"all"
			);
			expect(result.hasAccess).toBe(false);
		}
	});

	it("resource-specific scope grants access only for matching resource", () => {
		const rng = mulberry32(SEED + 17);
		for (let i = 0; i < PROPERTY_ITERATIONS; i++) {
			const scope = randomElement(rng, API_SCOPES);
			const resId = `site-${Math.floor(rng() * 1000)}`;
			const otherId = `site-${Math.floor(rng() * 1000) + 10_000}`;
			const metadata: Metadata = {
				resources: { [`website:${resId}`]: [scope] },
			};
			const match = checkAccess(
				[],
				metadata,
				{ valid: true },
				[scope],
				`website:${resId}`,
				"all"
			);
			const miss = checkAccess(
				[],
				metadata,
				{ valid: true },
				[scope],
				`website:${otherId}`,
				"all"
			);
			expect(match.hasAccess).toBe(true);
			expect(miss.hasAccess).toBe(false);
		}
	});
});
