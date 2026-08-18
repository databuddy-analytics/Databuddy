export const STRIPE_FAILURE_WEBHOOK_EVENTS = [
	{
		event: "payment_intent.payment_failed",
		purpose: "Tracks failed payment attempts",
	},
	{
		event: "invoice.payment_failed",
		purpose: "Tracks failed invoice attempts and retries",
	},
] as const;

export const STRIPE_WEBHOOK_EVENTS = {
	required: [
		{
			event: "payment_intent.succeeded",
			purpose: "Records successful one-time payments and payment context",
		},
		{
			event: "invoice.paid",
			purpose: "Provides invoice context and records out-of-band payment facts",
		},
		{
			event: "invoice_payment.paid",
			purpose: "Records the canonical payment for modern Stripe invoices",
		},
		STRIPE_FAILURE_WEBHOOK_EVENTS[0],
		{
			event: "payment_intent.canceled",
			purpose: "Tracks canceled payment attempts",
		},
		STRIPE_FAILURE_WEBHOOK_EVENTS[1],
		{
			event: "charge.refunded",
			purpose: "Records each refund",
		},
	],
	optional: [],
} as const;
