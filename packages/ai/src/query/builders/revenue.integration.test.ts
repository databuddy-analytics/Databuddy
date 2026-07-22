import { describe, expect, it } from "bun:test";
import { chQuery, clickHouse } from "@databuddy/db/clickhouse";
import { randomUUIDv7 } from "bun";
import { SimpleQueryBuilder } from "../simple-builder";
import type { Filter } from "../types";
import { ProfilesBuilders } from "./profiles";
import { RevenueBuilders } from "./revenue";

const describeIntegration =
	process.env.CLICKHOUSE_INTEGRATION_TESTS === "true" ? describe : describe.skip;

function stripeMetadata(
	recordKind: "attempt" | "link" | "money",
	extra: Record<string, string> = {}
): string {
	return JSON.stringify({
		databuddy_revenue_model: "stripe_events_v1",
		stripe_record_kind: recordKind,
		...extra,
	});
}

function revenueRow(
	websiteId: string,
	transactionId: string,
	amount: number,
	type: string,
	status: string,
	metadata = "{}",
	created = "2026-08-02 12:00:00",
	overrides: Record<string, unknown> = {}
): Record<string, unknown> {
	return {
		owner_id: websiteId,
		website_id: websiteId,
		customer_id: "cus_shared",
		transaction_id: transactionId,
		provider: "stripe",
		type,
		status,
		amount,
		original_amount: amount,
		original_currency: "USD",
		currency: "USD",
		metadata,
		created,
		synced_at: created,
		...overrides,
	};
}

async function revenueOverview(
	websiteId: string,
	startDate = "2026-07-01",
	endDate = "2026-08-03",
	filters?: Filter[]
): Promise<Record<string, null | number | string>[]> {
	const query = RevenueBuilders.revenue_overview?.customSql?.({
		endDate,
		startDate,
		websiteId,
		...(filters?.length ? { filters } : {}),
	});
	if (!query || typeof query === "string") {
		throw new Error("Revenue overview did not compile");
	}
	return chQuery<Record<string, number | string>>(query.sql, query.params);
}

async function organizationRevenueOverview(
	organizationId: string,
	websiteIds: string[],
	startDate = "2026-07-01",
	endDate = "2026-08-03"
): Promise<Record<string, null | number | string>[]> {
	const config = RevenueBuilders.revenue_overview;
	if (!config) {
		throw new Error("Revenue overview builder is missing");
	}
	const query = new SimpleQueryBuilder(config, {
		from: startDate,
		organizationWebsiteIds: websiteIds,
		projectId: organizationId,
		to: endDate,
		type: "revenue_overview",
	}).compile();
	return chQuery<Record<string, number | string>>(query.sql, query.params);
}

async function recentTransactions(
	websiteId: string,
	startDate: string,
	endDate: string
): Promise<Record<string, number | string>[]> {
	const query = RevenueBuilders.recent_transactions?.customSql?.({
		endDate,
		startDate,
		websiteId,
	});
	if (!query || typeof query === "string") {
		throw new Error("Recent transactions did not compile");
	}
	return chQuery<Record<string, number | string>>(query.sql, query.params);
}

function attributionEvent(
	websiteId: string,
	sessionId: string,
	time: string,
	utmCampaign: string | null
): Record<string, unknown> {
	return {
		id: randomUUIDv7(),
		client_id: websiteId,
		event_name: "screen_view",
		anonymous_id: `anon-${sessionId}`,
		session_id: sessionId,
		time,
		url: "https://example.com/checkout",
		path: "/checkout",
		ip: "127.0.0.1",
		user_agent: "integration-test",
		utm_campaign: utmCampaign,
		properties: "{}",
		created_at: time,
	};
}

describeIntegration("revenue query builders against ClickHouse", () => {
	for (const [name, builder] of Object.entries(RevenueBuilders)) {
		it(`executes ${name}`, async () => {
			const query = builder.customSql?.({
				endDate: "2026-01-02",
				startDate: "2026-01-01",
				websiteId: "__revenue_builder_integration__",
			});
			expect(query).toBeDefined();
			expect(typeof query).not.toBe("string");
			if (!query || typeof query === "string") {
				throw new Error(`${name} did not compile to a parameterized query`);
			}

			await chQuery(query.sql, query.params, {
				clickhouse_settings: {
					max_execution_time: 15,
					max_result_rows: 100,
				},
				readonly: true,
			});
		});
	}

	it("preserves legacy totals and reconciles immutable Stripe event records", async () => {
		const websiteId = `revenue-cutover-${randomUUIDv7()}`;
		const row = (
			transactionId: string,
			amount: number,
			type: string,
			status: string,
			rowMetadata = "{}",
			created = "2026-08-02 12:00:00",
			overrides: Record<string, unknown> = {}
		) =>
			revenueRow(
				websiteId,
				transactionId,
				amount,
				type,
				status,
				rowMetadata,
				created,
				overrides
			);

		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				// Legacy invoice and PaymentIntent rows are still reconciled by the
				// bounded amount/time fallback.
				row("pi_legacy", 100, "sale", "completed", "{}", "2026-07-01 12:00:00"),
				row(
					"in_legacy",
					100,
					"subscription",
					"completed",
					"{}",
					"2026-07-01 12:00:00"
				),
				// A standalone PaymentIntent must not suppress itself.
				row(
					"pi_standalone",
					40,
					"sale",
					"completed",
					stripeMetadata("money", {
						stripe_money_kind: "standalone_candidate",
						stripe_payment_intent_id: "pi_standalone",
					})
				),
				// InvoicePayment allocations replace their linked PaymentIntent
				// candidates exactly, including partial/multi-payment invoices.
				row(
					"pi_invoice_a",
					120,
					"sale",
					"completed",
					stripeMetadata("money", {
						stripe_money_kind: "standalone_candidate",
						stripe_payment_intent_id: "pi_invoice_a",
					})
				),
				row(
					"pi_invoice_b",
					80,
					"sale",
					"completed",
					stripeMetadata("money", {
						stripe_money_kind: "standalone_candidate",
						stripe_payment_intent_id: "pi_invoice_b",
					})
				),
				row(
					"inpay_a",
					120,
					"subscription",
					"completed",
					stripeMetadata("money", {
						stripe_invoice_id: "in_modern",
						stripe_invoice_payment_id: "inpay_a",
						stripe_money_kind: "invoice_payment",
						stripe_payment_intent_id: "pi_invoice_a",
					})
				),
				row(
					"inpay_b",
					80,
					"subscription",
					"completed",
					stripeMetadata("money", {
						stripe_invoice_id: "in_modern",
						stripe_invoice_payment_id: "inpay_b",
						stripe_money_kind: "invoice_payment",
						stripe_payment_intent_id: "pi_invoice_b",
					})
				),
				row(
					"evt_failed",
					50,
					"subscription_event",
					"failed",
					stripeMetadata("attempt", {
						stripe_event_type: "payment_intent.payment_failed",
						stripe_failure_code: "card_declined",
						stripe_failure_decline_code: "insufficient_funds",
						stripe_failure_type: "card_error",
						stripe_invoice_id: "in_recovered",
						stripe_payment_intent_id: "pi_recovered",
					}),
					"2026-08-01 12:00:00",
					{ synced_at: "2026-08-03 12:00:00" }
				),
				// The invoice event wins duplicate-attempt counting, while the richer
				// PaymentIntent event still supplies its safe decline code.
				row(
					"evt_invoice_failed",
					50,
					"subscription_event",
					"failed",
					stripeMetadata("attempt", {
						stripe_event_type: "invoice.payment_failed",
						stripe_failure_type: "card_error",
						stripe_invoice_id: "in_recovered",
						stripe_payment_intent_id: "pi_recovered",
					}),
					"2026-08-01 12:00:00",
					{ synced_at: "2026-08-03 12:00:01" }
				),
				row(
					"evt_canceled",
					25,
					"subscription_event",
					"canceled",
					stripeMetadata("attempt", {
						stripe_cancellation_reason: "requested_by_customer",
						stripe_event_type: "payment_intent.canceled",
						stripe_payment_intent_id: "pi_canceled",
					})
				),
				row(
					"pi_recovered",
					50,
					"sale",
					"completed",
					stripeMetadata("money", {
						stripe_money_kind: "standalone_candidate",
						stripe_payment_intent_id: "pi_recovered",
					})
				),
				row(
					"re_recovered_partial",
					-10,
					"refund",
					"refunded",
					stripeMetadata("money", {
						stripe_money_kind: "refund",
						stripe_payment_intent_id: "pi_recovered",
					}),
					"2026-08-03 13:00:00"
				),
			],
		});
		const [overview] = (await revenueOverview(websiteId)) as {
			canceled_payment_attempts: number | string;
			failed_payment_amount: number | string;
			failed_payment_attempts: number | string;
			payment_failure_rate: number | string;
			refund_amount: number | string;
			refund_count: number | string;
			recovered_payment_attempts: number | string;
			observed_failure_event_types: number | string;
			required_failure_event_types: number | string;
			successful_payment_attempts: number | string;
			top_payment_cancellation_reason: string;
			top_payment_failure_reason: string;
			total_revenue: number | string;
			total_transactions: number | string;
		}[];

		expect(Number(overview?.total_revenue)).toBe(390);
		expect(Number(overview?.total_transactions)).toBe(5);
		expect(Number(overview?.failed_payment_attempts)).toBe(1);
		expect(Number(overview?.canceled_payment_attempts)).toBe(1);
		expect(Number(overview?.failed_payment_amount)).toBe(50);
		expect(Number(overview?.recovered_payment_attempts)).toBe(1);
		expect(Number(overview?.successful_payment_attempts)).toBe(4);
		expect(Number(overview?.payment_failure_rate)).toBe(20);
		expect(Number(overview?.refund_amount)).toBe(-10);
		expect(Number(overview?.refund_count)).toBe(1);
		expect(Number(overview?.observed_failure_event_types)).toBe(2);
		expect(Number(overview?.required_failure_event_types)).toBe(2);
		expect(overview?.top_payment_failure_reason).toBe("insufficient_funds");
		expect(overview?.top_payment_cancellation_reason).toBe(
			"requested_by_customer"
		);
	});

	it("does not leak Stripe payment diagnostics into another provider", async () => {
		const websiteId = `revenue-provider-scope-${randomUUIDv7()}`;

		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					websiteId,
					"paddle-sale",
					75,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{ customer_id: "paddle-customer", provider: "paddle" }
				),
				revenueRow(
					websiteId,
					"stripe-failure",
					45,
					"subscription_event",
					"failed",
					stripeMetadata("attempt", {
						stripe_event_type: "payment_intent.payment_failed",
						stripe_failure_code: "do_not_honor",
						stripe_payment_intent_id: "pi_provider_scope",
					})
				),
			],
		});

		const [paddle] = await revenueOverview(
			websiteId,
			"2026-07-01",
			"2026-08-03",
			[{ field: "provider", op: "eq", value: "paddle" }]
		);
		expect(Number(paddle?.total_revenue)).toBe(75);
		expect(Number(paddle?.total_transactions)).toBe(1);
		expect(Number(paddle?.payment_diagnostics_available)).toBe(0);
		expect(paddle?.failed_payment_attempts).toBeNull();
		expect(paddle?.successful_payment_attempts).toBeNull();
		expect(paddle?.observed_failure_event_types).toBeNull();
		expect(paddle?.required_failure_event_types).toBeNull();

		const [stripe] = await revenueOverview(
			websiteId,
			"2026-07-01",
			"2026-08-03",
			[{ field: "provider", op: "eq", value: "stripe" }]
		);
		expect(Number(stripe?.total_revenue)).toBe(0);
		expect(Number(stripe?.payment_diagnostics_available)).toBe(1);
		expect(Number(stripe?.failed_payment_attempts)).toBe(1);
		expect(Number(stripe?.failed_payment_amount)).toBe(45);
		expect(Number(stripe?.observed_failure_event_types)).toBe(1);
		expect(Number(stripe?.required_failure_event_types)).toBe(2);
		expect(stripe?.top_payment_failure_reason).toBe("do_not_honor");
	}, 10_000);

	it("reconciles invoice fallbacks as exact allocation events arrive", async () => {
		const websiteId = `revenue-invoice-fallback-${randomUUIDv7()}`;
		const invoiceId = `in_${randomUUIDv7()}`;
		const firstPaymentId = `inpay_${randomUUIDv7()}`;
		const secondPaymentId = `inpay_${randomUUIDv7()}`;
		const paymentIntentId = `pi_${randomUUIDv7()}`;
		const at = "2026-08-02 12:00:00";

		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					websiteId,
					paymentIntentId,
					60,
					"sale",
					"completed",
					stripeMetadata("money", {
						stripe_money_kind: "standalone_candidate",
						stripe_payment_intent_id: paymentIntentId,
					}),
					at
				),
				revenueRow(
					websiteId,
					`evt_invoice:${firstPaymentId}`,
					0,
					"subscription_event",
					"linked",
					stripeMetadata("link", {
						stripe_invoice_id: invoiceId,
						stripe_invoice_payment_id: firstPaymentId,
						stripe_payment_intent_id: paymentIntentId,
					}),
					at
				),
				revenueRow(
					websiteId,
					invoiceId,
					100,
					"subscription_event",
					"completed",
					stripeMetadata("money", {
						stripe_invoice_id: invoiceId,
						stripe_money_kind: "invoice_fallback",
					}),
					at
				),
			],
		});

		let [overview] = await revenueOverview(websiteId);
		expect(Number(overview?.total_revenue)).toBe(100);
		expect(Number(overview?.total_transactions)).toBe(1);

		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					websiteId,
					firstPaymentId,
					60,
					"subscription",
					"completed",
					stripeMetadata("money", {
						stripe_invoice_id: invoiceId,
						stripe_invoice_payment_id: firstPaymentId,
						stripe_money_kind: "invoice_payment",
						stripe_payment_intent_id: paymentIntentId,
					}),
					"2026-08-02 12:01:00"
				),
			],
		});

		[overview] = await revenueOverview(websiteId);
		expect(Number(overview?.total_revenue)).toBe(100);
		expect(Number(overview?.total_transactions)).toBe(2);

		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					websiteId,
					secondPaymentId,
					40,
					"subscription",
					"completed",
					stripeMetadata("money", {
						stripe_invoice_id: invoiceId,
						stripe_invoice_payment_id: secondPaymentId,
						stripe_money_kind: "invoice_payment",
					}),
					"2026-08-02 12:02:00"
				),
			],
		});

		await clickHouse.command({
			query: "OPTIMIZE TABLE analytics.revenue PARTITION 202608 FINAL",
		});
		[overview] = await revenueOverview(websiteId);
		expect(Number(overview?.total_revenue)).toBe(100);
		expect(Number(overview?.total_transactions)).toBe(2);
	}, 10_000);

	it("keeps currencies separate and counts retry events without collapsing them", async () => {
		const websiteId = `revenue-currency-${randomUUIDv7()}`;
		const at = "2026-08-02 12:00:00";
		const invoiceSuccessMetadata = stripeMetadata("money", {
			stripe_invoice_id: "in_recovered",
			stripe_invoice_payment_id: "inpay_recovered",
			stripe_money_kind: "invoice_payment",
			stripe_payment_intent_id: "pi_invoice_recovered",
		});
		const retrySuccessMetadata = stripeMetadata("money", {
			stripe_money_kind: "standalone_candidate",
			stripe_payment_intent_id: "pi_retry",
		});
		const retryMetadata = stripeMetadata("attempt", {
			stripe_payment_intent_id: "pi_retry",
		});

		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(websiteId, "pi_legacy", 100, "sale", "completed", "{}", at),
				revenueRow(
					websiteId,
					"in_legacy_same_customer",
					100,
					"subscription",
					"completed",
					"{}",
					at
				),
				revenueRow(
					websiteId,
					"in_legacy_other_customer",
					100,
					"subscription",
					"completed",
					"{}",
					at,
					{ customer_id: "cus_other" }
				),
				revenueRow(
					websiteId,
					"inpay_recovered",
					60,
					"subscription",
					"completed",
					invoiceSuccessMetadata,
					at
				),
				revenueRow(
					websiteId,
					"evt_invoice_failed",
					60,
					"subscription_event",
					"failed",
					stripeMetadata("attempt", {
						stripe_invoice_id: "in_recovered",
					}),
					at
				),
				revenueRow(
					websiteId,
					"evt_invoice_failure_family",
					30,
					"subscription_event",
					"failed",
					stripeMetadata("attempt", {
						stripe_event_type: "invoice.payment_failed",
						stripe_invoice_id: "in_failure_family",
						stripe_payment_intent_id: "pi_failure_family",
					}),
					at
				),
				revenueRow(
					websiteId,
					"evt_pi_failure_family",
					30,
					"subscription_event",
					"failed",
					stripeMetadata("attempt", {
						stripe_event_type: "payment_intent.payment_failed",
						stripe_payment_intent_id: "pi_failure_family",
					}),
					at
				),
				revenueRow(
					websiteId,
					"evt_retry_1",
					40,
					"subscription_event",
					"failed",
					retryMetadata,
					at
				),
				revenueRow(
					websiteId,
					"evt_retry_2",
					40,
					"subscription_event",
					"failed",
					retryMetadata,
					at
				),
				// An immutable redelivery of the same Stripe event is still one attempt.
				revenueRow(
					websiteId,
					"evt_retry_2",
					40,
					"subscription_event",
					"failed",
					retryMetadata,
					at
				),
				revenueRow(
					websiteId,
					"pi_retry",
					40,
					"sale",
					"completed",
					retrySuccessMetadata,
					at
				),
				revenueRow(
					websiteId,
					"pi_eur",
					70,
					"sale",
					"completed",
					stripeMetadata("money", {
						stripe_money_kind: "standalone_candidate",
						stripe_payment_intent_id: "pi_eur",
					}),
					at,
					{
						currency: "EUR",
						original_currency: "EUR",
					}
				),
				revenueRow(
					websiteId,
					"evt_gbp_failed_only",
					25,
					"subscription_event",
					"failed",
					stripeMetadata("attempt", {
						stripe_event_type: "payment_intent.payment_failed",
						stripe_payment_intent_id: "pi_gbp_failed_only",
					}),
					at,
					{
						currency: "GBP",
						original_currency: "GBP",
					}
				),
			],
		});

		const overview = await revenueOverview(websiteId);
		const usd = overview.find((row) => row.currency === "USD");
		const eur = overview.find((row) => row.currency === "EUR");
		const gbp = overview.find((row) => row.currency === "GBP");

		expect(overview).toHaveLength(3);
		expect(Number(usd?.total_revenue)).toBe(300);
		expect(Number(usd?.total_transactions)).toBe(4);
		expect(Number(usd?.failed_payment_attempts)).toBe(4);
		expect(Number(usd?.failed_payment_amount)).toBe(170);
		expect(Number(usd?.recovered_payment_attempts)).toBe(2);
		expect(Number(usd?.successful_payment_attempts)).toBe(2);
		expect(Number(usd?.payment_failure_rate)).toBeCloseTo(66.67, 2);
		expect(Number(eur?.total_revenue)).toBe(70);
		expect(Number(eur?.successful_payment_attempts)).toBe(1);
		expect(Number(gbp?.total_revenue)).toBe(0);
		expect(Number(gbp?.failed_payment_attempts)).toBe(1);
		expect(Number(gbp?.payment_failure_rate)).toBe(100);
		expect(
			await revenueOverview(websiteId, "2026-07-01", "2026-08-03", [
				{ field: "currency", op: "eq", value: "EUR" },
			])
		).toEqual([
			expect.objectContaining({ currency: "EUR", total_revenue: 70 }),
		]);
	});

	it("isolates org-owned invoice attribution by website after FINAL merge", async () => {
		const ownerId = `revenue-owner-${randomUUIDv7()}`;
		const websiteId = `revenue-site-${randomUUIDv7()}`;
		const otherWebsiteId = `revenue-site-${randomUUIDv7()}`;
		const invoiceId = `in_${randomUUIDv7()}`;
		const otherInvoiceId = `in_${randomUUIDv7()}`;
		const paymentId = `inpay_${randomUUIDv7()}`;
		const otherPaymentId = `inpay_${randomUUIDv7()}`;
		const at = "2026-08-02 12:00:00";

		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					ownerId,
					`evt_invoice_${randomUUIDv7()}`,
					0,
					"subscription_event",
					"linked",
					stripeMetadata("link", { stripe_invoice_id: invoiceId }),
					at,
					{
						customer_id: "cus_rich",
						product_name: "Pro plan",
						synced_at: "2026-08-02 12:01:00",
						website_id: websiteId,
					}
				),
				revenueRow(
					ownerId,
					`evt_invoice_${randomUUIDv7()}`,
					0,
					"subscription_event",
					"linked",
					stripeMetadata("link", { stripe_invoice_id: otherInvoiceId }),
					at,
					{ website_id: otherWebsiteId }
				),
			],
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					ownerId,
					paymentId,
					125,
					"subscription",
					"completed",
					stripeMetadata("money", {
						stripe_invoice_id: invoiceId,
						stripe_invoice_payment_id: paymentId,
						stripe_money_kind: "invoice_payment",
						stripe_payment_intent_id: `pi_${randomUUIDv7()}`,
					}),
					at,
					{
						customer_id: "",
						product_name: null,
						synced_at: "2026-08-02 12:05:00",
						website_id: null,
					}
				),
				revenueRow(
					ownerId,
					otherPaymentId,
					75,
					"subscription",
					"completed",
					stripeMetadata("money", {
						stripe_invoice_id: otherInvoiceId,
						stripe_invoice_payment_id: otherPaymentId,
						stripe_money_kind: "invoice_payment",
					}),
					at,
					{ website_id: null }
				),
			],
		});

		await clickHouse.command({
			query: "OPTIMIZE TABLE analytics.revenue PARTITION 202608 FINAL",
		});

		const [overview] = await revenueOverview(
			websiteId,
			"2026-08-01",
			"2026-08-03"
		);
		expect(Number(overview?.total_revenue)).toBe(125);
		expect(Number(overview?.total_transactions)).toBe(1);
		const [organization] = await organizationRevenueOverview(
			ownerId,
			[websiteId, otherWebsiteId],
			"2026-08-01",
			"2026-08-03"
		);
		expect(Number(organization?.total_revenue)).toBe(200);
		expect(Number(organization?.total_transactions)).toBe(2);
		expect(
			await revenueOverview(
				`unrelated-site-${randomUUIDv7()}`,
				"2026-08-01",
				"2026-08-03"
			)
		).toEqual([]);

		const productQuery = RevenueBuilders.revenue_by_product?.customSql?.({
			endDate: "2026-08-03",
			startDate: "2026-08-01",
			websiteId,
		});
		if (!productQuery || typeof productQuery === "string") {
			throw new Error("Revenue by product did not compile");
		}
		const products = await chQuery<{
			customers: number | string;
			name: string;
			revenue: number | string;
			transactions: number | string;
		}>(productQuery.sql, productQuery.params);
		expect(products).toEqual([
			expect.objectContaining({
				customers: 1,
				name: "Pro plan",
				revenue: 125,
				transactions: 1,
			}),
		]);
	}, 15_000);

	it("does not attribute an earlier transaction to a future customer session", async () => {
		const websiteId = `revenue-as-of-${randomUUIDv7()}`;
		const customerId = `customer-${randomUUIDv7()}`;
		const sessionId = `session-${randomUUIDv7()}`;
		const earlierTransactionId = `txn-earlier-${randomUUIDv7()}`;
		const directFutureTransactionId = `txn-direct-future-${randomUUIDv7()}`;
		const laterTransactionId = `txn-later-${randomUUIDv7()}`;

		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				attributionEvent(
					websiteId,
					sessionId,
					"2026-08-02 12:00:00",
					"future-campaign"
				),
			],
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					websiteId,
					earlierTransactionId,
					50,
					"sale",
					"completed",
					"{}",
					"2026-08-01 12:00:00",
					{ customer_id: customerId, provider: "paddle" }
				),
				revenueRow(
					websiteId,
					directFutureTransactionId,
					60,
					"sale",
					"completed",
					"{}",
					"2026-08-01 13:00:00",
					{
						customer_id: customerId,
						provider: "paddle",
						session_id: sessionId,
					}
				),
				revenueRow(
					websiteId,
					laterTransactionId,
					75,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{
						customer_id: customerId,
						provider: "paddle",
						session_id: sessionId,
					}
				),
			],
		});

		const rows = await recentTransactions(
			websiteId,
			"2026-08-01",
			"2026-08-03"
		);
		const earlier = rows.find(
			(row) => row.transaction_id === earlierTransactionId
		);
		const directFuture = rows.find(
			(row) => row.transaction_id === directFutureTransactionId
		);
		const later = rows.find((row) => row.transaction_id === laterTransactionId);

		expect(Number(earlier?.is_attributed)).toBe(0);
		expect(earlier?.utm_campaign).toBe("Unattributed");
		expect(Number(directFuture?.is_attributed)).toBe(0);
		expect(directFuture?.utm_campaign).toBe("Unattributed");
		expect(Number(later?.is_attributed)).toBe(1);
		expect(later?.utm_campaign).toBe("future-campaign");
	});

	it("resolves an exact session event more than 90 days before revenue", async () => {
		const websiteId = `revenue-old-session-${randomUUIDv7()}`;
		const sessionId = `session-${randomUUIDv7()}`;
		const transactionId = `txn-${randomUUIDv7()}`;

		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				attributionEvent(
					websiteId,
					sessionId,
					"2025-12-01 12:00:00",
					"original-campaign"
				),
			],
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					websiteId,
					transactionId,
					100,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{ provider: "paddle", session_id: sessionId }
				),
			],
		});

		const rows = await recentTransactions(
			websiteId,
			"2026-08-01",
			"2026-08-03"
		);
		const transaction = rows.find(
			(row) => row.transaction_id === transactionId
		);

		expect(Number(transaction?.is_attributed)).toBe(1);
		expect(transaction?.utm_campaign).toBe("original-campaign");
	});

	it("does not fill first-touch dimensions from a later session event", async () => {
		const websiteId = `revenue-first-touch-${randomUUIDv7()}`;
		const sessionId = `session-${randomUUIDv7()}`;
		const transactionId = `txn-${randomUUIDv7()}`;

		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				attributionEvent(
					websiteId,
					sessionId,
					"2026-08-01 11:00:00",
					null
				),
				attributionEvent(
					websiteId,
					sessionId,
					"2026-08-02 12:00:00",
					"future-campaign"
				),
			],
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					websiteId,
					transactionId,
					100,
					"sale",
					"completed",
					"{}",
					"2026-08-01 12:00:00",
					{ provider: "paddle", session_id: sessionId }
				),
			],
		});

		const rows = await recentTransactions(
			websiteId,
			"2026-08-01",
			"2026-08-03"
		);
		const transaction = rows.find(
			(row) => row.transaction_id === transactionId
		);

		expect(Number(transaction?.is_attributed)).toBe(1);
		expect(transaction?.utm_campaign).toBe("None");
	});

	it("attributes invoice-only money from its relation context", async () => {
		const organizationId = `organization-${randomUUIDv7()}`;
		const websiteId = `revenue-invoice-context-${randomUUIDv7()}`;
		const sessionId = `session-${randomUUIDv7()}`;
		const anonymousId = `anon-${randomUUIDv7()}`;
		const at = "2026-08-02 12:00:00";

		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				{
					id: randomUUIDv7(),
					client_id: websiteId,
					event_name: "screen_view",
					anonymous_id: anonymousId,
					session_id: sessionId,
					time: at,
					url: "https://example.com/checkout",
					path: "/checkout",
					ip: "127.0.0.1",
					user_agent: "integration-test",
					properties: "{}",
					created_at: at,
				},
			],
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					organizationId,
					"evt_invoice_only_context",
					0,
					"subscription_event",
					"linked",
					stripeMetadata("link", {
						stripe_invoice_id: "in_invoice_only",
					}),
					at,
					{
						anonymous_id: anonymousId,
						customer_id: "",
						session_id: sessionId,
						website_id: websiteId,
					}
				),
				revenueRow(
					organizationId,
					"in_invoice_only",
					125,
					"subscription",
					"completed",
					stripeMetadata("money", {
						stripe_invoice_id: "in_invoice_only",
						stripe_money_kind: "invoice",
					}),
					at,
					{ customer_id: "", website_id: null }
				),
			],
		});

		const query = RevenueBuilders.revenue_attribution_overview?.customSql?.({
			endDate: "2026-08-03",
			startDate: "2026-08-01",
			websiteId,
		});
		if (!query || typeof query === "string") {
			throw new Error("Revenue attribution overview did not compile");
		}
		const rows = await chQuery<{
			name: string;
			revenue: number | string;
			transactions: number | string;
		}>(query.sql, query.params);

		const attributed = rows.find((row) => row.name === "Attributed");
		expect(Number(attributed?.revenue)).toBe(125);
		expect(Number(attributed?.transactions)).toBe(1);
	});

	it("attributes late organization-owned refunds to the website and paying profile", async () => {
		const websiteId = `revenue-refund-${randomUUIDv7()}`;
		const organizationId = `organization-${randomUUIDv7()}`;
		const profileId = `profile-${randomUUIDv7()}`;
		const anonymousId = `anon-${randomUUIDv7()}`;
		const sessionId = `session-${randomUUIDv7()}`;
		const paymentAt = "2026-04-01 12:00:00";
		const refundAt = "2026-08-02 12:00:00";
		const paymentMetadata = stripeMetadata("money", {
			stripe_money_kind: "standalone_candidate",
			stripe_payment_intent_id: "pi_profile_refund",
		});
		const refundMetadata = stripeMetadata("money", {
			stripe_money_kind: "refund",
			stripe_payment_intent_id: "pi_profile_refund",
		});

		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				{
					id: randomUUIDv7(),
					client_id: websiteId,
					event_name: "screen_view",
					anonymous_id: anonymousId,
					profile_id: profileId,
					session_id: sessionId,
					time: refundAt,
					url: "https://example.com/checkout",
					path: "/checkout",
					ip: "127.0.0.1",
					user_agent: "integration-test",
					properties: "{}",
					created_at: refundAt,
				},
			],
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					websiteId,
					"pi_profile_refund",
					100,
					"sale",
					"completed",
					paymentMetadata,
					paymentAt,
					{
						anonymous_id: anonymousId,
						owner_id: organizationId,
						profile_id: profileId,
						session_id: sessionId,
					}
				),
				revenueRow(
					websiteId,
					"re_profile_refund",
					-20,
					"refund",
					"refunded",
					refundMetadata,
					refundAt,
					{
						customer_id: "",
						owner_id: organizationId,
						website_id: null,
					}
				),
			],
		});

		const [overview] = (await revenueOverview(
			websiteId,
			"2026-08-01",
			"2026-08-03"
		)) as {
			refund_amount: number | string;
			refund_count: number | string;
			total_revenue: number | string;
			total_transactions: number | string;
		}[];

		const listQuery = ProfilesBuilders.profile_list?.customSql?.({
			endDate: "2026-08-03",
			startDate: "2026-08-01",
			websiteId,
			limit: 10,
			offset: 0,
		});
		if (!listQuery || typeof listQuery === "string") {
			throw new Error("Profile list did not compile");
		}
		const profiles = await chQuery<{ ltv: number | string; profile_id: string }>(
			listQuery.sql,
			listQuery.params
		);

		const detailQuery = ProfilesBuilders.profile_revenue?.customSql?.({
			endDate: "2026-08-03",
			startDate: "2026-08-01",
			websiteId,
			filters: [{ field: "anonymous_id", op: "eq", value: profileId }],
		});
		if (!detailQuery || typeof detailQuery === "string") {
			throw new Error("Profile revenue did not compile");
		}
		const transactions = await chQuery<{
			amount: number | string;
			transaction_id: string;
		}>(detailQuery.sql, detailQuery.params);

		expect(Number(overview?.total_revenue)).toBe(0);
		expect(Number(overview?.total_transactions)).toBe(0);
		expect(Number(overview?.refund_amount)).toBe(-20);
		expect(Number(overview?.refund_count)).toBe(1);
		expect(
			Number(profiles.find((profile) => profile.profile_id === profileId)?.ltv)
		).toBe(80);
		expect(transactions.map((transaction) => transaction.transaction_id)).toEqual([
			"re_profile_refund",
		]);
	});
});
