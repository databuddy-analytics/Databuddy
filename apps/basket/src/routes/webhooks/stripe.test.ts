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
				status: "paid",
			},
		},
	} satisfies StripeWebhookEvent;

	test("records invoice money once, from the payment event only", () => {
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
					payment: { payment_intent: "pi_1" },
					status: "paid",
				},
			},
		} satisfies StripeWebhookEvent;
		const records = [
			...normalizeStripeEvent(modernIntent),
			...normalizeStripeEvent(payment),
			...normalizeStripeEvent(modernInvoice),
		];

		expect(
			records.filter((record) => record.context.recordKind === "money")
		).toHaveLength(2);
		expect(
			records.find((record) => record.transactionId === "inpay_1")
		).toMatchObject({
			amount: 3,
			context: { invoiceId: "in_1", paymentIntentId: "pi_1" },
			createdUnix: 1_700_000_202,
		});
		expect(
			records.find((record) => record.transactionId === "pi_1")
		).toMatchObject({ context: { paymentIntentId: "pi_1" } });
		expect(normalizeStripeEvent(modernInvoice)).toEqual([]);
	});

	test.each([
		["usd", 500, 5],
		["jpy", 500, 500],
		["isk", 500, 5],
		["ugx", 500, 5],
	] as const)("converts %s Stripe minor units using the charge exponent", (currency, amount, expected) => {
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
	});

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
				},
			},
		});

		expect(attempt?.amount).toBe(500);
		expect(refund?.amount).toBe(-250);
	});

	test("records a refund from the charge total Stripe actually sends", () => {
		const refundEvent = (id: string, amountRefunded: number) =>
			normalizeStripeEvent({
				api_version: "2025-08-27.basil",
				created: 1_700_000_700,
				id,
				type: "charge.refunded",
				data: {
					object: {
						amount_refunded: amountRefunded,
						currency: "usd",
						customer: "cus_refund",
						id: "ch_partial",
						payment_intent: "pi_refund",
					},
				},
			});

		const [first] = refundEvent("evt_refund_1", 500);
		const [second] = refundEvent("evt_refund_2", 1200);

		expect(first).toMatchObject({
			amount: -5,
			context: { paymentIntentId: "pi_refund", recordKind: "money" },
			customerId: "cus_refund",
			status: "refunded",
			transactionId: "ch_partial:refund",
			type: "refund",
		});
		expect(second?.amount).toBe(-12);
		expect(second?.transactionId).toBe(first?.transactionId);
	});

	test("ignores a charge.refunded delivery that reports nothing refunded", () => {
		expect(
			normalizeStripeEvent({
				api_version: "2025-08-27.basil",
				created: 1_700_000_701,
				type: "charge.refunded",
				id: "evt_refund_zero",
				data: {
					object: {
						amount_refunded: 0,
						currency: "usd",
						id: "ch_zero",
					},
				},
			})
		).toEqual([]);
	});

	test("carries invoice metadata on a link record when the invoice omits payments", () => {
		const invoiceMetadata = {
			databuddy_anonymous_id: "anon-sub",
			databuddy_client_id: "site-sub",
			databuddy_session_id: "session-sub",
		};
		const invoiceRecords = normalizeStripeEvent({
			api_version: "2025-03-31.basil",
			created: 1_700_000_500,
			id: "evt_invoice_no_payments",
			type: "invoice.paid",
			data: {
				object: {
					amount_paid: 900,
					created: 1_699_000_000,
					currency: "usd",
					customer: "cus_sub",
					id: "in_no_payments",
					metadata: invoiceMetadata,
					status: "paid",
				},
			},
		});
		const paymentRecords = normalizeStripeEvent({
			api_version: "2025-03-31.basil",
			created: 1_700_000_501,
			id: "evt_inpay_no_payments",
			type: "invoice_payment.paid",
			data: {
				object: {
					amount_paid: 900,
					created: 1_700_000_490,
					currency: "usd",
					id: "inpay_no_payments",
					invoice: "in_no_payments",
					payment: { type: "payment_intent", payment_intent: "pi_sub" },
					status: "paid",
				},
			},
		});

		expect(invoiceRecords).toMatchObject([
			{
				amount: 0,
				context: { invoiceId: "in_no_payments", recordKind: "link" },
				customerId: "cus_sub",
				rawMetadata: invoiceMetadata,
				status: "linked",
				transactionId: "in_no_payments:link",
				type: "subscription_event",
			},
		]);
		expect(paymentRecords).toMatchObject([
			{
				amount: 9,
				context: { invoiceId: "in_no_payments", recordKind: "money" },
				rawMetadata: {},
				transactionId: "inpay_no_payments",
			},
		]);
	});

	test("collapses invoice.paid and invoice.payment_succeeded onto one link id", () => {
		const invoiceObject = {
			amount_paid: 900,
			created: 1_699_000_000,
			currency: "usd",
			customer: "cus_dual",
			id: "in_dual",
			metadata: { databuddy_session_id: "session-dual" },
			status: "paid",
		};
		const paid = normalizeStripeEvent({
			api_version: "2025-08-27.basil",
			created: 1_700_000_600,
			id: "evt_dual_paid",
			type: "invoice.paid",
			data: { object: invoiceObject },
		});
		const succeeded = normalizeStripeEvent({
			api_version: "2025-08-27.basil",
			created: 1_700_000_601,
			id: "evt_dual_succeeded",
			type: "invoice.payment_succeeded",
			data: { object: invoiceObject },
		});

		expect(paid.map((record) => record.transactionId)).toEqual([
			"in_dual:link",
		]);
		expect(succeeded.map((record) => record.transactionId)).toEqual([
			"in_dual:link",
		]);
		expect(paid[0]?.rawMetadata).toEqual(succeeded[0]?.rawMetadata);
	});

	test("omits the invoice link record when no databuddy ids are present", () => {
		const records = normalizeStripeEvent({
			api_version: "2025-03-31.basil",
			created: 1_700_000_502,
			id: "evt_invoice_bare",
			type: "invoice.paid",
			data: {
				object: {
					amount_paid: 900,
					created: 1_699_000_000,
					currency: "usd",
					customer: "cus_bare",
					description: "Pro plan",
					id: "in_bare",
					metadata: { internal_order_id: "ord_1" },
					status: "paid",
				},
			},
		});

		expect(records).toEqual([]);
	});

	test("falls back through remaining, due and total for a failed invoice", () => {
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
		const base = {
			created: 1_699_000_000,
			currency: "usd",
			status: "open",
		};

		expect(
			failedInvoice("evt_remaining", {
				...base,
				amount_due: 10_000,
				amount_paid: 3000,
				amount_remaining: 7000,
				id: "in_remaining",
			})?.amount
		).toBe(70);
		expect(
			failedInvoice("evt_due", {
				...base,
				amount_due: 10_000,
				amount_paid: 0,
				id: "in_due",
			})?.amount
		).toBe(100);
		expect(
			failedInvoice("evt_total", {
				...base,
				amount_paid: 0,
				id: "in_total",
				total: 4500,
			})?.amount
		).toBe(45);
	});

	test("cannot recover invoice context from a direct InvoicePayment event", () => {
		const [record] = normalizeStripeEvent({
			api_version: "2025-08-27.basil",
			created: 1_700_000_500,
			id: "evt_direct_inpay",
			type: "invoice_payment.paid",
			data: {
				object: {
					amount_paid: 300,
					created: 1_700_000_490,
					currency: "usd",
					id: "inpay_direct",
					invoice: "in_direct",
					payment: { payment_intent: "pi_direct" },
					status: "paid",
				},
			},
		});

		expect(record).toMatchObject({
			amount: 3,
			context: { invoiceId: "in_direct", paymentIntentId: "pi_direct" },
			rawMetadata: {},
			transactionId: "inpay_direct",
		});
		expect(record?.customerId).toBeUndefined();
		expect(record?.productName).toBeUndefined();
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
		expect(
			JSON.stringify(buildStripeMetadata({}, record.context))
		).not.toContain("provider message");
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

	test("records an invoice failure attempt without a reason Stripe did not send", () => {
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
					status: "open",
				},
			},
		});

		expect(record).toMatchObject({
			amount: 25,
			context: { invoiceId: "in_declined", recordKind: "attempt" },
			status: "failed",
		});
		expect(record?.context.paymentIntentId).toBeUndefined();
		expect(record?.context.failureCode).toBeUndefined();
		expect(record?.context.failureDeclineCode).toBeUndefined();
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

	test("records the event API version so payload shape stays answerable", () => {
		const context = {
			eventType: "invoice_payment.paid",
			recordKind: "money",
		} as const;

		expect(buildStripeMetadata({}, context, "2025-05-28.basil")).toMatchObject({
			stripe_api_version: "2025-05-28.basil",
		});
		expect(buildStripeMetadata({}, context, "2025-03-31")).toMatchObject({
			stripe_api_version: "2025-03-31",
		});
		expect(buildStripeMetadata({}, context)).not.toHaveProperty(
			"stripe_api_version"
		);
		expect(
			buildStripeMetadata({}, context, "not-a-version")
		).not.toHaveProperty("stripe_api_version");
	});
});
