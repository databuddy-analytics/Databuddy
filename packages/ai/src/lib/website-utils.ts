import { db } from "@databuddy/db";
import { cacheNamespaces, cacheable } from "@databuddy/redis";

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

export { getCachedWebsite, getWebsiteDomain };
