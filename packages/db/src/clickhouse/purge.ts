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
	"analytics.webhook_deliveries": "received_at",
} as const;

// uptime_monitor.site_id is a website id or, for standalone monitors, an
// uptime_schedules id.
export const KEYED_PURGE_TABLES = {
	"analytics.link_visits": { key: "link_id", arrivedAt: "timestamp" },
	"uptime.uptime_monitor": { key: "site_id", arrivedAt: "timestamp" },
} as const;

export type KeyedPurgeTable = keyof typeof KEYED_PURGE_TABLES;

// Ids travel as a URL query parameter, which Cloudflare cuts off near 64 KB.
const PURGE_BATCH_SIZE = 500;
const PURGE_SCAN_TIMEOUT_MS = 20_000;

// Organization rows tied to a website stay with that website, which may have
// been transferred to another organization.
const ORG_LEVEL_ROW = "ifNull(website_id, '') = ''";

const ANALYTICS_PURGES = [
	...Object.keys(CLIENT_ID_PURGE_TABLES).map(
		(table) =>
			`ALTER TABLE ${table} DELETE WHERE client_id IN {ids:Array(String)}`
	),
	...Object.keys(WEBSITE_ID_PURGE_TABLES).map(
		(table) =>
			`ALTER TABLE ${table} DELETE WHERE website_id IN {ids:Array(String)} OR (owner_id IN {ids:Array(String)} AND ${ORG_LEVEL_ROW})`
	),
];

type OnBatchPurged = (ids: string[]) => Promise<void>;

async function purgeInBatches(
	statements: string[],
	ids: string[],
	onBatchPurged?: OnBatchPurged
): Promise<void> {
	for (let start = 0; start < ids.length; start += PURGE_BATCH_SIZE) {
		const batch = ids.slice(start, start + PURGE_BATCH_SIZE);
		for (const statement of statements) {
			await chCommand(statement, { ids: batch });
		}
		await onBatchPurged?.(batch);
	}
}

// Owner ids are websites, organizations, or legacy user ids.
export function purgeAnalyticsData(
	ownerIds: string[],
	onBatchPurged?: OnBatchPurged
): Promise<void> {
	return purgeInBatches(ANALYTICS_PURGES, ownerIds, onBatchPurged);
}

export function purgeKeyedRows(
	table: KeyedPurgeTable,
	ids: string[],
	onBatchPurged?: OnBatchPurged
): Promise<void> {
	return purgeInBatches(
		[
			`ALTER TABLE ${table} DELETE WHERE ${KEYED_PURGE_TABLES[table].key} IN {ids:Array(String)}`,
		],
		ids,
		onBatchPurged
	);
}

export interface StoredDataOwner {
	id: string;
	recent: number;
}

function ownerScan(
	table: string,
	key: string,
	arrivedAt: string,
	filter = "1"
): string {
	return `SELECT assumeNotNull(${key}) AS id, max(${arrivedAt} > now() - INTERVAL 1 DAY) AS recent FROM ${table} WHERE ${key} != '' AND ${filter} GROUP BY id`;
}

const OWNER_SCANS = [
	...Object.entries(CLIENT_ID_PURGE_TABLES).flatMap(([table, arrivedAt]) =>
		arrivedAt ? [ownerScan(table, "client_id", arrivedAt)] : []
	),
	...Object.entries(WEBSITE_ID_PURGE_TABLES).flatMap(([table, arrivedAt]) => [
		ownerScan(table, "website_id", arrivedAt),
		ownerScan(table, "owner_id", arrivedAt, ORG_LEVEL_ROW),
	]),
];

function listStored(query: string, label: string): Promise<StoredDataOwner[]> {
	return chQuery<StoredDataOwner>(query, undefined, {
		abort_signal: AbortSignal.timeout(PURGE_SCAN_TIMEOUT_MS),
		label,
		readonly: true,
	});
}

export function listOwnersWithStoredData(): Promise<StoredDataOwner[]> {
	return listStored(
		`SELECT id, max(recent) AS recent FROM (${OWNER_SCANS.join(" UNION ALL ")}) GROUP BY id`,
		"purge.owners_with_stored_data"
	);
}

export function listKeyedIdsWithStoredRows(
	table: KeyedPurgeTable
): Promise<StoredDataOwner[]> {
	const { key, arrivedAt } = KEYED_PURGE_TABLES[table];
	return listStored(
		ownerScan(table, key, arrivedAt),
		`purge.stored_ids.${table}`
	);
}
