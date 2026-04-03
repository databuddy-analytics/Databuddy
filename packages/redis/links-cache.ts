import { getRedisCache } from "./redis";

const LINKS_CACHE_PREFIX = "link:slug";
const LINKS_CACHE_TTL = 604_800; // 7 days - long TTL with manual invalidation on update/delete

export interface CachedLink {
	androidUrl: string | null;
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

/**
 * Generates a consistent cache key for a link by slug
 */
export function getLinkCacheKey(slug: string): string {
	return `${LINKS_CACHE_PREFIX}:${slug}`;
}

/**
 * Get a link from cache by slug
 */
export async function getCachedLink(slug: string): Promise<CachedLink | null> {
	const redis = getRedisCache();
	const key = getLinkCacheKey(slug);

	const cached = await redis.get(key);
	if (!cached) {
		return null;
	}

	if (cached === "null") {
		return null;
	}

	try {
		return JSON.parse(cached) as CachedLink;
	} catch {
		return null;
	}
}

/**
 * Set a link in cache by slug
 */
export async function setCachedLink(
	slug: string,
	link: CachedLink
): Promise<void> {
	const redis = getRedisCache();
	const key = getLinkCacheKey(slug);
	await redis.setex(key, LINKS_CACHE_TTL, JSON.stringify(link));
}

/**
 * Set a negative cache entry for a slug that doesn't exist
 * Uses shorter TTL (60s) since new links invalidate the cache on creation anyway
 */
export async function setCachedLinkNotFound(slug: string): Promise<void> {
	const redis = getRedisCache();
	const key = getLinkCacheKey(slug);
	await redis.setex(key, 60, "null");
}

/**
 * Invalidate a link cache by slug
 */
export async function invalidateLinkCache(slug: string): Promise<void> {
	const redis = getRedisCache();
	const key = getLinkCacheKey(slug);
	await redis.del(key);
}

/**
 * Invalidate multiple link caches by slugs
 */
export async function invalidateLinkCaches(slugs: string[]): Promise<void> {
	if (slugs.length === 0) {
		return;
	}

	const redis = getRedisCache();
	const keys = slugs.map(getLinkCacheKey);
	await redis.del(...keys);
}
