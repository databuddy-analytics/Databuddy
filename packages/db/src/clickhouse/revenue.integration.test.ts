import { randomUUIDv7 } from "bun";
import { describe, expect, test } from "bun:test";
import { chQuery, clickHouse } from "./client";
import {
	buildRevenueLatestCte,
	explicitRevenueWebsiteExpression,
	stripeContextAggregates,
} from "./revenue";

const describeIntegration =
	process.env.CLICKHOUSE_INTEGRATION_TESTS === "true"
		? describe
		: describe.skip;

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

	test("applies candidate predicates directly", () => {
		const sql = buildRevenueLatestCte({
			candidateWhere: "created >= {from:DateTime}",
			scope: "owner_id = {ownerId:String}",
		});

		expect(sql).toContain("AND created >= {from:DateTime}");
		expect(sql.match(/FROM analytics\.revenue FINAL/g)).toHaveLength(1);
		expect(sql.match(/owner_id = \{ownerId:String\}/g)).toHaveLength(1);
	});
});

describeIntegration("canonical revenue rows against ClickHouse", () => {
	test("keeps settled context ahead of delayed failures and proves explicit website metadata", async () => {
		const ownerId = `revenue-context-${randomUUIDv7()}`;
		const legacyOwnerId = `${ownerId}-legacy`;
		const canonicalOwnerId = `${ownerId}-canonical`;
		const ambiguousOwnerId = `${ownerId}-ambiguous`;
		const websiteA = "website_default_example";
		const websiteB = "website_metadata_example";
		const websiteC = "website_legacy_example";
		await clickHouse.insert({
			format: "JSONEachRow",
			table: "analytics.revenue",
			values: [
				{
					...revenueRow(
						ownerId,
						"inpay_example",
						"completed",
						"2026-08-02 12:01:00"
					),
					website_id: websiteA,
					metadata: JSON.stringify({
						stripe_event_type: "invoice_payment.paid",
						stripe_record_kind: "money",
						stripe_invoice_id: "in_example",
					}),
				},
				{
					...revenueRow(
						ownerId,
						"in_example:link",
						"linked",
						"2026-08-02 12:02:00"
					),
					website_id: websiteB,
					profile_id: "profile_settled_example",
					session_id: "session_settled_example",
					product_name: "Settled example",
					metadata: JSON.stringify({
						client_id: websiteB,
						stripe_event_type: "invoice.paid",
						stripe_record_kind: "link",
						stripe_invoice_id: "in_example",
					}),
				},
				{
					...revenueRow(
						ownerId,
						"evt_delayed_example",
						"failed",
						"2026-08-02 12:05:00",
						{
							created: "2026-08-02 11:00:00",
							recordKind: "attempt",
							type: "subscription_event",
						}
					),
					website_id: websiteA,
					profile_id: "profile_failed_example",
					session_id: "session_failed_example",
					product_name: "Failed example",
					metadata: JSON.stringify({
						client_id: websiteA,
						stripe_event_type: "invoice.payment_failed",
						stripe_record_kind: "attempt",
						stripe_invoice_id: "in_example",
					}),
				},
				{
					...revenueRow(
						legacyOwnerId,
						"pi_legacy_example",
						"completed",
						"2026-08-02 12:01:00"
					),
					website_id: websiteC,
					profile_id: "profile_legacy_example",
					metadata: "{}",
				},
				{
					...revenueRow(
						legacyOwnerId,
						"evt_legacy_delayed_example",
						"failed",
						"2026-08-02 12:05:00",
						{
							recordKind: "attempt",
							type: "subscription_event",
						}
					),
					website_id: websiteA,
					profile_id: "profile_failed_example",
				},
				{
					...revenueRow(
						`${ownerId}-foreign`,
						"pi_foreign_example",
						"completed",
						"2026-08-02 12:01:00"
					),
					website_id: websiteA,
					metadata: JSON.stringify({
						client_id: "website_foreign_example",
						stripe_event_type: "payment_intent.succeeded",
					}),
				},
				{
					...revenueRow(
						`${ownerId}-paddle`,
						"txn_paddle_example",
						"completed",
						"2026-08-02 12:01:00"
					),
					provider: "paddle",
					website_id: websiteB,
					metadata: JSON.stringify({
						stripe_event_type: "invoice_payment.paid",
					}),
				},
				{
					...revenueRow(
						ownerId,
						"ch_example:refund",
						"refunded",
						"2026-08-02 12:10:00",
						{ type: "refund" }
					),
					website_id: websiteC,
					profile_id: "profile_refund_example",
					product_name: "Refund",
					metadata: JSON.stringify({ client_id: websiteC }),
				},
				{
					...revenueRow(
						canonicalOwnerId,
						"inpay_legacy_canonical_example",
						"completed",
						"2026-08-02 12:01:00"
					),
					website_id: websiteB,
					metadata: JSON.stringify({
						stripe_record_kind: "money",
						stripe_invoice_id: "in_legacy_canonical_example",
					}),
				},
				{
					...revenueRow(
						canonicalOwnerId,
						"pi_later_metadata_example",
						"completed",
						"2026-08-02 12:05:00"
					),
					website_id: websiteA,
					metadata: JSON.stringify({
						client_id: websiteA,
						stripe_record_kind: "money",
						stripe_event_type: "payment_intent.succeeded",
					}),
				},
				...["first", "second"].map((invoice) => ({
					...revenueRow(
						ambiguousOwnerId,
						`inpay_${invoice}_example`,
						"completed",
						"2026-08-02 12:01:00"
					),
					metadata: JSON.stringify({
						stripe_record_kind: "money",
						stripe_invoice_id: `in_${invoice}_example`,
					}),
				})),
			],
		});

		const contexts = await chQuery<{
			owner_id: string;
			website_id: string;
			explicit_website_id: string;
			payment_invoice_count: number | string;
			payment_invoice_id: string;
			profile_id: string;
			session_id: string;
			product_name: string;
		}>(
			`SELECT owner_id, ${stripeContextAggregates()}
			FROM analytics.revenue FINAL
			WHERE owner_id IN {ownerIds:Array(String)} AND provider = 'stripe' AND type != 'refund'
			GROUP BY owner_id`,
			{
				ownerIds: [
					ownerId,
					legacyOwnerId,
					`${ownerId}-foreign`,
					canonicalOwnerId,
					ambiguousOwnerId,
				],
			}
		);
		const byOwner = new Map(
			contexts.map((context) => [context.owner_id, context])
		);
		expect(byOwner.get(ownerId)?.profile_id).toBe("profile_settled_example");
		expect(byOwner.get(ownerId)?.session_id).toBe("session_settled_example");
		expect(byOwner.get(ownerId)?.product_name).toBe("Settled example");
		expect(byOwner.get(ownerId)?.website_id).toBe(websiteB);
		expect(byOwner.get(ownerId)?.explicit_website_id).toBe(websiteB);
		expect(Number(byOwner.get(ownerId)?.payment_invoice_count)).toBe(1);
		expect(byOwner.get(ownerId)?.payment_invoice_id).toBe("in_example");
		expect(byOwner.get(legacyOwnerId)?.profile_id).toBe(
			"profile_legacy_example"
		);
		expect(byOwner.get(legacyOwnerId)?.website_id).toBe(websiteC);
		expect(byOwner.get(legacyOwnerId)?.explicit_website_id).toBe(websiteC);
		expect(Number(byOwner.get(legacyOwnerId)?.payment_invoice_count)).toBe(0);
		expect(byOwner.get(legacyOwnerId)?.payment_invoice_id).toBe("");
		expect(byOwner.get(`${ownerId}-foreign`)?.explicit_website_id).toBe("");
		expect(byOwner.get(canonicalOwnerId)?.website_id).toBe(websiteB);
		expect(byOwner.get(canonicalOwnerId)?.explicit_website_id).toBe(websiteB);
		expect(byOwner.get(canonicalOwnerId)?.payment_invoice_id).toBe(
			"in_legacy_canonical_example"
		);
		expect(Number(byOwner.get(ambiguousOwnerId)?.payment_invoice_count)).toBe(
			2
		);
		expect(byOwner.get(ambiguousOwnerId)?.payment_invoice_id).toBe("");

		const rawSites = await chQuery<{
			transaction_id: string;
			explicit_website_id: string | null;
		}>(
			`SELECT r.transaction_id, ${explicitRevenueWebsiteExpression("r")} AS explicit_website_id
			FROM analytics.revenue AS r FINAL
			WHERE r.owner_id IN {ownerIds:Array(String)}`,
			{
				ownerIds: [
					ownerId,
					legacyOwnerId,
					`${ownerId}-foreign`,
					`${ownerId}-paddle`,
				],
			}
		);
		const byTransaction = new Map(
			rawSites.map((row) => [row.transaction_id, row.explicit_website_id])
		);
		expect(byTransaction.get("inpay_example")).toBeNull();
		expect(byTransaction.get("in_example:link")).toBe(websiteB);
		expect(byTransaction.get("pi_legacy_example")).toBe(websiteC);
		expect(byTransaction.get("pi_foreign_example")).toBeNull();
		expect(byTransaction.get("txn_paddle_example")).toBe(websiteB);
	});

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
				revenueRow(ownerId, "re_refund", "refunded", "2026-08-02 12:04:00", {
					amount: "-100.0000",
					paymentIntentId: "pi_refunded_payment",
					type: "refund",
				}),
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
