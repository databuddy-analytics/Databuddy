import { randomUUID } from "node:crypto";
import {
	and,
	db,
	eq,
	gt,
	normalizeEmailNotificationSettings,
	sql,
	withTransaction,
} from "@databuddy/db";
import { usageAlertLog } from "@databuddy/db/schema";
import { render, UsageAlertEmail, UsageLimitEmail } from "@databuddy/email";
import { config } from "@databuddy/env/app";
import { SlackProvider } from "@databuddy/notifications";
import {
	cacheable,
	invalidateAgentContextSnapshotsForOwner,
	invalidateBillingOwnerCaches,
} from "@databuddy/redis";
import { Elysia } from "elysia";
import { useLogger } from "evlog/elysia";
import { Resend } from "resend";
import { Webhook } from "svix";
// biome-ignore lint/performance/noNamespaceImport: vitest+bun fails to bind zod's named `z` export; namespace import is the reliable form
import * as z from "zod";
import { mergeWideEvent } from "../../lib/tracing";

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const SVIX_SECRET = process.env.AUTUMN_WEBHOOK_SECRET;
const SLACK_URL = process.env.SLACK_WEBHOOK_URL ?? "";

const resend = new Resend(process.env.RESEND_API_KEY);
const svix = SVIX_SECRET ? new Webhook(SVIX_SECRET) : null;
const slack = SLACK_URL ? new SlackProvider({ webhookUrl: SLACK_URL }) : null;

const limitReachedSchema = z.object({
	customer_id: z.string(),
	feature_id: z.string(),
	limit_type: z.enum(["included", "max_purchase", "spend_limit"]),
});

const usageAlertSchema = z.object({
	customer_id: z.string(),
	feature_id: z.string(),
	usage_alert: z.object({
		name: z.string().optional(),
		threshold: z.number(),
		threshold_type: z.string(),
	}),
});

const productScenarioSchema = z.enum([
	"new",
	"upgrade",
	"downgrade",
	"renew",
	"cancel",
	"expired",
	"past_due",
	"scheduled",
]);

type ProductScenario = z.infer<typeof productScenarioSchema>;

const productsUpdatedSchema = z.object({
	customer: z.object({
		id: z.string().nullable(),
		name: z.string().nullable(),
		email: z.string().nullable(),
		env: z.string(),
		products: z.array(
			z.object({ id: z.string(), name: z.string(), status: z.string() })
		),
	}),
	scenario: productScenarioSchema,
	updated_product: z.object({ id: z.string(), name: z.string().nullable() }),
});

type LimitReachedData = z.infer<typeof limitReachedSchema>;
type UsageAlertData = z.infer<typeof usageAlertSchema>;
type ProductsUpdatedData = z.infer<typeof productsUpdatedSchema>;

interface RawAutumnEvent {
	data: unknown;
	type: string;
}

interface WebhookResult {
	message: string;
	success: boolean;
}

async function getOrganizationEmailSettings(customerId: string) {
	const row = await db.query.organization.findFirst({
		where: { id: customerId },
		columns: { emailNotifications: true },
	});
	return normalizeEmailNotificationSettings(row?.emailNotifications);
}

const getUserData = cacheable(
	async (
		customerId: string
	): Promise<{ email: string | null; name: string | null }> => {
		const row = await db.query.user.findFirst({
			where: { id: customerId },
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

export async function sendAlertEmail(opts: {
	customerId: string;
	cooldownKey: string;
	alertType: string;
	subject: string;
	react: React.ReactElement;
}): Promise<WebhookResult> {
	const log = useLogger();
	const { customerId, cooldownKey, alertType, subject, react } = opts;

	const { email } = await getUserData(customerId);
	if (!email) {
		log.warn("No email for customer", {
			autumn: { customerId, cooldownKey },
		});
		return { success: false, message: "No email found" };
	}

	return withTransaction(async (tx) => {
		await tx.execute(
			sql`SELECT pg_advisory_xact_lock(hashtextextended(${`usage-alert:${customerId}:${cooldownKey}`}, 0))`
		);

		const since = new Date(Date.now() - COOLDOWN_MS);
		const [recent] = await tx
			.select({ id: usageAlertLog.id })
			.from(usageAlertLog)
			.where(
				and(
					eq(usageAlertLog.userId, customerId),
					eq(usageAlertLog.featureId, cooldownKey),
					gt(usageAlertLog.createdAt, since)
				)
			)
			.limit(1);

		if (recent) {
			log.info("Skipping alert - sent recently", {
				autumn: { customerId, cooldownKey },
			});
			return { success: true, message: "Already sent recently" };
		}

		const html = await render(react);
		const result = await resend.emails.send({
			from: config.email.alertsFrom,
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

		await tx.insert(usageAlertLog).values({
			id: randomUUID(),
			userId: customerId,
			featureId: cooldownKey,
			alertType,
			emailSentTo: email,
		});

		log.info("Alert email sent", {
			autumn: { customerId, cooldownKey, emailId: result.data?.id },
		});
		return { success: true, message: "Email sent" };
	});
}

async function invalidatePlanCaches(customerId: string | null): Promise<void> {
	if (!customerId) {
		return;
	}
	try {
		const ownedOrganizations = await db.query.member.findMany({
			where: { userId: customerId, role: "owner" },
			columns: { organizationId: true },
		});
		const ownerIds = [
			customerId,
			...ownedOrganizations.map((row) => row.organizationId),
		];
		await Promise.all([
			invalidateBillingOwnerCaches(ownerIds),
			...ownerIds.map((ownerId) =>
				invalidateAgentContextSnapshotsForOwner(ownerId)
			),
		]);
	} catch (error) {
		useLogger().info("Plan cache invalidation failed (best-effort)", {
			autumn: { customerId, error },
		});
	}
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

async function handleUsageAlert(data: UsageAlertData): Promise<WebhookResult> {
	const { customer_id, feature_id, usage_alert } = data;
	const settings = await getOrganizationEmailSettings(customer_id);
	if (!settings.billing.usageWarnings) {
		return { success: true, message: "Usage warning emails disabled" };
	}
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

async function handleProductsUpdated(
	data: ProductsUpdatedData
): Promise<WebhookResult> {
	const log = useLogger();
	const { scenario, customer, updated_product } = data;
	const productLabel = updated_product.name ?? updated_product.id;

	log.info("Products updated", {
		autumn: { customerId: customer.id, scenario, product: updated_product.id },
	});
	await invalidatePlanCaches(customer.id);

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
			return handleLimitReached(limitReachedSchema.parse(event.data));
		case "balances.usage_alert_triggered":
			return handleUsageAlert(usageAlertSchema.parse(event.data));
		case "customer.products.updated":
			return handleProductsUpdated(productsUpdatedSchema.parse(event.data));
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

		try {
			return await dispatch(event);
		} catch (error) {
			if (error instanceof z.ZodError) {
				log.error(new Error("Invalid Autumn webhook payload"), {
					autumn: { type: event.type, issues: error.issues },
				});
				set.status = 400;
				return { success: false, message: "Invalid event payload" };
			}
			throw error;
		}
	},
	{ parse: "none" }
);
