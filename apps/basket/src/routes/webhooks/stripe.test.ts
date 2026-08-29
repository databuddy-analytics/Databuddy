import { describe, expect, test } from "vitest";
import { createHmac } from "node:crypto";
import { buildStripeMetadata, verifyStripeSignature } from "./stripe";
import {
	type StripeWebhookEvent,
	getInvoiceMetadata,
	normalizeStripeEvent,
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

	test("wrong secret → mismatch", () => {
		const header = sign(VALID_PAYLOAD, "wrong_secret");
		const result = verifyStripeSignature(VALID_PAYLOAD, header, SECRET);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain("mismatch");
		}
	});

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

	test("valid signature but invalid JSON body → error", () => {
		const broken = "not json {{{";
		const header = sign(broken);
		const result = verifyStripeSignature(broken, header, SECRET);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain("JSON");
		}
	});

});

describe("getInvoiceMetadata", () => {
	test("merges parent, subscription_details, and invoice metadata with invoice winning", () => {
		const merged = getInvoiceMetadata({
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
		getInvoiceMetadata({
				amount_paid: 100,
				created: 1_700_000_000,
				currency: "usd",
				id: "in_1",
			})
		).toEqual({});
	});
});

describe("normalizeStripeEvent", () => {
	const modernIntent = {
		api_version: "2025-08-27.basil",
		created: 1_700_000_200,
		id: "evt_pi_paid",
		type: "payment_intent.succeeded",
		data: {
			object: {
				amount: 300,
				created: 1_700_000_000,
				currency: "usd",
				id: "pi_1",
				metadata: {
					databuddy_profile_id: "profile-1",
					databuddy_session_id: "session-1",
				},
			},
		},
	} satisfies StripeWebhookEvent;
	const modernInvoice = {
		api_version: "2025-08-27.basil",
		created: 1_700_000_201,
		id: "evt_invoice_paid",
		type: "invoice.paid",
		data: {
			object: {
				amount_paid: 300,
				created: 1_699_900_000,
				currency: "usd",
				id: "in_1",
				payments: {
					data: [
						{
							amount_paid: 300,
							created: 1_700_000_190,
							currency: "usd",
							id: "inpay_1",
							invoice: "in_1",
							payment: {
								payment_intent: "pi_1",
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
	} satisfies StripeWebhookEvent;

	test("uses one immutable payment identity for modern invoice revenue", () => {
		const intent = {
			...modernIntent,
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
		const invoice = modernInvoice;
		const records = [
			...normalizeStripeEvent(intent),
			...normalizeStripeEvent(payment),
			...normalizeStripeEvent(invoice),
		];

		expect(records.find((record) => record.transactionId === "in_1")).toBeUndefined();
		expect(
			records.find((record) => record.transactionId === "inpay_1")
		).toMatchObject({
			amount: 3,
			context: {
				invoiceId: "in_1",
				paymentIntentId: "pi_1",
			},
			createdUnix: 1_700_000_202,
		});
		expect(
			records.find((record) => record.transactionId === "pi_1")
		).toMatchObject({ context: { paymentIntentId: "pi_1" } });
		expect(
			normalizeStripeEvent(invoice).filter(
				(record) => record.transactionId === "inpay_1"
			)
		).toHaveLength(1);
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
				...modernIntent,
				id: `evt_${currency}`,
				data: {
					object: {
						...modernIntent.data.object,
						amount,
						currency,
						id: `pi_${currency}`,
					},
				},
			});

			expect(record?.amount).toBe(expected);
			expect(record?.currency).toBe(currency.toUpperCase());
		}
	);

	test("applies zero-decimal conversion to attempts and refunds", () => {
		const [attempt] = normalizeStripeEvent({
			...modernIntent,
			id: "evt_jpy_failed",
			type: "payment_intent.payment_failed",
			data: {
				object: {
					...modernIntent.data.object,
					amount: 500,
					currency: "jpy",
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

	test("counts complete modern invoice out-of-band payment facts once", () => {
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
				context: {
					invoiceId: "in_oob",
				},
				transactionId: "in_oob:out_of_band",
			},
		]);
		expect(partialMoney).toContainEqual(
			expect.objectContaining({
				amount: 60,
					context: expect.objectContaining({
						invoiceId: "in_partial_oob",
						paymentIntentId: "pi_partial",
				}),
				transactionId: "inpay_partial",
			})
		);
		expect(partialMoney).toContainEqual(
			expect.objectContaining({
				amount: 40,
					context: expect.objectContaining({
						invoiceId: "in_partial_oob",
					}),
				transactionId: "in_partial_oob:out_of_band",
			})
		);
		expect(partiallyOutOfBand).toContainEqual(
			expect.objectContaining({
				context: expect.objectContaining({
					invoiceId: "in_partial_oob",
					paymentIntentId: "pi_partial",
				}),
				transactionId: "inpay_partial",
			})
		);
	});

	test("counts exact embedded allocations and out-of-band remainder", () => {
		const money = normalizeStripeEvent({
			api_version: "2025-08-27.basil",
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
					transactionId: "inpay_transition",
			},
				{
					amount: 40,
					transactionId: "in_transition_oob:out_of_band",
			},
		]);
	});

	test("uses payment IDs when modern invoice allocations are paginated", () => {
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
					amount: 1,
					transactionId: "inpay_1",
			},
				{
					amount: 2,
					transactionId: "inpay_2",
			},
		]);
		expect(records.find((record) => record.transactionId === "in_partial")).toBeUndefined();
	});

	test("does not infer modern out-of-band revenue from a paginated list", () => {
		const records = normalizeStripeEvent({
			api_version: "2025-08-27.basil",
			created: 1_700_000_300,
			id: "evt_paginated_oob",
			type: "invoice.paid",
			data: {
				object: {
					amount_paid: 400,
					created: 1_699_000_000,
					currency: "usd",
					id: "in_paginated_oob",
					payments: {
						has_more: true,
						data: [],
					},
					status: "paid",
				},
			},
		});

		expect(
			records.some(
				(record) => record.transactionId.endsWith(":out_of_band")
			)
		).toBe(false);
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
				...modernIntent,
				id: `evt_${status}`,
				type,
				data: {
					object: {
						...modernIntent.data.object,
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
			...modernIntent,
			id: "evt_declined",
			type: "payment_intent.payment_failed",
			data: {
				object: {
					...modernIntent.data.object,
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
		expect(buildStripeMetadata({}, record.context)).toMatchObject({
			stripe_failure_code: "card_declined",
			stripe_failure_decline_code: "insufficient_funds",
			stripe_failure_type: "card_error",
		});
		expect(JSON.stringify(buildStripeMetadata({}, record.context))).not.toContain(
			"provider message"
		);
	});

	test("rejects unbounded failure text but keeps a safe cancellation reason", () => {
		const [record] = normalizeStripeEvent({
			...modernIntent,
			id: "evt_canceled_reason",
			type: "payment_intent.canceled",
			data: {
				object: {
					...modernIntent.data.object,
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
		expect(buildStripeMetadata({}, record.context)).toMatchObject({
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
			...modernIntent,
			api_version: "2025-08-27.basil",
			created: 1_700_172_800,
			data: {
				object: { ...modernIntent.data.object, created: 1_700_000_000 },
			},
		});
		expect(record?.createdUnix).toBe(1_700_172_800);
	});

	test("keeps embedded payment identities when allocations are paginated", () => {
		const records = normalizeStripeEvent({
			...modernInvoice,
			api_version: "2025-08-27.basil",
			data: {
				object: {
					...modernInvoice.data.object,
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

		expect(records).toHaveLength(1);
		expect(records[0]).toMatchObject({
			context: {
				invoiceId: "in_1",
				paymentIntentId: "pi_partial_page",
			},
			transactionId: "inpay_partial_page",
		});
	});

	test("serializes source identity without changing analytics attribution", () => {
		expect(
				buildStripeMetadata(
					{ profile_id: "profile-1" },
					{
						eventType: "invoice_payment.paid",
					invoiceId: "in_1",
					paymentIntentId: "pi_1",
					recordKind: "money",
				}
			)
			).toEqual({
				profile_id: "profile-1",
				stripe_event_type: "invoice_payment.paid",
			stripe_invoice_id: "in_1",
			stripe_payment_intent_id: "pi_1",
			stripe_record_kind: "money",
		});
		expect(
				buildStripeMetadata(
					{},
					{
						eventType: "invoice.paid",
						invoiceId: "in_1",
						recordKind: "money",
					}
				)
			).toMatchObject({ stripe_event_type: "invoice.paid" });
	});
});
