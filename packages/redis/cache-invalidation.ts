import { getRedisCache } from "./redis";

/**
 * Stringifies arguments in the same way as cacheable function
 * to generate consistent cache keys.
 */
function escapeRedisPattern(value: string): string {
	return value.replace(/[\\*?[\]]/g, "\\$&");
}

function stringify(obj: unknown): string {
	if (obj === null) {
		return "null";
	}
	if (obj === undefined) {
		return "undefined";
	}
	if (typeof obj === "boolean") {
		return obj ? "true" : "false";
	}
	if (typeof obj === "number" || typeof obj === "string") {
		return String(obj);
	}
	if (typeof obj === "function") {
		return obj.toString();
	}
	if (Array.isArray(obj)) {
		return `[${obj.map(stringify).join(",")}]`;
	}
	if (typeof obj === "object") {
		return Object.entries(obj)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([k, v]) => `${k}:${stringify(v)}`)
			.join(":");
	}
	return String(obj);
}

/**
 * Generates a cache key for a cacheable function with the given prefix and arguments.
 * This matches the format used by the cacheable wrapper.
 */
export function getCacheableKey(prefix: string, ...args: unknown[]): string {
	return `cacheable:${prefix}:${stringify(args)}`;
}

export function getCacheableTagIndexKey(prefix: string, tag: string): string {
	return `cacheable-index:${prefix}:${tag}`;
}

export const cacheNamespaces = {
	agentTelemetryWebsiteExists: "agent-telemetry:website-exists",
	apiKeyByHash: "api-key-by-hash",
	apiKeyOwnerId: "api_key_owner_id",
	billingOwner: "rpc:billing_owner",
	flag: "flag",
	flagsClient: "flags-client",
	flagsDefinitions: "flags-definitions",
	flagsUser: "flags-user",
	insightsNarrative: "insights-narrative",
	mcpInsights: "mcp:insights",
	memberRole: "rpc:member_role",
	organizationOwner: "rpc:org_owner",
	slackChannelBinding: "slack-channel-binding",
	slackIntegrationByTeam: "slack-integration-by-team",
	statusPage: "status-page",
	userPreferences: "user-prefs",
	websiteById: "website_by_id",
	websiteCache: "website-cache",
	websiteDomain: "website-domain",
	websiteDomainsBatch: "website-domains-batch",
	websiteWithOwner: "website_with_owner_v2",
} as const;

function cacheTag(scope: string, ...parts: string[]): string {
	return [scope, ...parts.map((part) => encodeURIComponent(part))].join(":");
}

export const cacheTags = {
	billingOwner: (ownerId: string) => cacheTag("billing-owner", ownerId),
	flagClient: (clientId: string) => cacheTag("flag-client", clientId),
	flagKey: (clientId: string, flagKey: string) =>
		cacheTag("flag-key", clientId, flagKey),
	flagUser: (clientId: string, userId: string) =>
		cacheTag("flag-user", clientId, userId),
	organization: (organizationId: string) =>
		cacheTag("organization", organizationId),
	website: (websiteId: string) => cacheTag("website", websiteId),
} as const;

export const AGENT_CONTEXT_SNAPSHOT_PREFIX = "agent:context-snapshot";
const AGENT_CONTEXT_SNAPSHOT_STALE_AT = new Date(0).toISOString();

const WEBSITE_READ_CACHE_PREFIXES = [
	cacheNamespaces.websiteById,
	cacheNamespaces.websiteWithOwner,
	cacheNamespaces.websiteCache,
	cacheNamespaces.websiteDomain,
	cacheNamespaces.agentTelemetryWebsiteExists,
] as const;

const USER_PREFERENCES_CACHE_PREFIX = cacheNamespaces.userPreferences;
const STATUS_PAGE_CACHE_PREFIX = cacheNamespaces.statusPage;
const SLACK_INTEGRATION_CACHE_PREFIX = cacheNamespaces.slackIntegrationByTeam;
const SLACK_CHANNEL_BINDING_CACHE_PREFIX = cacheNamespaces.slackChannelBinding;
// Keep in sync with CACHE_KEY_PREFIX in packages/rpc/src/routers/insights.ts.
const LEGACY_INSIGHTS_API_CACHE_PREFIX = "ai-insights";

export interface CacheInvalidationResult {
	attempted: number;
	failed: number;
}

async function settleInvalidations(
	tasks: Promise<unknown>[]
): Promise<CacheInvalidationResult> {
	const results = await Promise.allSettled(tasks);
	return {
		attempted: tasks.length,
		failed: results.filter((result) => result.status === "rejected").length,
	};
}

export type WebsiteReadCachePrefix =
	(typeof WEBSITE_READ_CACHE_PREFIXES)[number];

export function getAgentContextSnapshotKey(
	userId: string,
	websiteId: string,
	organizationId?: string | null
): string {
	const ownerId = organizationId ?? userId;
	return `${AGENT_CONTEXT_SNAPSHOT_PREFIX}:${ownerId}:${websiteId}`;
}

async function updateSnapshotIfCurrent(
	key: string,
	cached: string,
	next: string | null
): Promise<number> {
	const redis = getRedisCache();
	const result = (await redis.eval(
		`local current = redis.call("GET", KEYS[1])
if current == false then
	return 0
end
if current ~= ARGV[1] then
	return 0
end
if ARGV[2] == "" then
	redis.call("DEL", KEYS[1])
	return 1
end
local ttl = redis.call("TTL", KEYS[1])
if ttl > 0 then
	redis.call("SET", KEYS[1], ARGV[2], "EX", ttl)
else
	redis.call("SET", KEYS[1], ARGV[2])
end
return 1`,
		1,
		key,
		cached,
		next ?? ""
	)) as number;
	return result;
}

async function markAgentContextSnapshotStale(key: string): Promise<number> {
	const redis = getRedisCache();
	const cached = await redis.get(key);
	if (!cached) {
		return 0;
	}

	try {
		const parsed = JSON.parse(cached) as unknown;
		if (!(parsed && typeof parsed === "object")) {
			return updateSnapshotIfCurrent(key, cached, null);
		}
		const snapshot = parsed as Record<string, unknown>;
		if (typeof snapshot.context !== "string") {
			return updateSnapshotIfCurrent(key, cached, null);
		}
		const stale = JSON.stringify({
			...snapshot,
			refreshedAt: AGENT_CONTEXT_SNAPSHOT_STALE_AT,
		});
		return updateSnapshotIfCurrent(key, cached, stale);
	} catch {
		return updateSnapshotIfCurrent(key, cached, null);
	}
}

async function markAgentContextSnapshotsStale(
	pattern: string
): Promise<number> {
	const redis = getRedisCache();
	let markedCount = 0;
	let cursor = "0";
	do {
		const [nextCursor, keys] = (await redis.scan(
			cursor,
			"MATCH",
			pattern,
			"COUNT",
			100
		)) as [string, string[]];
		cursor = nextCursor;

		if (keys.length > 0) {
			const counts = await Promise.all(
				keys.map((key) => markAgentContextSnapshotStale(key))
			);
			markedCount += counts.reduce((sum, count) => sum + count, 0);
		}
	} while (cursor !== "0");
	return markedCount;
}

export async function invalidateAgentContextSnapshot(
	userId: string,
	websiteId: string,
	organizationId?: string | null
): Promise<void> {
	try {
		await markAgentContextSnapshotStale(
			getAgentContextSnapshotKey(userId, websiteId, organizationId)
		);
	} catch {
		// Agent context is advisory; cache invalidation should not fail mutations.
	}
}

export async function invalidateAgentContextSnapshotsForWebsite(
	websiteId: string
): Promise<number> {
	try {
		return await markAgentContextSnapshotsStale(
			`${AGENT_CONTEXT_SNAPSHOT_PREFIX}:*:${websiteId}`
		);
	} catch {
		return 0;
	}
}

export async function invalidateAgentContextSnapshotsForOwner(
	ownerId: string
): Promise<number> {
	try {
		return await markAgentContextSnapshotsStale(
			`${AGENT_CONTEXT_SNAPSHOT_PREFIX}:${ownerId}:*`
		);
	} catch {
		return 0;
	}
}

/**
 * Invalidates a specific cacheable cache entry by prefix and exact arguments.
 */
export async function invalidateCacheableKey(
	prefix: string,
	...args: unknown[]
): Promise<void> {
	const redis = getRedisCache();
	const key = getCacheableKey(prefix, ...args);
	await redis.del(key);
}

/**
 * Invalidates all cacheable cache entries matching a pattern.
 * Uses Redis SCAN to safely iterate through matching keys.
 *
 * @param pattern - Redis pattern (use * for wildcards, e.g., "cacheable:flag:*")
 * @returns Number of keys deleted
 */
export async function invalidateCacheablePattern(
	pattern: string
): Promise<number> {
	const redis = getRedisCache();
	let deletedCount = 0;

	// Use SCAN with MATCH to find keys
	let cursor = "0";
	do {
		// SCAN returns [cursor, keys[]] in ioredis
		const [nextCursor, keys] = (await redis.scan(
			cursor,
			"MATCH",
			pattern,
			"COUNT",
			100
		)) as [string, string[]];
		cursor = nextCursor;

		if (keys.length > 0) {
			await redis.del(...keys);
			deletedCount += keys.length;
		}
	} while (cursor !== "0");

	return deletedCount;
}

export async function invalidateCacheableTag(
	prefix: string,
	tag: string,
	options?: { fallbackPattern?: string }
): Promise<number> {
	const redis = getRedisCache();
	const indexKey = getCacheableTagIndexKey(prefix, tag);
	const keys = await redis.smembers(indexKey);
	let deletedCount = 0;

	if (keys.length > 0) {
		deletedCount += await redis.del(...keys);
	}
	await redis.del(indexKey);

	if (keys.length === 0 && options?.fallbackPattern) {
		deletedCount += await invalidateCacheablePattern(options.fallbackPattern);
	}

	return deletedCount;
}

export function invalidateCacheableTags(
	prefix: string,
	tags: string[],
	options?: { fallbackPattern?: (tag: string) => string | undefined }
): Promise<CacheInvalidationResult> {
	const uniqueTags = [...new Set(tags.filter(Boolean))];
	return settleInvalidations(
		uniqueTags.map((tag) =>
			invalidateCacheableTag(prefix, tag, {
				fallbackPattern: options?.fallbackPattern?.(tag),
			})
		)
	);
}

/**
 * Invalidates all variations of a cacheable cache entry.
 * Useful when you want to invalidate a cache entry but don't know all possible argument values.
 *
 * @param prefix - The cache prefix (e.g., "flag", "flags-client")
 * @param knownArgs - Known arguments to include in the pattern
 * @returns Number of keys deleted
 *
 * @example
 * // Invalidate all flag caches for a specific key and clientId, regardless of environment
 * await invalidateCacheableWithArgs("flag", ["my-flag-key", "client-123"]);
 */
export async function invalidateCacheableWithArgs(
	prefix: string,
	knownArgs: unknown[]
): Promise<number> {
	const redis = getRedisCache();
	let deletedCount = 0;

	// Exact match: cacheable:prefix:[arg1,arg2]
	const exactKey = `cacheable:${prefix}:${stringify(knownArgs)}`;

	// With undefined trailing arg: cacheable:prefix:[arg1,arg2,undefined]
	const undefinedTrailingKey = `cacheable:${prefix}:${stringify([
		...knownArgs,
		undefined,
	])}`;

	// With any trailing args: cacheable:prefix:[arg1,arg2,*]
	const serializedArgs = stringify(knownArgs);
	const wildcardPattern =
		knownArgs.length === 0
			? `${escapeRedisPattern(`cacheable:${prefix}:`)}*`
			: `${escapeRedisPattern(
					`cacheable:${prefix}:${serializedArgs.slice(0, -1)}`
				)},*\\]`;

	for (const key of [exactKey, undefinedTrailingKey]) {
		const result = await redis.del(key);
		deletedCount += result;
	}

	// Use SCAN for wildcard pattern
	let cursor = "0";
	do {
		const [nextCursor, keys] = (await redis.scan(
			cursor,
			"MATCH",
			wildcardPattern,
			"COUNT",
			100
		)) as [string, string[]];
		cursor = nextCursor;

		if (keys.length > 0) {
			await redis.del(...keys);
			deletedCount += keys.length;
		}
	} while (cursor !== "0");

	return deletedCount;
}

/**
 * Invalidates all cacheable cache entries with a specific prefix.
 *
 * @param prefix - The cache prefix (e.g., "flag", "flags-client")
 * @returns Number of keys deleted
 */
export function invalidateCacheablePrefix(prefix: string): Promise<number> {
	return invalidateCacheablePattern(`cacheable:${prefix}:*`);
}

/**
 * Invalidates read-model caches that can return stale website rows or website-derived values.
 */
export function invalidateWebsiteReadCaches(
	websiteId: string
): Promise<CacheInvalidationResult> {
	return settleInvalidations([
		...WEBSITE_READ_CACHE_PREFIXES.map((prefix) =>
			invalidateCacheableKey(prefix, websiteId)
		),
		invalidateCacheableTag(
			cacheNamespaces.websiteDomainsBatch,
			cacheTags.website(websiteId),
			{
				fallbackPattern: `cacheable:${cacheNamespaces.websiteDomainsBatch}:*${websiteId}*`,
			}
		),
	]);
}

export function invalidateUserPreferencesCache(userId: string): Promise<void> {
	return invalidateCacheableKey(USER_PREFERENCES_CACHE_PREFIX, userId);
}

export function invalidateStatusPageCache(slug: string): Promise<number> {
	return invalidateCacheableWithArgs(STATUS_PAGE_CACHE_PREFIX, [slug]);
}

export function invalidateSlackIntegrationCache(teamId: string): Promise<void> {
	return invalidateCacheableKey(SLACK_INTEGRATION_CACHE_PREFIX, teamId);
}

export function invalidateSlackChannelBindingCache(
	integrationId: string,
	channelId: string
): Promise<void> {
	return invalidateCacheableKey(
		SLACK_CHANNEL_BINDING_CACHE_PREFIX,
		integrationId,
		channelId
	);
}

async function invalidateTagWithArgsFallback(
	prefix: string,
	tag: string,
	knownArgs: unknown[]
): Promise<number> {
	const deleted = await invalidateCacheableTag(prefix, tag);
	return deleted > 0 ? deleted : invalidateCacheableWithArgs(prefix, knownArgs);
}

export function invalidateFlagReadCaches(input: {
	clientId: string;
	flagKey?: string;
	userId?: string | null;
}): Promise<CacheInvalidationResult> {
	const clientTag = cacheTags.flagClient(input.clientId);
	const tasks: Promise<unknown>[] = [
		invalidateTagWithArgsFallback(cacheNamespaces.flagsClient, clientTag, [
			input.clientId,
		]),
		invalidateTagWithArgsFallback(cacheNamespaces.flagsDefinitions, clientTag, [
			input.clientId,
		]),
	];

	if (input.flagKey) {
		tasks.push(
			invalidateTagWithArgsFallback(
				cacheNamespaces.flag,
				cacheTags.flagKey(input.clientId, input.flagKey),
				[input.flagKey, input.clientId]
			)
		);
	} else {
		tasks.push(
			invalidateCacheableTag(cacheNamespaces.flag, clientTag, {
				fallbackPattern: `cacheable:${cacheNamespaces.flag}:*${input.clientId}*`,
			})
		);
	}

	if (input.userId) {
		tasks.push(
			invalidateTagWithArgsFallback(
				cacheNamespaces.flagsUser,
				cacheTags.flagUser(input.clientId, input.userId),
				[input.userId, input.clientId]
			)
		);
	} else {
		tasks.push(
			invalidateCacheableTag(cacheNamespaces.flagsUser, clientTag, {
				fallbackPattern: `cacheable:${cacheNamespaces.flagsUser}:*${input.clientId}*`,
			})
		);
	}

	return settleInvalidations(tasks);
}

function invalidateBillingOwnerCache(ownerId: string): Promise<number> {
	return invalidateCacheableTag(
		cacheNamespaces.billingOwner,
		cacheTags.billingOwner(ownerId),
		{
			fallbackPattern: `cacheable:${cacheNamespaces.billingOwner}:*${ownerId}*`,
		}
	);
}

export function invalidateBillingOwnerCaches(
	ownerIds: string[]
): Promise<CacheInvalidationResult> {
	return settleInvalidations(
		[...new Set(ownerIds.filter(Boolean))].map(invalidateBillingOwnerCache)
	);
}

export function invalidateInsightsCachesForOrganization(
	organizationId: string
): Promise<CacheInvalidationResult> {
	const organizationTag = cacheTags.organization(organizationId);
	return settleInvalidations([
		invalidateCacheablePattern(
			`${LEGACY_INSIGHTS_API_CACHE_PREFIX}:${organizationId}:*`
		),
		invalidateCacheableTag(cacheNamespaces.insightsNarrative, organizationTag, {
			fallbackPattern: `cacheable:${cacheNamespaces.insightsNarrative}:*${organizationId}*`,
		}),
		invalidateCacheableTag(cacheNamespaces.mcpInsights, organizationTag, {
			fallbackPattern: `cacheable:${cacheNamespaces.mcpInsights}:*${organizationId}*`,
		}),
	]);
}

export function invalidateOrganizationMembershipCaches(input: {
	organizationId: string;
	userId: string;
}): Promise<CacheInvalidationResult> {
	return settleInvalidations([
		invalidateCacheableKey(
			cacheNamespaces.memberRole,
			input.userId,
			input.organizationId
		),
		invalidateCacheableKey(
			cacheNamespaces.organizationOwner,
			input.organizationId
		),
		invalidateCacheableKey(cacheNamespaces.apiKeyOwnerId, input.organizationId),
		...[...new Set([input.organizationId, input.userId])].map(
			invalidateBillingOwnerCache
		),
	]);
}
