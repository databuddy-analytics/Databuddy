import { and, db, eq, gt } from "@databuddy/db";
import { usageAlertLog, user } from "@databuddy/db/schema";
import { UsageAlertEmail, UsageLimitEmail } from "@databuddy/email";
import { sendSlackWebhook } from "@databuddy/notifications";
import { cacheable } from "@databuddy/redis";
import { createId } from "@databuddy/shared/utils/ids";
import { Elysia } from "elysia";
import { useLogger } from "evlog/elysia";
import { Resend } from "resend";
import { Webhook } from "svix";
import { mergeWideEvent } from "../../lib/tracing";

const resend = new Resend(process.env.RESEND_API_KEY);
const SVIX_SECRET = process.env.AUTUMN_WEBHOOK_SECRET;
const SLACK_URL = process.env.SLACK_WEBHOOK_URL ?? "";
const COOLDOWN_DAYS = 7;

interface LimitReachedData {
	customer_id: string;
	entity_id?: string;
	feature_id: string;
	limit_type: "included" | "max_purchase" | "spend_limit";
}

interface UsageAlertData {
	customer_id: string;
	entity_id?: string;
	feature_id: string;
	usage_alert: {
		name?: string;
		threshold: number;
		threshold_type: string;
	};
}

interface ProductsUpdatedData {
	customer: {
		id: string | null;
		name: string | null;
		email: string | null;
		env: string;
		features: Record<
			string,
			{
				id: string;
				name: string;
				usage: number;
				included_usage: number;
				unlimited: boolean;
			}
		>;
		products: Array<{ id: string; name: string; status: string }>;
	};
	scenario: ProductScenario;
	updated_product: { id: string; name: string | null };
}

type ProductScenario =
	| "new"
	| "upgrade"
	| "downgrade"
	| "renew"
	| "cancel"
	| "expired"
	| "past_due"
	| "scheduled";

interface WebhookResult {
	message: string;
	success: boolean;
}

async function _getUserData(
	customerId: string
): Promise<{ email: string | null; name: string | null }> {
	const row = await db.query.user.findFirst({
		where: eq(user.id, customerId),
		columns: { email: true, name: true },
	});
	return { email: row?.email ?? null, name: row?.name ?? null };
}

const getUserData = cacheable(_getUserData, {
	expireInSec: 300,
	prefix: "user_data",
	staleWhileRevalidate: true,
	staleTime: 60,
});

function formatFeatureId(id: string): string {
	return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function wasRecentlySent(userId: string, key: string): Promise<boolean> {
	const since = new Date();
	since.setDate(since.getDate() - COOLDOWN_DAYS);

	const row = await db.query.usageAlertLog.findFirst({
		where: and(
			eq(usageAlertLog.userId, userId),
			eq(usageAlertLog.featureId, key),
			gt(usageAlertLog.createdAt, since)
		),
		columns: { id: true },
	});
	return Boolean(row);
}

async function recordAlert(
	userId: string,
	key: string,
	alertType: string,
	email: string
): Promise<void> {
	await db.insert(usageAlertLog).values({
		id: createId(),
		userId,
		featureId: key,
		alertType,
		emailSentTo: email,
	});
}

async function sendAlertEmailAction(opts: {
	customerId: string;
	cooldownKey: string;
	alertType: string;
	subject: string;
	react: React.ReactElement;
}): Promise<WebhookResult> {
	const { customerId, cooldownKey, alertType, subject, react } = opts;

	if (await wasRecentlySent(customerId, cooldownKey)) {
		useLogger().info("Skipping alert - sent recently", {
			autumn: { customerId, cooldownKey },
		});
		return { success: true, message: "Already sent recently" };
	}

	const userData = await getUserData(customerId);
	if (!userData.email) {
		useLogger().warn("No email for customer", {
			autumn: { customerId, cooldownKey },
		});
		return { success: false, message: "No email found" };
	}

	const result = await resend.emails.send({
		from: "Databuddy <alerts@databuddy.cc>",
		to: userData.email,
		subject,
		react,
	});

	if (result.error) {
		useLogger().error(new Error(result.error.message), {
			autumn: { customerId, resend: result.error },
		});
		return { success: false, message: result.error.message };
	}

	await recordAlert(customerId, cooldownKey, alertType, userData.email);

	useLogger().info("Alert email sent", {
		autumn: { customerId, cooldownKey, emailId: result.data?.id },
	});
	return { success: true, message: "Email sent" };
}

function handleLimitReached(
	data: LimitReachedData
): WebhookResult | Promise<WebhookResult> {
	const { customer_id, feature_id, limit_type } = data;

	if (limit_type !== "included") {
		return { success: true, message: `Skipped ${limit_type} limit` };
	}

	const featureName = formatFeatureId(feature_id);

	mergeWideEvent({ customer_id, feature_id, limit_type });

	return sendAlertEmailAction({
		customerId: customer_id,
		cooldownKey: feature_id,
		alertType: limit_type,
		subject: `You've reached your ${featureName} limit`,
		react: UsageLimitEmail({
			featureName,
			thresholdType: "limit_reached",
		}),
	});
}

function handleUsageAlert(data: UsageAlertData): Promise<WebhookResult> {
	const { customer_id, feature_id, usage_alert } = data;
	const featureName = formatFeatureId(feature_id);
	const isPercentage =
		usage_alert.threshold_type === "usage_percentage_threshold";
	const label = isPercentage
		? `${usage_alert.threshold}%`
		: String(usage_alert.threshold);

	mergeWideEvent({
		customer_id,
		feature_id,
		usage_alert_threshold: usage_alert.threshold,
		usage_alert_type: usage_alert.threshold_type,
	});

	return sendAlertEmailAction({
		customerId: customer_id,
		cooldownKey: `${feature_id}_alert_${usage_alert.threshold}`,
		alertType: `usage_alert_${usage_alert.threshold_type}`,
		subject: `${featureName} usage alert: ${label} reached`,
		react: UsageAlertEmail({
			featureName,
			threshold: usage_alert.threshold,
			thresholdType: isPercentage ? "usage_percentage_threshold" : "usage",
			alertName: usage_alert.name ?? undefined,
		}),
	});
}

const SCENARIO_LABELS: Record<
	ProductScenario,
	{ verb: string; title: string; priority: "normal" | "high" }
> = {
	new: { verb: "subscribed to", title: "New subscription", priority: "normal" },
	upgrade: { verb: "upgraded to", title: "Plan upgrade", priority: "normal" },
	downgrade: {
		verb: "downgraded to",
		title: "Plan downgrade",
		priority: "normal",
	},
	renew: { verb: "renewed", title: "Subscription renewed", priority: "normal" },
	cancel: {
		verb: "canceled",
		title: "Subscription canceled",
		priority: "high",
	},
	expired: {
		verb: "expired on",
		title: "Subscription expired",
		priority: "high",
	},
	past_due: {
		verb: "is past due on",
		title: "Payment past due",
		priority: "high",
	},
	scheduled: {
		verb: "scheduled a change to",
		title: "Plan change scheduled",
		priority: "normal",
	},
};

function handleProductsUpdated(data: ProductsUpdatedData): WebhookResult {
	const { scenario, customer, updated_product } = data;

	useLogger().info("Products updated", {
		autumn: { customerId: customer.id, scenario, product: updated_product.id },
	});

	if (
		SLACK_URL &&
		!(process.env.NODE_ENV === "production" && customer.env === "sandbox")
	) {
		const info = SCENARIO_LABELS[scenario];

		sendSlackWebhook(SLACK_URL, {
			title: info.title,
			message: `Customer ${info.verb} *${updated_product.name ?? updated_product.id}*.`,
			priority: info.priority,
			metadata: {
				scenario,
				product: updated_product.name ?? updated_product.id,
				customerId: customer.id ?? "—",
				email: customer.email ?? "—",
				name: customer.name ?? "—",
				env: customer.env,
			},
		}).catch((error) => {
			useLogger().error(
				error instanceof Error ? error : new Error(String(error)),
				{ autumn: { slack: true, customerId: customer.id } }
			);
		});
	}

	return { success: true, message: `Processed ${scenario}` };
}

function verifySvix(
	body: string,
	headers: Record<string, string | null>
): boolean {
	if (!SVIX_SECRET) {
		throw new Error("AUTUMN_WEBHOOK_SECRET not configured");
	}

	const id = headers["svix-id"];
	const ts = headers["svix-timestamp"];
	const sig = headers["svix-signature"];

	if (!(id && ts && sig)) {
		useLogger().error(new Error("Missing Svix headers"), {
			autumn: { step: "verify" },
		});
		return false;
	}

	try {
		new Webhook(SVIX_SECRET).verify(body, {
			"svix-id": id,
			"svix-timestamp": ts,
			"svix-signature": sig,
		});
		return true;
	} catch (error) {
		useLogger().error(
			error instanceof Error ? error : new Error(String(error)),
			{ autumn: { step: "verify_signature" } }
		);
		return false;
	}
}

const handlers: Record<
	string,
	(data: never) => WebhookResult | Promise<WebhookResult>
> = {
	"balances.limit_reached": handleLimitReached,
	"balances.usage_alert_triggered": handleUsageAlert,
	"customer.products.updated": handleProductsUpdated,
};

export const autumnWebhook = new Elysia().post(
	"/autumn",
	async ({ headers, request }) => {
		const rawBody = await request.text();

		if (
			!verifySvix(rawBody, {
				"svix-id": headers["svix-id"] ?? null,
				"svix-timestamp": headers["svix-timestamp"] ?? null,
				"svix-signature": headers["svix-signature"] ?? null,
			})
		) {
			return new Response(
				JSON.stringify({ success: false, message: "Invalid signature" }),
				{ status: 401, headers: { "Content-Type": "application/json" } }
			);
		}

		const { type, data } = JSON.parse(rawBody) as { type: string; data: never };

		mergeWideEvent({
			webhook_type: type,
			svix_id: headers["svix-id"] ?? "unknown",
		});
		useLogger().info("Autumn webhook", { autumn: { type } });

		const handler = handlers[type];
		if (handler) {
			return await handler(data);
		}

		useLogger().warn("Unknown webhook type", { autumn: { type } });
		return { success: true, message: "Unknown event type" };
	},
	{ parse: "none" }
);
