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
			purpose: "Records invoice and subscription context",
		},
		{
			event: "invoice_payment.paid",
			purpose: "Records exact invoice allocations on modern Stripe versions",
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
