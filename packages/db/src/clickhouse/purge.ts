import { chCommand, chQuery } from "./client";

// Each purged table maps to the column that says when a row arrived, which the
// owner scan uses to skip owners that are still receiving data. blocked_traffic
// is not scanned: basket keeps logging hits for deleted websites there, and its
// TTL expires them.
export const CLIENT_ID_PURGE_TABLES = {
	"analytics.events": "time",
	"analytics.error_spans": "timestamp",
	"analytics.web_vitals_spans": "timestamp",
	"analytics.engagement_spans": "timestamp",
	"analytics.outgoing_links": "timestamp",
	"analytics.blocked_traffic": null,
	"analytics.ai_traffic_spans": "timestamp",
	"analytics.daily_pageviews": "date",
	"analytics.identity_anon_pairs": "identity_time",
	"analytics.identity_session_pairs": "identity_time",
} as const;

export const WEBSITE_ID_PURGE_TABLES = {
	"analytics.custom_events": "timestamp",
	"analytics.mcp_spans": "timestamp",
	"analytics.webhook_deliveries": "received_at",
} as const;

// Owner ids are websites, organizations, or legacy user ids. Organization rows
// tied to a website stay with that website, which may have been transferred.
export async function purgeAnalyticsData(ownerIds: string[]): Promise<void> {
	if (ownerIds.length === 0) {
		return;
	}
	for (const table of Object.keys(CLIENT_ID_PURGE_TABLES)) {
		await chCommand(
			`ALTER TABLE ${table} DELETE WHERE client_id IN {ownerIds:Array(String)}`,
			{ ownerIds }
		);
	}
	for (const table of Object.keys(WEBSITE_ID_PURGE_TABLES)) {
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

function ownerScan(table: string, key: string, arrivedAt: string): string {
	return `SELECT assumeNotNull(${key}) AS id, max(${arrivedAt} > now() - INTERVAL 1 DAY) AS recent FROM ${table} WHERE ${key} != '' GROUP BY id`;
}

const OWNER_SCANS = [
	...Object.entries(CLIENT_ID_PURGE_TABLES).flatMap(([table, arrivedAt]) =>
		arrivedAt ? [ownerScan(table, "client_id", arrivedAt)] : []
	),
	...Object.entries(WEBSITE_ID_PURGE_TABLES).flatMap(([table, arrivedAt]) => [
		ownerScan(table, "website_id", arrivedAt),
		ownerScan(table, "owner_id", arrivedAt),
	]),
];

export function listOwnersWithStoredData(): Promise<StoredDataOwner[]> {
	return chQuery<StoredDataOwner>(
		`SELECT id, max(recent) AS recent FROM (${OWNER_SCANS.join(" UNION ALL ")}) GROUP BY id`,
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
