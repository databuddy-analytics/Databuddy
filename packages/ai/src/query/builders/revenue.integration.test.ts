import { describe, expect, it } from "bun:test";
import { chQuery, clickHouse } from "@databuddy/db/clickhouse";
import { randomUUIDv7 } from "bun";
import { SimpleQueryBuilder } from "../simple-builder";
import type { Filter } from "../types";
import { ProfilesBuilders } from "./profiles";
import { RevenueBuilders } from "./revenue";

const describeIntegration =
	process.env.CLICKHOUSE_INTEGRATION_TESTS === "true"
		? describe
		: describe.skip;

function stripeMetadata(
	recordKind: "attempt" | "link" | "money",
	extra: Record<string, string> = {}
): string {
	return JSON.stringify({
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
	const query = RevenueBuilders.revenue_overview.customSql({
		endDate,
		startDate,
		websiteId,
		...(filters?.length ? { filters } : {}),
	});
	return chQuery<Record<string, number | string>>(query.sql, query.params);
}

async function organizationRevenueOverview(
	organizationId: string,
	websiteIds: string[],
	startDate = "2026-07-01",
	endDate = "2026-08-03"
): Promise<Record<string, null | number | string>[]> {
	const config = RevenueBuilders.revenue_overview;
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
	const query = RevenueBuilders.recent_transactions.customSql({
		endDate,
		startDate,
		websiteId,
	});
	return chQuery<Record<string, number | string>>(query.sql, query.params);
}

function attributionEvent(
	websiteId: string,
	sessionId: string,
	time: string,
	utmCampaign: string | null,
	overrides: Record<string, unknown> = {}
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
		...overrides,
	};
}

describeIntegration("revenue query builders against ClickHouse", () => {
	it("prefers settled Stripe context over delayed failures and isolates providers", async () => {
		const websiteId = `revenue-context-order-${randomUUIDv7()}`;
		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: ["old", "paid"].map((profile) =>
				attributionEvent(
					websiteId,
					`${profile}-session`,
					"2026-08-01 11:00:00",
					profile,
					{
						profile_id: profile,
					}
				)
			),
		});
		const intent = { stripe_payment_intent_id: "pi_context_example" };
		const invoice = { stripe_invoice_id: "in_context_example" };
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					websiteId,
					"pi_context_example",
					100,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{
						profile_id: "paid",
						session_id: "paid-session",
						product_name: "Paid plan",
					}
				),
				revenueRow(
					websiteId,
					"inpay_context",
					100,
					"subscription",
					"completed",
					stripeMetadata("money", {
						...intent,
						stripe_invoice_id: "in_pi_context",
					})
				),
				revenueRow(
					websiteId,
					"in_context_example:link",
					0,
					"subscription_event",
					"linked",
					stripeMetadata("link", invoice),
					"2026-08-02 12:00:00",
					{
						profile_id: "paid",
						session_id: "paid-session",
					}
				),
				revenueRow(
					websiteId,
					"inpay_invoice_context",
					50,
					"subscription",
					"completed",
					stripeMetadata("money", invoice)
				),
				...[intent, invoice].map((keys, i) =>
					revenueRow(
						websiteId,
						`evt_delayed_failure_${i}`,
						100,
						"subscription_event",
						"failed",
						stripeMetadata("attempt", keys),
						"2026-08-01 12:00:00",
						{
							profile_id: "old",
							session_id: "old-session",
							product_name: "Old plan",
							synced_at: "2026-08-03 12:00:00",
						}
					)
				),
				...[intent, invoice].map((keys, i) =>
					revenueRow(
						websiteId,
						`paddle_copied_context_${i}`,
						75,
						"sale",
						"completed",
						JSON.stringify(keys),
						"2026-08-02 12:00:00",
						{
							provider: "paddle",
							customer_id: "",
						}
					)
				),
			],
		});
		const payments = await recentTransactions(
			websiteId,
			"2026-08-01",
			"2026-08-03"
		);
		expect(
			Object.fromEntries(
				payments.map((row) => [
					row.transaction_id,
					[Number(row.is_attributed), row.utm_campaign],
				])
			)
		).toEqual({
			inpay_context: [1, "paid"],
			inpay_invoice_context: [1, "paid"],
			paddle_copied_context_0: [0, "Unattributed"],
			paddle_copied_context_1: [0, "Unattributed"],
		});
		expect(
			payments.find((row) => row.transaction_id === "inpay_context")
				?.product_name
		).toBe("Paid plan");
		const context = {
			websiteId,
			startDate: "2026-08-01",
			endDate: "2026-08-03",
		};
		const list = ProfilesBuilders.profile_list.customSql(context);
		const profiles = await chQuery<{ profile_id: string; ltv: number }>(
			list.sql,
			list.params
		);
		expect(
			Object.fromEntries(
				profiles.map((row) => [row.profile_id, Number(row.ltv)])
			)
		).toEqual({ old: 0, paid: 150 });
		for (const [profile, expected] of [
			["old", []],
			["paid", ["inpay_context", "inpay_invoice_context"]],
		] as const) {
			const detail = ProfilesBuilders.profile_revenue.customSql({
				...context,
				filters: [{ field: "anonymous_id", op: "eq", value: profile }],
			});
			const rows = await chQuery<{ transaction_id: string }>(
				detail.sql,
				detail.params
			);
			expect(rows.map((row) => row.transaction_id).sort()).toEqual([
				...expected,
			]);
		}
	});

	it("does not assign lifetime receipts through identities first seen after payment", async () => {
		const websiteId = `revenue-profile-time-${randomUUIDv7()}`;
		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				attributionEvent(
					websiteId,
					"reused-session",
					"2026-08-01 11:00:00",
					null,
					{ profile_id: "old-profile", anonymous_id: "reused-device" }
				),
				attributionEvent(
					websiteId,
					"reused-session",
					"2026-08-02 11:00:00",
					null,
					{ profile_id: "new-profile", anonymous_id: "reused-device" }
				),
			],
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					websiteId,
					"old-session-money",
					100,
					"sale",
					"completed",
					"{}",
					"2026-08-01 12:00:00",
					{ session_id: "reused-session", customer_id: "" }
				),
				revenueRow(
					websiteId,
					"old-device-money",
					20,
					"sale",
					"completed",
					"{}",
					"2026-08-01 12:00:00",
					{ anonymous_id: "reused-device", customer_id: "" }
				),
				revenueRow(
					websiteId,
					"explicit-lifetime-money",
					5,
					"sale",
					"completed",
					"{}",
					"2026-08-01 12:00:00",
					{ profile_id: "new-profile", customer_id: "" }
				),
			],
		});
		const query = ProfilesBuilders.profile_list.customSql({
			websiteId,
			startDate: "2026-08-02",
			endDate: "2026-08-02",
		});
		const profiles = await chQuery<{ profile_id: string; ltv: number }>(
			query.sql,
			query.params
		);
		expect(profiles).toEqual([
			expect.objectContaining({ profile_id: "new-profile", ltv: 5 }),
		]);
	});

	it("requires prior anonymous session evidence for profile payment details", async () => {
		const websiteId = `revenue-anonymous-time-${randomUUIDv7()}`;
		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				attributionEvent(
					websiteId,
					"anonymous-session",
					"2026-08-02 12:00:00",
					null
				),
			],
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: ["2026-08-02 11:00:00", "2026-08-02 13:00:00"].map((created, i) =>
				revenueRow(
					websiteId,
					`anonymous-time-${i}`,
					10,
					"sale",
					"completed",
					"{}",
					created,
					{ session_id: "anonymous-session", customer_id: "" }
				)
			),
		});
		const query = ProfilesBuilders.profile_revenue.customSql({
			websiteId,
			startDate: "2026-08-02",
			endDate: "2026-08-02",
			filters: [
				{ field: "anonymous_id", op: "eq", value: "anon-anonymous-session" },
			],
		});
		const payments = await chQuery<{ transaction_id: string }>(
			query.sql,
			query.params
		);
		expect(payments.map((row) => row.transaction_id)).toEqual([
			"anonymous-time-1",
		]);
	});

	it("keeps customer renewal evidence valid only until a second profile appears", async () => {
		const websiteId = `revenue-customer-time-${randomUUIDv7()}`;
		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: ["2026-08-01 11:00:00", "2026-08-03 11:00:00"].map((time, i) =>
				attributionEvent(websiteId, "customer-session", time, `campaign-${i}`, {
					profile_id: `profile-${i}`,
					anonymous_id: "",
				})
			),
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [1, 2, 3].map((day) =>
				revenueRow(
					websiteId,
					`customer-payment-${day}`,
					10,
					"sale",
					"completed",
					"{}",
					`2026-08-0${day} 12:00:00`,
					{
						customer_id: "customer-example",
						session_id: day === 1 ? "customer-session" : null,
					}
				)
			),
		});
		for (const endDate of ["2026-08-02", "2026-08-03"]) {
			const payments = await recentTransactions(
				websiteId,
				"2026-08-02",
				endDate
			);
			expect(
				payments.find((row) => row.transaction_id === "customer-payment-2")
			).toEqual(
				expect.objectContaining({
					is_attributed: 1,
					utm_campaign: "campaign-0",
				})
			);
			if (endDate === "2026-08-03") {
				expect(
					payments.find((row) => row.transaction_id === "customer-payment-3")
				).toEqual(
					expect.objectContaining({
						is_attributed: 0,
						utm_campaign: "Unattributed",
					})
				);
			}
		}
	});

	it("keeps profile lifetime totals in their recorded currency", async () => {
		const websiteId = `revenue-profile-currency-${randomUUIDv7()}`;
		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				"usd-profile",
				"eur-profile",
				"mixed-profile",
				"empty-profile",
			].map((profile_id) =>
				attributionEvent(websiteId, profile_id, "2026-08-01 11:00:00", null, {
					profile_id,
				})
			),
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				["usd-profile", "USD", 100, "completed", "sale"],
				["eur-profile", "EUR", 100, "completed", "sale"],
				["eur-profile", "EUR", -20, "refunded", "refund"],
				["mixed-profile", "USD", 100, "completed", "sale"],
				["mixed-profile", "EUR", 100, "completed", "sale"],
				["usd-profile", "GBP", 500, "failed", "sale"],
				["usd-profile", "EUR", 500, "completed", "subscription_event"],
			].map(([profile_id, currency, amount, status, type], i) =>
				revenueRow(
					websiteId,
					`currency-receipt-${i}`,
					Number(amount),
					String(type),
					String(status),
					"{}",
					"2026-08-02 12:00:00",
					{ profile_id, currency, customer_id: "" }
				)
			),
		});
		const query = ProfilesBuilders.profile_list.customSql({
			websiteId,
			startDate: "2026-08-01",
			endDate: "2026-08-03",
		});
		const profiles = await chQuery<{
			profile_id: string;
			ltv: number | null;
			ltv_currency: string;
		}>(query.sql, query.params);
		expect(
			Object.fromEntries(
				profiles.map((row) => [row.profile_id, [row.ltv, row.ltv_currency]])
			)
		).toEqual({
			"usd-profile": [100, "USD"],
			"eur-profile": [80, "EUR"],
			"mixed-profile": [null, ""],
			"empty-profile": [0, ""],
		});
	});

	it("leaves an intent-only refund unassigned when its invoice allocation is ambiguous", async () => {
		const ownerId = `organization-${randomUUIDv7()}`;
		const defaultWebsite = `${ownerId}-default`;
		const websites = [defaultWebsite, `${ownerId}-first`, `${ownerId}-second`];
		const intent = { stripe_payment_intent_id: "pi_multiple_invoices" };
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				...websites.slice(1).map((websiteId, i) =>
					revenueRow(
						websiteId,
						`inpay_allocation_${i}`,
						100,
						"subscription",
						"completed",
						stripeMetadata("money", {
							...intent,
							stripe_invoice_id: `in_allocation_${i}`,
							stripe_event_type: "invoice_payment.paid",
							client_id: websiteId,
						}),
						"2026-08-02 12:00:00",
						{ owner_id: ownerId }
					)
				),
				revenueRow(
					defaultWebsite,
					"ambiguous-refund",
					-5,
					"refund",
					"refunded",
					stripeMetadata("money", {
						...intent,
						stripe_event_type: "charge.refunded",
					}),
					"2026-08-02 13:00:00",
					{ owner_id: ownerId }
				),
			],
		});
		const [organization] = await organizationRevenueOverview(ownerId, websites);
		expect(Number(organization?.total_revenue)).toBe(200);
		expect(Number(organization?.refund_amount)).toBe(-5);
		for (const websiteId of websites) {
			const [website] = await revenueOverview(websiteId);
			expect(Number(website?.refund_amount ?? 0)).toBe(0);
		}
	}, 15_000);

	it("keeps earlier attribution stable when a session later changes profiles or salt", async () => {
		const websiteId = `revenue-temporal-${randomUUIDv7()}`;
		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				attributionEvent(
					websiteId,
					"shared-session",
					"2026-08-01 11:00:00",
					"first-person",
					{
						profile_id: "first-profile",
						anonymous_id: "salt-first-day",
					}
				),
				attributionEvent(
					websiteId,
					"shared-session",
					"2026-08-02 11:00:00",
					"second-person",
					{
						profile_id: "second-profile",
						anonymous_id: "salt-second-day",
					}
				),
			],
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					websiteId,
					"earlier-payment",
					10,
					"sale",
					"completed",
					"{}",
					"2026-08-01 12:00:00",
					{
						session_id: "shared-session",
						anonymous_id: "salt-next-day",
						customer_id: "",
					}
				),
				revenueRow(
					websiteId,
					"ambiguous-payment",
					20,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{ session_id: "shared-session", customer_id: "" }
				),
				revenueRow(
					websiteId,
					"identified-payment",
					30,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{
						session_id: "shared-session",
						profile_id: "second-profile",
						customer_id: "",
					}
				),
			],
		});
		const earlier = await revenueOverview(
			websiteId,
			"2026-08-01",
			"2026-08-01"
		);
		expect(Number(earlier[0]?.attributed_revenue)).toBe(10);
		const wider = await revenueOverview(websiteId, "2026-08-01", "2026-08-02");
		expect(Number(wider[0]?.total_revenue)).toBe(60);
		expect(Number(wider[0]?.attributed_revenue)).toBe(40);
		const transactions = await recentTransactions(
			websiteId,
			"2026-08-01",
			"2026-08-02"
		);
		expect(
			Object.fromEntries(
				transactions.map((row) => [
					row.transaction_id,
					[Number(row.is_attributed), row.utm_campaign],
				])
			)
		).toEqual({
			"earlier-payment": [1, "first-person"],
			"ambiguous-payment": [0, "Unattributed"],
			"identified-payment": [1, "second-person"],
		});
		const detail = ProfilesBuilders.profile_revenue.customSql({
			websiteId,
			startDate: "2026-08-01",
			endDate: "2026-08-02",
			filters: [{ field: "anonymous_id", op: "eq", value: "first-profile" }],
		});
		const payments = await chQuery<{ transaction_id: string }>(
			detail.sql,
			detail.params
		);
		expect(payments.map((row) => row.transaction_id)).toEqual([]);
	}, 15_000);

	it("counts an invoice-tagged standalone intent and resolves conflicting websites once", async () => {
		const ownerId = `organization-${randomUUIDv7()}`;
		const websiteA = `revenue-site-a-${randomUUIDv7()}`;
		const websiteB = `revenue-site-b-${randomUUIDv7()}`;
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					websiteA,
					"pi_standalone",
					100,
					"sale",
					"completed",
					stripeMetadata("money", {
						stripe_invoice_id: "in_standalone",
						stripe_payment_intent_id: "pi_standalone",
					}),
					"2026-08-02 12:00:00",
					{ owner_id: ownerId, profile_id: "site-profile" }
				),
				revenueRow(
					websiteA,
					"pi_conflicting",
					50,
					"sale",
					"completed",
					stripeMetadata("money", {
						stripe_payment_intent_id: "pi_conflicting",
					}),
					"2026-08-02 12:00:00",
					{
						owner_id: ownerId,
						profile_id: "site-profile",
						synced_at: "2026-08-02 13:00:00",
					}
				),
				revenueRow(
					websiteB,
					"inpay_conflicting",
					50,
					"subscription",
					"completed",
					stripeMetadata("money", {
						stripe_invoice_id: "in_conflicting",
						stripe_payment_intent_id: "pi_conflicting",
					}),
					"2026-08-02 12:00:00",
					{ owner_id: ownerId, profile_id: "site-profile" }
				),
				...[true, false].map((withIntent) =>
					revenueRow(
						websiteB,
						withIntent ? "intent-refund" : "invoice-only-refund",
						-10,
						"refund",
						"refunded",
						stripeMetadata("money", {
							stripe_invoice_id: "in_conflicting",
							...(withIntent
								? { stripe_payment_intent_id: "pi_conflicting" }
								: {}),
						}),
						"2026-08-02 13:00:00",
						{ owner_id: ownerId, website_id: null }
					)
				),
			],
		});
		const a = await revenueOverview(websiteA, "2026-08-02", "2026-08-02");
		const b = await revenueOverview(websiteB, "2026-08-02", "2026-08-02");
		expect(Number(a[0]?.total_revenue)).toBe(100);
		expect(Number(b[0]?.total_revenue)).toBe(50);
		expect(Number(a[0]?.refund_amount ?? 0)).toBe(0);
		expect(Number(b[0]?.refund_amount)).toBe(-20);
		const detail = ProfilesBuilders.profile_revenue.customSql({
			websiteId: websiteA,
			startDate: "2026-08-02",
			endDate: "2026-08-02",
			filters: [{ field: "anonymous_id", op: "eq", value: "site-profile" }],
		});
		const payments = await chQuery<{ transaction_id: string }>(
			detail.sql,
			detail.params
		);
		expect(payments.map((row) => row.transaction_id)).toEqual([
			"pi_standalone",
		]);
	});

	it("keeps organization receipts without a website in unattributed gross revenue", async () => {
		const ownerId = `organization-${randomUUIDv7()}`;
		const websiteId = `revenue-unassigned-${randomUUIDv7()}`;
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					websiteId,
					"unassigned-payment",
					100,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{ owner_id: ownerId, website_id: null }
				),
			],
		});
		const overview = await organizationRevenueOverview(
			ownerId,
			[websiteId],
			"2026-08-02",
			"2026-08-02"
		);
		expect(Number(overview[0]?.total_revenue)).toBe(100);
		expect(Number(overview[0]?.attributed_revenue)).toBe(0);
		const site = await revenueOverview(websiteId, "2026-08-02", "2026-08-02");
		expect(Number(site[0]?.total_revenue ?? 0)).toBe(0);
	});

	it("resolves an invoice-only refund from exact context older than 90 days", async () => {
		const ownerId = `organization-${randomUUIDv7()}`;
		const websiteId = `revenue-old-invoice-${randomUUIDv7()}`;
		const metadata = { stripe_invoice_id: "invoice-without-intent" };
		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				attributionEvent(
					websiteId,
					"old-session",
					"2026-05-01 11:00:00",
					"original-source"
				),
			],
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					websiteId,
					"invoice-without-intent:link",
					0,
					"subscription_event",
					"linked",
					stripeMetadata("link", metadata),
					"2026-05-01 12:00:00",
					{ owner_id: ownerId, session_id: "old-session" }
				),
				revenueRow(
					websiteId,
					"old-invoice-refund",
					-20,
					"refund",
					"refunded",
					stripeMetadata("money", metadata),
					"2026-08-02 12:00:00",
					{ owner_id: ownerId, website_id: null }
				),
			],
		});
		const overview = await revenueOverview(
			websiteId,
			"2026-08-02",
			"2026-08-02"
		);
		expect(Number(overview[0]?.refund_amount)).toBe(-20);
		const query = RevenueBuilders.revenue_by_utm_campaign.customSql({
			websiteId,
			startDate: "2026-08-02",
			endDate: "2026-08-02",
		});
		const campaigns = await chQuery<{ name: string }>(query.sql, query.params);
		expect(campaigns.map((row) => row.name)).toEqual(["original-source"]);
	});

	it("matches tracked identities without crediting future or conflicting visits", async () => {
		const websiteId = `revenue-identities-${randomUUIDv7()}`;
		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				attributionEvent(
					websiteId,
					"profile-session",
					"2026-08-02 11:00:00",
					"profile",
					{ profile_id: "profile-example" }
				),
				attributionEvent(
					websiteId,
					"anonymous-session",
					"2026-08-02 11:00:00",
					"anonymous"
				),
				attributionEvent(
					websiteId,
					"future-session",
					"2026-08-02 13:00:00",
					"future",
					{ profile_id: "future-profile" }
				),
				attributionEvent(
					websiteId,
					"shared-session",
					"2026-08-02 10:00:00",
					"wrong-person",
					{ profile_id: "other-profile" }
				),
				attributionEvent(
					websiteId,
					"shared-session",
					"2026-08-02 11:00:00",
					"right-person",
					{ profile_id: "right-profile" }
				),
			],
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					websiteId,
					"profile-invoice:link",
					0,
					"subscription_event",
					"linked",
					stripeMetadata("link", { stripe_invoice_id: "profile-invoice" }),
					"2026-08-02 12:00:00",
					{ profile_id: "profile-example", customer_id: "" }
				),
				revenueRow(
					websiteId,
					"profile-payment",
					40,
					"subscription",
					"completed",
					stripeMetadata("money", { stripe_invoice_id: "profile-invoice" }),
					"2026-08-02 12:00:00",
					{ customer_id: "" }
				),
				revenueRow(
					websiteId,
					"anonymous-payment",
					30,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{ anonymous_id: "anon-anonymous-session", customer_id: "" }
				),
				revenueRow(
					websiteId,
					"unknown-payment",
					20,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{ profile_id: "untracked-profile", customer_id: "" }
				),
				revenueRow(
					websiteId,
					"future-payment",
					10,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{ profile_id: "future-profile", customer_id: "" }
				),
				revenueRow(
					websiteId,
					"shared-payment",
					15,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{
						profile_id: "right-profile",
						session_id: "shared-session",
						customer_id: "",
					}
				),
			],
		});
		const [overview] = await revenueOverview(
			websiteId,
			"2026-08-02",
			"2026-08-02"
		);
		expect(Number(overview?.total_revenue)).toBe(115);
		expect(Number(overview?.attributed_revenue)).toBe(85);
		const transactions = await recentTransactions(
			websiteId,
			"2026-08-02",
			"2026-08-02"
		);
		expect(
			Object.fromEntries(
				transactions.map((row) => [
					row.transaction_id,
					Number(row.is_attributed),
				])
			)
		).toEqual({
			"profile-payment": 1,
			"anonymous-payment": 1,
			"shared-payment": 1,
			"unknown-payment": 0,
			"future-payment": 0,
		});
		expect(
			transactions.find((row) => row.transaction_id === "shared-payment")
				?.utm_campaign
		).toBe("right-person");
	});

	it("uses the first valid current customer session independently of report start", async () => {
		const websiteId = `revenue-customer-history-${randomUUIDv7()}`;
		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				attributionEvent(
					websiteId,
					"obsolete-session",
					"2026-05-02 10:00:00",
					"obsolete"
				),
				attributionEvent(
					websiteId,
					"valid-session",
					"2026-06-01 10:00:00",
					"valid-history"
				),
			],
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					websiteId,
					"missing-seed",
					0,
					"subscription_event",
					"failed",
					"{}",
					"2026-05-01 12:00:00",
					{ session_id: "missing-session" }
				),
				revenueRow(
					websiteId,
					"corrected-seed",
					0,
					"subscription_event",
					"failed",
					"{}",
					"2026-05-02 12:00:00",
					{ session_id: "obsolete-session" }
				),
				revenueRow(
					websiteId,
					"corrected-seed",
					0,
					"subscription_event",
					"failed",
					"{}",
					"2026-05-02 12:00:00",
					{ session_id: null, synced_at: "2026-05-02 13:00:00" }
				),
				revenueRow(
					websiteId,
					"valid-seed",
					0,
					"subscription_event",
					"failed",
					"{}",
					"2026-06-01 12:00:00",
					{ session_id: "valid-session" }
				),
				revenueRow(
					websiteId,
					"renewal",
					50,
					"subscription",
					"completed",
					"{}",
					"2026-09-02 12:00:00"
				),
			],
		});
		for (const start of ["2026-08-01", "2026-09-02"]) {
			const [overview] = await revenueOverview(websiteId, start, "2026-09-02");
			expect(Number(overview?.attributed_revenue)).toBe(50);
			const transactions = await recentTransactions(
				websiteId,
				start,
				"2026-09-02"
			);
			expect(
				transactions.find((row) => row.transaction_id === "renewal")
					?.utm_campaign
			).toBe("valid-history");
		}
	}, 15_000);

	it("keeps tracked sessions inside their website in organization reports", async () => {
		const ownerId = `revenue-scope-owner-${randomUUIDv7()}`;
		const siteA = `revenue-scope-a-${randomUUIDv7()}`;
		const siteB = `revenue-scope-b-${randomUUIDv7()}`;
		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				attributionEvent(
					siteA,
					"shared-session",
					"2026-08-02 11:00:00",
					"site-a"
				),
			],
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					ownerId,
					"site-a-payment",
					25,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{ website_id: siteA, session_id: "shared-session" }
				),
				revenueRow(
					ownerId,
					"site-b-payment",
					25,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{ website_id: siteB, session_id: "shared-session" }
				),
			],
		});
		const [organization] = await organizationRevenueOverview(
			ownerId,
			[siteA, siteB],
			"2026-08-02",
			"2026-08-02"
		);
		expect(Number(organization?.total_revenue)).toBe(50);
		expect(Number(organization?.attributed_revenue)).toBe(25);
		const [site] = await revenueOverview(siteB, "2026-08-02", "2026-08-02");
		expect(Number(site?.attributed_revenue)).toBe(0);
	});

	it("reconciles canonical payments and anonymous or session-only profile revenue across date windows", async () => {
		const websiteId = `revenue-profile-parity-${randomUUIDv7()}`;
		const profileId = "profile-example";
		const metadata = stripeMetadata("money", {
			stripe_payment_intent_id: "pi_example",
			stripe_invoice_id: "in_example",
		});
		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				{
					...attributionEvent(
						websiteId,
						"profile-session",
						"2026-08-01 11:00:00",
						null
					),
					profile_id: profileId,
				},
			],
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					websiteId,
					"pi_example",
					100,
					"sale",
					"completed",
					stripeMetadata("money", { stripe_payment_intent_id: "pi_example" }),
					"2026-08-01 12:00:00",
					{ profile_id: profileId }
				),
				revenueRow(
					websiteId,
					"inpay_example",
					100,
					"subscription",
					"completed",
					metadata,
					"2026-08-02 12:00:00"
				),
				revenueRow(
					websiteId,
					"session-only",
					25,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{ session_id: "profile-session", customer_id: "" }
				),
				revenueRow(
					websiteId,
					"anonymous-only",
					15,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{ anonymous_id: "anon-profile-session", customer_id: "" }
				),
				revenueRow(
					websiteId,
					"refund-example",
					-20,
					"refund",
					"refunded",
					metadata,
					"2026-08-02 13:00:00"
				),
			],
		});
		const [overview] = await revenueOverview(
			websiteId,
			"2026-08-01",
			"2026-08-03"
		);
		expect(Number(overview?.total_revenue)).toBe(140);
		const earlier = await revenueOverview(
			websiteId,
			"2026-08-01",
			"2026-08-01"
		);
		expect(Number(earlier[0]?.total_revenue ?? 0)).toBe(0);
		const list = ProfilesBuilders.profile_list.customSql({
			websiteId,
			startDate: "2026-08-01",
			endDate: "2026-08-03",
			limit: 10,
			offset: 0,
		});
		const profiles = await chQuery<{ profile_id: string; ltv: number }>(
			list.sql,
			list.params
		);
		expect(
			Number(profiles.find((profile) => profile.profile_id === profileId)?.ltv)
		).toBe(120);
		const detail = ProfilesBuilders.profile_revenue.customSql({
			websiteId,
			startDate: "2026-08-01",
			endDate: "2026-08-03",
			filters: [{ field: "anonymous_id", op: "eq", value: profileId }],
		});
		const payments = await chQuery<{ transaction_id: string }>(
			detail.sql,
			detail.params
		);
		expect(payments.map((payment) => payment.transaction_id).sort()).toEqual([
			"anonymous-only",
			"inpay_example",
			"refund-example",
			"session-only",
		]);
	}, 15_000);

	it("assigns anonymous receipts only to an unambiguous profile", async () => {
		const websiteId = `revenue-anonymous-parity-${randomUUIDv7()}`;
		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				["profile-a", "unique-device"],
				["profile-a", "shared-device"],
				["profile-b", "shared-device"],
			].map(([profileId, anonymousId]) =>
				attributionEvent(
					websiteId,
					`${profileId}-${anonymousId}`,
					"2026-08-01 11:00:00",
					null,
					{
						profile_id: profileId,
						anonymous_id: anonymousId,
					}
				)
			),
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					websiteId,
					"unique-receipt",
					10,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{ anonymous_id: "unique-device", customer_id: "" }
				),
				revenueRow(
					websiteId,
					"ambiguous-receipt",
					20,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{ anonymous_id: "shared-device", customer_id: "" }
				),
				revenueRow(
					websiteId,
					"identified-receipt",
					30,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{
						profile_id: "profile-a",
						anonymous_id: "shared-device",
						customer_id: "",
					}
				),
				revenueRow(
					websiteId,
					"session-receipt",
					5,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{
						anonymous_id: "shared-device",
						session_id: "profile-a-shared-device",
						customer_id: "",
					}
				),
				revenueRow(
					websiteId,
					"stale-device-receipt",
					5,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{
						anonymous_id: "stale-device",
						session_id: "profile-a-shared-device",
						customer_id: "",
					}
				),
			],
		});
		const [overview] = await revenueOverview(websiteId);
		expect(Number(overview?.total_revenue)).toBe(70);
		expect(Number(overview?.attributed_revenue)).toBe(50);
		const context = {
			websiteId,
			startDate: "2026-08-01",
			endDate: "2026-08-03",
		};
		const list = ProfilesBuilders.profile_list.customSql(context);
		const profiles = await chQuery<{ profile_id: string; ltv: number }>(
			list.sql,
			list.params
		);
		expect(
			Object.fromEntries(
				profiles.map((profile) => [profile.profile_id, Number(profile.ltv)])
			)
		).toEqual({ "profile-a": 50, "profile-b": 0 });
		for (const [profileId, expected] of [
			[
				"profile-a",
				[
					"identified-receipt",
					"session-receipt",
					"stale-device-receipt",
					"unique-receipt",
				],
			],
			["profile-b", []],
		] as const) {
			const detail = ProfilesBuilders.profile_revenue.customSql({
				...context,
				filters: [{ field: "anonymous_id", op: "eq", value: profileId }],
			});
			const payments = await chQuery<{ transaction_id: string }>(
				detail.sql,
				detail.params
			);
			expect(payments.map((payment) => payment.transaction_id).sort()).toEqual([
				...expected,
			]);
		}
	});

	it("preserves null-ID payment descriptions and excludes identified receipts with the same label", async () => {
		const websiteId = `revenue-descriptions-${randomUUIDv7()}`;
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					websiteId,
					"team-a",
					100,
					"sale",
					"completed",
					"{}",
					"2026-08-01 12:00:00",
					{ product_id: null, product_name: "Team" }
				),
				revenueRow(
					websiteId,
					"team-b",
					200,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{ product_id: null, product_name: "Team" }
				),
				revenueRow(
					websiteId,
					"solo",
					400,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{ product_id: null, product_name: "Solo" }
				),
				revenueRow(
					websiteId,
					"refund",
					-50,
					"refund",
					"refunded",
					"{}",
					"2026-08-02 12:00:00",
					{ product_id: null, product_name: "Refund" }
				),
				revenueRow(
					websiteId,
					"identified",
					700,
					"sale",
					"completed",
					"{}",
					"2026-08-02 12:00:00",
					{ product_id: "identified-team", product_name: "Team" }
				),
			],
		});
		const query = new SimpleQueryBuilder(RevenueBuilders.revenue_by_product, {
			projectId: websiteId,
			type: "revenue_by_product",
			from: "2026-08-01",
			to: "2026-08-03",
			limit: 20,
		}).compile();
		const groups = await chQuery<Record<string, unknown>>(
			query.sql,
			query.params
		);
		expect(groups).toHaveLength(3);
		expect(groups).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					provider: "stripe",
					product_id: null,
					name: "Team",
					revenue: 300,
					transactions: 2,
				}),
				expect.objectContaining({
					provider: "stripe",
					product_id: null,
					name: "Solo",
					revenue: 400,
					transactions: 1,
				}),
				expect.objectContaining({
					provider: "stripe",
					product_id: "identified-team",
					name: "Team",
					revenue: 700,
					transactions: 1,
				}),
			])
		);
		const filters: Filter[] = [
			{ field: "currency", op: "eq", value: "USD" },
			{ field: "provider", op: "eq", value: "stripe" },
			{ field: "product_name", op: "eq", value: "Team" },
			{ field: "product_id", op: "eq", value: "" },
		];
		const [measured] = await revenueOverview(
			websiteId,
			"2026-08-01",
			"2026-08-03",
			filters
		);
		expect(measured).toMatchObject({
			total_revenue: 300,
			refund_amount: 0,
			payment_diagnostics_available: 0,
		});
		const [all] = await revenueOverview(websiteId, "2026-08-01", "2026-08-03");
		expect(all).toMatchObject({ total_revenue: 1400, refund_amount: -50 });
		expect(
			await revenueOverview(websiteId, "2026-08-01", "2026-08-03", [
				...filters.slice(0, 2),
				{ field: "product_name", op: "eq", value: "absent" },
				...filters.slice(3),
			])
		).toEqual([]);
	}, 15_000);

	it("counts canonical Stripe records and keeps payment diagnostics separate", async () => {
		const websiteId = `revenue-cutover-${randomUUIDv7()}`;
		const cutoverRevenueRow = (
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
				cutoverRevenueRow(
					"pi_standalone",
					40,
					"sale",
					"completed",
					stripeMetadata("money", {
						stripe_payment_intent_id: "pi_standalone",
					})
				),
				cutoverRevenueRow(
					"pi_invoice_a",
					120,
					"sale",
					"completed",
					stripeMetadata("money", {
						stripe_payment_intent_id: "pi_invoice_a",
					})
				),
				cutoverRevenueRow(
					"pi_invoice_b",
					80,
					"sale",
					"completed",
					stripeMetadata("money", {
						stripe_payment_intent_id: "pi_invoice_b",
					})
				),
				cutoverRevenueRow(
					"inpay_a",
					120,
					"subscription",
					"completed",
					stripeMetadata("money", {
						stripe_invoice_id: "in_modern",
						stripe_payment_intent_id: "pi_invoice_a",
					})
				),
				cutoverRevenueRow(
					"inpay_b",
					80,
					"subscription",
					"completed",
					stripeMetadata("money", {
						stripe_invoice_id: "in_modern",
						stripe_payment_intent_id: "pi_invoice_b",
					})
				),
				cutoverRevenueRow(
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
				cutoverRevenueRow(
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
				cutoverRevenueRow(
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
				cutoverRevenueRow(
					"pi_recovered",
					50,
					"sale",
					"completed",
					stripeMetadata("money", {
						stripe_payment_intent_id: "pi_recovered",
					})
				),
				cutoverRevenueRow(
					"re_recovered_partial",
					-10,
					"refund",
					"refunded",
					stripeMetadata("money", {
						stripe_payment_intent_id: "pi_recovered",
					}),
					"2026-08-03 13:00:00"
				),
			],
		});
		const [overview] = await revenueOverview(websiteId);

		expect(Number(overview?.total_revenue)).toBe(290);
		expect(Number(overview?.total_transactions)).toBe(4);
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

	it("counts a canonical modern payment once across invoice event deliveries", async () => {
		const websiteId = `revenue-canonical-${randomUUIDv7()}`;
		const at = "2026-08-02 12:00:00";

		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					websiteId,
					"pi_modern",
					60,
					"sale",
					"completed",
					stripeMetadata("money", {
						stripe_payment_intent_id: "pi_modern",
					}),
					at
				),
				revenueRow(
					websiteId,
					"inpay_modern",
					60,
					"subscription",
					"completed",
					stripeMetadata("money", {
						stripe_invoice_id: "in_modern",
						stripe_payment_intent_id: "pi_modern",
					}),
					at
				),
				revenueRow(
					websiteId,
					"in_modern:out_of_band",
					40,
					"subscription",
					"completed",
					stripeMetadata("money", {
						stripe_invoice_id: "in_modern",
					}),
					at
				),
			],
		});

		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					websiteId,
					"inpay_modern",
					60,
					"subscription",
					"completed",
					stripeMetadata("money", {
						stripe_invoice_id: "in_modern",
						stripe_payment_intent_id: "pi_modern",
						stripe_event_type: "invoice_payment.paid",
					}),
					at,
					{ synced_at: "2026-08-02 12:01:00" }
				),
			],
		});

		const [overview] = await revenueOverview(websiteId);
		expect(Number(overview?.total_revenue)).toBe(100);
		expect(Number(overview?.total_transactions)).toBe(2);
	}, 10_000);

	it("keeps currencies separate and counts retry events without collapsing them", async () => {
		const websiteId = `revenue-currency-${randomUUIDv7()}`;
		const at = "2026-08-02 12:00:00";
		const invoiceSuccessMetadata = stripeMetadata("money", {
			stripe_invoice_id: "in_recovered",
			stripe_payment_intent_id: "pi_invoice_recovered",
		});
		const retrySuccessMetadata = stripeMetadata("money", {
			stripe_payment_intent_id: "pi_retry",
		});
		const retryMetadata = stripeMetadata("attempt", {
			stripe_payment_intent_id: "pi_retry",
		});

		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
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
					"inpay_jpy",
					70,
					"subscription",
					"completed",
					"{}",
					at,
					{
						currency: "JPY",
						original_currency: "JPY",
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

		expect(overview).toHaveLength(4);
		expect(Number(usd?.total_revenue)).toBe(100);
		expect(Number(usd?.total_transactions)).toBe(2);
		expect(Number(usd?.failed_payment_attempts)).toBe(4);
		expect(Number(usd?.failed_payment_amount)).toBe(170);
		expect(Number(usd?.recovered_payment_attempts)).toBe(2);
		expect(Number(usd?.successful_payment_attempts)).toBe(2);
		expect(Number(usd?.payment_failure_rate)).toBeCloseTo(66.67, 2);
		expect(Number(eur?.total_revenue)).toBe(70);
		expect(Number(eur?.successful_payment_attempts)).toBe(1);
		const jpy = overview.find((row) => row.currency === "JPY");
		expect(Number(jpy?.total_revenue)).toBe(70);
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
		const paymentIntentId = `pi_${randomUUIDv7()}`;
		const otherPaymentIntentId = `pi_${randomUUIDv7()}`;
		const paymentId = `inpay_${randomUUIDv7()}`;
		const otherPaymentId = `inpay_${randomUUIDv7()}`;
		const at = "2026-08-02 12:00:00";

		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					ownerId,
					paymentIntentId,
					125,
					"sale",
					"completed",
					stripeMetadata("money", {
						stripe_payment_intent_id: paymentIntentId,
					}),
					at,
					{
						customer_id: "cus_rich",
						product_name: "Pro plan",
						website_id: websiteId,
					}
				),
				revenueRow(
					ownerId,
					otherPaymentIntentId,
					75,
					"sale",
					"completed",
					stripeMetadata("money", {
						stripe_payment_intent_id: otherPaymentIntentId,
					}),
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
						stripe_payment_intent_id: paymentIntentId,
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
						stripe_payment_intent_id: otherPaymentIntentId,
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

		const productQuery = RevenueBuilders.revenue_by_product.customSql({
			endDate: "2026-08-03",
			startDate: "2026-08-01",
			websiteId,
		});
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

	it("keeps first-touch dimensions coherent on timestamp ties and missing values", async () => {
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
					"tied-campaign",
					{
						id: "00000000-0000-4000-8000-000000000002",
						country: "US",
						browser_name: "Chrome",
						device_type: "desktop",
						referrer: "https://other.example.com",
					}
				),
				attributionEvent(websiteId, sessionId, "2026-08-01 11:00:00", null, {
					id: "00000000-0000-4000-8000-000000000001",
					country: null,
					browser_name: "Firefox",
					device_type: "mobile",
					referrer: "https://first.example.com",
				}),
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
		expect(transaction).toMatchObject({
			country: "Unknown",
			browser_name: "Firefox",
			device_type: "mobile",
			referrer: "first.example.com",
		});
	});

	it("attributes invoice-only money from its direct session context", async () => {
		const organizationId = `organization-${randomUUIDv7()}`;
		const websiteId = `revenue-invoice-context-${randomUUIDv7()}`;
		const sessionId = `session-${randomUUIDv7()}`;
		const anonymousId = `anon-${randomUUIDv7()}`;
		const at = "2026-08-02 12:00:00";

		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				attributionEvent(websiteId, sessionId, at, null, {
					anonymous_id: anonymousId,
				}),
			],
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					organizationId,
					"in_invoice_only",
					125,
					"subscription",
					"completed",
					stripeMetadata("money", {
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
			],
		});

		const query = RevenueBuilders.revenue_attribution_overview.customSql({
			endDate: "2026-08-03",
			startDate: "2026-08-01",
			websiteId,
		});
		const rows = await chQuery<{
			name: string;
			revenue: number | string;
			transactions: number | string;
		}>(query.sql, query.params);

		const attributed = rows.find((row) => row.name === "Attributed");
		expect(Number(attributed?.revenue)).toBe(125);
		expect(Number(attributed?.transactions)).toBe(1);
	});

	it("keeps customer first-touch dimensions when a historical invoice supplies the website", async () => {
		const organizationId = `organization-${randomUUIDv7()}`;
		const websiteId = `revenue-customer-dims-${randomUUIDv7()}`;
		const sessionId = `session-${randomUUIDv7()}`;
		const customerId = `cus-${randomUUIDv7()}`;
		const seededAt = "2026-08-01 12:00:00";
		const renewalAt = "2026-08-02 12:00:00";

		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				attributionEvent(websiteId, sessionId, "2026-08-01 11:00:00", null, {
					anonymous_id: "",
					url: "https://example.com/pricing",
					path: "/pricing",
					country: "DE",
					browser_name: "Chrome",
					device_type: "desktop",
					referrer: "https://partner.example/launch",
				}),
			],
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					organizationId,
					"pi_seed_session",
					10,
					"sale",
					"completed",
					stripeMetadata("money"),
					seededAt,
					{
						customer_id: customerId,
						session_id: sessionId,
						website_id: null,
					}
				),
				revenueRow(
					organizationId,
					"inpay_seed",
					10,
					"subscription",
					"completed",
					stripeMetadata("money", {
						stripe_payment_intent_id: "pi_seed_session",
						stripe_invoice_id: "in_seed",
					}),
					seededAt,
					{ customer_id: "", website_id: websiteId }
				),
				revenueRow(
					organizationId,
					"inpay_renewal",
					20,
					"subscription",
					"completed",
					stripeMetadata("money", { stripe_invoice_id: "in_renewal" }),
					renewalAt,
					{
						customer_id: customerId,
						session_id: null,
						website_id: websiteId,
					}
				),
			],
		});

		const query = RevenueBuilders.revenue_by_country.customSql({
			endDate: "2026-08-03",
			startDate: "2026-08-01",
			websiteId,
		});
		const rows = await chQuery<{ name: string; transactions: number | string }>(
			query.sql,
			query.params
		);

		expect(rows.find((row) => row.name === "Unknown")).toBeUndefined();
		expect(Number(rows.find((row) => row.name === "DE")?.transactions)).toBe(2);
		const [renewal] = await revenueOverview(
			websiteId,
			"2026-08-02",
			"2026-08-02"
		);
		expect(Number(renewal?.total_revenue)).toBe(20);
		expect(Number(renewal?.attributed_revenue)).toBe(20);
		const [wider] = await revenueOverview(
			websiteId,
			"2026-08-01",
			"2026-08-03"
		);
		expect(Number(wider?.total_revenue)).toBe(30);
		expect(Number(wider?.attributed_revenue)).toBe(30);
	});

	it("attributes invoice payment money from the invoice link record", async () => {
		const organizationId = `organization-${randomUUIDv7()}`;
		const websiteId = `revenue-invoice-link-${randomUUIDv7()}`;
		const sessionId = `session-${randomUUIDv7()}`;
		const anonymousId = `anon-${randomUUIDv7()}`;
		const at = "2026-08-02 12:00:00";

		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				attributionEvent(websiteId, sessionId, "2026-08-02 11:00:00", null, {
					anonymous_id: anonymousId,
					country: "FR",
				}),
			],
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					organizationId,
					"in_linked:link",
					0,
					"subscription_event",
					"linked",
					stripeMetadata("link", { stripe_invoice_id: "in_linked" }),
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
					"inpay_linked",
					140,
					"subscription",
					"completed",
					stripeMetadata("money", { stripe_invoice_id: "in_linked" }),
					at,
					{
						anonymous_id: null,
						customer_id: "",
						session_id: null,
						website_id: websiteId,
					}
				),
			],
		});

		const query = RevenueBuilders.revenue_attribution_overview.customSql({
			endDate: "2026-08-03",
			startDate: "2026-08-01",
			websiteId,
		});
		const rows = await chQuery<{
			name: string;
			revenue: number | string;
			transactions: number | string;
		}>(query.sql, query.params);

		const attributed = rows.find((row) => row.name === "Attributed");
		expect(Number(attributed?.revenue)).toBe(140);
		expect(Number(attributed?.transactions)).toBe(1);
	});

	it("credits invoice payment money to the visitor from the invoice link record", async () => {
		const organizationId = `organization-${randomUUIDv7()}`;
		const websiteId = `profile-invoice-link-${randomUUIDv7()}`;
		const anonymousId = `anon-${randomUUIDv7()}`;
		const sessionId = `session-${randomUUIDv7()}`;
		const at = "2026-08-02 12:00:00";

		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				attributionEvent(websiteId, sessionId, "2026-08-02 11:00:00", null),
			],
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					organizationId,
					"in_profile_link:link",
					0,
					"subscription_event",
					"linked",
					stripeMetadata("link", { stripe_invoice_id: "in_profile_link" }),
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
					"inpay_profile",
					140,
					"subscription",
					"completed",
					stripeMetadata("money", { stripe_invoice_id: "in_profile_link" }),
					at,
					{
						anonymous_id: null,
						customer_id: "",
						session_id: null,
						website_id: websiteId,
					}
				),
			],
		});

		const detailQuery = ProfilesBuilders.profile_revenue.customSql({
			endDate: "2026-08-03",
			startDate: "2026-08-01",
			websiteId,
			filters: [{ field: "anonymous_id", op: "eq", value: anonymousId }],
		});
		const transactions = await chQuery<{
			amount: number | string;
			transaction_id: string;
		}>(detailQuery.sql, detailQuery.params);

		expect(
			transactions.map((transaction) => transaction.transaction_id)
		).toEqual(["inpay_profile"]);
	});

	it("stitches an invoice link record created just past the report cutoff", async () => {
		const organizationId = `organization-${randomUUIDv7()}`;
		const websiteId = `revenue-link-cutoff-${randomUUIDv7()}`;
		const sessionId = `session-${randomUUIDv7()}`;

		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				attributionEvent(websiteId, sessionId, "2026-08-02 11:00:00", null),
			],
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					organizationId,
					"inpay_cutoff",
					160,
					"subscription",
					"completed",
					stripeMetadata("money", { stripe_invoice_id: "in_cutoff" }),
					"2026-08-03 23:59:58",
					{
						anonymous_id: null,
						customer_id: "",
						session_id: null,
						website_id: websiteId,
					}
				),
				revenueRow(
					organizationId,
					"in_cutoff:link",
					0,
					"subscription_event",
					"linked",
					stripeMetadata("link", { stripe_invoice_id: "in_cutoff" }),
					"2026-08-04 00:00:02",
					{
						customer_id: "",
						session_id: sessionId,
						website_id: websiteId,
					}
				),
			],
		});

		const query = RevenueBuilders.revenue_attribution_overview.customSql({
			endDate: "2026-08-03",
			startDate: "2026-08-01",
			websiteId,
		});
		const rows = await chQuery<{ name: string; revenue: number | string }>(
			query.sql,
			query.params
		);

		expect(Number(rows.find((row) => row.name === "Attributed")?.revenue)).toBe(
			160
		);
		expect(rows.find((row) => row.name === "Unattributed")).toBeUndefined();
	});

	it("stitches an invoice link record that arrives after the payment row", async () => {
		const organizationId = `organization-${randomUUIDv7()}`;
		const websiteId = `revenue-link-late-${randomUUIDv7()}`;
		const sessionId = `session-${randomUUIDv7()}`;
		const at = "2026-08-02 12:00:00";

		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				attributionEvent(websiteId, sessionId, "2026-08-02 11:00:00", null, {
					anonymous_id: "",
					country: "FR",
				}),
			],
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					organizationId,
					"inpay_late_link",
					180,
					"subscription",
					"completed",
					stripeMetadata("money", { stripe_invoice_id: "in_late_link" }),
					at,
					{
						anonymous_id: null,
						customer_id: "",
						session_id: null,
						website_id: websiteId,
						synced_at: "2026-08-02 12:00:00",
					}
				),
			],
		});
		await clickHouse.insert({
			table: "analytics.revenue",
			format: "JSONEachRow",
			values: [
				revenueRow(
					organizationId,
					"in_late_link:link",
					0,
					"subscription_event",
					"linked",
					stripeMetadata("link", { stripe_invoice_id: "in_late_link" }),
					at,
					{
						customer_id: "",
						session_id: sessionId,
						website_id: websiteId,
						synced_at: "2026-08-02 18:00:00",
					}
				),
			],
		});

		const query = RevenueBuilders.revenue_attribution_overview.customSql({
			endDate: "2026-08-03",
			startDate: "2026-08-01",
			websiteId,
		});
		const rows = await chQuery<{ name: string; revenue: number | string }>(
			query.sql,
			query.params
		);

		expect(Number(rows.find((row) => row.name === "Attributed")?.revenue)).toBe(
			180
		);
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
			stripe_payment_intent_id: "pi_profile_refund",
		});
		const refundMetadata = stripeMetadata("money", {
			stripe_payment_intent_id: "pi_profile_refund",
		});

		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				attributionEvent(websiteId, sessionId, refundAt, null, {
					anonymous_id: anonymousId,
					profile_id: profileId,
				}),
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

		const [overview] = await revenueOverview(
			websiteId,
			"2026-08-01",
			"2026-08-03"
		);

		const listQuery = ProfilesBuilders.profile_list.customSql({
			endDate: "2026-08-03",
			startDate: "2026-08-01",
			websiteId,
			limit: 10,
			offset: 0,
		});
		const profiles = await chQuery<{
			ltv: number | string;
			profile_id: string;
		}>(listQuery.sql, listQuery.params);

		const detailQuery = ProfilesBuilders.profile_revenue.customSql({
			endDate: "2026-08-03",
			startDate: "2026-08-01",
			websiteId,
			filters: [{ field: "anonymous_id", op: "eq", value: profileId }],
		});
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
		expect(
			transactions.map((transaction) => transaction.transaction_id)
		).toEqual(["re_profile_refund"]);
	});
});
