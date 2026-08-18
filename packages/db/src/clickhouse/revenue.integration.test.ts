import { randomUUIDv7 } from "bun";
import { describe, expect, test } from "bun:test";
import { chQuery, clickHouse } from "./client";
import { buildRevenueLatestCte } from "./revenue";

const describeIntegration =
	process.env.CLICKHOUSE_INTEGRATION_TESTS === "true" ? describe : describe.skip;

interface RevenueRow {
	amount: number | string;
	created?: string;
	status: string;
	transaction_id: string;
	type: string;
}

interface RevenueHealthSummary {
	failed_attempts: number | string;
	refunds: number | string;
	successful_payments: number | string;
	total_revenue: number | string;
}

function stripeMetadata(
	paymentIntentId: string,
	recordKind: "attempt" | "money"
): string {
	return JSON.stringify({
		stripe_payment_intent_id: paymentIntentId,
		stripe_record_kind: recordKind,
	});
}

function revenueRow(
	ownerId: string,
	transactionId: string,
	status: string,
	syncedAt: string,
	options: {
		amount?: string;
		created?: string;
		paymentIntentId?: string;
		recordKind?: "attempt" | "money";
		type?: string;
	} = {}
) {
	const created = options.created ?? "2026-08-02 12:00:00";
	return {
		amount: options.amount ?? "100.0000",
		created,
		currency: "USD",
		metadata: stripeMetadata(
			options.paymentIntentId ?? transactionId,
			options.recordKind ?? "money"
		),
		original_amount: options.amount ?? "100.0000",
		original_currency: "USD",
		owner_id: ownerId,
		provider: "stripe",
		status,
		synced_at: syncedAt,
		transaction_id: transactionId,
		type: options.type ?? "sale",
		website_id: ownerId,
	};
}

describe("buildRevenueLatestCte", () => {
	test("reads canonical immutable transactions with FINAL", () => {
		const sql = buildRevenueLatestCte({
			name: "scoped_revenue",
			scope: "owner_id = {ownerId:String}",
		});

		expect(sql).toContain("FROM analytics.revenue FINAL");
		expect(sql).toContain("nullIf(website_id, '') AS website_id");
		expect(sql).toContain("nullIf(anonymous_id, '') AS anonymous_id");
		expect(sql).toContain("nullIf(product_name, '') AS product_name");
		expect(sql).toContain("WHERE owner_id = {ownerId:String}");
		expect(sql).not.toContain("GROUP BY owner_id, provider, transaction_id");
});

	test("keeps range predicates in the canonical read", () => {
		const sql = buildRevenueLatestCte({ scope: "owner_id = 'org_1'" });

		expect(sql).toContain("FROM analytics.revenue FINAL");
		expect(sql).toContain("WHERE owner_id = 'org_1'");
});

	test("applies candidate predicates directly", () => {
		const sql = buildRevenueLatestCte({
			candidateWhere: "created >= {from:DateTime}",
			scope: "owner_id = {ownerId:String}",
		});

		expect(sql).toContain("AND created >= {from:DateTime}");
		expect(sql.match(/FROM analytics\.revenue FINAL/g)).toHaveLength(1);
		expect(sql.match(/owner_id = \{ownerId:String\}/g)).toHaveLength(1);
	});

	test("accepts a trusted source override", () => {
		const sql = buildRevenueLatestCte({
			scope: "owner_id = {ownerId:String}",
			source: "analytics.revenue_retained_versions_test",
		});

		expect(sql).toContain("FROM analytics.revenue_retained_versions_test");
		expect(sql).not.toContain("FROM analytics.revenue\n");
	});
});

describeIntegration("canonical revenue rows against ClickHouse", () => {
	test("keeps attempts, payments, and refunds as separate rows", async () => {
		const ownerId = `revenue-immutable-${randomUUIDv7()}`;

		await clickHouse.insert({
			format: "JSONEachRow",
			table: "analytics.revenue",
			values: [
				revenueRow(
					ownerId,
					"pi_late_failure",
					"completed",
					"2026-08-02 12:01:00",
					{ paymentIntentId: "pi_late_failure" }
				),
				revenueRow(
					ownerId,
					"evt_old_failure",
					"failed",
					"2026-08-02 12:05:00",
					{
						paymentIntentId: "pi_late_failure",
						recordKind: "attempt",
						type: "subscription_event",
					}
				),
				revenueRow(
					ownerId,
					"evt_initial_failure",
					"failed",
					"2026-08-02 12:02:00",
					{
						paymentIntentId: "pi_recovered",
						recordKind: "attempt",
						type: "subscription_event",
					}
				),
				revenueRow(
					ownerId,
					"pi_recovered",
					"completed",
					"2026-08-02 12:03:00",
					{ paymentIntentId: "pi_recovered" }
				),
				revenueRow(
					ownerId,
					"pi_refunded_payment",
					"completed",
					"2026-08-02 12:01:00",
					{ paymentIntentId: "pi_refunded_payment" }
				),
				revenueRow(
					ownerId,
					"re_refund",
					"refunded",
					"2026-08-02 12:04:00",
					{
						amount: "-100.0000",
						paymentIntentId: "pi_refunded_payment",
						type: "refund",
					}
				),
			],
		});

		const rows = await chQuery<RevenueRow>(
			`WITH ${buildRevenueLatestCte({
				scope: "owner_id = {ownerId:String}",
			})}
			SELECT transaction_id, type, status, amount
			FROM revenue_latest
			ORDER BY transaction_id`,
			{ ownerId }
		);
		const byId = new Map(rows.map((row) => [row.transaction_id, row]));

		expect(byId.get("pi_late_failure")?.status).toBe("completed");
		expect(byId.get("evt_old_failure")?.status).toBe("failed");
		expect(byId.get("pi_recovered")?.status).toBe("completed");
		expect(byId.get("evt_initial_failure")?.status).toBe("failed");
		expect(byId.get("pi_refunded_payment")?.status).toBe("completed");
		expect(byId.get("re_refund")).toMatchObject({
			status: "refunded",
			type: "refund",
		});
		expect(Number(byId.get("re_refund")?.amount)).toBe(-100);
		expect(rows).toHaveLength(6);

		const [summary] = await chQuery<RevenueHealthSummary>(
			`WITH ${buildRevenueLatestCte({
				scope: "owner_id = {ownerId:String}",
			})}
			SELECT
				toFloat64(sumIf(
					amount,
					type != 'subscription_event'
						AND ((type = 'refund' AND status = 'refunded') OR status = 'completed')
				)) AS total_revenue,
				countIf(type = 'subscription_event' AND status = 'failed') AS failed_attempts,
				countIf(type != 'subscription_event' AND type != 'refund' AND status = 'completed') AS successful_payments,
				countIf(type = 'refund' AND status = 'refunded') AS refunds
			FROM revenue_latest`,
			{ ownerId }
		);

		expect(Number(summary?.total_revenue)).toBe(200);
		expect(Number(summary?.failed_attempts)).toBe(2);
		expect(Number(summary?.successful_payments)).toBe(3);
		expect(Number(summary?.refunds)).toBe(1);
	});

});
