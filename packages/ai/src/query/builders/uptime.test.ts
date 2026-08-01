import { TABLE_COLUMNS } from "@databuddy/db/clickhouse/tables";
import { describe, expect, it } from "vitest";
import { UptimeBuilders } from "./uptime";

describe("UptimeBuilders", () => {
	it("deduplicates complete physical rows without sorting them first", () => {
		const query = UptimeBuilders.uptime_overview?.customSql?.({
			endDate: "2026-08-03",
			startDate: "2026-08-01",
			websiteId: "website-1",
		});
		const sql = query?.sql.replaceAll(/\s+/g, " ").trim() ?? "";

		expect(sql).toContain(
			`LIMIT 1 BY ${TABLE_COLUMNS["uptime.uptime_monitor"].join(", ")}`
		);
		expect(sql).not.toContain("ORDER BY timestamp DESC LIMIT 1 BY");
	});
});
