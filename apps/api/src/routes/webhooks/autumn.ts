import { and, db, eq, gt } from "@databuddy/db";
import { usageAlertLog, user } from "@databuddy/db/schema";
import { render, UsageAlertEmail, UsageLimitEmail } from "@databuddy/email";
import { SlackProvider } from "@databuddy/notifications";
import { cacheable } from "@databuddy/redis";
import { createId } from "@databuddy/shared/utils/ids";
import { Elysia } from "elysia";
import { useLogger } from "evlog/elysia";
import { Resend } from "resend";
import { Webhook } from "svix";
import { mergeWideEvent } from "../../lib/tracing";

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const SVIX_SECRET = process.env.AUTUMN_WEBHOOK_SECRET;
const SLACK_URL = process.env.SLACK_WEBHOOK_URL ?? "";

const resend = new Resend(process.env.RESEND_API_KEY);
const svix = SVIX_SECRET ? new Webhook(SVIX_SECRET) : null;
const slack = SLACK_URL ? new SlackProvider({ webhookUrl: SLACK_URL }) : null;

interface LimitReachedData {
	customer_id: string;
	feature_id: string;
	limit_type: "included" | "max_purchase" | "spend_limit";
}

interface UsageAlertData {
	customer_id: string;
	feature_id: string;
	usage_alert: {
		name?: string;
		threshold: number;
		threshold_type: string;
	};
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

interface ProductsUpdatedData {
	customer: {
		id: string | null;
		name: string | null;
		email: string | null;
		env: string;
		products: Array<{ id: string; name: string; status: string }>;
	};
	scenario: ProductScenario;
	updated_product: { id: string; name: string | null };
}

interface RawAutumnEvent {
	data: unknown;
	type: string;
}

interface WebhookResult {
	message: string;
	success: boolean;
}

const getUserData = cacheable(
	async (
		customerId: string
	): Promise<{ email: string | null; name: string | null }> => {
		const row = await db.query.user.findFirst({
			where: eq(user.id, customerId),
			columns: { email: true, name: true },
		});
		return { email: row?.email ?? null, name: row?.name ?? null };
	},
	{
		expireInSec: 300,
		prefix: "user_data",
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);

function formatFeatureId(id: string): string {
	return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function wasRecentlySent(userId: string, key: string): Promise<boolean> {
	const since = new Date(Date.now() - COOLDOWN_MS);
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

async function sendAlertEmail(opts: {
	customerId: string;
	cooldownKey: string;
	alertType: string;
	subject: string;
	react: React.ReactElement;
}): Promise<WebhookResult> {
	const log = useLogger();
	const { customerId, cooldownKey, alertType, subject, react } = opts;

	if (await wasRecentlySent(customerId, cooldownKey)) {
		log.info("Skipping alert - sent recently", {
			autumn: { customerId, cooldownKey },
		});
		return { success: true, message: "Already sent recently" };
	}

	const { email } = await getUserData(customerId);
	if (!email) {
		log.warn("No email for customer", {
			autumn: { customerId, cooldownKey },
		});
		return { success: false, message: "No email found" };
	}

	const html = await render(react);
	const result = await resend.emails.send({
		from: "Databuddy <alerts@databuddy.cc>",
		to: email,
		subject,
		html,
	});

	if (result.error) {
		log.error(new Error(result.error.message), {
			autumn: { customerId, resend: result.error },
		});
		return { success: false, message: result.error.message };
	}

	await db.insert(usageAlertLog).values({
		id: createId(),
		userId: customerId,
		featureId: cooldownKey,
		alertType,
		emailSentTo: email,
	});

	log.info("Alert email sent", {
		autumn: { customerId, cooldownKey, emailId: result.data?.id },
	});
	return { success: true, message: "Email sent" };
}

function handleLimitReached(
	data: LimitReachedData
): Promise<WebhookResult> | WebhookResult {
	const { customer_id, feature_id, limit_type } = data;

	if (limit_type !== "included") {
		return { success: true, message: `Skipped ${limit_type} limit` };
	}

	const featureName = formatFeatureId(feature_id);
	mergeWideEvent({ customer_id, feature_id, limit_type });

	return sendAlertEmail({
		customerId: customer_id,
		cooldownKey: feature_id,
		alertType: limit_type,
		subject: `[Action required] ${featureName} limit reached — upgrade to continue tracking`,
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

	return sendAlertEmail({
		customerId: customer_id,
		cooldownKey: `${feature_id}_alert_${usage_alert.threshold}`,
		alertType: `usage_alert_${usage_alert.threshold_type}`,
		subject: `[Action required] You've used ${label} of your ${featureName.toLowerCase()}`,
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
	const log = useLogger();
	const { scenario, customer, updated_product } = data;
	const productLabel = updated_product.name ?? updated_product.id;

	log.info("Products updated", {
		autumn: { customerId: customer.id, scenario, product: updated_product.id },
	});

	const shouldSkipSlack =
		!slack ||
		(process.env.NODE_ENV === "production" && customer.env === "sandbox");

	if (shouldSkipSlack) {
		return { success: true, message: `Processed ${scenario}` };
	}

	const info = SCENARIO_LABELS[scenario];
	if (!info) {
		return { success: true, message: `Processed ${scenario}` };
	}

	slack
		.send({
			title: info.title,
			message: `Customer ${info.verb} *${productLabel}*.`,
			priority: info.priority,
			metadata: {
				scenario,
				product: productLabel,
				customerId: customer.id ?? "—",
				email: customer.email ?? "—",
				name: customer.name ?? "—",
				env: customer.env,
			},
		})
		.catch((error) => {
			log.error(error instanceof Error ? error : new Error(String(error)), {
				autumn: { slack: true, customerId: customer.id },
			});
		});

	return { success: true, message: `Processed ${scenario}` };
}

type VerifyResult =
	| { ok: true }
	| {
			ok: false;
			reason: "not_configured" | "missing_headers" | "bad_signature";
	  };

function verifySvix(
	body: string,
	headers: { id: string | null; ts: string | null; sig: string | null }
): VerifyResult {
	if (!svix) {
		return { ok: false, reason: "not_configured" };
	}

	const { id, ts, sig } = headers;
	if (!(id && ts && sig)) {
		return { ok: false, reason: "missing_headers" };
	}

	try {
		svix.verify(body, {
			"svix-id": id,
			"svix-timestamp": ts,
			"svix-signature": sig,
		});
		return { ok: true };
	} catch {
		return { ok: false, reason: "bad_signature" };
	}
}

function dispatch(
	event: RawAutumnEvent
): Promise<WebhookResult> | WebhookResult {
	switch (event.type) {
		case "balances.limit_reached":
			return handleLimitReached(event.data as LimitReachedData);
		case "balances.usage_alert_triggered":
			return handleUsageAlert(event.data as UsageAlertData);
		case "customer.products.updated":
			return handleProductsUpdated(event.data as ProductsUpdatedData);
		default:
			useLogger().warn("Unknown webhook type", {
				autumn: { type: event.type },
			});
			return { success: true, message: "Unknown event type" };
	}
}

export const autumnWebhook = new Elysia().post(
	"/autumn",
	async ({ headers, request, set }) => {
		const log = useLogger();
		const rawBody = await request.text();

		const verify = verifySvix(rawBody, {
			id: headers["svix-id"] ?? null,
			ts: headers["svix-timestamp"] ?? null,
			sig: headers["svix-signature"] ?? null,
		});

		if (!verify.ok) {
			if (verify.reason === "not_configured") {
				log.error(new Error("AUTUMN_WEBHOOK_SECRET not configured"), {
					autumn: { step: "verify", reason: verify.reason },
				});
				set.status = 503;
				return { success: false, message: "Webhook secret not configured" };
			}
			log.error(new Error(`Svix verification failed: ${verify.reason}`), {
				autumn: { step: "verify", reason: verify.reason },
			});
			set.status = 401;
			return { success: false, message: "Invalid signature" };
		}

		let event: RawAutumnEvent;
		try {
			event = JSON.parse(rawBody) as RawAutumnEvent;
		} catch {
			set.status = 400;
			return { success: false, message: "Invalid JSON body" };
		}

		if (typeof event?.type !== "string") {
			set.status = 400;
			return { success: false, message: "Invalid event shape" };
		}

		const svixId = headers["svix-id"];
		mergeWideEvent({
			webhook_type: event.type,
			...(svixId ? { svix_id: svixId } : {}),
		});
		log.info("Autumn webhook", { autumn: { type: event.type } });

		return dispatch(event);
	},
	{ parse: "none" }
);
