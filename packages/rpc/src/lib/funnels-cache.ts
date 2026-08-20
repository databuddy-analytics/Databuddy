import {
	createDrizzleCache,
	invalidateAgentContextSnapshotsForWebsite,
	redis,
} from "@databuddy/redis";

export const funnelCache = createDrizzleCache({
	redis,
	namespace: "funnels",
});

/**
 * Invalidate the cached funnel definition and any agent context that contains
 * it. Keep this next to the goals cache helper so non-funnel routers can apply
 * a funnel definition change without importing the funnels router.
 */
export async function invalidateFunnelsCache(
	websiteId: string,
	funnelId?: string
): Promise<void> {
	const keys = [`list:${websiteId}`];
	if (funnelId) {
		keys.push(`byId:${funnelId}`);
	}

	const operations: Promise<unknown>[] = keys.map((key) =>
		funnelCache.invalidateByKey(key)
	);
	if (funnelId) {
		operations.push(funnelCache.invalidateByTags([`funnel:${funnelId}`]));
	}
	operations.push(invalidateAgentContextSnapshotsForWebsite(websiteId));

	await Promise.allSettled(operations);
}
