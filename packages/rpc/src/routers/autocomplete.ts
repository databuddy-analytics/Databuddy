import { chQuery } from "@databuddy/db/clickhouse";
import { createDrizzleCache, redis } from "@databuddy/redis";
import { z } from "zod";
import { rpcError } from "../errors";
import { logger } from "../lib/logger";
import { publicProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";
import { getCacheAuthContext } from "../utils/cache-keys";

const drizzleCache = createDrizzleCache({ redis, namespace: "autocomplete" });

const CACHE_TTL = 1800;

const getDefaultDateRange = () => {
	const endDate = new Date().toISOString().split("T")[0];
	const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
		.toISOString()
		.split("T")[0];
	return { startDate, endDate };
};

const getAutocompleteQuery = () => `
	SELECT 'customEvents' as category, event_name as value
	FROM analytics.custom_events
	WHERE website_id = {websiteId:String}
		AND timestamp >= parseDateTimeBestEffort({startDate:String})
		AND timestamp <= parseDateTimeBestEffort({endDate:String})
		AND event_name != ''
	GROUP BY event_name
	UNION ALL
	SELECT 'pagePaths' as category, 
		decodeURLComponent(CASE 
			WHEN path LIKE 'http%' THEN 
				CASE WHEN trimRight(splitByChar('?', substring(path, position(path, '/', 9)))[1], '/') = '' THEN '/' ELSE trimRight(splitByChar('?', substring(path, position(path, '/', 9)))[1], '/') END
			ELSE 
				CASE WHEN trimRight(splitByChar('?', path)[1], '/') = '' THEN '/' ELSE trimRight(splitByChar('?', path)[1], '/') END
		END) as value
	FROM analytics.events
	WHERE client_id = {websiteId:String}
		AND time >= parseDateTimeBestEffort({startDate:String})
		AND time <= parseDateTimeBestEffort({endDate:String})
		AND event_name = 'screen_view'
		AND path != ''
	GROUP BY value
	HAVING value != '' AND value != '/'
	UNION ALL
	SELECT 'browsers' as category, browser_name as value
	FROM analytics.events
	WHERE client_id = {websiteId:String}
		AND time >= parseDateTimeBestEffort({startDate:String})
		AND time <= parseDateTimeBestEffort({endDate:String})
		AND browser_name IS NOT NULL AND browser_name != '' AND browser_name != 'Unknown'
	GROUP BY browser_name
	UNION ALL
	SELECT 'operatingSystems' as category, os_name as value
	FROM analytics.events
	WHERE client_id = {websiteId:String}
		AND time >= parseDateTimeBestEffort({startDate:String})
		AND time <= parseDateTimeBestEffort({endDate:String})
		AND os_name IS NOT NULL AND os_name != '' AND os_name != 'Unknown'
	GROUP BY os_name
	UNION ALL
	SELECT 'countries' as category, country as value
	FROM analytics.events
	WHERE client_id = {websiteId:String}
		AND time >= parseDateTimeBestEffort({startDate:String})
		AND time <= parseDateTimeBestEffort({endDate:String})
		AND country IS NOT NULL AND country != ''
	GROUP BY country
	UNION ALL
	SELECT 'deviceTypes' as category, device_type as value
	FROM analytics.events
	WHERE client_id = {websiteId:String}
		AND time >= parseDateTimeBestEffort({startDate:String})
		AND time <= parseDateTimeBestEffort({endDate:String})
		AND device_type IS NOT NULL AND device_type != ''
	GROUP BY device_type
	UNION ALL
	SELECT 'utmSources' as category, utm_source as value
	FROM analytics.events
	WHERE client_id = {websiteId:String}
		AND time >= parseDateTimeBestEffort({startDate:String})
		AND time <= parseDateTimeBestEffort({endDate:String})
		AND utm_source IS NOT NULL AND utm_source != ''
	GROUP BY utm_source
	UNION ALL
	SELECT 'utmMediums' as category, utm_medium as value
	FROM analytics.events
	WHERE client_id = {websiteId:String}
		AND time >= parseDateTimeBestEffort({startDate:String})
		AND time <= parseDateTimeBestEffort({endDate:String})
		AND utm_medium IS NOT NULL AND utm_medium != ''
	GROUP BY utm_medium
	UNION ALL
	SELECT 'utmCampaigns' as category, utm_campaign as value
	FROM analytics.events
	WHERE client_id = {websiteId:String}
		AND time >= parseDateTimeBestEffort({startDate:String})
		AND time <= parseDateTimeBestEffort({endDate:String})
		AND utm_campaign IS NOT NULL AND utm_campaign != ''
	GROUP BY utm_campaign
`;

const categorizeAutocompleteResults = (
	results: Array<{ category: string; value: string }>
) => ({
	customEvents: results
		.filter((r) => r.category === "customEvents")
		.map((r) => r.value),
	pagePaths: results
		.filter((r) => r.category === "pagePaths")
		.map((r) => r.value),
	browsers: results
		.filter((r) => r.category === "browsers")
		.map((r) => r.value),
	operatingSystems: results
		.filter((r) => r.category === "operatingSystems")
		.map((r) => r.value),
	countries: results
		.filter((r) => r.category === "countries")
		.map((r) => r.value),
	deviceTypes: results
		.filter((r) => r.category === "deviceTypes")
		.map((r) => r.value),
	utmSources: results
		.filter((r) => r.category === "utmSources")
		.map((r) => r.value),
	utmMediums: results
		.filter((r) => r.category === "utmMediums")
		.map((r) => r.value),
	utmCampaigns: results
		.filter((r) => r.category === "utmCampaigns")
		.map((r) => r.value),
});

const autocompleteOutputSchema = z.object({
	customEvents: z.array(z.string()),
	pagePaths: z.array(z.string()),
	browsers: z.array(z.string()),
	operatingSystems: z.array(z.string()),
	countries: z.array(z.string()),
	deviceTypes: z.array(z.string()),
	utmSources: z.array(z.string()),
	utmMediums: z.array(z.string()),
	utmCampaigns: z.array(z.string()),
});

export const autocompleteRouter = {
	get: publicProcedure
		.route({
			description: "Returns autocomplete suggestions for analytics filters.",
			method: "POST",
			path: "/autocomplete/get",
			summary: "Get autocomplete",
			tags: ["Autocomplete"],
		})
		.input(
			z.object({
				websiteId: z.string(),
				startDate: z.string().optional(),
				endDate: z.string().optional(),
			})
		)
		.output(autocompleteOutputSchema)
		.handler(async ({ context, input }) => {
			const { startDate, endDate } =
				input.startDate && input.endDate
					? { startDate: input.startDate, endDate: input.endDate }
					: getDefaultDateRange();

			const authContext = await getCacheAuthContext(context, {
				websiteId: input.websiteId,
			});

			return drizzleCache.withCache({
				key: `autocomplete:${input.websiteId}:${startDate}:${endDate}:${authContext}`,
				ttl: CACHE_TTL,
				tables: ["websites"],
				queryFn: async () => {
					await withWorkspace(context, {
						websiteId: input.websiteId,
						permissions: ["read"],
						allowPublicAccess: true,
					});
					const params = { websiteId: input.websiteId, startDate, endDate };

					try {
						const results = await chQuery<{
							category: string;
							value: string;
						}>(getAutocompleteQuery(), params);

						return categorizeAutocompleteResults(results);
					} catch (error) {
						logger.error(
							`Failed to fetch autocomplete data for website ${input.websiteId}: ${error instanceof Error ? error.message : String(error)}`
						);
						throw rpcError.internal(
							`Failed to fetch autocomplete data for website ${input.websiteId}: ${error instanceof Error ? error.message : String(error)}`
						);
					}
				},
			});
		}),
};
