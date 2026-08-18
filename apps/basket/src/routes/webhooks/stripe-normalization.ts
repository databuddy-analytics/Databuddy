export interface ExpandableObject {
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

export interface WebhookPaymentIntent extends WebhookContextObject {
	amount: number;
	amount_received?: number;
	cancellation_reason?: unknown;
	created: number;
	currency: string;
	last_payment_error?: WebhookPaymentError | null;
}

export interface WebhookInvoicePayment {
	amount_paid?: number | null;
	amount_requested?: number | null;
	created: number;
	currency: string;
	id: string;
	invoice: string | WebhookInvoiceContext;
	is_default?: boolean;
	payment?: {
		charge?: string | WebhookContextObject | null;
		payment_intent?: string | WebhookPaymentContext | null;
		payment_record?: string | WebhookContextObject | null;
		type: "charge" | "payment_intent" | "payment_record";
	};
	status: "canceled" | "open" | "paid";
}

export interface WebhookInvoice extends WebhookInvoiceContext {
	amount_due?: number;
	amount_paid: number;
	amount_remaining?: number;
	billing_reason?: string | null;
	created: number;
	currency: string;
	payments?: {
		data: WebhookInvoicePayment[];
		has_more?: boolean;
	} | null;
	status?: string;
	subscription?: string | null;
	total?: number;
}

export interface WebhookCharge extends WebhookContextObject {
	amount_refunded: number;
	currency: string;
	payment_intent?: string | WebhookContextObject | null;
	refunds?: {
		data: Array<{
			amount: number;
			created: number;
			id: string;
		}>;
	};
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

export type StripeRecordKind = "attempt" | "money";

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
	status: "canceled" | "completed" | "failed" | "refunded";
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

export function getExpandableId(
	value: string | ExpandableObject | null | undefined
): string | undefined {
	if (!value) {
		return;
	}
	return typeof value === "string" ? value : value.id;
}

function getCustomerId(
	value: string | ExpandableObject | null | undefined
): string | undefined {
	return getExpandableId(value);
}

function getExpandedObject<T extends ExpandableObject>(
	value: string | T | null | undefined
): T | undefined {
	return typeof value === "object" && value !== null ? value : undefined;
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

function getInvoicePaymentContext(payment: WebhookInvoicePayment): {
	customerId?: string;
	productName?: string;
	rawMetadata: Record<string, string>;
} {
	const invoice = getExpandedObject(payment.invoice);
	const paymentObject =
		getExpandedObject(payment.payment?.payment_intent) ??
		getExpandedObject(payment.payment?.charge) ??
		getExpandedObject(payment.payment?.payment_record);
	const productName =
		invoice?.description ?? paymentObject?.description ?? undefined;
	const resolvedCustomerId =
		getCustomerId(invoice?.customer) ?? getCustomerId(paymentObject?.customer);
	return {
		...(resolvedCustomerId ? { customerId: resolvedCustomerId } : {}),
		...(productName ? { productName } : {}),
		rawMetadata: {
			...paymentObject?.metadata,
			...(invoice ? getInvoiceMetadata(invoice) : {}),
		},
	};
}

function buildInvoicePaymentRecord(
	event: StripeWebhookEvent,
	payment: WebhookInvoicePayment,
	rawMetadata: Record<string, string> = {},
	fallbackCustomerId?: string,
	fallbackProductName?: string
): NormalizedStripeRecord | null {
	if (payment.status !== "paid" || !payment.amount_paid) {
		return null;
	}
	const invoiceId = getExpandableId(payment.invoice);
	if (!invoiceId) {
		throw new Error("Stripe InvoicePayment is missing invoice identity");
	}
	const paymentIntentId = getExpandableId(payment.payment?.payment_intent);
	const expandedContext = getInvoicePaymentContext(payment);
	const resolvedCustomerId = fallbackCustomerId ?? expandedContext.customerId;
	const resolvedProductName =
		fallbackProductName ?? expandedContext.productName;
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
		...(resolvedCustomerId ? { customerId: resolvedCustomerId } : {}),
		...(resolvedProductName ? { productName: resolvedProductName } : {}),
		rawMetadata: { ...expandedContext.rawMetadata, ...rawMetadata },
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
		customerId: getCustomerId(intent.customer),
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

function buildOutOfBandPaymentRecord(
	event: StripeWebhookEvent,
	invoice: WebhookInvoice,
	amountMinorUnits: number,
	input: {
		customerId?: string;
		paymentIntentId?: string;
		productName?: string;
		rawMetadata: Record<string, string>;
		transactionId: string;
	}
): NormalizedStripeRecord {
	return {
		amount: amountFromMinorUnits(
			amountMinorUnits,
			invoice.currency,
			"Stripe Invoice.amount_paid"
		),
		context: buildRecordContext(event, "money", {
			invoiceId: invoice.id,
			...(input.paymentIntentId
				? { paymentIntentId: input.paymentIntentId }
				: {}),
		}),
		createdUnix: requireUnixSeconds(event.created, "Stripe payment time"),
		currency: invoice.currency.toUpperCase(),
		...(input.customerId ? { customerId: input.customerId } : {}),
		...(input.productName ? { productName: input.productName } : {}),
		rawMetadata: input.rawMetadata,
		status: "completed",
		transactionId: input.transactionId,
		type: "subscription",
	};
}

function sumPaidInvoiceAllocations(invoice: WebhookInvoice): number {
	return (invoice.payments?.data ?? []).reduce((total, payment) => {
		if (
			payment.status !== "paid" ||
			!Number.isSafeInteger(payment.amount_paid) ||
			Number(payment.amount_paid) <= 0
		) {
			return total;
		}
		return total + Number(payment.amount_paid);
	}, 0);
}

function getOutOfBandPaymentAmount(invoice: WebhookInvoice): number | null {
	if (!invoice.payments || invoice.payments.has_more === true) {
		return null;
	}
	return Math.max(0, invoice.amount_paid - sumPaidInvoiceAllocations(invoice));
}

function normalizePaidInvoice(
	event: StripeWebhookEvent
): NormalizedStripeRecord[] {
	const invoice = event.data.object as WebhookInvoice;
	const rawMetadata = getInvoiceMetadata(invoice);
	const invoiceCustomerId = getCustomerId(invoice.customer);
	const productName = invoice.description ?? undefined;
	if (invoice.status !== "paid" || invoice.amount_paid <= 0) {
		return [];
	}

	const allocations = (invoice.payments?.data ?? [])
		.map((payment) =>
			buildInvoicePaymentRecord(
				event,
				payment,
				rawMetadata,
				invoiceCustomerId,
				productName
			)
		)
		.filter((record): record is NormalizedStripeRecord => record !== null);
	const outOfBandMinorUnits = getOutOfBandPaymentAmount(invoice);
	return [
		...allocations,
		...(outOfBandMinorUnits !== null && outOfBandMinorUnits > 0
			? [
					buildOutOfBandPaymentRecord(event, invoice, outOfBandMinorUnits, {
						customerId: invoiceCustomerId,
						productName,
						rawMetadata,
						transactionId: `${invoice.id}:out_of_band`,
					}),
				]
			: []),
	];
}

function normalizeFailedInvoice(
	event: StripeWebhookEvent
): NormalizedStripeRecord[] {
	const invoice = event.data.object as WebhookInvoice;
	const openPayments = (invoice.payments?.data ?? []).filter(
		(payment) =>
			payment.status === "open" && nonNegativeInteger(payment.amount_requested)
	);
	const requestedPayment =
		openPayments.find((payment) => payment.is_default) ??
		(openPayments.length === 1 ? openPayments[0] : undefined);
	const requestedPaymentIntentId = getExpandableId(
		requestedPayment?.payment?.payment_intent
	);
	const requestedPaymentIntent = getExpandedObject(
		requestedPayment?.payment?.payment_intent
	);
	const amountMinorUnits =
		requestedPayment?.amount_requested ??
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
			customerId: getCustomerId(invoice.customer),
			invoiceId: invoice.id,
			...(requestedPaymentIntentId
				? { paymentIntentId: requestedPaymentIntentId }
				: {}),
			productName: invoice.description ?? undefined,
			rawMetadata: getInvoiceMetadata(invoice),
			reason: getPaymentFailureContext(requestedPaymentIntent),
			status: "failed",
		}),
	];
}

function normalizeRefund(event: StripeWebhookEvent): NormalizedStripeRecord[] {
	const charge = event.data.object as WebhookCharge;
	const paymentIntentId = getExpandableId(charge.payment_intent);
	const refundCustomerId = getCustomerId(charge.customer);
	return (charge.refunds?.data ?? []).map((refund) => ({
		amount: -amountFromMinorUnits(
			refund.amount,
			charge.currency,
			"Stripe Refund.amount"
		),
		context: buildRecordContext(event, "money", {
			...(paymentIntentId ? { paymentIntentId } : {}),
		}),
		createdUnix: requireUnixSeconds(refund.created, "Stripe refund time"),
		currency: charge.currency.toUpperCase(),
		...(refundCustomerId ? { customerId: refundCustomerId } : {}),
		productName: "Refund",
		rawMetadata: charge.metadata ?? {},
		status: "refunded",
		transactionId: refund.id,
		type: "refund",
	}));
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
