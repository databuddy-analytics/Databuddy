import { createHmac, timingSafeEqual } from "node:crypto";
import { clickHouse } from "@databuddy/db/clickhouse";
import { Elysia } from "elysia";
import { evlog, useLogger } from "evlog/elysia";
import { getDailySalt, saltAnonymousId } from "@lib/security";
import { sanitizeString, VALIDATION_LIMITS } from "@utils/validation";
import { formatDate, getWebhookConfig, resolveWebsiteId } from "./shared";

const SIGNATURE_TOLERANCE_SECONDS = 300;

interface WebhookConfig {
	ownerId: string;
	stripeWebhookSecret: string;
	websiteId: string | null;
}

interface WebhookPaymentIntent {
	amount: number;
	amount_received?: number;
	created: number;
	currency: string;
	customer?: string | { id: string } | null;
	description?: string | null;
	id: string;
	invoice?: string | { id: string } | null;
	metadata?: Record<string, string>;
}

interface WebhookCharge {
	amount_refunded: number;
	currency: string;
	customer?: string | { id: string } | null;
	id: string;
	metadata?: Record<string, string>;
	refunds?: {
		data: Array<{
			id: string;
			amount: number;
			created: number;
		}>;
	};
}

interface WebhookInvoice {
	amount_paid: number;
	billing_reason?: string | null;
	created: number;
	currency: string;
	customer?: string | { id: string } | null;
	description?: string | null;
	id: string;
	metadata?: Record<string, string>;
	parent?: {
		subscription_details?: { metadata?: Record<string, string> | null } | null;
	} | null;
	payment_intent?: string | { id: string } | null;
	status?: string;
	subscription?: string | null;
	subscription_details?: {
		metadata?: Record<string, string> | null;
	} | null;
}

interface WebhookEvent {
	data: {
		object: WebhookPaymentIntent | WebhookCharge | WebhookInvoice;
	};
	id: string;
	type: string;
}

export function verifyStripeSignature(
	payload: string,
	header: string,
	secret: string
): { valid: true; event: WebhookEvent } | { valid: false; error: string } {
	const parts: Record<string, string[]> = {};

	for (const item of header.split(",")) {
		const [key, value] = item.split("=");
		if (key && value) {
			if (!parts[key]) {
				parts[key] = [];
			}
			parts[key].push(value);
		}
	}

	const timestamp = parts.t?.[0];
	const signatures = parts.v1 || [];

	if (!timestamp) {
		return { valid: false, error: "Missing timestamp in signature header" };
	}

	if (signatures.length === 0) {
		return { valid: false, error: "No v1 signatures found in header" };
	}

	const timestampNum = Number.parseInt(timestamp, 10);
	const now = Math.floor(Date.now() / 1000);

	if (Math.abs(now - timestampNum) > SIGNATURE_TOLERANCE_SECONDS) {
		return { valid: false, error: "Timestamp outside tolerance zone" };
	}

	const signedPayload = `${timestamp}.${payload}`;
	const expectedSignature = createHmac("sha256", secret)
		.update(signedPayload, "utf8")
		.digest("hex");

	const signatureMatch = signatures.some((sig) => {
		try {
			return timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(sig));
		} catch {
			return false;
		}
	});

	if (!signatureMatch) {
		return { valid: false, error: "Signature mismatch" };
	}

	try {
		const event = JSON.parse(payload) as WebhookEvent;
		return { valid: true, event };
	} catch {
		return { valid: false, error: "Invalid JSON payload" };
	}
}

interface AnalyticsMetadata {
	anonymous_id?: string;
	client_id?: string;
	profile_id?: string;
	session_id?: string;
}

async function extractAnalyticsMetadata(
	metadata: Record<string, string> | undefined
): Promise<AnalyticsMetadata> {
	if (!metadata) {
		return {};
	}

	const rawAnonId = metadata.databuddy_anonymous_id;
	let anonymousId: string | undefined;
	if (rawAnonId) {
		const salt = await getDailySalt();
		anonymousId = saltAnonymousId(rawAnonId, salt);
	}

	return {
		anonymous_id: anonymousId,
		profile_id:
			sanitizeString(
				metadata.databuddy_profile_id,
				VALIDATION_LIMITS.USER_ID_MAX_LENGTH
			) || undefined,
		session_id: metadata.databuddy_session_id,
		client_id: metadata.databuddy_client_id,
	};
}

function extractCustomerId(
	customer: string | { id: string } | null | undefined
): string | undefined {
	if (!customer) {
		return;
	}
	return typeof customer === "string" ? customer : customer.id;
}

function getConfig(hash: string): Promise<WebhookConfig | { error: string }> {
	return getWebhookConfig(hash, "stripeWebhookSecret", "stripe") as Promise<
		WebhookConfig | { error: string }
	>;
}

export function invoiceMetadataSources(
	invoice: WebhookInvoice
): Record<string, string> {
	return {
		...invoice.parent?.subscription_details?.metadata,
		...invoice.subscription_details?.metadata,
		...invoice.metadata,
	};
}

async function existingAttribution(
	ownerId: string,
	transactionId: string
): Promise<
	Pick<AnalyticsMetadata, "anonymous_id" | "profile_id" | "session_id">
> {
	try {
		const result = await clickHouse.query({
			query: `SELECT
					argMax(profile_id, synced_at) AS profile_id,
					argMax(ifNull(anonymous_id, ''), synced_at) AS anonymous_id,
					argMax(ifNull(session_id, ''), synced_at) AS session_id
				FROM analytics.revenue
				WHERE owner_id = {ownerId:String} AND transaction_id = {transactionId:String}`,
			query_params: { ownerId, transactionId },
			format: "JSONEachRow",
		});
		const [row] = await result.json<{
			profile_id: string;
			anonymous_id: string;
			session_id: string;
		}>();
		if (!row) {
			return {};
		}
		return {
			profile_id: row.profile_id || undefined,
			anonymous_id: row.anonymous_id || undefined,
			session_id: row.session_id || undefined,
		};
	} catch {
		return {};
	}
}

async function withCarriedAttribution(
	metadata: AnalyticsMetadata,
	ownerId: string,
	transactionId: string
): Promise<AnalyticsMetadata> {
	if (metadata.profile_id || metadata.anonymous_id || metadata.session_id) {
		return metadata;
	}
	const carried = await existingAttribution(ownerId, transactionId);
	return { ...metadata, ...carried };
}

async function handlePaymentIntent(
	pi: WebhookPaymentIntent,
	config: WebhookConfig
): Promise<void> {
	const log = useLogger();
	const metadata = await withCarriedAttribution(
		await extractAnalyticsMetadata(pi.metadata),
		config.ownerId,
		pi.id
	);
	const customerId = extractCustomerId(pi.customer);
	const descLower = pi.description?.toLowerCase() ?? "";
	const isSubscription = !!pi.invoice || descLower.startsWith("subscription");
	const type: "sale" | "subscription" = isSubscription
		? "subscription"
		: "sale";
	const amount = (pi.amount_received ?? pi.amount) / 100;
	const currency = pi.currency.toUpperCase();
	const productName =
		pi.description && !descLower.startsWith("subscription")
			? pi.description
			: undefined;

	log.set({
		revenue: {
			type,
			status: "completed",
			amount,
			currency,
			customerId,
			transactionId: pi.id,
		},
	});

	await clickHouse.insert({
		table: "analytics.revenue",
		values: [
			{
				owner_id: config.ownerId,
				website_id: await resolveWebsiteId(
					metadata.client_id,
					config.websiteId,
					config.ownerId
				),
				transaction_id: pi.id,
				provider: "stripe",
				type,
				status: "completed",
				amount,
				original_amount: amount,
				original_currency: currency,
				currency,
				anonymous_id: metadata.anonymous_id || undefined,
				profile_id: metadata.profile_id || undefined,
				session_id: metadata.session_id || undefined,
				customer_id: customerId,
				product_name: productName,
				metadata: JSON.stringify(metadata),
				created: formatDate(new Date(pi.created * 1000)),
				synced_at: formatDate(new Date()),
			},
		],
		format: "JSONEachRow",
	});
}

async function handleFailedPayment(
	pi: WebhookPaymentIntent,
	config: WebhookConfig,
	status: "failed" | "canceled"
): Promise<void> {
	const log = useLogger();
	const metadata = await extractAnalyticsMetadata(pi.metadata);
	const customerId = extractCustomerId(pi.customer);
	const amount = (pi.amount_received ?? pi.amount) / 100;
	const currency = pi.currency.toUpperCase();
	const descLower = pi.description?.toLowerCase() ?? "";
	const isSubscription = !!pi.invoice || descLower.startsWith("subscription");
	const type: "sale" | "subscription" = isSubscription
		? "subscription"
		: "sale";
	const productName =
		pi.description && !descLower.startsWith("subscription")
			? pi.description
			: undefined;

	log.set({
		revenue: {
			type,
			status,
			amount,
			currency,
			customerId,
			transactionId: pi.id,
		},
	});

	await clickHouse.insert({
		table: "analytics.revenue",
		values: [
			{
				owner_id: config.ownerId,
				website_id: await resolveWebsiteId(
					metadata.client_id,
					config.websiteId,
					config.ownerId
				),
				transaction_id: pi.id,
				provider: "stripe",
				type,
				status,
				amount,
				original_amount: amount,
				original_currency: currency,
				currency,
				anonymous_id: metadata.anonymous_id || undefined,
				profile_id: metadata.profile_id || undefined,
				session_id: metadata.session_id || undefined,
				customer_id: customerId,
				product_name: productName,
				metadata: JSON.stringify(metadata),
				created: formatDate(new Date(pi.created * 1000)),
				synced_at: formatDate(new Date()),
			},
		],
		format: "JSONEachRow",
	});
}

async function handleInvoicePaid(
	invoice: WebhookInvoice,
	config: WebhookConfig
): Promise<void> {
	const log = useLogger();
	if (invoice.amount_paid === 0) {
		log.set({ revenue: { skipped: "zero_amount", invoiceId: invoice.id } });
		return;
	}

	const paymentIntentId =
		typeof invoice.payment_intent === "string"
			? invoice.payment_intent
			: invoice.payment_intent?.id;
	const transactionId = paymentIntentId || invoice.id;
	const metadata = await withCarriedAttribution(
		await extractAnalyticsMetadata(invoiceMetadataSources(invoice)),
		config.ownerId,
		transactionId
	);
	const customerId = extractCustomerId(invoice.customer);
	const amount = invoice.amount_paid / 100;
	const currency = invoice.currency.toUpperCase();

	log.set({
		revenue: {
			type: "subscription",
			status: "completed",
			amount,
			currency,
			customerId,
			transactionId,
			billingReason: invoice.billing_reason,
			subscriptionId: invoice.subscription,
		},
	});

	await clickHouse.insert({
		table: "analytics.revenue",
		values: [
			{
				owner_id: config.ownerId,
				website_id: await resolveWebsiteId(
					metadata.client_id,
					config.websiteId,
					config.ownerId
				),
				transaction_id: transactionId,
				provider: "stripe",
				type: "subscription" as const,
				status: "completed",
				amount,
				original_amount: amount,
				original_currency: currency,
				currency,
				anonymous_id: metadata.anonymous_id || undefined,
				profile_id: metadata.profile_id || undefined,
				session_id: metadata.session_id || undefined,
				customer_id: customerId,
				product_name: invoice.description || undefined,
				metadata: JSON.stringify(metadata),
				created: formatDate(new Date(invoice.created * 1000)),
				synced_at: formatDate(new Date()),
			},
		],
		format: "JSONEachRow",
	});
}

async function handleInvoiceFailed(
	invoice: WebhookInvoice,
	config: WebhookConfig
): Promise<void> {
	const log = useLogger();
	const metadata = await extractAnalyticsMetadata(invoice.metadata);
	const customerId = extractCustomerId(invoice.customer);
	const amount = invoice.amount_paid / 100;
	const currency = invoice.currency.toUpperCase();

	log.set({
		revenue: {
			type: "subscription",
			status: "failed",
			amount,
			currency,
			customerId,
			transactionId: invoice.id,
			billingReason: invoice.billing_reason,
			subscriptionId: invoice.subscription,
		},
	});

	await clickHouse.insert({
		table: "analytics.revenue",
		values: [
			{
				owner_id: config.ownerId,
				website_id: await resolveWebsiteId(
					metadata.client_id,
					config.websiteId,
					config.ownerId
				),
				transaction_id: invoice.id,
				provider: "stripe",
				type: "subscription" as const,
				status: "failed",
				amount,
				original_amount: amount,
				original_currency: currency,
				currency,
				anonymous_id: metadata.anonymous_id || undefined,
				profile_id: metadata.profile_id || undefined,
				session_id: metadata.session_id || undefined,
				customer_id: customerId,
				product_name: invoice.description || undefined,
				metadata: JSON.stringify(metadata),
				created: formatDate(new Date(invoice.created * 1000)),
				synced_at: formatDate(new Date()),
			},
		],
		format: "JSONEachRow",
	});
}

async function handleRefund(
	charge: WebhookCharge,
	config: WebhookConfig
): Promise<void> {
	const log = useLogger();
	const metadata = await extractAnalyticsMetadata(charge.metadata);
	const customerId = extractCustomerId(charge.customer);
	const currency = charge.currency.toUpperCase();
	const refunds = charge.refunds?.data || [];

	log.set({
		revenue: {
			type: "refund",
			currency,
			customerId,
			refundCount: refunds.length,
		},
	});

	for (const refund of refunds) {
		const amount = refund.amount / 100;

		await clickHouse.insert({
			table: "analytics.revenue",
			values: [
				{
					owner_id: config.ownerId,
					website_id: await resolveWebsiteId(
						metadata.client_id,
						config.websiteId,
						config.ownerId
					),
					transaction_id: refund.id,
					provider: "stripe",
					type: "refund",
					status: "refunded",
					amount: -amount,
					original_amount: -amount,
					original_currency: currency,
					currency,
					anonymous_id: metadata.anonymous_id || undefined,
					profile_id: metadata.profile_id || undefined,
					session_id: metadata.session_id || undefined,
					customer_id: customerId,
					product_name: "Refund",
					metadata: JSON.stringify(metadata),
					created: formatDate(new Date(refund.created * 1000)),
					synced_at: formatDate(new Date()),
				},
			],
			format: "JSONEachRow",
		});
	}
}

export const stripeWebhook = new Elysia().use(evlog()).post(
	"/webhooks/stripe/:hash",
	async ({ params, request, set }) => {
		const log = useLogger();
		log.set({ provider: "stripe", webhookHash: params.hash });

		const result = await getConfig(params.hash);

		if ("error" in result) {
			log.set({ configError: result.error });
			set.status = 404;
			return { error: "Webhook endpoint not found" };
		}

		log.set({ ownerId: result.ownerId, websiteId: result.websiteId });

		const signature = request.headers.get("stripe-signature");
		if (!signature) {
			log.set({ signatureError: "missing_header" });
			set.status = 400;
			return { error: "Missing stripe-signature header" };
		}

		const body = await request.text();
		const verification = verifyStripeSignature(
			body,
			signature,
			result.stripeWebhookSecret
		);

		if (!verification.valid) {
			log.warn("Stripe signature verification failed");
			log.set({ signatureError: verification.error });
			set.status = 401;
			return { error: "Invalid webhook signature" };
		}

		const event = verification.event;
		log.set({ eventType: event.type, eventId: event.id });

		try {
			switch (event.type) {
				case "payment_intent.succeeded": {
					await handlePaymentIntent(
						event.data.object as WebhookPaymentIntent,
						result
					);
					break;
				}
				case "payment_intent.payment_failed": {
					await handleFailedPayment(
						event.data.object as WebhookPaymentIntent,
						result,
						"failed"
					);
					break;
				}
				case "payment_intent.canceled": {
					await handleFailedPayment(
						event.data.object as WebhookPaymentIntent,
						result,
						"canceled"
					);
					break;
				}
				case "invoice.paid":
				case "invoice.payment_succeeded": {
					await handleInvoicePaid(event.data.object as WebhookInvoice, result);
					break;
				}
				case "invoice.payment_failed": {
					await handleInvoiceFailed(
						event.data.object as WebhookInvoice,
						result
					);
					break;
				}
				case "charge.refunded": {
					await handleRefund(event.data.object as WebhookCharge, result);
					break;
				}
				default: {
					log.set({ unhandled: true });
				}
			}

			return { received: true, type: event.type };
		} catch (error) {
			log.error(error instanceof Error ? error : new Error(String(error)));
			set.status = 500;
			return { error: "Failed to process webhook event" };
		}
	},
	{ parse: "none" }
);
