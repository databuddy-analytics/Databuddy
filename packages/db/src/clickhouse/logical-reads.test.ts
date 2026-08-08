import { describe, expect, it } from "bun:test";
import { finalizeDeliveryTables } from "./logical-reads";

describe("finalizeDeliveryTables", () => {
	it("detects delivery-backed relations without rewriting SQL", () => {
		const result = finalizeDeliveryTables(`
			SELECT e.path, r.amount
			FROM analytics.events e
			JOIN analytics.revenue r ON r.session_id = e.session_id
		`);

		expect(result.usesFinal).toBe(true);
		expect(result.query).toContain("FROM analytics.events e");
		expect(result.query).toContain("JOIN analytics.revenue r");
		expect(result.query).not.toContain("FINAL");
	});

	it("supports quoted relations and nested queries", () => {
		const result = finalizeDeliveryTables(`
			WITH events AS (
				SELECT id FROM \`analytics\`.\`events\`
			)
			SELECT * FROM "analytics.custom_events" AS custom
			JOIN events ON 1 = 1
		`);

		expect(result.query).toContain("FROM `analytics`.`events`");
		expect(result.query).toContain(
			'FROM "analytics.custom_events" AS custom'
		);
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
});
