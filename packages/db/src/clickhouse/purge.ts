import { chCommand, chQuery } from "./client";

export const CLIENT_ID_PURGE_TABLES = [
	"analytics.events",
	"analytics.error_spans",
	"analytics.web_vitals_spans",
	"analytics.engagement_spans",
	"analytics.outgoing_links",
	"analytics.blocked_traffic",
	"analytics.ai_traffic_spans",
	"analytics.daily_pageviews",
	"analytics.identity_anon_pairs",
	"analytics.identity_session_pairs",
] as const;

export const WEBSITE_ID_PURGE_TABLES = [
	"analytics.custom_events",
	"analytics.webhook_deliveries",
] as const;

// Owner ids are websites, organizations, or legacy user ids. Organization rows
// tied to a website stay with that website, which may have been transferred.
export async function purgeAnalyticsData(ownerIds: string[]): Promise<void> {
	if (ownerIds.length === 0) {
		return;
	}
	for (const table of CLIENT_ID_PURGE_TABLES) {
		await chCommand(
			`ALTER TABLE ${table} DELETE WHERE client_id IN {ownerIds:Array(String)}`,
			{ ownerIds }
		);
	}
	for (const table of WEBSITE_ID_PURGE_TABLES) {
		await chCommand(
			`ALTER TABLE ${table} DELETE WHERE website_id IN {ownerIds:Array(String)} OR (owner_id IN {ownerIds:Array(String)} AND ifNull(website_id, '') = '')`,
			{ ownerIds }
		);
	}
}

export async function purgeLinkVisits(linkIds: string[]): Promise<void> {
	if (linkIds.length === 0) {
		return;
	}
	await chCommand(
		"ALTER TABLE analytics.link_visits DELETE WHERE link_id IN {linkIds:Array(String)}",
		{ linkIds }
	);
}

export interface StoredDataOwner {
	id: string;
	recent: number;
}

const PURGE_SCAN_TIMEOUT_MS = 20_000;

// blocked_traffic is left out: basket keeps logging hits for deleted
// websites there, and its TTL expires them.
export function listOwnersWithStoredData(): Promise<StoredDataOwner[]> {
	return chQuery<StoredDataOwner>(
		`SELECT id, max(last_seen) > now() - INTERVAL 1 DAY AS recent
		 FROM (
			SELECT client_id AS id, max(time) AS last_seen FROM analytics.events GROUP BY id
			UNION ALL SELECT assumeNotNull(website_id), max(timestamp) FROM analytics.custom_events WHERE website_id IS NOT NULL GROUP BY website_id
			UNION ALL SELECT owner_id, max(timestamp) FROM analytics.custom_events GROUP BY owner_id
			UNION ALL SELECT client_id, max(timestamp) FROM analytics.error_spans GROUP BY client_id
			UNION ALL SELECT client_id, max(timestamp) FROM analytics.web_vitals_spans GROUP BY client_id
			UNION ALL SELECT client_id, max(timestamp) FROM analytics.engagement_spans GROUP BY client_id
			UNION ALL SELECT client_id, max(timestamp) FROM analytics.outgoing_links GROUP BY client_id
			UNION ALL SELECT client_id, max(timestamp) FROM analytics.ai_traffic_spans GROUP BY client_id
			UNION ALL SELECT client_id, max(toDateTime64(date, 3)) FROM analytics.daily_pageviews GROUP BY client_id
			UNION ALL SELECT client_id, max(identity_time) FROM analytics.identity_anon_pairs GROUP BY client_id
			UNION ALL SELECT client_id, max(identity_time) FROM analytics.identity_session_pairs GROUP BY client_id
			UNION ALL SELECT assumeNotNull(website_id), max(toDateTime64(received_at, 3)) FROM analytics.webhook_deliveries WHERE website_id IS NOT NULL GROUP BY website_id
			UNION ALL SELECT owner_id, max(toDateTime64(received_at, 3)) FROM analytics.webhook_deliveries GROUP BY owner_id
		 )
		 GROUP BY id`,
		undefined,
		{
			abort_signal: AbortSignal.timeout(PURGE_SCAN_TIMEOUT_MS),
			label: "purge.owners_with_stored_data",
			readonly: true,
		}
	);
}

export function listLinksWithStoredVisits(): Promise<StoredDataOwner[]> {
	return chQuery<StoredDataOwner>(
		`SELECT link_id AS id, max(timestamp) > now() - INTERVAL 1 DAY AS recent
		 FROM analytics.link_visits
		 GROUP BY link_id`,
		undefined,
		{
			abort_signal: AbortSignal.timeout(PURGE_SCAN_TIMEOUT_MS),
			label: "purge.links_with_stored_visits",
			readonly: true,
		}
	);
}
