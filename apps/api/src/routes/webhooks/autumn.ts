import { and, db, eq, gt, usageAlertLog, user } from "@databuddy/db";
import { UsageLimitEmail } from "@databuddy/email";
import { cacheable } from "@databuddy/redis";
import { logger } from "@databuddy/shared/logger";
import { createId } from "@databuddy/shared/utils/ids";
import { Elysia } from "elysia";
import { Resend } from "resend";
import { Webhook } from "svix";
import { record, setAttributes } from "../../lib/tracing";

const resend = new Resend(process.env.RESEND_API_KEY);
const SVIX_WEBHOOK_SECRET = process.env.AUTUMN_WEBHOOK_SECRET;
const ALERT_COOLDOWN_DAYS = 7;

interface AutumnCustomer {
	id: string;
	email: string | null;
	name: string | null;
	env: string;
	features: Record<
		string,
		{
			id: string;
			name: string;
			balance: number;
			usage: number;
			included_usage: number;
			unlimited: boolean;
			overage_allowed: boolean;
			interval: string | null;
		}
	>;
}

interface AutumnFeature {
	id: string;
	name: string;
	type: string;
}

type ThresholdType = "limit_reached" | "allowance_used";

type ProductScenario =
	| "new"
	| "upgrade"
	| "downgrade"
	| "renew"
	| "cancel"
	| "expired"
	| "past_due"
	| "scheduled";

interface ThresholdData {
	customer: AutumnCustomer;
	feature: AutumnFeature;
	threshold_type: ThresholdType;
}

interface ProductsUpdatedData {
	scenario: ProductScenario;
	customer: AutumnCustomer;
	updated_product: { id: string; name: string };
}

async function _getUserEmail(customerId: string): Promise<string | null> {
	const dbUser = await db.query.user.findFirst({
		where: eq(user.id, customerId),
		columns: { email: true },
	});
	return dbUser?.email ?? null;
}

const getUserEmail = cacheable(_getUserEmail, {
	expireInSec: 300,
	prefix: "user_email",
	staleWhileRevalidate: true,
	staleTime: 60,
});

function formatFeatureName(featureId: string, featureName: string): string {
	if (featureName) {
		return featureName;
	}
	return featureId
		.replace(/_/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

async function wasAlertSentRecently(
	userId: string,
	featureId: string
): Promise<boolean> {
	const cooldownDate = new Date();
	cooldownDate.setDate(cooldownDate.getDate() - ALERT_COOLDOWN_DAYS);

	const recentAlert = await db.query.usageAlertLog.findFirst({
		where: and(
			eq(usageAlertLog.userId, userId),
			eq(usageAlertLog.featureId, featureId),
			gt(usageAlertLog.createdAt, cooldownDate)
		),
		columns: { id: true },
	});

	return Boolean(recentAlert);
}

async function logAlertSent(
	userId: string,
	featureId: string,
	alertType: string,
	emailSentTo: string
): Promise<void> {
	await db.insert(usageAlertLog).values({
		id: createId(),
		userId,
		featureId,
		alertType,
		emailSentTo,
	});
}

async function handleThresholdReached(
	payload: ThresholdData
): Promise<{ success: boolean; message: string }> {
	const { customer, feature, threshold_type } = payload;

	if (process.env.NODE_ENV === "production" && customer.env === "sandbox") {
		logger.info(
			{ customerId: customer.id, feature: feature.id },
			"Skipping sandbox threshold event in production"
		);
		return { success: true, message: "Skipped sandbox event" };
	}

	const featureData = customer.features[feature.id];
	if (featureData?.overage_allowed) {
		logger.info(
			{ customerId: customer.id, feature: feature.id },
			"Skipping alert - overage allowed (paid plan)"
		);
		return { success: true, message: "Skipped - overage allowed" };
	}

	if (featureData?.unlimited) {
		logger.info(
			{ customerId: customer.id, feature: feature.id },
			"Skipping alert - unlimited feature"
		);
		return { success: true, message: "Skipped - unlimited feature" };
	}

	const recentlySent = await wasAlertSentRecently(customer.id, feature.id);
	if (recentlySent) {
		logger.info(
			{ customerId: customer.id, feature: feature.id },
			"Skipping alert - already sent within cooldown period"
		);
		return {
			success: true,
			message: `Alert already sent within ${ALERT_COOLDOWN_DAYS} days`,
		};
	}

	const email = customer.email ?? (await getUserEmail(customer.id));
	if (!email) {
		logger.warn(
			{ customerId: customer.id, feature: feature.id },
			"No email found for customer"
		);
		return { success: false, message: "No email found for customer" };
	}

	const usageAmount = featureData?.usage ?? 0;
	const limitAmount = featureData?.included_usage ?? 0;
	const featureName = formatFeatureName(feature.id, feature.name);

	setAttributes({
		customer_id: customer.id,
		feature_id: feature.id,
		threshold_type,
		usage: usageAmount,
		limit: limitAmount,
	});

	const result = await resend.emails.send({
		from: "Databuddy <alerts@databuddy.cc>",
		to: email,
		subject: `You've reached your ${featureName} limit`,
		react: UsageLimitEmail({
			featureName,
			usageAmount,
			limitAmount,
			userName: customer.name ?? undefined,
			thresholdType: threshold_type,
		}),
	});

	if (result.error) {
		logger.error(
			{ error: result.error, customerId: customer.id },
			"Failed to send usage limit email"
		);
		return { success: false, message: result.error.message };
	}

	await logAlertSent(customer.id, feature.id, threshold_type, email);

	logger.info(
		{ customerId: customer.id, feature: feature.id, emailId: result.data?.id },
		"Sent usage limit alert email"
	);

	return { success: true, message: "Email sent successfully" };
}

function handleProductsUpdated(payload: ProductsUpdatedData): {
	success: boolean;
	message: string;
} {
	const { scenario, customer, updated_product } = payload;

	logger.info(
		{ customerId: customer.id, scenario, product: updated_product.id },
		"Received products updated webhook"
	);

	return { success: true, message: `Processed ${scenario} event` };
}

function verifyWebhookSignature(
	payload: string,
	headers: Record<string, string | null>
): boolean {
	if (!SVIX_WEBHOOK_SECRET) {
		logger.warn("AUTUMN_WEBHOOK_SECRET not configured, skipping verification");
		return true;
	}

	const svixId = headers["svix-id"];
	const svixTimestamp = headers["svix-timestamp"];
	const svixSignature = headers["svix-signature"];

	if (!(svixId && svixTimestamp && svixSignature)) {
		logger.error("Missing Svix headers for webhook verification");
		return false;
	}

	try {
		const wh = new Webhook(SVIX_WEBHOOK_SECRET);
		wh.verify(payload, {
			"svix-id": svixId,
			"svix-timestamp": svixTimestamp,
			"svix-signature": svixSignature,
		});
		return true;
	} catch (error) {
		logger.error({ error }, "Failed to verify webhook signature");
		return false;
	}
}

type WebhookBody =
	| { type: string; data: ThresholdData | ProductsUpdatedData }
	| {
			customer: AutumnCustomer;
			feature?: AutumnFeature;
			threshold_type?: ThresholdType;
			scenario?: ProductScenario;
			updated_product?: { id: string; name: string };
	  };

export const autumnWebhook = new Elysia().post(
	"/autumn",
	async ({ headers, request }) => {
		const rawBody = await request.text();
		const parsedBody = JSON.parse(rawBody) as WebhookBody;

		const isValid = verifyWebhookSignature(rawBody, {
			"svix-id": headers["svix-id"] ?? null,
			"svix-timestamp": headers["svix-timestamp"] ?? null,
			"svix-signature": headers["svix-signature"] ?? null,
		});

		if (!isValid) {
			return new Response(
				JSON.stringify({ success: false, message: "Invalid signature" }),
				{ status: 401, headers: { "Content-Type": "application/json" } }
			);
		}

		return record("autumnWebhook", async () => {
			// Svix-wrapped format: { type: "...", data: {...} }
			if ("type" in parsedBody && "data" in parsedBody) {
				const { type, data } = parsedBody;

				setAttributes({
					webhook_type: type,
					svix_id: headers["svix-id"] ?? "unknown",
				});

				logger.info({ type }, "Received Autumn webhook");

				if (type === "customer.threshold_reached") {
					return await handleThresholdReached(data as ThresholdData);
				}
				if (type === "customer.products.updated") {
					return handleProductsUpdated(data as ProductsUpdatedData);
				}

				logger.warn({ type }, "Unknown webhook type");
				return { success: true, message: "Unknown event type, ignored" };
			}

			// Direct format: { customer: {...}, feature: {...}, threshold_type: "..." }
			if ("customer" in parsedBody) {
				const { customer, feature, threshold_type, scenario, updated_product } =
					parsedBody;

				setAttributes({
					webhook_type: threshold_type
						? "customer.threshold_reached"
						: "customer.products.updated",
					svix_id: headers["svix-id"] ?? "unknown",
				});

				if (threshold_type && feature) {
					logger.info({ threshold_type }, "Received Autumn threshold webhook");
					return await handleThresholdReached({
						customer,
						feature,
						threshold_type,
					});
				}

				if (scenario && updated_product) {
					logger.info({ scenario }, "Received Autumn products updated webhook");
					return handleProductsUpdated({
						scenario,
						customer,
						updated_product,
					});
				}
			}

			logger.warn({ body: parsedBody }, "Unknown webhook payload format");
			return { success: true, message: "Unknown payload format, ignored" };
		});
	},
	{ parse: "none" }
);
