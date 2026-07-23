import { randomUUIDv7 } from "bun";
import { describe, expect, test } from "bun:test";
import { chQuery, clickHouse } from "./client";
import { revenueLatestCte } from "./revenue";

const describeIntegration =
	process.env.CLICKHOUSE_INTEGRATION_TESTS === "true" ? describe : describe.skip;

interface CollapsedRevenueRow {
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

function metadata(
	eventId: string,
	eventCreated: number,
	paymentIntentId: string,
	recordKind: "attempt" | "money"
): string {
	return JSON.stringify({
		databuddy_revenue_model: "stripe_events_v1",
		stripe_event_created: eventCreated,
		stripe_event_id: eventId,
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
		eventCreated?: number;
		eventId?: string;
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
		metadata: metadata(
			options.eventId ?? `evt-${transactionId}-${status}`,
			options.eventCreated ?? 1_785_672_000,
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

describeIntegration("revenue lifecycle collapse against ClickHouse", () => {
	test("keeps immutable attempts and money across out-of-order delivery", async () => {
		const ownerId = `revenue-lifecycle-${randomUUIDv7()}`;

		await clickHouse.insert({
			format: "JSONEachRow",
			table: "analytics.revenue",
			values: [
				// A late-delivered, older attempt has its immutable Stripe event ID,
				// so it cannot replace the successful PaymentIntent row.
				revenueRow(
					ownerId,
					"pi_late_failure",
					"completed",
					"2026-08-02 12:01:00",
					{ eventCreated: 1_785_672_200, eventId: "evt_success" }
				),
				revenueRow(
					ownerId,
					"evt_old_failure",
					"failed",
					"2026-08-02 12:05:00",
					{
						eventCreated: 1_785_672_100,
						eventId: "evt_old_failure",
						paymentIntentId: "pi_late_failure",
						recordKind: "attempt",
						type: "subscription_event",
					}
				),
				// A legitimate recovery preserves both the failed attempt and money.
				revenueRow(
					ownerId,
					"evt_initial_failure",
					"failed",
					"2026-08-02 12:02:00",
					{
						eventCreated: 1_785_672_300,
						eventId: "evt_initial_failure",
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
					{ eventCreated: 1_785_672_400, eventId: "evt_recovery" }
				),
				// Refunds keep their own immutable refund IDs and relation metadata.
				revenueRow(
					ownerId,
					"pi_refunded_payment",
					"completed",
					"2026-08-02 12:01:00",
					{ eventCreated: 1_785_672_500, eventId: "evt_charge" }
				),
				revenueRow(
					ownerId,
					"re_refund",
					"refunded",
					"2026-08-02 12:04:00",
					{
						amount: "-100.0000",
						eventCreated: 1_785_672_600,
						eventId: "evt_refund",
						paymentIntentId: "pi_refunded_payment",
						type: "refund",
					}
				),
			],
		});

		const rows = await chQuery<CollapsedRevenueRow>(
			`WITH ${revenueLatestCte({
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
			`WITH ${revenueLatestCte({
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

	test("uses the winning lifecycle date for legacy retained versions", async () => {
		const ownerId = `revenue-window-${randomUUIDv7()}`;
		const table = `analytics.revenue_versions_${randomUUIDv7().replaceAll("-", "")}`;
		const transactionId = "pi_legacy_recovery";

		await clickHouse.command({
			query: `CREATE TABLE ${table} AS analytics.revenue ENGINE = Memory`,
		});
		try {
			await clickHouse.insert({
				format: "JSONEachRow",
				table,
				values: [
					revenueRow(
						ownerId,
						transactionId,
						"failed",
						"2026-07-01 12:01:00",
						{
							created: "2026-07-01 12:00:00",
							eventCreated: 1_783_000_000,
							eventId: "evt_legacy_failure",
							recordKind: "attempt",
							type: "subscription_event",
						}
					),
					revenueRow(
						ownerId,
						transactionId,
						"completed",
						"2026-08-02 12:01:00",
						{
							created: "2026-08-02 12:00:00",
							eventCreated: 1_785_672_000,
							eventId: "evt_legacy_recovery",
						}
					),
				],
			});

			const rowsInWindow = (startDate: string, endDate: string) =>
				chQuery<CollapsedRevenueRow>(
					`WITH ${revenueLatestCte({
						candidateWhere: `created >= toDateTime({startDate:String})
							AND created <= toDateTime(concat({endDate:String}, ' 23:59:59'))`,
						scope: "owner_id = {ownerId:String}",
						source: table,
					})}
					SELECT transaction_id, status, created
					FROM revenue_latest
					WHERE created >= toDateTime({startDate:String})
						AND created <= toDateTime(concat({endDate:String}, ' 23:59:59'))`,
					{ endDate, ownerId, startDate }
				);

			expect(await rowsInWindow("2026-07-01", "2026-07-02")).toEqual([]);
			expect(await rowsInWindow("2026-08-01", "2026-08-03")).toEqual([
				expect.objectContaining({
					created: "2026-08-02 12:00:00",
					status: "completed",
					transaction_id: transactionId,
				}),
			]);
		} finally {
			await clickHouse.command({ query: `DROP TABLE IF EXISTS ${table}` });
		}
	});
});
