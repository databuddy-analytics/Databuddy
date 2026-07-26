import { describe, expect, test } from "bun:test";
import { revenueLatestCte } from "./revenue";

describe("revenueLatestCte", () => {
	test("selects one deterministic lifecycle state per provider transaction", () => {
		const sql = revenueLatestCte({
			name: "scoped_revenue",
			scope: "owner_id = {ownerId:String}",
		});

		expect(sql).toContain(
			"GROUP BY owner_id, provider, transaction_id"
		);
		expect(sql).toContain(
			"tuple(_revenue_state_rank, _revenue_event_unix, _revenue_source_unix, _revenue_identity_richness, _revenue_tiebreaker)"
		);
		expect(sql).toContain(
			"toUInt64(toUnixTimestamp(synced_at)) AS _revenue_source_unix"
		);
		expect(sql).toContain("status = 'completed', 4");
		expect(sql).toContain("status = 'refunded', 5");
		expect(sql).toContain("status = 'canceled', 3");
		expect(sql).toContain("status = 'failed', 2");
		expect(sql).toContain(
			"JSONExtractUInt(metadata, 'stripe_event_created')"
		);
		expect(sql).toContain(") AS _revenue_event_unix");
		expect(sql).toContain("cityHash64(toString(tuple(");
		expect(sql).toContain("toUInt8(profile_id != '')");
		expect(sql).toContain(") AS _revenue_tiebreaker");
		expect(sql).not.toContain("% 33554432");
		expect(sql).toContain("WHERE owner_id = {ownerId:String}");
		expect(sql).not.toContain(" FINAL");
	});

	test("carries non-empty identity without changing the latest lifecycle row", () => {
		const sql = revenueLatestCte({ scope: "owner_id = 'org_1'" });

		expect(sql).toContain("tuple(profile_id != '', _revenue_state_rank");
		expect(sql).toContain(
			"tuple(ifNull(anonymous_id, '') != '', _revenue_state_rank"
		);
		expect(sql).toContain("tuple(customer_id != '', _revenue_state_rank");
		expect(sql).toContain("tuple(ifNull(product_name, '') != ''");
		expect(sql).toContain("tuple(lengthUTF8(metadata), _revenue_state_rank");
		expect(sql).toContain("latest_customer_id AS customer_id");
		expect(sql).toContain("latest_metadata AS metadata");
		expect(sql).toContain("latest.11 AS created");
		expect(sql).toContain("latest.12 AS synced_at");
		expect(sql).toContain("latest.2 AS status");
		expect(sql).not.toContain("min(created)");
		expect(sql).not.toContain("canonical_created");
	});

	test("uses indexed range candidates without excluding another version of a key", () => {
		const sql = revenueLatestCte({
			candidateWhere: "created >= {from:DateTime}",
			scope: "owner_id = {ownerId:String}",
		});

		expect(sql).toContain(
			"(owner_id, provider, transaction_id) IN ("
		);
		expect(sql).toContain("AND created >= {from:DateTime}");
		expect(sql.match(/FROM analytics\.revenue/g)).toHaveLength(2);
		expect(sql.match(/owner_id = \{ownerId:String\}/g)).toHaveLength(2);
	});

	test("can exercise retained versions from a trusted test source", () => {
		const sql = revenueLatestCte({
			scope: "owner_id = {ownerId:String}",
			source: "analytics.revenue_retained_versions_test",
		});

		expect(sql).toContain("FROM analytics.revenue_retained_versions_test");
		expect(sql).not.toContain("FROM analytics.revenue\n");
	});
});
