import { describe, expect, it } from "bun:test";
import { finalizeDeliveryTables } from "./logical-reads";

describe("finalizeDeliveryTables", () => {
	it("inserts FINAL after delivery-backed table references", () => {
		const result = finalizeDeliveryTables(`
			SELECT e.path, r.amount
			FROM analytics.events e
			JOIN analytics.revenue r ON r.session_id = e.session_id
		`);

		expect(result.usesFinal).toBe(true);
		expect(result.query).toContain("FROM analytics.events FINAL e");
		// analytics.revenue is not in the delivery-table list, so no FINAL is added
		expect(result.query).toContain("JOIN analytics.revenue r");
		expect(result.query).not.toContain("JOIN analytics.revenue FINAL");
	});

	it("supports quoted relations and nested queries", () => {
		const result = finalizeDeliveryTables(`
			WITH events AS (
				SELECT id FROM \`analytics\`.\`events\`
			)
			SELECT * FROM "analytics.custom_events" AS custom
			JOIN events ON 1 = 1
		`);

		expect(result.usesFinal).toBe(true);
		expect(result.query).toContain("FROM `analytics`.`events` FINAL");
		expect(result.query).toContain('FROM "analytics.custom_events" FINAL AS custom');
	});

	it("leaves an explicit FINAL modifier untouched", () => {
		const query = "SELECT count() FROM analytics.link_visits FINAL";
		expect(finalizeDeliveryTables(query)).toEqual({ query, usesFinal: true });
	});

	it("ignores table names inside strings and comments", () => {
		const query = `
			SELECT 'FROM analytics.events' AS example
			FROM analytics.revenue
			-- JOIN analytics.outgoing_links
		`;
		expect(finalizeDeliveryTables(query)).toEqual({ query, usesFinal: false });
	});

	it("inserts FINAL before an alias when alias follows directly", () => {
		const query = "SELECT * FROM analytics.events e WHERE e.client_id = 'x'";
		const result = finalizeDeliveryTables(query);
		expect(result.query).toBe(
			"SELECT * FROM analytics.events FINAL e WHERE e.client_id = 'x'"
		);
		expect(result.usesFinal).toBe(true);
	});

	it("handles multiple analytics table references in one query", () => {
		const query = `
			SELECT *
			FROM analytics.events
			JOIN analytics.custom_events ON 1 = 1
		`;
		const result = finalizeDeliveryTables(query);
		expect(result.query).toContain("FROM analytics.events FINAL");
		expect(result.query).toContain("JOIN analytics.custom_events FINAL");
	});
});
