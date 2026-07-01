import { createHmac, timingSafeEqual } from "node:crypto";
import { clickHouse } from "@databuddy/db/clickhouse";
import { Elysia } from "elysia";
import { evlog, useLogger } from "evlog/elysia";
import { getDailySalt, saltAnonymousId } from "@lib/security";
import { formatDate, getWebhookConfig, resolveWebsiteId } from "./shared";

interface PaddleTransaction {
	billed_at: string | null;
	created_at: string;
	currency_code: string;
	custom_data?: Record<string, string>;
	details: {
		totals: { total: string };
		line_items?: Array<{
			product: { id: string; name: string };
			price: { billing_cycle: { interval: string } | null };
		}>;
	};
	id: string;
}

async function extractAnalyticsMetadata(
	data: Record<string, string> | undefined
): Promise<Record<string, string>> {
	if (!data) {
		return {};
	}
	const result: Record<string, string> = {};
	if (data.anonymous_id) {
		const salt = await getDailySalt();
		result.anonymous_id = saltAnonymousId(data.anonymous_id, salt);
	}
	if (data.session_id) {
		result.session_id = data.session_id;
	}
	if (data.website_id) {
		result.website_id = data.website_id;
	}
	return result;
}

interface PaddleEvent {
	data: PaddleTransaction;
	event_type: string;
}

const SIGNATURE_TOLERANCE_SECONDS = 300;
const SIGNATURE_TIMESTAMP_REGEX = /^\d+$/;

function getConfig(hash: string) {
	return getWebhookConfig(hash, "paddleWebhookSecret", "paddle");
}

function parsePaddleSignatureHeader(header: string): Record<string, string[]> {
	const parts: Record<string, string[]> = {};

	for (const item of header.split(";")) {
		const index = item.indexOf("=");
		if (index <= 0) {
			continue;
		}

		const key = item.slice(0, index).trim();
		const value = item.slice(index + 1).trim();
		if (!(key && value)) {
			continue;
		}

		parts[key] ??= [];
		parts[key].push(value);
	}

	return parts;
}

function timingSafeHexEqual(
	expectedHex: string,
	candidateHex: string
): boolean {
	try {
		const expected = Buffer.from(expectedHex, "hex");
		const candidate = Buffer.from(candidateHex, "hex");
		return (
			expected.length === candidate.length &&
			timingSafeEqual(expected, candidate)
		);
	} catch {
		return false;
	}
}

export function verifyPaddleSignature(
	body: string,
	header: string,
	secret: string
): { valid: true } | { valid: false; error: string } {
	const parts = parsePaddleSignatureHeader(header);
	const timestamp = parts.ts?.[0];
	const signatures = parts.h1 || [];

	if (!timestamp) {
		return { valid: false, error: "Missing timestamp in signature header" };
	}

	if (!SIGNATURE_TIMESTAMP_REGEX.test(timestamp)) {
		return { valid: false, error: "Invalid timestamp in signature header" };
	}

	if (signatures.length === 0) {
		return { valid: false, error: "No h1 signatures found in header" };
	}

	const timestampNum = Number.parseInt(timestamp, 10);
	const now = Math.floor(Date.now() / 1000);
	if (Math.abs(now - timestampNum) > SIGNATURE_TOLERANCE_SECONDS) {
		return { valid: false, error: "Timestamp outside tolerance zone" };
	}

	const expected = createHmac("sha256", secret)
		.update(`${timestamp}:${body}`, "utf8")
		.digest("hex");

	if (!signatures.some((sig) => timingSafeHexEqual(expected, sig))) {
		return { valid: false, error: "Signature mismatch" };
	}

	return { valid: true };
}

async function handleTransaction(
	tx: PaddleTransaction,
	config: { ownerId: string; websiteId: string | null }
): Promise<void> {
	const log = useLogger();
	const metadata = await extractAnalyticsMetadata(tx.custom_data);
	const lineItems = tx.details.line_items || [];
	const isSubscription = lineItems.some((i) => i?.price?.billing_cycle != null);
	const type = isSubscription ? "subscription" : "sale";
	const amount = Number.parseFloat(tx.details.totals.total) / 100;
	const currency = tx.currency_code;

	log.set({
		revenue: {
			type,
			status: "completed",
			amount,
			currency,
			transactionId: tx.id,
			product: lineItems[0]?.product?.name,
		},
	});

	await clickHouse.insert({
		table: "analytics.revenue",
		values: [
			{
				owner_id: config.ownerId,
				website_id: await resolveWebsiteId(
					metadata.website_id,
					config.websiteId,
					config.ownerId
				),
				transaction_id: tx.id,
				provider: "paddle",
				type,
				status: "completed",
				amount,
				original_amount: amount,
				original_currency: currency,
				currency,
				anonymous_id: metadata.anonymous_id || undefined,
				session_id: metadata.session_id || undefined,
				product_id: lineItems[0]?.product?.id || undefined,
				product_name: lineItems[0]?.product?.name || undefined,
				metadata: JSON.stringify(metadata),
				created: formatDate(new Date(tx.billed_at || tx.created_at)),
				synced_at: formatDate(new Date()),
			},
		],
		format: "JSONEachRow",
	});
}

export const paddleWebhook = new Elysia().use(evlog()).post(
	"/webhooks/paddle/:hash",
	async ({ params, request, set }) => {
		const log = useLogger();
		log.set({ provider: "paddle", webhookHash: params.hash });

		const result = await getConfig(params.hash);

		if ("error" in result) {
			log.set({ configError: result.error });
			set.status = 404;
			return { error: "Webhook endpoint not found" };
		}

		log.set({ ownerId: result.ownerId, websiteId: result.websiteId });

		const signature = request.headers.get("paddle-signature");
		if (!signature) {
			log.set({ signatureError: "missing_header" });
			set.status = 400;
			return { error: "Missing paddle-signature header" };
		}

		const body = await request.text();
		const verification = verifyPaddleSignature(
			body,
			signature,
			result.paddleWebhookSecret
		);

		if (!verification.valid) {
			log.warn("Paddle signature verification failed");
			log.set({ signatureError: verification.error });
			set.status = 401;
			return { error: "Invalid webhook signature" };
		}

		let event: PaddleEvent;
		try {
			event = JSON.parse(body);
		} catch {
			log.set({ parseError: "invalid_json" });
			set.status = 400;
			return { error: "Invalid JSON payload" };
		}

		log.set({ eventType: event.event_type });

		try {
			if (event.event_type === "transaction.completed") {
				await handleTransaction(event.data, result);
			} else {
				log.set({ unhandled: true });
			}

			return { received: true, type: event.event_type };
		} catch (error) {
			log.error(error instanceof Error ? error : new Error(String(error)));
			set.status = 500;
			return { error: "Failed to process webhook event" };
		}
	},
	{ parse: "none" }
);
