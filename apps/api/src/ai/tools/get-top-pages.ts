import { tool } from "ai";
import { z } from "zod";
import { executeTimedQuery } from "./utils";

interface TopPageResult extends Record<string, unknown> {
	path: string;
	views: number;
	unique_visitors: number;
}

/**
 * Tool for getting the top pages by page views for a website.
 * Cached for 5 minutes to reduce database load for repeated queries.
 */
export const getTopPagesTool = tool({
	description:
		"Get the top pages by page views for a website. Returns the most visited pages with their view counts.",
	inputSchema: z.object({
		websiteId: z.string().describe("The website ID to query"),
		limit: z
			.number()
			.min(1)
			.max(50)
			.default(10)
			.describe("Number of top pages to return"),
		days: z
			.number()
			.min(1)
			.max(90)
			.default(7)
			.describe("Number of days to look back"),
	}),
	execute: async ({ websiteId, limit, days }) => {
		const sql = `
			SELECT 
				path,
				COUNT(*) AS views,
				uniq(anonymous_id) AS unique_visitors
			FROM analytics.events 
			WHERE 
				client_id = {websiteId:String}
				AND event_name = 'screen_view' 
				AND path != ''
				AND time >= today() - INTERVAL {days:UInt32} DAY
			GROUP BY path 
			ORDER BY views DESC 
			LIMIT {limit:UInt32}
		`;

		const result = await executeTimedQuery<TopPageResult>(
			"Get Top Pages Tool",
			sql,
			{ websiteId, days, limit },
			{ websiteId, limit, days }
		);

		if (result.rowCount === 0) {
			return {
				pages: [],
				summary: "No page views found for this time period.",
			};
		}

		const totalViews = result.data.reduce(
			(sum, page) => sum + Number(page.views),
			0
		);

		return {
			pages: result.data.map((page) => ({
				path: page.path,
				views: Number(page.views),
				uniqueVisitors: Number(page.unique_visitors),
				percentage: ((Number(page.views) / totalViews) * 100).toFixed(1),
			})),
			summary: `Found ${result.rowCount} pages with ${totalViews.toLocaleString()} total views in the last ${days} days.`,
			totalViews,
			period: `Last ${days} days`,
		};
	},
});
