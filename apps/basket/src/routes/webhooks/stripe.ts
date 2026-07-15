import { createHmac, timingSafeEqual } from "node:crypto";
import { clickHouse } from "@databuddy/db/clickhouse";
import { Elysia } from "elysia";
import { evlog, useLogger } from "evlog/elysia";
import { getDailySalt, saltAnonymousId } from "@lib/security";
import { sanitizeString, VALIDATION_LIMITS } from "@utils/validation";
import {
	type NormalizedStripeRecord,
	type StripeWebhookEvent,
	normalizeStripeEvent,
} from "./stripe-normalization";
import { formatDate, getWebhookConfig, resolveWebsiteId } from "./shared";

const SIGNATURE_TOLERANCE_SECONDS = 300;

interface WebhookConfig {
	ownerId: string;
	stripeWebhookSecret: string;
	websiteId: string | null;
}

interface AnalyticsMetadata {
	anonymous_id?: string;
	client_id?: string;
	profile_id?: string;
	session_id?: string;
}

export function verifyStripeSignature(
	payload: string,
	header: string,
	secret: string
):
	| { valid: true; event: StripeWebhookEvent }
	| { valid: false; error: string } {
	const parts: Record<string, string[]> = {};
	for (const item of header.split(",")) {
		const [key, value] = item.split("=");
		if (!(key && value)) {
			continue;
		}
		const values = parts[key] ?? [];
		values.push(value);
		parts[key] = values;
	}

	const timestamp = parts.t?.[0];
	const signatures = parts.v1 ?? [];
	if (!timestamp) {
		return { valid: false, error: "Missing timestamp in signature header" };
	}
	if (signatures.length === 0) {
		return { valid: false, error: "No v1 signatures found in header" };
	}

	const timestampNumber = Number.parseInt(timestamp, 10);
	const now = Math.floor(Date.now() / 1000);
	if (
		!Number.isSafeInteger(timestampNumber) ||
		Math.abs(now - timestampNumber) > SIGNATURE_TOLERANCE_SECONDS
	) {
		return { valid: false, error: "Timestamp outside tolerance zone" };
	}

	const expected = createHmac("sha256", secret)
		.update(`${timestamp}.${payload}`, "utf8")
		.digest("hex");
	const signatureMatch = signatures.some((signature) => {
		try {
			return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
		} catch {
			return false;
		}
	});
	if (!signatureMatch) {
		return { valid: false, error: "Signature mismatch" };
	}

	try {
		return { valid: true, event: JSON.parse(payload) as StripeWebhookEvent };
	} catch {
		return { valid: false, error: "Invalid JSON payload" };
	}
}

function analyticsMetadata(
	metadata: Record<string, string>,
	dailySalt: string | undefined
): AnalyticsMetadata {
	const anonymousId =
		metadata.databuddy_anonymous_id && dailySalt
			? saltAnonymousId(metadata.databuddy_anonymous_id, dailySalt)
			: undefined;
	const clientId = sanitizeString(
		metadata.databuddy_client_id,
		VALIDATION_LIMITS.USER_ID_MAX_LENGTH
	);
	const profileId = sanitizeString(
		metadata.databuddy_profile_id,
		VALIDATION_LIMITS.USER_ID_MAX_LENGTH
	);
	const sessionId = sanitizeString(
		metadata.databuddy_session_id,
		VALIDATION_LIMITS.SESSION_ID_MAX_LENGTH
	);
	return {
		...(anonymousId ? { anonymous_id: anonymousId } : {}),
		...(clientId ? { client_id: clientId } : {}),
		...(profileId ? { profile_id: profileId } : {}),
		...(sessionId ? { session_id: sessionId } : {}),
	};
}

export function stripeRecordMetadata(
	metadata: AnalyticsMetadata,
	context: NormalizedStripeRecord["context"]
): Record<string, string | number> {
	return {
		...metadata,
		databuddy_revenue_model: "stripe_events_v1",
		...(context.cancellationReason
			? { stripe_cancellation_reason: context.cancellationReason }
			: {}),
		stripe_event_created: context.eventCreated,
		stripe_event_id: context.eventId,
		...(context.eventType ? { stripe_event_type: context.eventType } : {}),
		...(context.failureCode
			? { stripe_failure_code: context.failureCode }
			: {}),
		...(context.failureDeclineCode
			? { stripe_failure_decline_code: context.failureDeclineCode }
			: {}),
		...(context.failureType
			? { stripe_failure_type: context.failureType }
			: {}),
		stripe_record_kind: context.recordKind,
		...(context.apiVersion ? { stripe_api_version: context.apiVersion } : {}),
		...(context.invoiceId ? { stripe_invoice_id: context.invoiceId } : {}),
		...(context.invoicePaymentId
			? { stripe_invoice_payment_id: context.invoicePaymentId }
			: {}),
		...(context.moneyKind ? { stripe_money_kind: context.moneyKind } : {}),
		...(context.paymentIntentId
			? { stripe_payment_intent_id: context.paymentIntentId }
			: {}),
	};
}

function getConfig(hash: string): Promise<WebhookConfig | { error: string }> {
	return getWebhookConfig(hash, "stripeWebhookSecret", "stripe") as Promise<
		WebhookConfig | { error: string }
	>;
}

async function persistStripeRecords(
	config: WebhookConfig,
	records: NormalizedStripeRecord[]
): Promise<void> {
	if (records.length === 0) {
		return;
	}
	const needsAnonymousSalt = records.some(
		(record) => record.rawMetadata.databuddy_anonymous_id
	);
	const dailySalt = needsAnonymousSalt ? await getDailySalt() : undefined;
	const websiteIds = new Map<string, Promise<string | undefined>>();
	const resolveRecordWebsite = (metadata: AnalyticsMetadata) => {
		const key = metadata.client_id ?? "";
		let pending = websiteIds.get(key);
		if (!pending) {
			pending = resolveWebsiteId(
				metadata.client_id,
				config.websiteId,
				config.ownerId
			);
			websiteIds.set(key, pending);
		}
		return pending;
	};
	const syncedAt = formatDate(new Date());
	const values = await Promise.all(
		records.map(async (record) => {
			const metadata = analyticsMetadata(record.rawMetadata, dailySalt);
			return {
				owner_id: config.ownerId,
				website_id: await resolveRecordWebsite(metadata),
				transaction_id: record.transactionId,
				provider: "stripe",
				type: record.type,
				status: record.status,
				amount: record.amount,
				original_amount: record.amount,
				original_currency: record.currency,
				currency: record.currency,
				anonymous_id: metadata.anonymous_id,
				profile_id: metadata.profile_id,
				session_id: metadata.session_id,
				customer_id: record.customerId,
				product_name: record.productName,
				metadata: JSON.stringify(
					stripeRecordMetadata(metadata, record.context)
				),
				created: formatDate(new Date(record.createdUnix * 1000)),
				synced_at: syncedAt,
			};
		})
	);

	await clickHouse.insert({
		table: "analytics.revenue",
		values,
		format: "JSONEachRow",
	});
}

export const stripeWebhook = new Elysia().use(evlog()).post(
	"/webhooks/stripe/:hash",
	async ({ params, request, set }) => {
		const log = useLogger();
		log.set({ provider: "stripe", webhookHash: params.hash });

		const config = await getConfig(params.hash);
		if ("error" in config) {
			log.set({ configError: config.error });
			set.status = 404;
			return { error: "Webhook endpoint not found" };
		}

		const signature = request.headers.get("stripe-signature");
		if (!signature) {
			set.status = 400;
			return { error: "Missing stripe-signature header" };
		}
		const verification = verifyStripeSignature(
			await request.text(),
			signature,
			config.stripeWebhookSecret
		);
		if (!verification.valid) {
			log.warn("Stripe signature verification failed");
			log.set({ signatureError: verification.error });
			set.status = 401;
			return { error: "Invalid webhook signature" };
		}

		const event = verification.event;
		log.set({
			eventId: event.id,
			eventType: event.type,
			stripeApiVersion: event.api_version,
		});
		try {
			const records = normalizeStripeEvent(event);
			await persistStripeRecords(config, records);
			log.set({
				recordCount: records.length,
				moneyRecordCount: records.filter(
					(record) => record.context.recordKind === "money"
				).length,
				attemptRecordCount: records.filter(
					(record) => record.context.recordKind === "attempt"
				).length,
			});
			return { received: true, type: event.type };
		} catch (error) {
			log.error(error instanceof Error ? error : new Error(String(error)));
			set.status = 500;
			return { error: "Failed to process webhook event" };
		}
	},
	{ parse: "none" }
);
