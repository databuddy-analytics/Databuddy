import { chCommand } from "./client";

export const CLIENT_ID_PURGE_TABLES = [
	"analytics.events",
	"analytics.error_spans",
	"analytics.web_vitals_spans",
	"analytics.outgoing_links",
	"analytics.blocked_traffic",
	"analytics.ai_traffic_spans",
	"analytics.daily_pageviews",
] as const;

export const WEBSITE_ID_PURGE_TABLES = ["analytics.custom_events"] as const;

export async function purgeWebsiteAnalyticsData(
	websiteId: string
): Promise<void> {
	for (const table of CLIENT_ID_PURGE_TABLES) {
		await chCommand(
			`ALTER TABLE ${table} DELETE WHERE client_id = {websiteId:String}`,
			{ websiteId }
		);
	}
	for (const table of WEBSITE_ID_PURGE_TABLES) {
		await chCommand(
			`ALTER TABLE ${table} DELETE WHERE website_id = {websiteId:String}`,
			{ websiteId }
		);
	}
}
