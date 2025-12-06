import { createDrizzleCache, getRedisCache, redis } from "@databuddy/redis";
import { logger } from "@databuddy/shared/logger";

/**
 * Invalidates basic website caches (websites table and getById key)
 * @param websiteId - The ID of the website
 * @param websiteCache - The website cache instance
 */
export const invalidateBasicWebsiteCaches = async (
	websiteId: string,
	websiteCache: ReturnType<typeof createDrizzleCache>
): Promise<void> => {
	await Promise.all([
		websiteCache.invalidateByTables(["websites"]),
		websiteCache.invalidateByKey(`getById:${websiteId}`),
	]);
};

/**
 * Invalidates all caches related to a specific website
 * @param websiteId - The ID of the website
 * @param userId - The ID of the user performing the action
 */
export const invalidateWebsiteCaches = async (
	websiteId: string,
	userId: string
): Promise<void> => {
	try {
		const redisCache = getRedisCache();

		await Promise.all([
			// Website caches
			createDrizzleCache({ redis, namespace: "websites" }).invalidateByTables([
				"websites",
			]),
			createDrizzleCache({ redis, namespace: "websites" }).invalidateByKey(
				`getById:${websiteId}`
			),

			// Invalidate the cacheable function cache used by authorizeWebsiteAccess
			// The cacheable function creates keys with format: "cacheable:{prefix}:{args}"
			redisCache.del(`cacheable:website_by_id:${websiteId}`),

			createDrizzleCache({ redis, namespace: "auth" }).invalidateByKey(
				`auth:${userId}:${websiteId}`
			),

			// Funnel caches
			createDrizzleCache({
				redis,
				namespace: "funnels",
			}).invalidateByTables(["funnelDefinitions"]),
			createDrizzleCache({ redis, namespace: "funnels" }).invalidateByKey(
				`funnels:list:${websiteId}`
			),
			createDrizzleCache({ redis, namespace: "funnels" }).invalidateByKey(
				`funnels:listPublic:${websiteId}`
			),

			// Goals caches
			createDrizzleCache({ redis, namespace: "goals" }).invalidateByTables([
				"goals",
			]),
			createDrizzleCache({ redis, namespace: "goals" }).invalidateByKey(
				`goals:list:${websiteId}`
			),

			// Autocomplete caches
			createDrizzleCache({
				redis,
				namespace: "autocomplete",
			}).invalidateByTables(["websites"]),

			// Mini-charts caches
			createDrizzleCache({
				redis,
				namespace: "mini-charts",
			}).invalidateByTables(["websites"]),
			createDrizzleCache({
				redis,
				namespace: "mini-charts",
			}).invalidateByKey(`mini-charts:${userId}:${websiteId}`),
			createDrizzleCache({
				redis,
				namespace: "mini-charts",
			}).invalidateByKey(`mini-charts:public:${websiteId}`),
		]);
	} catch (error) {
		logger.error(
			{
				error,
				websiteId,
				userId,
			},
			"Failed to invalidate caches"
		);
		throw error;
	}
};
