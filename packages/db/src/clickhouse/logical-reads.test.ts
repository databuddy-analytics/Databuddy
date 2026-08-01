import { describe, expect, it } from "bun:test";
import { finalizeDeliveryTables } from "./logical-reads";

describe("finalizeDeliveryTables", () => {
	it("finalizes only delivery-backed relations", () => {
		const result = finalizeDeliveryTables(`
			SELECT e.path, r.amount
			FROM analytics.events e
			JOIN analytics.revenue r ON r.session_id = e.session_id
		`);

		expect(result.usesFinal).toBe(true);
		expect(result.query).toContain("FROM analytics.events FINAL AS e");
		expect(result.query).toContain("JOIN analytics.revenue r");
		expect(result.query).not.toContain("analytics.revenue FINAL");
	});

	it("supports quoted relations and nested queries", () => {
		const result = finalizeDeliveryTables(`
			WITH events AS (
				SELECT id FROM \`analytics\`.\`events\`
			)
			SELECT * FROM "analytics.custom_events" AS custom
			JOIN events ON 1 = 1
		`);

		expect(result.query).toContain("FROM `analytics`.`events` FINAL");
		expect(result.query).toContain(
			'FROM "analytics.custom_events" FINAL AS custom'
		);
	});

	it("does not duplicate an explicit FINAL modifier", () => {
		const query = "SELECT count() FROM analytics.link_visits FINAL";
		expect(finalizeDeliveryTables(query)).toEqual({ query, usesFinal: true });
	});

	it("normalizes implicit and explicit aliases after FINAL", () => {
		expect(
			finalizeDeliveryTables(
				"SELECT * FROM analytics.events event JOIN analytics.link_visits AS visit ON 1 = 1"
			).query
		).toBe(
			"SELECT * FROM analytics.events FINAL AS event JOIN analytics.link_visits FINAL AS visit ON 1 = 1"
		);
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
