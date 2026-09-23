interface ExpandableObject {
	id: string;
}

interface WebhookContextObject extends ExpandableObject {
	customer?: string | ExpandableObject | null;
	description?: string | null;
	metadata?: Record<string, string>;
}

interface WebhookPaymentError {
	code?: unknown;
	decline_code?: unknown;
	message?: unknown;
	type?: unknown;
}

interface WebhookPaymentContext extends WebhookContextObject {
	cancellation_reason?: unknown;
	last_payment_error?: WebhookPaymentError | null;
}

interface WebhookInvoiceContext extends WebhookContextObject {
	parent?: {
		subscription_details?: {
			metadata?: Record<string, string> | null;
		} | null;
	} | null;
	subscription_details?: {
		metadata?: Record<string, string> | null;
	} | null;
}

interface WebhookPaymentIntent extends WebhookContextObject {
	amount: number;
	amount_received?: number;
	cancellation_reason?: unknown;
	created: number;
	currency: string;
	last_payment_error?: WebhookPaymentError | null;
}

interface WebhookInvoicePayment {
	amount_paid?: number | null;
	created: number;
	currency: string;
	id: string;
	invoice: string;
	payment?: {
		payment_intent?: string | null;
	};
	status: "canceled" | "open" | "paid";
}

interface WebhookInvoice extends WebhookInvoiceContext {
	amount_due?: number;
	amount_paid: number;
	amount_remaining?: number;
	billing_reason?: string | null;
	created: number;
	currency: string;
	status?: string;
	subscription?: string | null;
	total?: number;
}

interface WebhookCharge extends WebhookContextObject {
	amount_refunded: number;
	created: number;
	currency: string;
	payment_intent?: string | null;
}

export interface StripeWebhookEvent {
	api_version?: string | null;
	created: number;
	data: {
		object:
			| WebhookCharge
			| WebhookInvoice
			| WebhookInvoicePayment
			| WebhookPaymentIntent;
	};
	id: string;
	type: string;
}

type StripeRecordKind = "attempt" | "link" | "money";

const STRIPE_ZERO_DECIMAL_CURRENCIES = new Set([
	"BIF",
	"CLP",
	"DJF",
	"GNF",
	"JPY",
	"KMF",
	"KRW",
	"MGA",
	"PYG",
	"RWF",
	"UGX",
	"VND",
	"VUV",
	"XAF",
	"XOF",
	"XPF",
]);
const STRIPE_TWO_DECIMAL_COMPATIBILITY_CURRENCIES = new Set(["ISK", "UGX"]);

export interface NormalizedStripeRecord {
	amount: number;
	context: {
		cancellationReason?: string;
		eventType: string;
		failureCode?: string;
		failureDeclineCode?: string;
		failureType?: string;
		invoiceId?: string;
		paymentIntentId?: string;
		recordKind: StripeRecordKind;
	};
	createdUnix: number;
	currency: string;
	customerId?: string;
	productName?: string;
	rawMetadata: Record<string, string>;
	status: "canceled" | "completed" | "failed" | "linked" | "refunded";
	transactionId: string;
	type: "refund" | "sale" | "subscription" | "subscription_event";
}

function validUnixSeconds(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) > 0;
}

function requireUnixSeconds(value: unknown, label: string): number {
	if (!validUnixSeconds(value)) {
		throw new Error(`${label} must be a positive Unix timestamp`);
	}
	return value;
}

function amountFromMinorUnits(
	value: unknown,
	currency: string,
	label: string
): number {
	if (!(Number.isSafeInteger(value) && Number(value) > 0)) {
		throw new Error(`${label} must be a positive integer`);
	}
	const normalizedCurrency = currency.toUpperCase();
	const exponent =
		STRIPE_ZERO_DECIMAL_CURRENCIES.has(normalizedCurrency) &&
		!STRIPE_TWO_DECIMAL_COMPATIBILITY_CURRENCIES.has(normalizedCurrency)
			? 0
			: 2;
	return Number(value) / 10 ** exponent;
}

function nonNegativeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) >= 0;
}

function getExpandableId(
	value: string | ExpandableObject | null | undefined
): string | undefined {
	if (!value) {
		return;
	}
	return typeof value === "string" ? value : value.id;
}

const STRIPE_REASON_TOKEN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function reasonToken(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return;
	}
	const token = value.trim().toLowerCase();
	return STRIPE_REASON_TOKEN.test(token) ? token : undefined;
}

function getPaymentFailureContext(
	...sources: Array<WebhookPaymentContext | undefined>
): Pick<
	NormalizedStripeRecord["context"],
	"cancellationReason" | "failureCode" | "failureDeclineCode" | "failureType"
> {
	const first = (read: (source: WebhookPaymentContext) => unknown) =>
		sources
			.map((source) => (source ? reasonToken(read(source)) : undefined))
			.find((value): value is string => value !== undefined);
	const cancellationReason = first((source) => source.cancellation_reason);
	const failureCode = first((source) => source.last_payment_error?.code);
	const failureDeclineCode = first(
		(source) => source.last_payment_error?.decline_code
	);
	const failureType = first((source) => source.last_payment_error?.type);
	return {
		...(cancellationReason ? { cancellationReason } : {}),
		...(failureCode ? { failureCode } : {}),
		...(failureDeclineCode ? { failureDeclineCode } : {}),
		...(failureType ? { failureType } : {}),
	};
}

export function getInvoiceMetadata(
	invoice: WebhookInvoiceContext
): Record<string, string> {
	return {
		...invoice.parent?.subscription_details?.metadata,
		...invoice.subscription_details?.metadata,
		...invoice.metadata,
	};
}

function buildRecordContext(
	event: StripeWebhookEvent,
	recordKind: StripeRecordKind,
	extra: Omit<
		NormalizedStripeRecord["context"],
		"eventType" | "recordKind"
	> = {}
): NormalizedStripeRecord["context"] {
	return {
		eventType: event.type,
		recordKind,
		...extra,
	};
}

function buildAttemptRecord(
	event: StripeWebhookEvent,
	input: {
		amountMinorUnits: number;
		createdUnix?: number;
		currency: string;
		customerId?: string;
		invoiceId?: string;
		paymentIntentId?: string;
		productName?: string;
		rawMetadata?: Record<string, string>;
		reason?: Pick<
			NormalizedStripeRecord["context"],
			| "cancellationReason"
			| "failureCode"
			| "failureDeclineCode"
			| "failureType"
		>;
		status: "canceled" | "failed";
	}
): NormalizedStripeRecord {
	return {
		amount:
			Number.isSafeInteger(input.amountMinorUnits) && input.amountMinorUnits > 0
				? amountFromMinorUnits(
						input.amountMinorUnits,
						input.currency,
						"Stripe attempt amount"
					)
				: 0,
		context: buildRecordContext(event, "attempt", {
			...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
			...(input.paymentIntentId
				? { paymentIntentId: input.paymentIntentId }
				: {}),
			...input.reason,
		}),
		createdUnix: requireUnixSeconds(
			input.createdUnix ?? event.created,
			"Stripe attempt timestamp"
		),
		currency: input.currency.toUpperCase(),
		...(input.customerId ? { customerId: input.customerId } : {}),
		...(input.productName ? { productName: input.productName } : {}),
		rawMetadata: input.rawMetadata ?? {},
		status: input.status,
		transactionId: event.id,
		type: "subscription_event",
	};
}

function buildInvoicePaymentRecord(
	event: StripeWebhookEvent,
	payment: WebhookInvoicePayment
): NormalizedStripeRecord | null {
	if (payment.status !== "paid" || !payment.amount_paid) {
		return null;
	}
	const invoiceId = getExpandableId(payment.invoice);
	if (!invoiceId) {
		throw new Error("Stripe InvoicePayment is missing invoice identity");
	}
	const paymentIntentId = getExpandableId(payment.payment?.payment_intent);
	return {
		amount: amountFromMinorUnits(
			payment.amount_paid,
			payment.currency,
			"Stripe InvoicePayment.amount_paid"
		),
		context: buildRecordContext(event, "money", {
			invoiceId,
			...(paymentIntentId ? { paymentIntentId } : {}),
		}),
		createdUnix: requireUnixSeconds(event.created, "Stripe payment time"),
		currency: payment.currency.toUpperCase(),
		rawMetadata: {},
		status: "completed",
		transactionId: payment.id,
		type: "subscription",
	};
}

function normalizePaymentIntent(
	event: StripeWebhookEvent,
	status: "canceled" | "failed" | "succeeded"
): NormalizedStripeRecord[] {
	const intent = event.data.object as WebhookPaymentIntent;
	const paymentDetails = {
		createdUnix: event.created,
		currency: intent.currency,
		customerId: getExpandableId(intent.customer),
		paymentIntentId: intent.id,
		productName: intent.description ?? undefined,
		rawMetadata: intent.metadata,
	};
	if (status !== "succeeded") {
		return [
			buildAttemptRecord(event, {
				...paymentDetails,
				amountMinorUnits: intent.amount,
				reason: getPaymentFailureContext(intent),
				status,
			}),
		];
	}
	const amountMinorUnits =
		intent.amount_received && intent.amount_received > 0
			? intent.amount_received
			: intent.amount;
	return [
		{
			amount: amountFromMinorUnits(
				amountMinorUnits,
				intent.currency,
				"Stripe PaymentIntent amount"
			),
			context: buildRecordContext(event, "money", {
				paymentIntentId: intent.id,
			}),
			createdUnix: requireUnixSeconds(event.created, "Stripe payment time"),
			currency: intent.currency.toUpperCase(),
			...(paymentDetails.customerId
				? { customerId: paymentDetails.customerId }
				: {}),
			...(paymentDetails.productName
				? { productName: paymentDetails.productName }
				: {}),
			rawMetadata: intent.metadata ?? {},
			status: "completed",
			transactionId: intent.id,
			type: "sale",
		},
	];
}

function buildInvoiceLinkRecord(
	event: StripeWebhookEvent,
	invoice: WebhookInvoice,
	input: {
		customerId?: string;
		productName?: string;
		rawMetadata: Record<string, string>;
	}
): NormalizedStripeRecord | null {
	const linksAVisitor = Object.keys(input.rawMetadata).some((key) =>
		key.startsWith("databuddy_")
	);
	if (!linksAVisitor) {
		return null;
	}
	return {
		amount: 0,
		context: buildRecordContext(event, "link", { invoiceId: invoice.id }),
		createdUnix: requireUnixSeconds(event.created, "Stripe payment time"),
		currency: invoice.currency.toUpperCase(),
		...(input.customerId ? { customerId: input.customerId } : {}),
		...(input.productName ? { productName: input.productName } : {}),
		rawMetadata: input.rawMetadata,
		status: "linked",
		transactionId: `${invoice.id}:link`,
		type: "subscription_event",
	};
}

function normalizePaidInvoice(
	event: StripeWebhookEvent
): NormalizedStripeRecord[] {
	const invoice = event.data.object as WebhookInvoice;
	if (invoice.status !== "paid" || invoice.amount_paid <= 0) {
		return [];
	}
	const link = buildInvoiceLinkRecord(event, invoice, {
		customerId: getExpandableId(invoice.customer),
		productName: invoice.description ?? undefined,
		rawMetadata: getInvoiceMetadata(invoice),
	});
	return link ? [link] : [];
}

function normalizeFailedInvoice(
	event: StripeWebhookEvent
): NormalizedStripeRecord[] {
	const invoice = event.data.object as WebhookInvoice;
	const amountMinorUnits =
		(nonNegativeInteger(invoice.amount_remaining)
			? invoice.amount_remaining
			: undefined) ??
		(nonNegativeInteger(invoice.amount_due) ? invoice.amount_due : undefined) ??
		(nonNegativeInteger(invoice.total) ? invoice.total : undefined) ??
		invoice.amount_paid;
	return [
		buildAttemptRecord(event, {
			amountMinorUnits,
			currency: invoice.currency,
			customerId: getExpandableId(invoice.customer),
			invoiceId: invoice.id,
			productName: invoice.description ?? undefined,
			rawMetadata: getInvoiceMetadata(invoice),
			status: "failed",
		}),
	];
}

function normalizeRefund(event: StripeWebhookEvent): NormalizedStripeRecord[] {
	const charge = event.data.object as WebhookCharge;
	if (
		!(
			Number.isSafeInteger(charge.amount_refunded) && charge.amount_refunded > 0
		)
	) {
		return [];
	}
	const paymentIntentId = getExpandableId(charge.payment_intent);
	const refundCustomerId = getExpandableId(charge.customer);
	return [
		{
			amount: -amountFromMinorUnits(
				charge.amount_refunded,
				charge.currency,
				"Stripe Charge.amount_refunded"
			),
			context: buildRecordContext(event, "money", {
				...(paymentIntentId ? { paymentIntentId } : {}),
			}),
			createdUnix: requireUnixSeconds(charge.created, "Stripe charge time"),
			currency: charge.currency.toUpperCase(),
			...(refundCustomerId ? { customerId: refundCustomerId } : {}),
			productName: "Refund",
			rawMetadata: charge.metadata ?? {},
			status: "refunded",
			transactionId: `${charge.id}:refund`,
			type: "refund",
		},
	];
}

export function normalizeStripeEvent(
	event: StripeWebhookEvent
): NormalizedStripeRecord[] {
	requireUnixSeconds(event.created, "Stripe event.created");
	switch (event.type) {
		case "payment_intent.succeeded":
			return normalizePaymentIntent(event, "succeeded");
		case "payment_intent.payment_failed":
			return normalizePaymentIntent(event, "failed");
		case "payment_intent.canceled":
			return normalizePaymentIntent(event, "canceled");
		case "invoice.paid":
		case "invoice.payment_succeeded":
			return normalizePaidInvoice(event);
		case "invoice.payment_failed":
			return normalizeFailedInvoice(event);
		case "invoice_payment.paid": {
			const payment = buildInvoicePaymentRecord(
				event,
				event.data.object as WebhookInvoicePayment
			);
			return payment ? [payment] : [];
		}
		case "charge.refunded":
			return normalizeRefund(event);
		default:
			return [];
	}
}
