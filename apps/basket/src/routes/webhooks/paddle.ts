import { timingSafeEqual } from "node:crypto";
import { clickHouse, db, eq, revenueConfig } from "@databuddy/db";
import { Elysia } from "elysia";
import { useLogger } from "evlog/elysia";

const DATE_REGEX = /\.\d{3}Z$/;

interface PaddleTransaction {
	id: string;
	currency_code: string;
	details: {
		totals: { total: string };
		line_items?: Array<{
			product: { id: string; name: string };
			price: { billing_cycle: { interval: string } | null };
		}>;
	};
	custom_data?: Record<string, string>;
	created_at: string;
	billed_at: string | null;
}

function extractAnalyticsMetadata(
	data: Record<string, string> | undefined
): Record<string, string> {
	if (!data) {
		return {};
	}
	const result: Record<string, string> = {};
	if (data.anonymous_id) {
		result.anonymous_id = data.anonymous_id;
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
	event_type: string;
	data: PaddleTransaction;
}

function formatDate(date: Date): string {
	return date.toISOString().replace("T", " ").replace(DATE_REGEX, "");
}

async function getConfig(hash: string) {
	const config = await db.query.revenueConfig.findFirst({
		where: eq(revenueConfig.webhookHash, hash),
		columns: {
			ownerId: true,
			websiteId: true,
			paddleWebhookSecret: true,
		},
	});

	if (!config) {
		return { error: "not_found" as const };
	}

	if (!config.paddleWebhookSecret) {
		return { error: "paddle_not_configured" as const };
	}

	return {
		ownerId: config.ownerId,
		websiteId: config.websiteId,
		paddleWebhookSecret: config.paddleWebhookSecret,
	};
}

async function verifySignature(
	body: string,
	signature: string,
	secret: string
): Promise<boolean> {
	try {
		const encoder = new TextEncoder();
		const key = await crypto.subtle.importKey(
			"raw",
			encoder.encode(secret),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"]
		);

		const signatureBuffer = await crypto.subtle.sign(
			"HMAC",
			key,
			encoder.encode(body)
		);

		const expected = Array.from(new Uint8Array(signatureBuffer))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		const sigBuffer = Buffer.from(signature, "utf8");
		const expectedBuffer = Buffer.from(expected, "utf8");
		return (
			sigBuffer.length === expectedBuffer.length &&
			timingSafeEqual(sigBuffer, expectedBuffer)
		);
	} catch {
		return false;
	}
}

async function handleTransaction(
	tx: PaddleTransaction,
	config: { ownerId: string; websiteId: string | null }
): Promise<void> {
	const log = useLogger();
	const metadata = extractAnalyticsMetadata(tx.custom_data);
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
				website_id: metadata.website_id || config.websiteId || undefined,
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

export const paddleWebhook = new Elysia().post(
	"/webhooks/paddle/:hash",
	async ({ params, request, set }) => {
		const log = useLogger();
		log.set({ provider: "paddle", webhookHash: params.hash });

		const result = await getConfig(params.hash);

		if ("error" in result) {
			log.set({ configError: result.error });
			if (result.error === "not_found") {
				set.status = 404;
				return { error: "Webhook endpoint not found" };
			}
			set.status = 400;
			return { error: "Paddle webhook not configured for this account" };
		}

		log.set({ ownerId: result.ownerId, websiteId: result.websiteId });

		const signature = request.headers.get("paddle-signature");
		if (!signature) {
			log.set({ signatureError: "missing_header" });
			set.status = 400;
			return { error: "Missing paddle-signature header" };
		}

		const body = await request.text();
		const valid = await verifySignature(
			body,
			signature,
			result.paddleWebhookSecret
		);

		if (!valid) {
			log.warn("Paddle signature verification failed");
			log.set({ signatureError: "mismatch" });
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
			if (
				event.event_type === "transaction.completed" ||
				event.event_type === "transaction.billed"
			) {
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
