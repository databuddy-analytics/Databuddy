import { db } from "@databuddy/db";
import { cacheNamespaces, cacheTags, cacheable } from "@databuddy/redis";

const getCachedWebsite = cacheable(
	async (websiteId: string) =>
		(await db.query.websites.findFirst({ where: { id: websiteId } })) ?? null,
	{
		expireInSec: 300,
		prefix: cacheNamespaces.websiteCache,
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);

function getWebsiteDomain(websiteId: string): Promise<string | null> {
	return getCachedWebsite(websiteId).then(
		(website) => website?.domain || null,
		() => null
	);
}

const getCachedWebsiteDomain = cacheable(
	async (websiteIds: string[]): Promise<Record<string, string | null>> => {
		if (websiteIds.length === 0) {
			return {};
		}

		try {
			const websitesList = await db.query.websites.findMany({
				where: { id: { in: websiteIds } },
				columns: { id: true, domain: true },
			});

			const results: Record<string, string | null> = {};
			for (const id of websiteIds) {
				results[id] = null;
			}
			for (const website of websitesList) {
				results[website.id] = website.domain;
			}

			return results;
		} catch {
			return Object.fromEntries(websiteIds.map((id) => [id, null]));
		}
	},
	{
		expireInSec: 300,
		prefix: cacheNamespaces.websiteDomainsBatch,
		staleWhileRevalidate: true,
		staleTime: 60,
		tags: (_result, websiteIds) => websiteIds.map(cacheTags.website),
	}
);

export { getCachedWebsite, getCachedWebsiteDomain, getWebsiteDomain };
