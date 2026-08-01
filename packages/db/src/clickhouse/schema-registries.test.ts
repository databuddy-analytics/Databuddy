import { describe, expect, it } from "bun:test";
import { TABLE_NAMES } from "./client";
import { PROFILE_ID_TABLES } from "./identity";
import { parseTable, readSql } from "./schema-parse";
import { TABLE_COLUMNS } from "./schema/tables.generated";
import {
	AGENT_TABLE_COLUMNS,
	AGENT_TENANT_COLUMN_BY_TABLE,
} from "./sql-validation";

const KNOWN_TABLES = new Set(Object.keys(TABLE_COLUMNS));
const columnsOf = (table: string): ReadonlySet<string> =>
	new Set(TABLE_COLUMNS[table as keyof typeof TABLE_COLUMNS] ?? []);

const DELIVERY_TABLE_FILES = {
	"analytics.custom_events": "analytics/core/custom_events.sql",
	"analytics.error_spans": "analytics/errors/error_spans.sql",
	"analytics.events": "analytics/core/events.sql",
	"analytics.link_visits": "analytics/links/link_visits.sql",
	"analytics.outgoing_links": "analytics/links/outgoing_links.sql",
	"analytics.web_vitals_spans":
		"analytics/web-vitals/web_vitals_spans.sql",
} as const;

describe("hand-maintained registries stay in sync with the generated DDL columns", () => {
	it("TABLE_NAMES values are all real tables", () => {
		for (const qualified of Object.values(TABLE_NAMES)) {
			expect(KNOWN_TABLES).toContain(qualified);
		}
	});

	it("AGENT_TENANT_COLUMN_BY_TABLE points at real tables and columns", () => {
		for (const [table, tenantColumn] of Object.entries(
			AGENT_TENANT_COLUMN_BY_TABLE
		)) {
			expect(KNOWN_TABLES).toContain(table);
			expect([...columnsOf(table)]).toContain(tenantColumn);
		}
	});

	it("every AGENT_TABLE_COLUMNS entry exists on its table", () => {
		for (const [table, columns] of Object.entries(AGENT_TABLE_COLUMNS)) {
			expect(KNOWN_TABLES).toContain(table);
			const real = columnsOf(table);
			for (const column of columns) {
				expect([...real]).toContain(column);
			}
		}
	});

	it("PROFILE_ID_TABLES are real tables that carry profile_id", () => {
		for (const table of PROFILE_ID_TABLES) {
			expect(KNOWN_TABLES).toContain(table);
			expect([...columnsOf(table)]).toContain("profile_id");
		}
	});

	it("id-less span tables expose a persisted delivery identity", () => {
		for (const table of [
			"analytics.custom_events",
			"analytics.error_spans",
			"analytics.web_vitals_spans",
		]) {
			expect([...columnsOf(table)]).toContain("delivery_id");
		}
	});

	it("delivery tables replace replays by their stable row identity", () => {
		for (const [table, file] of Object.entries(DELIVERY_TABLE_FILES)) {
			const ddl = readSql(`${import.meta.dir}/schema/${file}`);
			const parsed = parseTable(ddl);
			const identity =
				table === "analytics.events" ||
				table === "analytics.link_visits" ||
				table === "analytics.outgoing_links"
					? "id"
					: "delivery_key";

			expect(parsed.engine).toContain("ReplicatedReplacingMergeTree");
			expect(parsed.engine).toContain("ingested_at");
			expect(parsed.primaryKey).not.toBe("");
			expect(parsed.orderBy).toContain(identity);
			expect(parsed.columns.find((column) => column.name === "ingested_at")?.hasDefault).toBe(true);
			if (identity === "delivery_key") {
				expect(
					parsed.columns.find((column) => column.name === "delivery_key")
						?.computed
				).toBe(true);
			}
		}
	});

	it("delivery keys preserve time locality without a skip-index fallback", () => {
		const keys = {
			"analytics.custom_events": {
				orderBy: "(owner_id, event_name, timestamp, delivery_key)",
				primaryKey: "(owner_id, event_name, timestamp)",
			},
			"analytics.error_spans": {
				orderBy: "(client_id, error_type, path, timestamp, delivery_key)",
				primaryKey: "(client_id, error_type, path, timestamp)",
			},
			"analytics.events": {
				orderBy: "(client_id, time, id)",
				primaryKey: "(client_id, time)",
			},
			"analytics.link_visits": {
				orderBy: "(link_id, timestamp, id)",
				primaryKey: "(link_id, timestamp)",
			},
			"analytics.outgoing_links": {
				orderBy: "(client_id, timestamp, id)",
				primaryKey: "(client_id, timestamp)",
			},
			"analytics.web_vitals_spans": {
				orderBy: "(client_id, metric_name, path, timestamp, delivery_key)",
				primaryKey: "(client_id, metric_name, path, timestamp)",
			},
		} as const;

		for (const [table, expected] of Object.entries(keys)) {
			const file = DELIVERY_TABLE_FILES[
				table as keyof typeof DELIVERY_TABLE_FILES
			];
			const parsed = parseTable(readSql(`${import.meta.dir}/schema/${file}`));
			expect(parsed.orderBy).toBe(expected.orderBy);
			expect(parsed.primaryKey).toBe(expected.primaryKey);
			expect(
				parsed.indexes.some((index) =>
					/^(?:time|timestamp) TYPE minmax\b/.test(index.definition)
				)
			).toBe(false);
		}
	});

	it("shadow mirrors can append the version without column misalignment", () => {
		for (const file of Object.values(DELIVERY_TABLE_FILES)) {
			const columns = parseTable(
				readSql(`${import.meta.dir}/schema/${file}`)
			).columns;
			expect(columns.at(-1)?.name).toBe("ingested_at");
			expect(columns.at(-1)?.hasDefault).toBe(true);
			expect(
				columns
					.filter((column) => column.computed)
					.every((column) => column.name === "delivery_key")
			).toBe(true);
		}
	});

	it("the daily pageview projection preserves event-level deduplication", () => {
		const table = parseTable(
			readSql(
				`${import.meta.dir}/schema/analytics/pageviews/daily_pageviews.sql`
			)
		);
		const view = readSql(
			`${import.meta.dir}/schema/analytics/pageviews/daily_pageviews_mv.sql`
		);

		expect(table.engine).toContain("ReplicatedReplacingMergeTree");
		expect(table.primaryKey).toBe("(client_id, date)");
		expect(table.orderBy).toBe("(client_id, date, id)");
		expect(view).toContain("id,");
		expect(view).toContain("WHERE event_name = 'screen_view'");
		expect(view).not.toContain("countIf");
	});
});
