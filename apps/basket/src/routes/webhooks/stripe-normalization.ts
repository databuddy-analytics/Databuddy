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
	invoice?: string | WebhookInvoiceContext | null;
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
	payment_intent?: string | WebhookPaymentContext | null;
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

export type StripeRecordKind = "attempt" | "link" | "money";

const STRIPE_API_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;
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
// Stripe keeps charge amounts for these nominally zero-decimal currencies in
// two-decimal form for API compatibility (for example, 5 UGX is sent as 500).
const STRIPE_TWO_DECIMAL_COMPATIBILITY_CURRENCIES = new Set(["ISK", "UGX"]);

export interface NormalizedStripeRecord {
	amount: number;
	context: {
		apiVersion?: string;
		cancellationReason?: string;
		eventCreated: number;
		eventId: string;
		eventType?: string;
		failureCode?: string;
		failureDeclineCode?: string;
		failureType?: string;
		invoiceId?: string;
		invoicePaymentId?: string;
		moneyKind?:
			| "invoice"
			| "invoice_fallback"
			| "invoice_payment"
			| "refund"
			| "standalone_candidate";
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

export function expandableId(
	value: string | ExpandableObject | null | undefined
): string | undefined {
	if (!value) {
		return;
	}
	return typeof value === "string" ? value : value.id;
}

function customerId(
	value: string | ExpandableObject | null | undefined
): string | undefined {
	return expandableId(value);
}

function expandedObject<T extends ExpandableObject>(
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

function paymentFailureContext(
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

export function invoiceMetadataSources(
	invoice: WebhookInvoiceContext
): Record<string, string> {
	return {
		...invoice.parent?.subscription_details?.metadata,
		...invoice.subscription_details?.metadata,
		...invoice.metadata,
	};
}

function eventContext(
	event: StripeWebhookEvent,
	recordKind: StripeRecordKind,
	extra: Omit<
		NormalizedStripeRecord["context"],
		"apiVersion" | "eventCreated" | "eventId" | "recordKind"
	> = {}
): NormalizedStripeRecord["context"] {
	return {
		...(event.api_version ? { apiVersion: event.api_version } : {}),
		eventCreated: requireUnixSeconds(event.created, "Stripe event.created"),
		eventId: event.id,
		eventType: event.type,
		recordKind,
		...extra,
	};
}

function linkRecord(
	event: StripeWebhookEvent,
	input: {
		createdUnix?: number;
		currency: string;
		customerId?: string;
		invoiceId?: string;
		invoicePaymentId?: string;
		paymentIntentId?: string;
		productName?: string;
		rawMetadata?: Record<string, string>;
		transactionId?: string;
	}
): NormalizedStripeRecord {
	return {
		amount: 0,
		context: eventContext(event, "link", {
			...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
			...(input.invoicePaymentId
				? { invoicePaymentId: input.invoicePaymentId }
				: {}),
			...(input.paymentIntentId
				? { paymentIntentId: input.paymentIntentId }
				: {}),
		}),
		createdUnix: requireUnixSeconds(
			input.createdUnix ?? event.created,
			"Stripe link timestamp"
		),
		currency: input.currency.toUpperCase(),
		...(input.customerId ? { customerId: input.customerId } : {}),
		...(input.productName ? { productName: input.productName } : {}),
		rawMetadata: input.rawMetadata ?? {},
		status: "linked",
		transactionId: input.transactionId ?? event.id,
		type: "subscription_event",
	};
}

function attemptRecord(
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
		context: eventContext(event, "attempt", {
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

function invoicePaymentContext(payment: WebhookInvoicePayment): {
	customerId?: string;
	productName?: string;
	rawMetadata: Record<string, string>;
} {
	const invoice = expandedObject(payment.invoice);
	const paymentObject =
		expandedObject(payment.payment?.payment_intent) ??
		expandedObject(payment.payment?.charge) ??
		expandedObject(payment.payment?.payment_record);
	const productName =
		invoice?.description ?? paymentObject?.description ?? undefined;
	const resolvedCustomerId =
		customerId(invoice?.customer) ?? customerId(paymentObject?.customer);
	return {
		...(resolvedCustomerId ? { customerId: resolvedCustomerId } : {}),
		...(productName ? { productName } : {}),
		rawMetadata: {
			...paymentObject?.metadata,
			...(invoice ? invoiceMetadataSources(invoice) : {}),
		},
	};
}

function invoicePaymentRecord(
	event: StripeWebhookEvent,
	payment: WebhookInvoicePayment,
	rawMetadata: Record<string, string> = {},
	fallbackCustomerId?: string,
	fallbackProductName?: string
): NormalizedStripeRecord | null {
	if (payment.status !== "paid" || !payment.amount_paid) {
		return null;
	}
	const invoiceId = expandableId(payment.invoice);
	if (!invoiceId) {
		throw new Error("Stripe InvoicePayment is missing invoice identity");
	}
	const paymentIntentId = expandableId(payment.payment?.payment_intent);
	const expandedContext = invoicePaymentContext(payment);
	const resolvedCustomerId = fallbackCustomerId ?? expandedContext.customerId;
	const resolvedProductName =
		fallbackProductName ?? expandedContext.productName;
	return {
		amount: amountFromMinorUnits(
			payment.amount_paid,
			payment.currency,
			"Stripe InvoicePayment.amount_paid"
		),
		context: eventContext(event, "money", {
			invoiceId,
			invoicePaymentId: payment.id,
			moneyKind: "invoice_payment",
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

function invoicePaymentLinkRecord(
	event: StripeWebhookEvent,
	payment: WebhookInvoicePayment,
	rawMetadata: Record<string, string>,
	fallbackCustomerId?: string,
	fallbackProductName?: string
): NormalizedStripeRecord | null {
	if (payment.status !== "paid") {
		return null;
	}
	const invoiceId = expandableId(payment.invoice);
	const paymentIntentId = expandableId(payment.payment?.payment_intent);
	if (!(invoiceId && paymentIntentId)) {
		return null;
	}
	const expandedContext = invoicePaymentContext(payment);
	return linkRecord(event, {
		createdUnix: event.created,
		currency: payment.currency,
		customerId: fallbackCustomerId ?? expandedContext.customerId,
		invoiceId,
		invoicePaymentId: payment.id,
		paymentIntentId,
		productName: fallbackProductName ?? expandedContext.productName,
		rawMetadata: { ...expandedContext.rawMetadata, ...rawMetadata },
		// A relation and a later direct InvoicePayment event must survive FINAL
		// independently. Stripe event + allocation IDs are immutable on retries.
		transactionId: `${event.id}:${payment.id}`,
	});
}

function apiDate(apiVersion: string | null | undefined): string | null {
	const match = apiVersion?.match(STRIPE_API_DATE_PREFIX);
	return match?.[1] ?? null;
}

export function usesInvoicePayments(
	apiVersion: string | null | undefined
): boolean {
	const date = apiDate(apiVersion);
	return date !== null && date >= "2025-03-31";
}

export function emitsInvoicePaymentPaidEvents(
	apiVersion: string | null | undefined
): boolean {
	const date = apiDate(apiVersion);
	return date !== null && date >= "2025-05-28";
}

function normalizePaymentIntent(
	event: StripeWebhookEvent,
	status: "canceled" | "failed" | "succeeded"
): NormalizedStripeRecord[] {
	const intent = event.data.object as WebhookPaymentIntent;
	const invoiceId = expandableId(intent.invoice);
	const common = {
		createdUnix: event.created,
		currency: intent.currency,
		customerId: customerId(intent.customer),
		invoiceId,
		paymentIntentId: intent.id,
		productName: intent.description ?? undefined,
		rawMetadata: intent.metadata,
	};
	if (status !== "succeeded") {
		return [
			attemptRecord(event, {
				...common,
				amountMinorUnits: intent.amount,
				reason: paymentFailureContext(intent),
				status,
			}),
		];
	}
	if (invoiceId) {
		return [linkRecord(event, common)];
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
			context: eventContext(event, "money", {
				moneyKind: "standalone_candidate",
				paymentIntentId: intent.id,
			}),
			createdUnix: requireUnixSeconds(event.created, "Stripe payment time"),
			currency: intent.currency.toUpperCase(),
			...(common.customerId ? { customerId: common.customerId } : {}),
			...(common.productName ? { productName: common.productName } : {}),
			rawMetadata: intent.metadata ?? {},
			status: "completed",
			transactionId: intent.id,
			type: "sale",
		},
	];
}

function invoiceMoneyRecord(
	event: StripeWebhookEvent,
	invoice: WebhookInvoice,
	amountMinorUnits: number,
	input: {
		customerId?: string;
		moneyKind?: "invoice" | "invoice_fallback";
		paymentIntentId?: string;
		productName?: string;
		rawMetadata: Record<string, string>;
	}
): NormalizedStripeRecord {
	return {
		amount: amountFromMinorUnits(
			amountMinorUnits,
			invoice.currency,
			"Stripe Invoice.amount_paid"
		),
		context: eventContext(event, "money", {
			invoiceId: invoice.id,
			moneyKind: input.moneyKind ?? "invoice",
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
		transactionId: invoice.id,
		// Old readers exclude subscription events. The reconciler promotes marked
		// fallbacks to subscription money, making Basket/API rollout order safe.
		type:
			input.moneyKind === "invoice_fallback"
				? "subscription_event"
				: "subscription",
	};
}

function paidInvoiceAllocationMinorUnits(invoice: WebhookInvoice): number {
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

function normalizePaidInvoice(
	event: StripeWebhookEvent
): NormalizedStripeRecord[] {
	const invoice = event.data.object as WebhookInvoice;
	const rawMetadata = invoiceMetadataSources(invoice);
	const invoiceCustomerId = customerId(invoice.customer);
	const productName = invoice.description ?? undefined;
	const context = linkRecord(event, {
		currency: invoice.currency,
		customerId: invoiceCustomerId,
		invoiceId: invoice.id,
		productName,
		rawMetadata,
	});
	if (invoice.status !== "paid" || invoice.amount_paid <= 0) {
		return [context];
	}

	const supportsInvoicePayments = usesInvoicePayments(event.api_version);
	const legacyPaymentIntentId = expandableId(invoice.payment_intent);
	if (!supportsInvoicePayments && legacyPaymentIntentId) {
		return [
			context,
			invoiceMoneyRecord(event, invoice, invoice.amount_paid, {
				customerId: invoiceCustomerId,
				paymentIntentId: legacyPaymentIntentId,
				productName,
				rawMetadata,
			}),
		];
	}

	const needsFallback =
		emitsInvoicePaymentPaidEvents(event.api_version) ||
		(supportsInvoicePayments &&
			(invoice.payments == null || invoice.payments.has_more === true));
	if (needsFallback) {
		const paymentLinks = (invoice.payments?.data ?? [])
			.map((payment) =>
				invoicePaymentLinkRecord(
					event,
					payment,
					rawMetadata,
					invoiceCustomerId,
					productName
				)
			)
			.filter((record): record is NormalizedStripeRecord => record !== null);
		// Modern endpoints may not have subscribed to invoice_payment.paid yet,
		// while transition snapshots can be paginated. Reads subtract any exact
		// allocations from this total, so neither case loses or duplicates money.
		return [
			context,
			...paymentLinks,
			invoiceMoneyRecord(event, invoice, invoice.amount_paid, {
				customerId: invoiceCustomerId,
				moneyKind: "invoice_fallback",
				paymentIntentId: legacyPaymentIntentId,
				productName,
				rawMetadata,
			}),
		];
	}

	// InvoicePayment objects shipped before their paid webhook. During that
	// transition window, embedded allocations are the only exact money source.
	// Older snapshots can expose the same shape, so retain those allocations too.
	const allocations = (invoice.payments?.data ?? [])
		.map((payment) =>
			invoicePaymentRecord(
				event,
				payment,
				rawMetadata,
				invoiceCustomerId,
				productName
			)
		)
		.filter((record): record is NormalizedStripeRecord => record !== null);
	if (supportsInvoicePayments) {
		const outOfBandMinorUnits = Math.max(
			0,
			invoice.amount_paid - paidInvoiceAllocationMinorUnits(invoice)
		);
		return [
			context,
			...allocations,
			...(outOfBandMinorUnits > 0
				? [
						invoiceMoneyRecord(event, invoice, outOfBandMinorUnits, {
							customerId: invoiceCustomerId,
							productName,
							rawMetadata,
						}),
					]
				: []),
		];
	}
	if (allocations.length > 0) {
		return [context, ...allocations];
	}

	// Old snapshot versions can represent out-of-band invoices with no PaymentIntent.
	return [
		context,
		invoiceMoneyRecord(event, invoice, invoice.amount_paid, {
			customerId: invoiceCustomerId,
			productName,
			rawMetadata,
		}),
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
	const requestedPaymentIntentId = expandableId(
		requestedPayment?.payment?.payment_intent
	);
	const requestedPaymentIntent = expandedObject(
		requestedPayment?.payment?.payment_intent
	);
	const invoicePaymentIntent = expandedObject(invoice.payment_intent);
	const amountMinorUnits =
		requestedPayment?.amount_requested ??
		(nonNegativeInteger(invoice.amount_remaining)
			? invoice.amount_remaining
			: undefined) ??
		(nonNegativeInteger(invoice.amount_due) ? invoice.amount_due : undefined) ??
		(nonNegativeInteger(invoice.total) ? invoice.total : undefined) ??
		invoice.amount_paid;
	return [
		attemptRecord(event, {
			amountMinorUnits,
			currency: invoice.currency,
			customerId: customerId(invoice.customer),
			invoiceId: invoice.id,
			paymentIntentId:
				requestedPaymentIntentId ?? expandableId(invoice.payment_intent),
			productName: invoice.description ?? undefined,
			rawMetadata: invoiceMetadataSources(invoice),
			reason: paymentFailureContext(
				requestedPaymentIntent,
				invoicePaymentIntent
			),
			status: "failed",
		}),
	];
}

function normalizeRefund(event: StripeWebhookEvent): NormalizedStripeRecord[] {
	const charge = event.data.object as WebhookCharge;
	const paymentIntentId = expandableId(charge.payment_intent);
	return (charge.refunds?.data ?? []).map((refund) => ({
		amount: -amountFromMinorUnits(
			refund.amount,
			charge.currency,
			"Stripe Refund.amount"
		),
		context: eventContext(event, "money", {
			moneyKind: "refund",
			...(paymentIntentId ? { paymentIntentId } : {}),
		}),
		createdUnix: requireUnixSeconds(refund.created, "Stripe refund time"),
		currency: charge.currency.toUpperCase(),
		...(customerId(charge.customer)
			? { customerId: customerId(charge.customer) }
			: {}),
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
			const payment = invoicePaymentRecord(
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
