import { describe, expect, test } from "vitest";
import { createHmac } from "node:crypto";
import { stripeRecordMetadata, verifyStripeSignature } from "./stripe";
import {
	type StripeWebhookEvent,
	emitsInvoicePaymentPaidEvents,
	invoiceMetadataSources,
	normalizeStripeEvent,
	usesInvoicePayments,
} from "./stripe-normalization";

const SECRET = "whsec_test_secret_key";

function sign(payload: string, secret = SECRET, timestamp?: number): string {
	const ts = timestamp ?? Math.floor(Date.now() / 1000);
	const sig = createHmac("sha256", secret)
		.update(`${ts}.${payload}`, "utf8")
		.digest("hex");
	return `t=${ts},v1=${sig}`;
}

const VALID_PAYLOAD = JSON.stringify({
	created: 1_700_000_123,
	id: "evt_1",
	type: "payment_intent.succeeded",
	data: {
		object: {
			id: "pi_1",
			amount: 1000,
			currency: "usd",
			created: 1_700_000_000,
		},
	},
});

describe("verifyStripeSignature", () => {
	// ── Valid signatures ──

	test("valid signature → parsed event", () => {
		const header = sign(VALID_PAYLOAD);
		const result = verifyStripeSignature(VALID_PAYLOAD, header, SECRET);
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.event.id).toBe("evt_1");
			expect(result.event.type).toBe("payment_intent.succeeded");
		}
	});

	test("valid with multiple v1 signatures (one correct)", () => {
		const ts = Math.floor(Date.now() / 1000);
		const correctSig = createHmac("sha256", SECRET)
			.update(`${ts}.${VALID_PAYLOAD}`, "utf8")
			.digest("hex");
		const header = `t=${ts},v1=wrong_sig,v1=${correctSig}`;
		const result = verifyStripeSignature(VALID_PAYLOAD, header, SECRET);
		expect(result.valid).toBe(true);
	});

	// ── Missing fields ──

	test("missing timestamp → invalid", () => {
		const result = verifyStripeSignature(VALID_PAYLOAD, "v1=abc123", SECRET);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain("timestamp");
		}
	});

	test("missing v1 signature → invalid", () => {
		const ts = Math.floor(Date.now() / 1000);
		const result = verifyStripeSignature(VALID_PAYLOAD, `t=${ts}`, SECRET);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain("No v1");
		}
	});

	// ── Signature mismatch ──

	test("wrong secret → mismatch", () => {
		const header = sign(VALID_PAYLOAD, "wrong_secret");
		const result = verifyStripeSignature(VALID_PAYLOAD, header, SECRET);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain("mismatch");
		}
	});

	test("tampered payload → mismatch", () => {
		const header = sign(VALID_PAYLOAD);
		const tampered = VALID_PAYLOAD.replace("1000", "999999");
		const result = verifyStripeSignature(tampered, header, SECRET);
		expect(result.valid).toBe(false);
	});

	test("tampered signature → mismatch", () => {
		const header = sign(VALID_PAYLOAD);
		const tampered = header.replace(/v1=([a-f0-9]{10})/, "v1=0000000000");
		const result = verifyStripeSignature(VALID_PAYLOAD, tampered, SECRET);
		expect(result.valid).toBe(false);
	});

	// ── Timestamp tolerance ──

	test("timestamp 6 minutes old → rejected", () => {
		const oldTs = Math.floor(Date.now() / 1000) - 360;
		const header = sign(VALID_PAYLOAD, SECRET, oldTs);
		const result = verifyStripeSignature(VALID_PAYLOAD, header, SECRET);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain("tolerance");
		}
	});

	test("timestamp 4 minutes old → accepted", () => {
		const recentTs = Math.floor(Date.now() / 1000) - 240;
		const header = sign(VALID_PAYLOAD, SECRET, recentTs);
		const result = verifyStripeSignature(VALID_PAYLOAD, header, SECRET);
		expect(result.valid).toBe(true);
	});

	test("future timestamp within tolerance → accepted", () => {
		const futureTs = Math.floor(Date.now() / 1000) + 60;
		const header = sign(VALID_PAYLOAD, SECRET, futureTs);
		const result = verifyStripeSignature(VALID_PAYLOAD, header, SECRET);
		expect(result.valid).toBe(true);
	});

	// ── Invalid JSON ──

	test("valid signature but invalid JSON body → error", () => {
		const broken = "not json {{{";
		const header = sign(broken);
		const result = verifyStripeSignature(broken, header, SECRET);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain("JSON");
		}
	});

	// ���─ Edge cases ──

	test("empty payload", () => {
		const header = sign("");
		const result = verifyStripeSignature("", header, SECRET);
		// Empty string is not valid JSON, so should fail at parse step
		expect(result.valid).toBe(false);
	});

	test("empty header → missing timestamp", () => {
		const result = verifyStripeSignature(VALID_PAYLOAD, "", SECRET);
		expect(result.valid).toBe(false);
	});

	test("header with extra unknown parts → still works", () => {
		const ts = Math.floor(Date.now() / 1000);
		const sig = createHmac("sha256", SECRET)
			.update(`${ts}.${VALID_PAYLOAD}`, "utf8")
			.digest("hex");
		const header = `t=${ts},v1=${sig},v0=legacy`;
		const result = verifyStripeSignature(VALID_PAYLOAD, header, SECRET);
		expect(result.valid).toBe(true);
	});

	// ── Fuzz: 50 random payloads with correct signatures ──

	test("50 random payloads → all verify correctly", () => {
		for (let i = 0; i < 50; i++) {
			const payload = JSON.stringify({
				id: `evt_${i}`,
				type: "charge.succeeded",
				data: { object: { id: `ch_${i}`, amount: i * 100 } },
			});
			const header = sign(payload);
			const result = verifyStripeSignature(payload, header, SECRET);
			expect(result.valid).toBe(true);
		}
	});

	// ── Fuzz: 50 random payloads with wrong signatures ──

	test("50 random payloads with wrong secret → all rejected", () => {
		for (let i = 0; i < 50; i++) {
			const payload = JSON.stringify({
				id: `evt_${i}`,
				type: "x",
				data: { object: {} },
			});
			const header = sign(payload, "wrong_secret_" + i);
			const result = verifyStripeSignature(payload, header, SECRET);
			expect(result.valid).toBe(false);
		}
	});
});

describe("invoiceMetadataSources", () => {
	test("merges parent, subscription_details, and invoice metadata with invoice winning", () => {
		const merged = invoiceMetadataSources({
			amount_paid: 100,
			created: 1_700_000_000,
			currency: "usd",
			id: "in_1",
			metadata: { databuddy_profile_id: "user_invoice" },
			parent: {
				subscription_details: {
					metadata: {
						databuddy_profile_id: "user_parent",
						databuddy_client_id: "site_parent",
					},
				},
			},
			subscription_details: {
				metadata: { databuddy_session_id: "sess_sub" },
			},
		});
		expect(merged).toEqual({
			databuddy_profile_id: "user_invoice",
			databuddy_client_id: "site_parent",
			databuddy_session_id: "sess_sub",
		});
	});

	test("returns empty object when no metadata anywhere", () => {
		expect(
			invoiceMetadataSources({
				amount_paid: 100,
				created: 1_700_000_000,
				currency: "usd",
				id: "in_1",
			})
		).toEqual({});
	});
});

describe("normalizeStripeEvent", () => {
	const acaciaIntent = {
		api_version: "2024-10-28.acacia",
		created: 1_700_000_200,
		id: "evt_pi_paid",
		type: "payment_intent.succeeded",
		data: {
			object: {
				amount: 300,
				created: 1_700_000_000,
				currency: "usd",
				id: "pi_1",
				invoice: "in_1",
				metadata: {
					databuddy_profile_id: "profile-1",
					databuddy_session_id: "session-1",
				},
			},
		},
	} satisfies StripeWebhookEvent;
	const acaciaInvoice = {
		api_version: "2024-10-28.acacia",
		created: 1_700_000_201,
		id: "evt_invoice_paid",
		type: "invoice.paid",
		data: {
			object: {
				amount_paid: 300,
				created: 1_699_900_000,
				currency: "usd",
				id: "in_1",
				payment_intent: "pi_1",
				status: "paid",
			},
		},
	} satisfies StripeWebhookEvent;

	test("keeps Acacia PaymentIntent attribution as a link and counts the invoice once", () => {
		const records = [
			...normalizeStripeEvent(acaciaInvoice),
			...normalizeStripeEvent(acaciaIntent),
		];
		const money = records.filter(
			(record) => record.context.recordKind === "money"
		);
		const link = records.find(
			(record) => record.context.eventId === "evt_pi_paid"
		);

		expect(money).toHaveLength(1);
		expect(money[0]).toMatchObject({
			amount: 3,
			createdUnix: 1_700_000_201,
			transactionId: "in_1",
			type: "subscription",
		});
		expect(link).toMatchObject({
			context: {
				invoiceId: "in_1",
				paymentIntentId: "pi_1",
				recordKind: "link",
			},
			rawMetadata: {
				databuddy_profile_id: "profile-1",
				databuddy_session_id: "session-1",
			},
		});
	});

	test("is independent of Acacia webhook delivery order and retries", () => {
		const forward = [
			...normalizeStripeEvent(acaciaIntent),
			...normalizeStripeEvent(acaciaInvoice),
		];
		const reverse = [
			...normalizeStripeEvent(acaciaInvoice),
			...normalizeStripeEvent(acaciaIntent),
		];
		expect(
			forward.map((record) => record.transactionId).sort()
		).toEqual(reverse.map((record) => record.transactionId).sort());
		expect(normalizeStripeEvent(acaciaInvoice)).toEqual(
			normalizeStripeEvent(acaciaInvoice)
		);
	});

	test("keeps direct InvoicePayment facts separate from the invoice fallback", () => {
		const intent = {
			...acaciaIntent,
			api_version: "2025-08-27.basil",
			data: {
				object: { ...acaciaIntent.data.object, invoice: undefined },
			},
		} satisfies StripeWebhookEvent;
		const payment = {
			api_version: "2025-08-27.basil",
			created: 1_700_000_202,
			id: "evt_inpay_paid",
			type: "invoice_payment.paid",
			data: {
				object: {
					amount_paid: 300,
					created: 1_700_000_190,
					currency: "usd",
					id: "inpay_1",
					invoice: "in_1",
					payment: { type: "payment_intent", payment_intent: "pi_1" },
					status: "paid",
				},
			},
		} satisfies StripeWebhookEvent;
		const invoice = {
			...acaciaInvoice,
			api_version: "2025-08-27.basil",
			data: {
				object: { ...acaciaInvoice.data.object, payment_intent: undefined },
			},
		} satisfies StripeWebhookEvent;
		const records = [
			...normalizeStripeEvent(intent),
			...normalizeStripeEvent(payment),
			...normalizeStripeEvent(invoice),
		];

		expect(
			records.filter((record) => record.context.moneyKind === "invoice")
		).toHaveLength(0);
		expect(
			records.find((record) => record.transactionId === "in_1")
		).toMatchObject({
			amount: 3,
			context: {
				invoiceId: "in_1",
				moneyKind: "invoice_fallback",
			},
			type: "subscription_event",
		});
		expect(
			records.find((record) => record.transactionId === "inpay_1")
		).toMatchObject({
			amount: 3,
			context: {
				invoiceId: "in_1",
				moneyKind: "invoice_payment",
				paymentIntentId: "pi_1",
			},
			createdUnix: 1_700_000_202,
		});
		expect(
			records.find((record) => record.transactionId === "pi_1")
		).toMatchObject({ context: { moneyKind: "standalone_candidate" } });
		expect(
			normalizeStripeEvent(invoice).filter(
				(record) => record.context.moneyKind === "invoice_payment"
			)
		).toEqual([]);
	});

	test.each([
		["usd", 500, 5],
		["jpy", 500, 500],
		["isk", 500, 5],
		["ugx", 500, 5],
	] as const)(
		"converts %s Stripe minor units using the charge exponent",
		(currency, amount, expected) => {
			const [record] = normalizeStripeEvent({
				...acaciaIntent,
				id: `evt_${currency}`,
				data: {
					object: {
						...acaciaIntent.data.object,
						amount,
						currency,
						id: `pi_${currency}`,
						invoice: undefined,
					},
				},
			});

			expect(record?.amount).toBe(expected);
			expect(record?.currency).toBe(currency.toUpperCase());
		}
	);

	test("applies zero-decimal conversion to attempts and refunds", () => {
		const [attempt] = normalizeStripeEvent({
			...acaciaIntent,
			id: "evt_jpy_failed",
			type: "payment_intent.payment_failed",
			data: {
				object: {
					...acaciaIntent.data.object,
					amount: 500,
					currency: "jpy",
					invoice: undefined,
				},
			},
		});
		const [refund] = normalizeStripeEvent({
			api_version: "2025-08-27.basil",
			created: 1_700_000_301,
			id: "evt_jpy_refund",
			type: "charge.refunded",
			data: {
				object: {
					amount_refunded: 250,
					currency: "jpy",
					id: "ch_jpy",
					refunds: {
						data: [{ amount: 250, created: 1_700_000_300, id: "re_jpy" }],
					},
				},
			},
		});

		expect(attempt?.amount).toBe(500);
		expect(refund?.amount).toBe(-250);
	});

	test("keeps modern invoice totals safe until exact allocations arrive", () => {
		const fullyOutOfBand = normalizeStripeEvent({
			api_version: "2025-08-27.basil",
			created: 1_700_000_300,
			id: "evt_oob_invoice",
			type: "invoice.paid",
			data: {
				object: {
					amount_paid: 10_000,
					created: 1_699_000_000,
					currency: "usd",
					id: "in_oob",
					payments: { data: [], has_more: false },
					status: "paid",
				},
			},
		});
		const partiallyOutOfBand = normalizeStripeEvent({
			api_version: "2025-08-27.basil",
			created: 1_700_000_301,
			id: "evt_partial_oob_invoice",
			type: "invoice.paid",
			data: {
				object: {
					amount_paid: 10_000,
					created: 1_699_000_000,
					currency: "usd",
					id: "in_partial_oob",
					payments: {
						data: [
							{
								amount_paid: 6_000,
								created: 1_700_000_290,
								currency: "usd",
								id: "inpay_partial",
								invoice: "in_partial_oob",
								payment: {
									payment_intent: "pi_partial",
									type: "payment_intent",
								},
								status: "paid",
							},
						],
						has_more: false,
					},
					status: "paid",
				},
			},
		});
		const fullMoney = fullyOutOfBand.filter(
			(record) => record.context.recordKind === "money"
		);
		const partialMoney = partiallyOutOfBand.filter(
			(record) => record.context.recordKind === "money"
		);

		expect(fullMoney).toMatchObject([
			{
				amount: 100,
				context: { invoiceId: "in_oob", moneyKind: "invoice_fallback" },
				transactionId: "in_oob",
			},
		]);
		expect(partialMoney).toMatchObject([
			{
				amount: 100,
				context: {
					invoiceId: "in_partial_oob",
					moneyKind: "invoice_fallback",
				},
				transactionId: "in_partial_oob",
			},
		]);
		expect(partiallyOutOfBand).toContainEqual(
			expect.objectContaining({
				context: expect.objectContaining({
					invoiceId: "in_partial_oob",
					paymentIntentId: "pi_partial",
					recordKind: "link",
				}),
				transactionId: "evt_partial_oob_invoice:inpay_partial",
			})
		);
	});

	test("keeps exact allocation and out-of-band amounts in the transition window", () => {
		const money = normalizeStripeEvent({
			api_version: "2025-05-27.basil",
			created: 1_700_000_301,
			id: "evt_transition_oob",
			type: "invoice.paid",
			data: {
				object: {
					amount_paid: 10_000,
					created: 1_699_000_000,
					currency: "usd",
					id: "in_transition_oob",
					payments: {
						data: [
							{
								amount_paid: 6_000,
								created: 1_700_000_290,
								currency: "usd",
								id: "inpay_transition",
								invoice: "in_transition_oob",
								payment: {
									payment_intent: "pi_transition",
									type: "payment_intent",
								},
								status: "paid",
							},
						],
						has_more: false,
					},
					status: "paid",
				},
			},
		}).filter((record) => record.context.recordKind === "money");

		expect(money).toMatchObject([
			{
				amount: 60,
				context: { moneyKind: "invoice_payment" },
				transactionId: "inpay_transition",
			},
			{
				amount: 40,
				context: { moneyKind: "invoice" },
				transactionId: "in_transition_oob",
			},
		]);
	});

	test("falls back to the total and retains visible modern allocation links", () => {
		const records = normalizeStripeEvent({
			api_version: "2025-08-27.basil",
			created: 1_700_000_300,
			id: "evt_partial_invoice",
			type: "invoice.paid",
			data: {
				object: {
					amount_paid: 400,
					created: 1_699_000_000,
					currency: "usd",
					id: "in_partial",
					status: "paid",
					payments: {
						has_more: true,
						data: [
							{
								amount_paid: 100,
								created: 1_700_000_100,
								currency: "usd",
								id: "inpay_1",
								invoice: "in_partial",
								payment: {
									type: "payment_intent",
									payment_intent: "pi_1",
								},
								status: "paid",
							},
							{
								amount_paid: 200,
								created: 1_700_000_200,
								currency: "usd",
								id: "inpay_2",
								invoice: "in_partial",
								payment: {
									type: "payment_intent",
									payment_intent: "pi_2",
								},
								status: "paid",
							},
						],
					},
				},
			},
		});
		const money = records.filter(
			(record) => record.context.recordKind === "money"
		);

		expect(money).toMatchObject([
			{
				amount: 4,
				context: {
					invoiceId: "in_partial",
					moneyKind: "invoice_fallback",
				},
				transactionId: "in_partial",
			},
		]);
		expect(
			records
				.filter((record) => record.context.recordKind === "link")
				.map((record) => record.transactionId)
		).toEqual([
			"evt_partial_invoice",
			"evt_partial_invoice:inpay_1",
			"evt_partial_invoice:inpay_2",
		]);
	});

	test("uses requested and remaining invoice amounts for failed partial payments", () => {
		const failedInvoice = (
			id: string,
			object: StripeWebhookEvent["data"]["object"]
		) =>
			normalizeStripeEvent({
				api_version: "2025-08-27.basil",
				created: 1_700_000_400,
				id,
				type: "invoice.payment_failed",
				data: { object },
			})[0];
		const remaining = failedInvoice("evt_remaining", {
			amount_due: 10_000,
			amount_paid: 3_000,
			amount_remaining: 7_000,
			created: 1_699_000_000,
			currency: "usd",
			id: "in_remaining",
			status: "open",
		});
		const requested = failedInvoice("evt_requested", {
			amount_due: 10_000,
			amount_paid: 3_000,
			amount_remaining: 7_000,
			created: 1_699_000_000,
			currency: "usd",
			id: "in_requested",
			payments: {
				data: [
					{
						amount_requested: 2_500,
						created: 1_700_000_390,
						currency: "usd",
						id: "inpay_requested",
							invoice: "in_requested",
							is_default: true,
							payment: {
								type: "payment_intent",
								payment_intent: "pi_requested",
							},
							status: "open",
					},
				],
				has_more: false,
			},
			status: "open",
		});

		expect(remaining?.amount).toBe(70);
		expect(requested?.amount).toBe(25);
		expect(requested?.context.paymentIntentId).toBe("pi_requested");
	});

	test("carries expanded invoice context on direct InvoicePayment events", () => {
		const [record] = normalizeStripeEvent({
			api_version: "2025-08-27.basil",
			created: 1_700_000_500,
			id: "evt_expanded_inpay",
			type: "invoice_payment.paid",
			data: {
				object: {
					amount_paid: 300,
					created: 1_700_000_490,
					currency: "usd",
					id: "inpay_expanded",
					invoice: {
						customer: "cus_invoice",
						description: "Pro plan",
						id: "in_expanded",
						metadata: { databuddy_session_id: "session-invoice" },
						parent: {
							subscription_details: {
								metadata: { databuddy_profile_id: "profile-subscription" },
							},
						},
					},
					payment: {
						payment_intent: {
							customer: "cus_payment",
							description: "Fallback plan",
							id: "pi_expanded",
							metadata: { databuddy_anonymous_id: "anon-payment" },
						},
						type: "payment_intent",
					},
					status: "paid",
				},
			},
		});

		expect(record).toMatchObject({
			customerId: "cus_invoice",
			productName: "Pro plan",
			rawMetadata: {
				databuddy_anonymous_id: "anon-payment",
				databuddy_profile_id: "profile-subscription",
				databuddy_session_id: "session-invoice",
			},
			context: {
				invoiceId: "in_expanded",
				paymentIntentId: "pi_expanded",
			},
		});
	});

	test("retains failed and canceled attempts with intended amount", () => {
		for (const [type, status] of [
			["payment_intent.payment_failed", "failed"],
			["payment_intent.canceled", "canceled"],
		] as const) {
			const [record] = normalizeStripeEvent({
				...acaciaIntent,
				id: `evt_${status}`,
				type,
				data: {
					object: {
						...acaciaIntent.data.object,
						amount_received: 0,
					},
				},
			});
			expect(record).toMatchObject({
				amount: 3,
				status,
				transactionId: `evt_${status}`,
				type: "subscription_event",
				context: { eventType: type, recordKind: "attempt" },
			});
		}
	});

	test("keeps actionable failure codes without retaining provider messages", () => {
		const [record] = normalizeStripeEvent({
			...acaciaIntent,
			id: "evt_declined",
			type: "payment_intent.payment_failed",
			data: {
				object: {
					...acaciaIntent.data.object,
					last_payment_error: {
						code: "card_declined",
						decline_code: "insufficient_funds",
						message: "Do not persist this provider message",
						type: "card_error",
					},
				},
			},
		});
		if (!record) {
			throw new Error("Expected a normalized failed payment");
		}

		expect(record.context).toMatchObject({
			failureCode: "card_declined",
			failureDeclineCode: "insufficient_funds",
			failureType: "card_error",
		});
		expect(record.context).not.toHaveProperty("message");
		expect(stripeRecordMetadata({}, record.context)).toMatchObject({
			stripe_failure_code: "card_declined",
			stripe_failure_decline_code: "insufficient_funds",
			stripe_failure_type: "card_error",
		});
		expect(JSON.stringify(stripeRecordMetadata({}, record.context))).not.toContain(
			"provider message"
		);
	});

	test("rejects unbounded failure text but keeps a safe cancellation reason", () => {
		const [record] = normalizeStripeEvent({
			...acaciaIntent,
			id: "evt_canceled_reason",
			type: "payment_intent.canceled",
			data: {
				object: {
					...acaciaIntent.data.object,
					cancellation_reason: " Requested_By_Customer ",
					last_payment_error: {
						code: "free-form failure text is not a code",
						decline_code: "x".repeat(65),
						type: 42,
					},
				},
			},
		});
		if (!record) {
			throw new Error("Expected a normalized canceled payment");
		}

		expect(record.context).toMatchObject({
			cancellationReason: "requested_by_customer",
		});
		expect(record.context.failureCode).toBeUndefined();
		expect(record.context.failureDeclineCode).toBeUndefined();
		expect(record.context.failureType).toBeUndefined();
		expect(stripeRecordMetadata({}, record.context)).toMatchObject({
			stripe_cancellation_reason: "requested_by_customer",
		});
	});

	test("reads invoice failure codes from the expanded attempted payment", () => {
		const [record] = normalizeStripeEvent({
			api_version: "2025-08-27.basil",
			created: 1_700_000_401,
			id: "evt_invoice_declined",
			type: "invoice.payment_failed",
			data: {
				object: {
					amount_due: 2500,
					amount_paid: 0,
					created: 1_700_000_390,
					currency: "usd",
					id: "in_declined",
					payments: {
						data: [
							{
								amount_requested: 2500,
								created: 1_700_000_400,
								currency: "usd",
								id: "inpay_declined",
								invoice: "in_declined",
								is_default: true,
								payment: {
									payment_intent: {
										id: "pi_declined",
										last_payment_error: {
											code: "card_declined",
											decline_code: "do_not_honor",
											type: "card_error",
										},
									},
									type: "payment_intent",
								},
								status: "open",
							},
						],
						has_more: false,
					},
					status: "open",
				},
			},
		});

		expect(record).toMatchObject({
			amount: 25,
			context: {
				failureCode: "card_declined",
				failureDeclineCode: "do_not_honor",
				failureType: "card_error",
				paymentIntentId: "pi_declined",
			},
		});
	});

	test("uses economic event time instead of object creation or retry arrival", () => {
		const [record] = normalizeStripeEvent({
			...acaciaIntent,
			api_version: "2025-08-27.basil",
			created: 1_700_172_800,
			data: {
				object: { ...acaciaIntent.data.object, created: 1_700_000_000, invoice: undefined },
			},
		});
		expect(record?.createdUnix).toBe(1_700_172_800);
	});

	test("retains embedded allocations before InvoicePayment paid webhooks exist", () => {
		const records = normalizeStripeEvent({
			...acaciaInvoice,
			api_version: "2025-03-31.basil",
			data: {
				object: {
					...acaciaInvoice.data.object,
					customer: "cus_invoice_only",
					metadata: { databuddy_session_id: "session-invoice-only" },
					payment_intent: undefined,
					payments: {
						data: [
							{
								amount_paid: 300,
								created: 1_700_000_190,
								currency: "usd",
								id: "inpay_embedded",
								invoice: "in_1",
								payment: {
									payment_intent: "pi_embedded",
									type: "payment_intent",
								},
								status: "paid",
							},
						],
						has_more: false,
					},
				},
			},
		});
		expect(records).toHaveLength(2);
		expect(records[0]).toMatchObject({
			customerId: "cus_invoice_only",
			rawMetadata: { databuddy_session_id: "session-invoice-only" },
			context: {
				invoiceId: "in_1",
				recordKind: "link",
			},
		});
		expect(records[0]?.context.paymentIntentId).toBeUndefined();
		expect(records[1]).toMatchObject({
			amount: 3,
			context: {
				invoiceId: "in_1",
				invoicePaymentId: "inpay_embedded",
				moneyKind: "invoice_payment",
				paymentIntentId: "pi_embedded",
			},
			transactionId: "inpay_embedded",
		});
		expect(usesInvoicePayments("2025-03-31.basil")).toBe(true);
		expect(emitsInvoicePaymentPaidEvents("2025-03-31.basil")).toBe(false);
	});

	test("uses a modern total fallback even before the endpoint subscribes", () => {
		expect(usesInvoicePayments("2025-03-30.acacia")).toBe(false);
		expect(emitsInvoicePaymentPaidEvents("2025-05-27.basil")).toBe(false);
		expect(emitsInvoicePaymentPaidEvents("2025-05-28.basil")).toBe(true);

		const records = normalizeStripeEvent({
			...acaciaInvoice,
			api_version: "2025-05-28.basil",
			data: {
				object: {
					...acaciaInvoice.data.object,
					payment_intent: undefined,
					payments: {
						data: [
							{
								amount_paid: 300,
								created: 1_700_000_190,
								currency: "usd",
								id: "inpay_direct",
								invoice: "in_1",
								payment: {
									payment_intent: "pi_direct",
									type: "payment_intent",
								},
								status: "paid",
							},
						],
						has_more: false,
					},
				},
			},
		});

		expect(records).toHaveLength(3);
		expect(records[0]).toMatchObject({
			context: { invoiceId: "in_1", recordKind: "link" },
			transactionId: "evt_invoice_paid",
		});
		expect(records[1]).toMatchObject({
			context: {
				invoiceId: "in_1",
				invoicePaymentId: "inpay_direct",
				paymentIntentId: "pi_direct",
				recordKind: "link",
			},
			transactionId: "evt_invoice_paid:inpay_direct",
		});
		expect(records[2]).toMatchObject({
			amount: 3,
			context: { invoiceId: "in_1", moneyKind: "invoice_fallback" },
			transactionId: "in_1",
		});
	});

	test("keeps transition-window totals when embedded allocations are paginated", () => {
		const records = normalizeStripeEvent({
			...acaciaInvoice,
			api_version: "2025-05-27.basil",
			data: {
				object: {
					...acaciaInvoice.data.object,
					payment_intent: undefined,
					payments: {
						data: [
							{
								amount_paid: 100,
								created: 1_700_000_190,
								currency: "usd",
							id: "inpay_partial_page",
							invoice: "in_1",
							payment: {
								payment_intent: "pi_partial_page",
								type: "payment_intent",
							},
							status: "paid",
							},
						],
						has_more: true,
					},
				},
			},
		});

		expect(records).toHaveLength(3);
		expect(records[1]).toMatchObject({
			context: {
				invoiceId: "in_1",
				invoicePaymentId: "inpay_partial_page",
				paymentIntentId: "pi_partial_page",
				recordKind: "link",
			},
			transactionId: "evt_invoice_paid:inpay_partial_page",
		});
		expect(records[2]).toMatchObject({
			amount: 3,
			context: { invoiceId: "in_1", moneyKind: "invoice_fallback" },
			transactionId: "in_1",
		});
	});

	test("keeps legacy out-of-band invoices as money", () => {
		const records = normalizeStripeEvent({
			...acaciaInvoice,
			api_version: "2024-10-28.acacia",
			data: {
				object: { ...acaciaInvoice.data.object, payment_intent: undefined },
			},
		});
		expect(records.some((record) => record.context.moneyKind === "invoice")).toBe(
			true
		);
	});

	test("serializes source identity without changing analytics attribution", () => {
		expect(
			stripeRecordMetadata(
				{ profile_id: "profile-1" },
				{
					apiVersion: "2025-08-27.basil",
					eventCreated: 123,
					eventId: "evt_1",
					eventType: "invoice_payment.paid",
					invoiceId: "in_1",
					paymentIntentId: "pi_1",
					recordKind: "money",
				}
			)
		).toEqual({
			databuddy_revenue_model: "stripe_events_v1",
			profile_id: "profile-1",
			stripe_api_version: "2025-08-27.basil",
			stripe_event_created: 123,
			stripe_event_id: "evt_1",
			stripe_event_type: "invoice_payment.paid",
			stripe_invoice_id: "in_1",
			stripe_payment_intent_id: "pi_1",
			stripe_record_kind: "money",
		});
		expect(
			stripeRecordMetadata(
				{},
				{
					eventCreated: 123,
					eventId: "evt_invoice",
					invoiceId: "in_1",
					moneyKind: "invoice_fallback",
					recordKind: "money",
				}
			)
		).toMatchObject({ stripe_money_kind: "invoice_fallback" });
	});
});
