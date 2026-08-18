import { createHmac } from "node:crypto";
import { resolve } from "node:path";
import {
	db,
	eq,
	organization,
	revenueConfig,
	sql,
	websites,
} from "@databuddy/db";
import { chCommand, chQuery, clickHouse } from "@databuddy/db/clickhouse";
import { randomUUIDv7 } from "bun";
import { describe, expect, test } from "bun:test";
import type { CustomSqlContext, Filter } from "../types";
import { ProfilesBuilders } from "./profiles";
import { RevenueBuilders } from "./revenue";

const describeStripeE2E =
	process.env.CLICKHOUSE_INTEGRATION_TESTS === "true" &&
	process.env.STRIPE_REVENUE_E2E === "true"
		? describe
		: describe.skip;

const START_DATE = "2026-01-01";
const END_DATE = "2026-12-31";
const API_VERSION = "2025-05-28.basil";
const DAY_SECONDS = 86_400;

type StripeObject = Record<string, unknown>;

interface StripeEvent {
	api_version: string;
	created: number;
	data: { object: StripeObject };
	id: string;
	type: string;
}

interface FixtureIds {
	configId: string;
	ownerId: string;
	runId: string;
	secret: string;
	siteId: string;
	webhookHash: string;
}

interface RevenueRow {
	amount: number | string;
	currency: string;
	metadata: string;
	status: string;
	transaction_id: string;
	type: string;
}

interface IdentityRow {
	anonymous_id: string | null;
	profile_id: string;
	session_id: string | null;
	transaction_id: string;
}

function assertLoopbackUrl(rawUrl: string, label: string): void {
	const url = new URL(rawUrl);
	const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
		throw new Error(`${label} must point at a loopback service for this test.`);
	}
}

function assertLocalDependencies(): void {
	for (const [label, value] of [
		["CLICKHOUSE_URL", process.env.CLICKHOUSE_URL],
		["DATABASE_URL", process.env.DATABASE_URL],
		["REDIS_URL", process.env.REDIS_URL],
	] as const) {
		if (!value) {
			throw new Error(`${label} is required for the Stripe revenue E2E test.`);
		}
		assertLoopbackUrl(value, label);
	}
}

function eventUnix(dayOffset: number, seconds = 0): number {
	return Math.floor(Date.parse("2026-08-01T12:00:00.000Z") / 1000) +
		dayOffset * DAY_SECONDS +
		seconds;
}

function eventTime(dayOffset: number, seconds = 0): string {
	return new Date(eventUnix(dayOffset, seconds) * 1000)
		.toISOString()
		.replace("T", " ")
		.replace("Z", "");
}

function stripeEvent(
	type: string,
	dayOffset: number,
	object: StripeObject,
	eventId = `evt_${randomUUIDv7()}`
): StripeEvent {
	return {
		api_version: API_VERSION,
		created: eventUnix(dayOffset),
		data: { object },
		id: eventId,
		type,
	};
}

function paymentIntent(input: {
	amount: number;
	currency?: string;
	customer?: string;
	day: number;
	description?: string;
	metadata?: Record<string, string>;
	id: string;
	}
): StripeEvent {
	return stripeEvent("payment_intent.succeeded", input.day, {
		amount: input.amount,
		amount_received: input.amount,
		created: eventUnix(input.day),
		currency: input.currency ?? "usd",
		customer: input.customer ?? null,
		description: input.description ?? "Integration test payment",
		id: input.id,
		metadata: input.metadata ?? {},
	});
}

function invoicePayment(
	input: {
	amount: number;
	customer?: string;
	day: number;
	description?: string;
	invoiceId: string;
	invoicePaymentId: string;
	metadata?: Record<string, string>;
	paymentIntentId?: string;
	currency?: string;
	}
): StripeEvent {
	const invoiceMetadata = input.metadata ?? {};
	const invoice: StripeObject = {
		customer: input.customer ?? null,
		description: input.description ?? "Integration test invoice",
		id: input.invoiceId,
		metadata: invoiceMetadata,
	};
	const paymentIntentObject = input.paymentIntentId
		? {
				customer: input.customer ?? null,
				description: input.description ?? "Integration test invoice",
				id: input.paymentIntentId,
				metadata: invoiceMetadata,
			}
		: null;

	return stripeEvent("invoice_payment.paid", input.day, {
		amount_paid: input.amount,
		created: eventUnix(input.day),
		currency: input.currency ?? "usd",
		id: input.invoicePaymentId,
		invoice,
		payment: {
			payment_intent: paymentIntentObject,
			type: "payment_intent",
		},
		status: "paid",
	});
}

function paidInvoice(
	input: {
	amountPaid: number;
	amountDue?: number;
	customer?: string;
	day: number;
	description?: string;
	hasMore?: boolean;
	invoiceId: string;
	metadata?: Record<string, string>;
	payments: Array<{
		amount: number;
		invoicePaymentId: string;
		paymentIntentId?: string;
	}>;
	currency?: string;
	}
): StripeEvent {
	const currency = input.currency ?? "usd";
	const metadata = input.metadata ?? {};
	const invoice: StripeObject = {
		amount_due: input.amountDue ?? input.amountPaid,
		amount_paid: input.amountPaid,
		amount_remaining: 0,
		billing_reason: "subscription_cycle",
		created: eventUnix(input.day),
		currency,
		customer: input.customer ?? null,
		description: input.description ?? "Integration test invoice",
		id: input.invoiceId,
		metadata,
		payments: {
			data: input.payments.map((payment) => ({
				amount_paid: payment.amount,
				created: eventUnix(input.day),
				currency,
				id: payment.invoicePaymentId,
				invoice: input.invoiceId,
				payment: {
					payment_intent: payment.paymentIntentId
						? {
							customer: input.customer ?? null,
							description: input.description ?? "Integration test invoice",
							id: payment.paymentIntentId,
							metadata,
						}
						: null,
					type: "payment_intent",
				},
				status: "paid",
			})),
			has_more: input.hasMore ?? false,
		},
		status: "paid",
		total: input.amountPaid,
	};
	return stripeEvent("invoice.paid", input.day, invoice);
}

function failedPaymentIntent(
	input: {
		amount: number;
		day: number;
		id: string;
		metadata?: Record<string, string>;
	}
): StripeEvent {
	return stripeEvent("payment_intent.payment_failed", input.day, {
		amount: input.amount,
		created: eventUnix(input.day),
		currency: "usd",
		id: input.id,
		last_payment_error: {
			code: "card_declined",
			decline_code: "insufficient_funds",
			type: "card_error",
		},
		metadata: input.metadata ?? {},
	});
}

function canceledPaymentIntent(day: number, id: string): StripeEvent {
	return stripeEvent("payment_intent.canceled", day, {
		amount: 1500,
		cancellation_reason: "requested_by_customer",
		created: eventUnix(day),
		currency: "usd",
		id,
		metadata: {},
	});
}

function failedInvoice(day: number, invoiceId: string): StripeEvent {
	return stripeEvent("invoice.payment_failed", day, {
		amount_due: 2500,
		amount_paid: 0,
		amount_remaining: 2500,
		created: eventUnix(day),
		currency: "usd",
		customer: null,
		id: invoiceId,
		metadata: {},
		payments: {
			data: [
				{
					amount_requested: 2500,
					id: `inpay_failed_${randomUUIDv7()}`,
					invoice: invoiceId,
					is_default: true,
					payment: {
						payment_intent: {
							id: `pi_failed_invoice_${randomUUIDv7()}`,
							last_payment_error: {
								decline_code: "insufficient_funds",
								type: "card_error",
							},
						},
						type: "payment_intent",
					},
					status: "open",
				},
			],
		},
		status: "open",
		total: 2500,
	});
}

function refundedCharge(day: number, paymentIntentId: string): StripeEvent {
	return stripeEvent("charge.refunded", day, {
		amount_refunded: 500,
		amount: 2500,
		currency: "usd",
		customer: null,
		id: `ch_${randomUUIDv7()}`,
		metadata: {},
		payment_intent: paymentIntentId,
		refunds: {
			data: [
				{ amount: 300, created: eventUnix(day), id: `re_${randomUUIDv7()}` },
				{ amount: 200, created: eventUnix(day), id: `re_${randomUUIDv7()}` },
			],
		},
	});
}

function analyticsEvent(input: {
	anonymousId: string;
	campaign?: string;
	profileId?: string;
	referrer?: string;
	sessionId: string;
	source?: string;
	time: string;
	websiteId: string;
}): Record<string, unknown> {
	return {
		anonymous_id: input.anonymousId,
		client_id: input.websiteId,
		created_at: input.time,
		event_name: "screen_view",
		id: randomUUIDv7(),
		ip: "127.0.0.1",
		path: "/checkout",
		profile_id: input.profileId ?? "",
		properties: "{}",
		referrer: input.referrer ?? null,
		session_id: input.sessionId,
		time: input.time,
		url: "https://stripe-revenue-e2e.invalid/checkout",
		user_agent: "stripe-revenue-e2e",
		utm_campaign: input.campaign ?? null,
		utm_source: input.source ?? null,
	};
}

function signStripePayload(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)):
	string {
	const signature = createHmac("sha256", secret)
		.update(`${timestamp}.${body}`, "utf8")
		.digest("hex");
	return `t=${timestamp},v1=${signature}`;
}

async function postStripeEvent(
	baseUrl: string,
	webhookHash: string,
	secret: string,
	event: StripeEvent,
	options: { signature?: string } = {}
): Promise<Response> {
	const body = JSON.stringify(event);
	return fetch(`${baseUrl}/webhooks/stripe/${webhookHash}`, {
		body,
		headers: {
			"content-type": "application/json",
			...(options.signature === undefined
				? { "stripe-signature": signStripePayload(body, secret) }
				: { "stripe-signature": options.signature }),
		},
		method: "POST",
	});
}

async function createFixture(): Promise<FixtureIds> {
	const runId = randomUUIDv7().replaceAll("-", "");
	const fixture: FixtureIds = {
		configId: `stripe_e2e_config_${runId}`,
		ownerId: `stripe_e2e_owner_${runId}`,
		runId,
		secret: `whsec_${runId}`,
		siteId: `stripe_e2e_site_${runId}`,
		webhookHash: `stripe-e2e-${runId}`,
	};
	const now = new Date();

	// Use only columns shared by the current schema and the older local dev
	// schema. This keeps the test runnable against an already-initialized local
	// stack while remaining valid after a fresh database setup.
	await db.transaction(async (tx) => {
		await tx.execute(sql`
			INSERT INTO organization (id, name, created_at)
			VALUES (${fixture.ownerId}, ${`Stripe revenue E2E ${runId}`}, ${now})
		`);
		await tx.execute(sql`
			INSERT INTO websites (id, domain, name, organization_id, "createdAt", "updatedAt")
			VALUES (
				${fixture.siteId},
				${`stripe-revenue-${runId}.invalid`},
				${"Stripe revenue E2E"},
				${fixture.ownerId},
				${now},
				${now}
			)
		`);
		await tx.execute(sql`
			INSERT INTO revenue_config (
				id,
				owner_id,
				website_id,
				webhook_hash,
				stripe_webhook_secret,
				currency,
				created_at,
				updated_at
			)
			VALUES (
				${fixture.configId},
				${fixture.ownerId},
				${fixture.siteId},
				${fixture.webhookHash},
				${fixture.secret},
				${"USD"},
				${now},
				${now}
			)
		`);
	});
	return fixture;
}

async function deleteFixture(fixture: FixtureIds): Promise<void> {
	await chCommand(
		"ALTER TABLE analytics.revenue DELETE WHERE owner_id = {ownerId:String} SETTINGS mutations_sync = 1",
		{ ownerId: fixture.ownerId }
	);
	await chCommand(
		"ALTER TABLE analytics.events DELETE WHERE client_id = {websiteId:String} SETTINGS mutations_sync = 1",
		{ websiteId: fixture.siteId }
	);
	await db.delete(revenueConfig).where(eq(revenueConfig.id, fixture.configId));
	await db.delete(websites).where(eq(websites.id, fixture.siteId));
	await db.delete(organization).where(eq(organization.id, fixture.ownerId));
}

async function startBasket(port: number): Promise<{
	baseUrl: string;
	stop: () => Promise<string>;
}> {
	const repoRoot = resolve(import.meta.dir, "../../../../..");
	const child = Bun.spawn(["bun", "run", "apps/basket/src/index.ts"], {
		cwd: repoRoot,
		env: { ...process.env, NODE_ENV: "development", PORT: String(port) },
		stderr: "pipe",
		stdout: "pipe",
	});
	const stdout = Bun.readableStreamToText(child.stdout);
	const stderr = Bun.readableStreamToText(child.stderr);
	const baseUrl = `http://127.0.0.1:${port}`;

	for (let attempt = 0; attempt < 80; attempt += 1) {
		try {
			const response = await fetch(`${baseUrl}/health`);
			if (response.ok) {
				return {
					baseUrl,
					stop: async () => {
						child.kill("SIGTERM");
						await Promise.race([child.exited, Bun.sleep(10_000)]);
						return `${await stdout}\n${await stderr}`;
					},
				};
			}
		} catch {
			// The basket process may still be loading its database clients.
		}
		await Bun.sleep(250);
	}

	child.kill("SIGTERM");
	const logs = `${await stdout}\n${await stderr}`;
	throw new Error(`Basket did not become healthy.\n${logs}`);
}

async function revenueOverview(
	websiteId: string,
	filters: Filter[] = []
): Promise<Record<string, number | string | null>[]> {
	const query = RevenueBuilders.revenue_overview?.customSql?.({
		endDate: END_DATE,
		filters,
		startDate: START_DATE,
		websiteId,
	});
	if (!query || typeof query === "string") {
		throw new Error("Revenue overview did not compile");
	}
	return chQuery<Record<string, number | string | null>>(query.sql, query.params);
}

async function runBuilder(
	name: string,
	websiteId: string,
	extra: Partial<CustomSqlContext> = {}
): Promise<Record<string, number | string | null>[]> {
	const query = RevenueBuilders[name]?.customSql?.({
		endDate: END_DATE,
		startDate: START_DATE,
		websiteId,
		...extra,
	});
	if (!query || typeof query === "string") {
		throw new Error(`${name} did not compile`);
	}
	return chQuery<Record<string, number | string | null>>(query.sql, query.params);
}

describeStripeE2E("Stripe revenue end-to-end matrix", () => {
	test(
		"ingests, deduplicates, attributes, and rejects the pre-cutover duplicate result",
		{ timeout: 120_000 },
		async () => {
			assertLocalDependencies();
			const fixture = await createFixture();
			const port = 41_00 + Math.floor(Math.random() * 400);
			let basket: Awaited<ReturnType<typeof startBasket>> | undefined;

			const profileId = `profile_${fixture.runId}`;
			const profileOnlyId = `profile_only_${fixture.runId}`;
			const identifiedSession = `session_identified_${fixture.runId}`;
			const sessionOnlyId = `session_only_${fixture.runId}`;
			const anonymousId = `anonymous_${fixture.runId}`;
			const saltedAnonymousId = `salted_${fixture.runId}`;
			const sharedCustomerId = `cus_shared_${fixture.runId}`;
			const linkedPaymentIntentId = `pi_linked_${fixture.runId}`;
			const allocationPaymentIntentId = `pi_alloc_${fixture.runId}`;
			const replayedPaymentIntentId = `pi_replayed_${fixture.runId}`;
			const refundPaymentIntentId = `pi_refund_${fixture.runId}`;

			try {
				basket = await startBasket(port);

				const identifiedMetadata = {
					databuddy_client_id: fixture.siteId,
					databuddy_profile_id: profileId,
					databuddy_session_id: identifiedSession,
				};
				const profileOnlyMetadata = {
					databuddy_client_id: fixture.siteId,
					databuddy_profile_id: profileOnlyId,
				};
				const sessionOnlyMetadata = {
					databuddy_client_id: fixture.siteId,
					databuddy_session_id: sessionOnlyId,
				};

				const identifiedEvent = paymentIntent({
					amount: 4200,
					customer: sharedCustomerId,
					day: 2,
					id: `pi_identified_${fixture.runId}`,
					metadata: identifiedMetadata,
				});
				const events: StripeEvent[] = [
					identifiedEvent,
					paymentIntent({
						amount: 1800,
						day: 3,
						id: `pi_anonymous_${fixture.runId}`,
					}),
					paymentIntent({
						amount: 3000,
						day: 8,
						id: `pi_profile_${fixture.runId}`,
						metadata: profileOnlyMetadata,
					}),
					paymentIntent({
						amount: 3500,
						day: 15,
						id: `pi_session_${fixture.runId}`,
						metadata: {
							...sessionOnlyMetadata,
							databuddy_anonymous_id: anonymousId,
						},
					}),
					paymentIntent({
						amount: 2200,
						day: 22,
						id: `pi_salted_${fixture.runId}`,
						metadata: { databuddy_anonymous_id: saltedAnonymousId },
					}),
					paymentIntent({
						amount: 6000,
						customer: sharedCustomerId,
						day: 29,
						id: linkedPaymentIntentId,
						metadata: identifiedMetadata,
					}),
					paidInvoice({
						amountPaid: 6000,
						customer: sharedCustomerId,
						day: 30,
						invoiceId: `in_linked_${fixture.runId}`,
						payments: [
							{
								amount: 6000,
								invoicePaymentId: `inpay_linked_${fixture.runId}`,
								paymentIntentId: linkedPaymentIntentId,
							},
						],
						metadata: identifiedMetadata,
					}),
					invoicePayment({
						amount: 6000,
						customer: sharedCustomerId,
						day: 31,
						invoiceId: `in_linked_${fixture.runId}`,
						invoicePaymentId: `inpay_linked_${fixture.runId}`,
						metadata: identifiedMetadata,
						paymentIntentId: linkedPaymentIntentId,
					}),
					paymentIntent({
						amount: 3000,
						day: 36,
						id: allocationPaymentIntentId,
						metadata: sessionOnlyMetadata,
					}),
					paidInvoice({
						amountPaid: 5000,
						day: 37,
						invoiceId: `in_alloc_${fixture.runId}`,
						payments: [
							{
								amount: 3000,
								invoicePaymentId: `inpay_alloc_${fixture.runId}`,
								paymentIntentId: allocationPaymentIntentId,
							},
						],
						metadata: sessionOnlyMetadata,
					}),
					invoicePayment({
						amount: 3000,
						day: 38,
						invoiceId: `in_alloc_${fixture.runId}`,
						invoicePaymentId: `inpay_alloc_${fixture.runId}`,
						metadata: sessionOnlyMetadata,
						paymentIntentId: allocationPaymentIntentId,
					}),
					paidInvoice({
						amountPaid: 4000,
						day: 43,
						hasMore: true,
						invoiceId: `in_page_${fixture.runId}`,
						payments: [
							{
								amount: 4000,
								invoicePaymentId: `inpay_page_${fixture.runId}`,
							},
						],
					}),
					invoicePayment({
						amount: 4000,
						day: 44,
						invoiceId: `in_page_${fixture.runId}`,
						invoicePaymentId: `inpay_page_${fixture.runId}`,
					}),
					paymentIntent({
						amount: 1000,
						day: 50,
						id: replayedPaymentIntentId,
					}),
					paymentIntent({
						amount: 2500,
						customer: `cus_refund_${fixture.runId}`,
						day: 61,
						id: refundPaymentIntentId,
					}),
					refundedCharge(62, refundPaymentIntentId),
					invoicePayment({
						amount: 2400,
						customer: sharedCustomerId,
						day: 68,
						invoiceId: `in_stitched_${fixture.runId}`,
						invoicePaymentId: `inpay_stitched_${fixture.runId}`,
					}),
					paymentIntent({
						amount: 500,
						currency: "jpy",
						day: 90,
						id: `pi_jpy_${fixture.runId}`,
					}),
					failedPaymentIntent({
						amount: 2500,
						day: 95,
						id: `pi_failed_${fixture.runId}`,
					}),
					failedInvoice(96, `in_failed_${fixture.runId}`),
					canceledPaymentIntent(100, `pi_canceled_${fixture.runId}`),
					stripeEvent("customer.created", 105, {
						id: `cus_unsupported_${fixture.runId}`,
					}),
				];

				for (const event of events) {
					const response = await postStripeEvent(
						basket.baseUrl,
						fixture.webhookHash,
						fixture.secret,
						event
					);
					expect(response.status, event.type).toBe(200);
				}

				// A replay has the same Stripe event and transaction identity. The
				// current model must remain one logical payment after two deliveries.
				for (const replay of [
					paymentIntent({
						amount: 1000,
						day: 50,
						id: replayedPaymentIntentId,
					}),
				]) {
					const response = await postStripeEvent(
						basket.baseUrl,
						fixture.webhookHash,
						fixture.secret,
						replay,
						{ signature: signStripePayload(JSON.stringify(replay), fixture.secret) }
					);
					expect(response.status).toBe(200);
				}

				const badSignatureResponse = await postStripeEvent(
					basket.baseUrl,
					fixture.webhookHash,
					fixture.secret,
					identifiedEvent,
					{ signature: signStripePayload(JSON.stringify(identifiedEvent), "wrong") }
				);
				expect(badSignatureResponse.status).toBe(401);

				const staleSignatureResponse = await postStripeEvent(
					basket.baseUrl,
					fixture.webhookHash,
					fixture.secret,
					identifiedEvent,
					{
						signature: signStripePayload(
							JSON.stringify(identifiedEvent),
							fixture.secret,
							Math.floor(Date.now() / 1000) - 301
						),
					},
				);
				expect(staleSignatureResponse.status).toBe(401);

				const missingSignatureResponse = await fetch(
					`${basket.baseUrl}/webhooks/stripe/${fixture.webhookHash}`,
					{
						body: JSON.stringify(identifiedEvent),
						headers: { "content-type": "application/json" },
						method: "POST",
					}
				);
				expect(missingSignatureResponse.status).toBe(400);

				await clickHouse.insert({
					format: "JSONEachRow",
					table: "analytics.events",
					values: [
						analyticsEvent({
							anonymousId: `anon_${fixture.runId}`,
							campaign: "first-touch-campaign",
							profileId,
							referrer: "https://search.example/results",
							sessionId: identifiedSession,
							source: "search",
							time: eventTime(1),
							websiteId: fixture.siteId,
						}),
						analyticsEvent({
							anonymousId: `anon_${fixture.runId}`,
							campaign: "second-touch-campaign",
							profileId,
							referrer: "https://ignored.example/results",
							sessionId: identifiedSession,
							source: "ignored",
							time: eventTime(1, 3600),
							websiteId: fixture.siteId,
						}),
						analyticsEvent({
							anonymousId,
							campaign: "partner-campaign",
							referrer: "https://partner.example/launch",
							sessionId: sessionOnlyId,
							source: "partner",
							time: eventTime(14),
							websiteId: fixture.siteId,
						}),
						analyticsEvent({
							anonymousId: `anon_profile_${fixture.runId}`,
							profileId: profileOnlyId,
							referrer: "https://email.example/click",
							sessionId: `profile_session_${fixture.runId}`,
							source: "email",
							time: eventTime(7),
							websiteId: fixture.siteId,
						}),
					],
				});

				const [usd] = await revenueOverview(fixture.siteId, [
					{ field: "currency", op: "eq", value: "USD" },
				]);
				const [jpy] = await revenueOverview(fixture.siteId, [
					{ field: "currency", op: "eq", value: "JPY" },
				]);
				expect(Number(usd?.total_revenue)).toBe(356);
				expect(Number(usd?.total_transactions)).toBe(12);
				expect(Number(usd?.subscription_revenue)).toBe(174);
				expect(Number(usd?.sale_revenue)).toBe(182);
				expect(Number(usd?.refund_amount)).toBe(-5);
				expect(Number(usd?.refund_count)).toBe(2);
				expect(Number(jpy?.total_revenue)).toBe(500);
				expect(Number(jpy?.total_transactions)).toBe(1);

				const rows = await chQuery<RevenueRow>(
					`SELECT transaction_id, amount, currency, type, status, metadata
					 FROM analytics.revenue FINAL
					 WHERE owner_id = {ownerId:String}`,
					{ ownerId: fixture.ownerId }
				);
				const logicalById = new Map(
					rows.map((row) => [row.transaction_id, row])
				);
				expect(logicalById.get(`pi_replayed_${fixture.runId}`)).toBeDefined();
				expect(rows.filter((row) => row.transaction_id === replayedPaymentIntentId)).toHaveLength(1);

				const identityRows = await chQuery<IdentityRow>(
					`SELECT transaction_id, profile_id, session_id, anonymous_id
					 FROM analytics.revenue FINAL
					 WHERE owner_id = {ownerId:String}
					 AND transaction_id IN {transactionIds:Array(String)}`,
					{
						ownerId: fixture.ownerId,
						transactionIds: [
							`pi_identified_${fixture.runId}`,
							`pi_anonymous_${fixture.runId}`,
							`pi_profile_${fixture.runId}`,
							`pi_session_${fixture.runId}`,
							`pi_salted_${fixture.runId}`,
						],
					}
				);
				const identityById = new Map(
					identityRows.map((row) => [row.transaction_id, row])
				);
				expect(identityById.get(`pi_identified_${fixture.runId}`)).toEqual(
					expect.objectContaining({
						profile_id: profileId,
						session_id: identifiedSession,
					})
				);
				expect(identityById.get(`pi_profile_${fixture.runId}`)).toEqual(
					expect.objectContaining({ profile_id: profileOnlyId })
				);
				expect(identityById.get(`pi_session_${fixture.runId}`)).toEqual(
					expect.objectContaining({ session_id: sessionOnlyId })
				);
				expect(identityById.get(`pi_anonymous_${fixture.runId}`)).toEqual(
					expect.objectContaining({ profile_id: "" })
				);
				const saltedIdentity = identityById.get(`pi_salted_${fixture.runId}`);
				expect(saltedIdentity?.anonymous_id).toBeTruthy();
				expect(saltedIdentity?.anonymous_id).not.toBe(saltedAnonymousId);

				// This is the regression oracle for the removed pre-cutover query:
				// sum every completed sale/subscription row independently. That old
				// rule counted a PaymentIntent and its InvoicePayment as two payments
				// because Basil PaymentIntents no longer carry an invoice reference.
				const legacyBrokenUsdGross = rows
					.filter(
						(row) =>
							row.currency === "USD" &&
							row.status === "completed" &&
							(row.type === "sale" || row.type === "subscription")
					)
					.reduce((total, row) => total + Number(row.amount), 0);
				const linkedPaymentIntentGross = rows
					.filter((row) =>
						[linkedPaymentIntentId, allocationPaymentIntentId].includes(
							row.transaction_id
						)
					)
					.reduce((total, row) => total + Number(row.amount), 0);
				expect(legacyBrokenUsdGross).toBe(446);
				expect(linkedPaymentIntentGross).toBe(90);
				expect(legacyBrokenUsdGross).toBe(
					Number(usd?.total_revenue) + linkedPaymentIntentGross
				);
				expect(legacyBrokenUsdGross).not.toBe(Number(usd?.total_revenue));

				const attribution = await runBuilder(
					"revenue_attribution_overview",
					fixture.siteId
				);
				const attributed = attribution.find((row) => row.name === "Attributed");
				const unattributed = attribution.find(
					(row) => row.name === "Unattributed"
				);
				expect(Number(attributed?.revenue)).toBeGreaterThan(0);
				expect(Number(unattributed?.revenue)).toBeGreaterThan(0);

				const referrers = await runBuilder("revenue_by_referrer", fixture.siteId);
				const sources = await runBuilder("revenue_by_utm_source", fixture.siteId);
				const campaigns = await runBuilder(
					"revenue_by_utm_campaign",
					fixture.siteId
				);
				expect(referrers.some((row) => row.name === "search.example")).toBe(true);
				expect(sources.some((row) => row.name === "search")).toBe(true);
				expect(campaigns.some((row) => row.name === "first-touch-campaign")).toBe(
					true
				);
				expect(campaigns.some((row) => row.name === "second-touch-campaign")).toBe(
					false
				);

				const recent = await runBuilder("recent_transactions", fixture.siteId);
				expect(recent.some((row) => row.transaction_id === refundPaymentIntentId)).toBe(
					true
				);
				expect(recent.some((row) => row.type === "refund")).toBe(false);

				const profileListQuery = ProfilesBuilders.profile_list?.customSql?.({
					endDate: END_DATE,
					limit: 50,
					offset: 0,
					startDate: START_DATE,
					websiteId: fixture.siteId,
				});
				if (!profileListQuery || typeof profileListQuery === "string") {
					throw new Error("Profile list did not compile");
				}
				const profiles = await chQuery<{ profile_id: string; ltv: number | string }>(
					profileListQuery.sql,
					profileListQuery.params
				);
				expect(profiles.some((profile) => profile.profile_id === profileId)).toBe(
					true
				);

				const profileRevenueQuery = ProfilesBuilders.profile_revenue?.customSql?.({
					endDate: END_DATE,
					filters: [{ field: "anonymous_id", op: "eq", value: profileId }],
					limit: 50,
					offset: 0,
					startDate: START_DATE,
					websiteId: fixture.siteId,
				});
				if (!profileRevenueQuery || typeof profileRevenueQuery === "string") {
					throw new Error("Profile revenue did not compile");
				}
				const profileRevenue = await chQuery<{ transaction_id: string }>(
					profileRevenueQuery.sql,
					profileRevenueQuery.params
				);
				expect(
					profileRevenue.some(
						(transaction) => transaction.transaction_id === `pi_identified_${fixture.runId}`
					)
				).toBe(true);
			} finally {
				try {
					if (basket) {
						await basket.stop();
					}
				} finally {
					await deleteFixture(fixture);
				}
			}
		}
	);
});
