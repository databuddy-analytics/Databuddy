import { randomUUID } from "node:crypto";
import { getRedisCache } from "./redis";

const LINKS_CACHE_PREFIX = "link:slug";
const LINKS_CACHE_TTL = 604_800;
const LINKS_NEGATIVE_CACHE_TTL = 60;
const LINKS_MUTATION_LEASE_TTL = 30;

const BEGIN_CACHED_LINK_MUTATION_SCRIPT = `
-- begin-cached-link-mutation
local current = redis.call("GET", KEYS[1])
local id = ARGV[1]
local token = ARGV[2]
local mode = ARGV[3]
local lease_ttl = tonumber(ARGV[4])

if current ~= false and current ~= "null" then
	local ok, decoded = pcall(cjson.decode, current)
	if not ok or type(decoded) ~= "table" then
		return "conflict"
	end

	if decoded.state == "pending" then
		return "busy"
	end

	if decoded.state == "tombstone" then
		if mode == "existing" and decoded.id ~= id then
			return "conflict"
		end
	elseif type(decoded.id) ~= "string" or type(decoded.targetUrl) ~= "string" then
		return "conflict"
	elseif mode == "new" or decoded.id ~= id then
		return "conflict"
	end
end

redis.call(
	"SET",
	KEYS[1],
	cjson.encode({ state = "pending", id = id, token = token }),
	"EX",
	lease_ttl
)
return "acquired"
`;

const FINISH_CACHED_LINK_MUTATION_SCRIPT = `
-- finish-cached-link-mutation
local current = redis.call("GET", KEYS[1])
if current == false then
	return 0
end

local current_ok, pending = pcall(cjson.decode, current)
if not current_ok or type(pending) ~= "table" then
	return 0
end
if pending.state ~= "pending" or pending.token ~= ARGV[1] then
	return 0
end
if type(pending.id) ~= "string" then
	return 0
end

local next_ok, next = pcall(cjson.decode, ARGV[2])
if not next_ok or type(next) ~= "table" or next.id ~= pending.id then
	return 0
end
if next.state == "tombstone" then
	if type(next.id) ~= "string" then
		return 0
	end
elseif type(next.targetUrl) ~= "string" then
	return 0
end

redis.call("SET", KEYS[1], ARGV[2], "EX", tonumber(ARGV[3]))
return 1
`;

const ABANDON_CACHED_LINK_MUTATION_SCRIPT = `
-- abandon-cached-link-mutation
local current = redis.call("GET", KEYS[1])
if current == false then
	return 0
end

local ok, pending = pcall(cjson.decode, current)
if not ok or type(pending) ~= "table" then
	return 0
end
if pending.state ~= "pending" or pending.token ~= ARGV[1] then
	return 0
end

return redis.call("DEL", KEYS[1])
`;

const DELETE_CACHED_LINK_IF_CURRENT_SCRIPT = `
-- delete-cached-link-if-current
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
	return 0
end
return redis.call("DEL", KEYS[1])
`;

export interface CachedLink {
	androidUrl: string | null;
	deepLinkApp: string | null;
	expiredRedirectUrl: string | null;
	expiresAt: string | null;
	id: string;
	iosUrl: string | null;
	ogDescription: string | null;
	ogImageUrl: string | null;
	ogTitle: string | null;
	ogVideoUrl: string | null;
	targetUrl: string;
}

interface CachedLinkPending {
	id: string;
	state: "pending";
	token: string;
}

interface CachedLinkTombstone {
	id: string;
	state: "tombstone";
}

export type CachedLinkLookup =
	| { state: "hit"; link: CachedLink }
	| { state: "miss" }
	| { state: "not_found" }
	| { state: "pending" };

export type CachedLinkMutationStart =
	| { state: "acquired"; token: string }
	| { state: "busy" }
	| { state: "conflict" };

export type CachedLinkMutationNext =
	| { state: "link"; link: CachedLink }
	| { id: string; state: "tombstone" };

function isCachedLink(value: unknown): value is CachedLink {
	if (!value || typeof value !== "object") {
		return false;
	}

	const link = value as Record<string, unknown>;
	return (
		typeof link.id === "string" &&
		typeof link.targetUrl === "string" &&
		[
			"androidUrl",
			"deepLinkApp",
			"expiredRedirectUrl",
			"expiresAt",
			"iosUrl",
		].every((key) => link[key] === null || typeof link[key] === "string") &&
		["ogDescription", "ogImageUrl", "ogTitle", "ogVideoUrl"].every(
			(key) => link[key] === null || typeof link[key] === "string"
		)
	);
}

function isCachedLinkPending(value: unknown): value is CachedLinkPending {
	if (!value || typeof value !== "object") {
		return false;
	}

	const marker = value as Record<string, unknown>;
	return (
		marker.state === "pending" &&
		typeof marker.id === "string" &&
		typeof marker.token === "string"
	);
}

function isCachedLinkTombstone(value: unknown): value is CachedLinkTombstone {
	if (!value || typeof value !== "object") {
		return false;
	}

	const marker = value as Record<string, unknown>;
	return marker.state === "tombstone" && typeof marker.id === "string";
}

function serializeMutationNext(next: CachedLinkMutationNext): string {
	return JSON.stringify(
		next.state === "link" ? next.link : { id: next.id, state: "tombstone" }
	);
}

async function evictInvalidCachedLinkIfCurrent(
	key: string,
	cached: string
): Promise<void> {
	try {
		await getRedisCache().eval(
			DELETE_CACHED_LINK_IF_CURRENT_SCRIPT,
			1,
			key,
			cached
		);
	} catch {
		// A corrupt cache value is still a miss when best-effort eviction fails.
	}
}

/**
 * Generates a consistent cache key for a link by slug.
 */
export function getLinkCacheKey(slug: string): string {
	return `${LINKS_CACHE_PREFIX}:${slug}`;
}

/**
 * Get a link from cache by slug. Pending mutations deliberately do not fall
 * through to a read-through database lookup.
 */
export async function getCachedLink(slug: string): Promise<CachedLinkLookup> {
	const redis = getRedisCache();
	const key = getLinkCacheKey(slug);

	const cached = await redis.get(key);
	if (!cached) {
		return { state: "miss" };
	}

	if (cached === "null") {
		return { state: "not_found" };
	}

	let value: unknown;
	try {
		value = JSON.parse(cached);
	} catch {
		await evictInvalidCachedLinkIfCurrent(key, cached);
		return { state: "miss" };
	}

	if (isCachedLinkPending(value)) {
		return { state: "pending" };
	}
	if (isCachedLinkTombstone(value)) {
		return { state: "not_found" };
	}
	if (isCachedLink(value)) {
		return { state: "hit", link: value };
	}

	await evictInvalidCachedLinkIfCurrent(key, cached);
	return { state: "miss" };
}

/**
 * Start an id-aware cache mutation lease. A lease replaces the prior value so
 * readers return `pending` instead of querying the database mid-mutation.
 */
export async function beginCachedLinkMutation(
	slug: string,
	mutation: { id: string; mode: "existing" | "new" }
): Promise<CachedLinkMutationStart> {
	const redis = getRedisCache();
	const token = randomUUID();
	const result = (await redis.eval(
		BEGIN_CACHED_LINK_MUTATION_SCRIPT,
		1,
		getLinkCacheKey(slug),
		mutation.id,
		token,
		mutation.mode,
		String(LINKS_MUTATION_LEASE_TTL)
	)) as string;

	if (result === "acquired") {
		return { state: "acquired", token };
	}
	if (result === "busy") {
		return { state: "busy" };
	}
	return { state: "conflict" };
}

/**
 * Finish a mutation only while this caller still owns its pending marker.
 */
export async function finishCachedLinkMutation(
	slug: string,
	token: string,
	next: CachedLinkMutationNext
): Promise<boolean> {
	const redis = getRedisCache();
	const result = (await redis.eval(
		FINISH_CACHED_LINK_MUTATION_SCRIPT,
		1,
		getLinkCacheKey(slug),
		token,
		serializeMutationNext(next),
		String(LINKS_CACHE_TTL)
	)) as number;
	return result === 1;
}

/**
 * Clear a matching pending marker only when the database change certainly did
 * not persist. This intentionally never restores a possibly stale live value.
 */
export async function abandonCachedLinkMutation(
	slug: string,
	token: string
): Promise<boolean> {
	const redis = getRedisCache();
	const result = (await redis.eval(
		ABANDON_CACHED_LINK_MUTATION_SCRIPT,
		1,
		getLinkCacheKey(slug),
		token
	)) as number;
	return result === 1;
}

/**
 * Backfill a cache miss without overwriting a newer mutation or tombstone.
 */
export async function setCachedLinkIfAbsent(
	slug: string,
	link: CachedLink
): Promise<boolean> {
	const redis = getRedisCache();
	const result = await redis.set(
		getLinkCacheKey(slug),
		JSON.stringify(link),
		"EX",
		LINKS_CACHE_TTL,
		"NX"
	);
	return result === "OK";
}

/**
 * Backfill a negative cache miss without replacing a concurrent mutation.
 */
export async function setCachedLinkNotFoundIfAbsent(
	slug: string
): Promise<boolean> {
	const redis = getRedisCache();
	const result = await redis.set(
		getLinkCacheKey(slug),
		"null",
		"EX",
		LINKS_NEGATIVE_CACHE_TTL,
		"NX"
	);
	return result === "OK";
}
