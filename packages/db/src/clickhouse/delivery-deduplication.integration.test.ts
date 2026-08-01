import { createClient } from "@clickhouse/client";
import { randomUUIDv7 } from "bun";
import { describe, expect, test } from "bun:test";
import { parseTable, readSql } from "./schema-parse";

const describeIntegration =
	process.env.CLICKHOUSE_INTEGRATION_TESTS === "true" ? describe : describe.skip;
const LOCAL_CLICKHOUSE_URL =
	process.env.CLICKHOUSE_URL ??
	"http://default:@localhost:8123/databuddy_analytics";

function assertLocalTestTarget(rawUrl: string): void {
	const url = new URL(rawUrl);
	const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (
		url.protocol !== "http:" ||
		!["localhost", "127.0.0.1", "::1"].includes(hostname)
	) {
		throw new Error(
			"Delivery deduplication integration tests only run against loopback ClickHouse."
		);
	}
}

interface DeliveryFixture {
	columns: string;
	file: string;
	identity: Readonly<Record<string, string>>;
	timeField: "date" | "time" | "timestamp";
}

const DELIVERY_FIXTURES: Record<string, DeliveryFixture> = {
	custom_events: {
		columns:
			"owner_id String, delivery_key String, timestamp DateTime64(3, 'UTC')",
		file: "analytics/core/custom_events.sql",
		identity: { delivery_key: "delivery:custom-1", owner_id: "owner-1" },
		timeField: "timestamp",
	},
	daily_pageviews: {
		columns: "client_id String, id String, date Date",
		file: "analytics/pageviews/daily_pageviews.sql",
		identity: { client_id: "site-1", id: "pageview-1" },
		timeField: "date",
	},
	error_spans: {
		columns:
			"client_id String, delivery_key String, timestamp DateTime64(3, 'UTC')",
		file: "analytics/errors/error_spans.sql",
		identity: { client_id: "site-1", delivery_key: "delivery:error-1" },
		timeField: "timestamp",
	},
	events: {
		columns: "client_id String, id String, time DateTime64(3, 'UTC')",
		file: "analytics/core/events.sql",
		identity: { client_id: "site-1", id: "event-1" },
		timeField: "time",
	},
	link_visits: {
		columns: "link_id String, id String, timestamp DateTime64(3, 'UTC')",
		file: "analytics/links/link_visits.sql",
		identity: { id: "visit-1", link_id: "link-1" },
		timeField: "timestamp",
	},
	outgoing_links: {
		columns: "client_id String, id String, timestamp DateTime64(3, 'UTC')",
		file: "analytics/links/outgoing_links.sql",
		identity: { client_id: "site-1", id: "outgoing-1" },
		timeField: "timestamp",
	},
	web_vitals_spans: {
		columns:
			"client_id String, delivery_key String, timestamp DateTime64(3, 'UTC')",
		file: "analytics/web-vitals/web_vitals_spans.sql",
		identity: { client_id: "site-1", delivery_key: "delivery:vital-1" },
		timeField: "timestamp",
	},
};

describeIntegration("delivery replacement identity against ClickHouse", () => {
	test(
		"collapses timestamp variants across partitions for every delivery table",
		{ timeout: 30_000 },
		async () => {
			assertLocalTestTarget(LOCAL_CLICKHOUSE_URL);
			const database = `delivery_dedup_${randomUUIDv7().replaceAll("-", "")}`;
			const client = createClient({ url: LOCAL_CLICKHOUSE_URL });
			let createdDatabase = false;

			try {
				await client.command({ query: `CREATE DATABASE ${database}` });
				createdDatabase = true;

				for (const [name, fixture] of Object.entries(DELIVERY_FIXTURES)) {
					const schema = parseTable(
						readSql(`${import.meta.dir}/schema/${fixture.file}`)
					);
					const table = `${database}.${name}`;
					await client.command({
						query: `CREATE TABLE ${table}
							(${fixture.columns}, ingested_at UInt64)
							ENGINE = ReplacingMergeTree(ingested_at)
							PARTITION BY ${schema.partitionBy}
							PRIMARY KEY ${schema.primaryKey}
							ORDER BY ${schema.orderBy}`,
					});
					await client.insert({
						format: "JSONEachRow",
						table,
						values: ["2026-01-01", "2026-02-01"].map((date, index) => ({
							...fixture.identity,
							[fixture.timeField]: `${date}${
								fixture.timeField === "date" ? "" : " 00:00:00.000"
							}`,
							ingested_at: index + 1,
						})),
					});

					const result = await client.query({
						format: "JSON",
						query: `SELECT
							(SELECT count() FROM ${table}) AS physical,
							(SELECT count() FROM ${table} FINAL) AS logical,
							(SELECT max(ingested_at) FROM ${table} FINAL) AS winning_version`,
					});
					const [counts] = (
						await result.json<{
							logical: string;
							physical: string;
							winning_version: string;
						}>()
					).data;

					expect(Number(counts?.physical)).toBe(2);
					expect(Number(counts?.logical)).toBe(1);
					expect(Number(counts?.winning_version)).toBe(2);
				}
			} finally {
				if (createdDatabase) {
					await client.command({
						query: `DROP DATABASE IF EXISTS ${database} SYNC`,
					});
				}
				await client.close();
			}
		}
	);
});
