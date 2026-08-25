import {
	createDrizzleCache,
	invalidateAgentContextSnapshotsForWebsite,
	redis,
} from "@databuddy/redis";

export const funnelCache = createDrizzleCache({
	redis,
	namespace: "funnels",
});
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
