import { createHash, randomUUID } from "node:crypto";
import {
	and,
	db,
	eq,
	gt,
	isNull,
	normalizeEmailNotificationSettings,
	or,
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
import { getAutumn } from "@databuddy/rpc";
import { recordPlanChange } from "@databuddy/services/billing-lifecycle";
import { DATABUNNY_USAGE } from "@databuddy/shared/billing";
import { Elysia } from "elysia";
import { log } from "evlog";
import { useLogger } from "evlog/elysia";
import { Resend } from "resend";
import { Webhook } from "svix";
// biome-ignore lint/performance/noNamespaceImport: vitest+bun fails to bind zod's named `z` export; namespace import is the reliable form
import * as z from "zod";
import { mergeWideEvent } from "@databuddy/ai/lib/tracing";
import {
	claimAutumnWebhook,
	deadLetterExhaustedAutumnWebhooks,
	getAutumnWebhook,
	listReplayableAutumnWebhookIds,
	recordAutumnWebhookAttempt,
	storeAutumnWebhook,
	type ClaimedAutumnWebhook,
} from "./autumn-inbox";

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const SVIX_SECRET = process.env.AUTUMN_WEBHOOK_SECRET;
const SLACK_URL = process.env.SLACK_WEBHOOK_URL ?? "";

const svix = SVIX_SECRET ? new Webhook(SVIX_SECRET) : null;
const slack = SLACK_URL ? new SlackProvider({ webhookUrl: SLACK_URL }) : null;

const billingIdentifierSchema = z.string().min(1).max(200);

interface AutumnLogger {
	error(error: Error, fields?: Record<string, unknown>): void;
	info(message: string, fields?: Record<string, unknown>): void;
	warn(message: string, fields?: Record<string, unknown>): void;
}

function getAutumnLogger(): AutumnLogger {
	try {
		return useLogger();
	} catch {
		return {
			error: (error, fields) =>
				log.error({
					service: "api",
					component: "autumn_webhook",
					error_message: error.message,
					...fields,
				}),
			info: (message, fields) =>
				log.info({
					service: "api",
					component: "autumn_webhook",
					message,
					...fields,
				}),
			warn: (message, fields) =>
				log.warn({
					service: "api",
					component: "autumn_webhook",
					message,
					...fields,
				}),
		};
	}
}

const limitReachedSchema = z.object({
	customer_id: billingIdentifierSchema,
	entity_id: billingIdentifierSchema.optional(),
	feature_id: billingIdentifierSchema,
	limit_type: z.enum(["included", "max_purchase", "spend_limit"]),
});

const usageAlertSchema = z.object({
	customer_id: billingIdentifierSchema,
	entity_id: billingIdentifierSchema.optional(),
	feature_id: billingIdentifierSchema,
	usage_alert: z.object({
		name: z.string().max(200).optional(),
		threshold: z.number(),
		threshold_type: z.string().min(1).max(100),
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
	disposition?: "dead_letter" | "deferred" | "duplicate";
	message: string;
	success: boolean;
}

type ReplayableAutumnEvent =
	| { data: LimitReachedData; type: "balances.limit_reached" }
	| {
			data: UsageAlertData;
			type: "balances.usage_alert_triggered";
	  };

interface BillingRecipient {
	email: string | null;
}

interface BillingOrganizationContext {
	emailNotifications: Parameters<typeof normalizeEmailNotificationSettings>[0];
	id: string;
	name: string;
}

interface UsageSnapshot {
	granted: number;
	isAvailable: boolean;
	nextResetAt: number | null;
	overageAllowed: boolean;
	remaining: number;
	usage: number;
}

interface BillingFeatureCopy {
	description: string;
	name: string;
	pausedActivity: string;
	unit: string;
}

const getBillingRecipient = cacheable(
	async (customerId: string): Promise<BillingRecipient> => {
		const row = await db.query.user.findFirst({
			where: { id: customerId },
			columns: { email: true },
		});
		return { email: row?.email ?? null };
	},
	{
		expireInSec: 300,
		prefix: "user_data",
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);

export async function resolveBillingOrganization(
	customerId: string,
	entityId?: string
): Promise<BillingOrganizationContext | null> {
	const memberships = await db.query.member.findMany({
		where: { userId: customerId, role: "owner" },
		columns: { organizationId: true },
		with: {
			organization: {
				columns: { id: true, name: true, emailNotifications: true },
			},
		},
	});

	const candidates = entityId
		? memberships.filter((row) => row.organizationId === entityId)
		: memberships;
	if (candidates.length !== 1) {
		return null;
	}

	const organization = candidates[0]?.organization;
	return organization
		? {
				emailNotifications: organization.emailNotifications,
				id: organization.id,
				name: organization.name,
			}
		: null;
}

function getFeatureCopy(featureId: string): BillingFeatureCopy {
	if (featureId === "agent_credits") {
		return {
			description: DATABUNNY_USAGE.description,
			name: DATABUNNY_USAGE.name,
			pausedActivity: DATABUNNY_USAGE.pausedActivity,
			unit: DATABUNNY_USAGE.unit,
		};
	}

	if (featureId === "events") {
		return {
			description:
				"Events include page views, custom events, errors, and Web Vitals collected by Databuddy.",
			name: "Event tracking",
			pausedActivity: "new event collection",
			unit: "events",
		};
	}

	const label = featureId.replaceAll(/[_-]+/g, " ").trim() || "Feature";
	return {
		description: `This allowance controls how much ${label} your plan can use.`,
		name: `${label[0]?.toUpperCase() ?? ""}${label.slice(1)} usage`,
		pausedActivity: label,
		unit: "units",
	};
}

async function getUsageSnapshot(
	customerId: string,
	featureId: string,
	entityId?: string
): Promise<UsageSnapshot | null> {
	try {
		const response = await getAutumn().check({
			customerId,
			featureId,
			...(entityId ? { entityId } : {}),
		});
		const balance = response.balance;
		if (!balance) {
			return null;
		}
		return {
			granted: balance.granted,
			isAvailable: response.allowed,
			nextResetAt: balance.nextResetAt,
			overageAllowed: balance.overageAllowed,
			remaining: balance.remaining,
			usage: balance.usage,
		};
	} catch (error) {
		getAutumnLogger().error(
			error instanceof Error ? error : new Error(String(error)),
			{ autumn: { step: "load_usage", customerId, entityId, featureId } }
		);
		return null;
	}
}

function formatUsageNumber(value: number): string {
	if (!Number.isFinite(value)) {
		return "—";
	}
	return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(
		value
	);
}

function usagePercentage(snapshot: UsageSnapshot): number | null {
	if (
		!(Number.isFinite(snapshot.granted) && Number.isFinite(snapshot.usage)) ||
		snapshot.granted <= 0
	) {
		return null;
	}
	return Math.round((snapshot.usage / snapshot.granted) * 100);
}

export async function sendAlertEmail(opts: {
	customerId: string;
	cooldownKey: string;
	alertType: string;
	idempotencyKey?: string;
	organizationId: string;
	subject: string;
	react: React.ReactElement;
	recipient: BillingRecipient;
}): Promise<WebhookResult> {
	const log = getAutumnLogger();
	const {
		customerId,
		cooldownKey,
		alertType,
		idempotencyKey,
		organizationId,
		subject,
		react,
		recipient,
	} = opts;

	const { email } = recipient;
	if (!email) {
		log.warn("No email for customer", {
			autumn: { customerId, cooldownKey, organizationId },
		});
		return { success: true, message: "No notification recipient found" };
	}
	const resendApiKey = process.env.RESEND_API_KEY;
	if (!resendApiKey) {
		log.error(new Error("RESEND_API_KEY is not configured"), {
			autumn: {
				customerId,
				cooldownKey,
				organizationId,
				step: "email_configuration",
			},
		});
		return { success: false, message: "Alert email delivery unavailable" };
	}
	const resend = new Resend(resendApiKey);

	return await withTransaction(async (tx) => {
		// Old API replicas use this organization-agnostic lock and write NULL
		// organization IDs. Take it first until the mixed-version window closes.
		await tx.execute(
			sql`SELECT pg_advisory_xact_lock(hashtextextended(${`usage-alert:${customerId}:${cooldownKey}`}, 0))`
		);
		await tx.execute(
			sql`SELECT pg_advisory_xact_lock(hashtextextended(${`usage-alert:${organizationId}:${customerId}:${cooldownKey}`}, 0))`
		);

		const since = new Date(Date.now() - COOLDOWN_MS);
		const [recent] = await tx
			.select({ id: usageAlertLog.id })
			.from(usageAlertLog)
			.where(
				and(
					eq(usageAlertLog.userId, customerId),
					eq(usageAlertLog.featureId, cooldownKey),
					gt(usageAlertLog.createdAt, since),
					or(
						eq(usageAlertLog.organizationId, organizationId),
						isNull(usageAlertLog.organizationId)
					)
				)
			)
			.limit(1);

		if (recent) {
			log.info("Skipping alert - sent recently", {
				autumn: { customerId, cooldownKey, organizationId },
			});
			return { success: true, message: "Already sent recently" };
		}

		const [html, text] = await Promise.all([
			render(react),
			render(react, { plainText: true }),
		]);
		const message = {
			from: config.email.alertsFrom,
			to: email,
			subject,
			html,
			text,
		};
		const result = idempotencyKey
			? await resend.emails.send(message, { idempotencyKey })
			: await resend.emails.send(message);

		if (result.error) {
			log.error(new Error(result.error.message), {
				autumn: { customerId, organizationId, resend: result.error },
			});
			return { success: false, message: "Alert email delivery failed" };
		}

		await tx.insert(usageAlertLog).values({
			id: randomUUID(),
			userId: customerId,
			organizationId,
			featureId: cooldownKey,
			alertType,
			emailSentTo: email,
		});

		log.info("Alert email sent", {
			autumn: {
				customerId,
				cooldownKey,
				emailId: result.data?.id,
				organizationId,
			},
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
		getAutumnLogger().info("Plan cache invalidation failed (best-effort)", {
			autumn: { customerId, error },
		});
	}
}

export async function handleLimitReached(
	data: LimitReachedData,
	idempotencyKey?: string
): Promise<WebhookResult> {
	const { customer_id, entity_id, feature_id, limit_type } = data;
	const organization = await resolveBillingOrganization(customer_id, entity_id);
	if (!organization) {
		getAutumnLogger().warn(
			"Deferring billing usage email without one organization",
			{
				autumn: { customerId: customer_id, entityId: entity_id },
			}
		);
		return {
			disposition: "deferred",
			success: false,
			message:
				"Billing usage email deferred: organization could not be resolved",
		};
	}

	const [recipient, snapshot] = await Promise.all([
		getBillingRecipient(customer_id),
		getUsageSnapshot(customer_id, feature_id, entity_id),
	]);

	if (
		!normalizeEmailNotificationSettings(organization.emailNotifications).billing
			.usageWarnings
	) {
		return { success: true, message: "Billing usage emails disabled" };
	}
	if (!snapshot) {
		return { success: false, message: "Current usage is unavailable" };
	}

	const feature = getFeatureCopy(feature_id);
	const isHardStop = !snapshot.isAvailable;
	const subject = isHardStop
		? `[Action required] ${feature.name} is paused`
		: `${feature.name}: included allowance used`;
	mergeWideEvent({ customer_id, feature_id, limit_type });

	return sendAlertEmail({
		customerId: customer_id,
		cooldownKey: `${feature_id}:limit:${limit_type}`,
		alertType: limit_type,
		idempotencyKey,
		organizationId: organization.id,
		subject,
		react: UsageLimitEmail({
			featureDescription: feature.description,
			featureName: feature.name,
			isAvailable: snapshot.isAvailable,
			limitAmount: snapshot.granted,
			limitType: limit_type,
			nextResetAt: snapshot.nextResetAt,
			organizationName: organization?.name,
			overageAllowed: snapshot.overageAllowed,
			pausedActivity: feature.pausedActivity,
			remainingAmount: snapshot.remaining,
			usageAmount: snapshot.usage,
			usageUnit: feature.unit,
		}),
		recipient,
	});
}

export async function handleUsageAlert(
	data: UsageAlertData,
	idempotencyKey?: string
): Promise<WebhookResult> {
	const { customer_id, entity_id, feature_id, usage_alert } = data;
	const organization = await resolveBillingOrganization(customer_id, entity_id);
	if (!organization) {
		getAutumnLogger().warn(
			"Deferring billing usage email without one organization",
			{
				autumn: { customerId: customer_id, entityId: entity_id },
			}
		);
		return {
			disposition: "deferred",
			success: false,
			message:
				"Billing usage email deferred: organization could not be resolved",
		};
	}

	const [recipient, snapshot] = await Promise.all([
		getBillingRecipient(customer_id),
		getUsageSnapshot(customer_id, feature_id, entity_id),
	]);
	if (
		!normalizeEmailNotificationSettings(organization.emailNotifications).billing
			.usageWarnings
	) {
		return { success: true, message: "Billing usage emails disabled" };
	}
	if (!snapshot) {
		return { success: false, message: "Current usage is unavailable" };
	}

	const feature = getFeatureCopy(feature_id);
	const percentage = usagePercentage(snapshot);
	const subject =
		percentage === null
			? `${feature.name}: ${formatUsageNumber(snapshot.usage)} ${feature.unit} used`
			: `${feature.name} is at ${percentage}%`;

	mergeWideEvent({
		customer_id,
		feature_id,
		usage_alert_threshold: usage_alert.threshold,
		usage_alert_type: usage_alert.threshold_type,
	});

	return sendAlertEmail({
		customerId: customer_id,
		cooldownKey: `${feature_id}:alert:${usage_alert.threshold_type}:${usage_alert.threshold}`,
		alertType: `usage_alert_${usage_alert.threshold_type}`,
		idempotencyKey,
		organizationId: organization.id,
		subject,
		react: UsageAlertEmail({
			featureDescription: feature.description,
			featureName: feature.name,
			limitAmount: snapshot.granted,
			nextResetAt: snapshot.nextResetAt,
			organizationName: organization?.name,
			overageAllowed: snapshot.overageAllowed,
			pausedActivity: feature.pausedActivity,
			remainingAmount: snapshot.remaining,
			usageAmount: snapshot.usage,
			usageUnit: feature.unit,
		}),
		recipient,
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
	const log = getAutumnLogger();
	const { scenario, customer, updated_product } = data;
	const productLabel = updated_product.name ?? updated_product.id;

	log.info("Products updated", {
		autumn: { customerId: customer.id, scenario, product: updated_product.id },
	});
	await invalidatePlanCaches(customer.id);

	const isSandboxInProduction =
		process.env.NODE_ENV === "production" && customer.env === "sandbox";

	if (customer.id && !isSandboxInProduction) {
		try {
			await recordPlanChange({
				customerId: customer.id,
				planId: updated_product.id,
				scenario,
			});
		} catch (error) {
			log.error(error instanceof Error ? error : new Error(String(error)), {
				autumn: { step: "record_plan_change", customerId: customer.id },
			});
		}
	}

	const shouldSkipSlack = !slack || isSandboxInProduction;

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

function replayableAutumnEvent(
	event: RawAutumnEvent
): ReplayableAutumnEvent | null {
	switch (event.type) {
		case "balances.limit_reached":
			return {
				data: limitReachedSchema.parse(event.data),
				type: event.type,
			};
		case "balances.usage_alert_triggered": {
			const data = usageAlertSchema.parse(event.data);
			return {
				data: {
					customer_id: data.customer_id,
					...(data.entity_id ? { entity_id: data.entity_id } : {}),
					feature_id: data.feature_id,
					usage_alert: {
						threshold: data.usage_alert.threshold,
						threshold_type: data.usage_alert.threshold_type,
					},
				},
				type: event.type,
			};
		}
		default:
			return null;
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function webhookIdempotencyKey(svixId: string): string {
	return createHash("sha256").update(svixId).digest("hex");
}

async function processClaimedAutumnWebhook(
	stored: ClaimedAutumnWebhook
): Promise<WebhookResult> {
	let result: WebhookResult;
	try {
		const event = replayableAutumnEvent({
			data: stored.payload,
			type: stored.type,
		});
		if (!event) {
			throw new Error(`Unsupported stored Autumn webhook type: ${stored.type}`);
		}
		result = await dispatch(event, webhookIdempotencyKey(stored.id));
	} catch (error) {
		const status = await recordAutumnWebhookAttempt({
			attempts: stored.attempts,
			claimToken: stored.claimToken,
			errorMessage: errorMessage(error),
			id: stored.id,
			status: "pending",
		});
		if (status === "completed") {
			return {
				disposition: "duplicate",
				message: "Webhook already processed",
				success: true,
			};
		}
		if (status === "dead_letter") {
			return {
				disposition: "dead_letter",
				message: "Webhook moved to dead letter",
				success: true,
			};
		}
		throw error;
	}

	if (result.disposition === "deferred") {
		const status = await recordAutumnWebhookAttempt({
			attempts: stored.attempts,
			claimToken: stored.claimToken,
			errorMessage: result.message,
			id: stored.id,
			status: "deferred",
		});
		if (status === "completed") {
			return {
				disposition: "duplicate",
				message: "Webhook already processed",
				success: true,
			};
		}
		if (status === "dead_letter") {
			return {
				disposition: "dead_letter",
				message: "Webhook moved to dead letter",
				success: true,
			};
		}
		return {
			disposition: "deferred",
			message: "Webhook stored for replay",
			success: true,
		};
	}

	if (!result.success) {
		const status = await recordAutumnWebhookAttempt({
			attempts: stored.attempts,
			claimToken: stored.claimToken,
			errorMessage: result.message,
			id: stored.id,
			status: "pending",
		});
		if (status === "completed") {
			return {
				disposition: "duplicate",
				message: "Webhook already processed",
				success: true,
			};
		}
		if (status === "dead_letter") {
			return {
				disposition: "dead_letter",
				message: "Webhook moved to dead letter",
				success: true,
			};
		}
		return result;
	}

	await recordAutumnWebhookAttempt({
		attempts: stored.attempts,
		claimToken: stored.claimToken,
		id: stored.id,
		status: "completed",
	});
	return result;
}

async function processStoredAutumnWebhook(
	svixId: string
): Promise<WebhookResult> {
	const claimed = await claimAutumnWebhook({ id: svixId });
	if (claimed) {
		return processClaimedAutumnWebhook(claimed);
	}

	const stored = await getAutumnWebhook(svixId);
	if (!stored) {
		return { success: false, message: "Stored webhook not found" };
	}
	if (stored.status === "completed") {
		return {
			disposition: "duplicate",
			message: "Webhook already processed",
			success: true,
		};
	}
	if (stored.status === "dead_letter") {
		return {
			disposition: "duplicate",
			message: "Webhook retained for investigation",
			success: true,
		};
	}
	return {
		disposition: "deferred",
		message: "Webhook already queued for replay",
		success: true,
	};
}

export async function handleVerifiedAutumnEvent(
	svixId: string,
	event: RawAutumnEvent
): Promise<WebhookResult> {
	const replayable = replayableAutumnEvent(event);
	if (!replayable) {
		return dispatch(event);
	}

	await storeAutumnWebhook({
		id: svixId,
		payload: replayable.data,
		type: replayable.type,
	});
	return processStoredAutumnWebhook(svixId);
}

export function replayDeferredAutumnWebhook(
	svixId: string
): Promise<WebhookResult> {
	return processStoredAutumnWebhook(svixId);
}

export async function replayDeferredAutumnWebhooks(
	limit = 25,
	shouldContinue: () => boolean = () => true
): Promise<{
	completed: number;
	deadLettered: number;
	deferred: number;
	failed: string[];
}> {
	const exhausted = await deadLetterExhaustedAutumnWebhooks();
	const ids = await listReplayableAutumnWebhookIds({ limit });
	const report = {
		completed: 0,
		deadLettered: exhausted,
		deferred: 0,
		failed: [] as string[],
	};
	for (const id of ids) {
		if (!shouldContinue()) {
			break;
		}
		try {
			const result = await replayDeferredAutumnWebhook(id);
			if (result.disposition === "dead_letter") {
				report.deadLettered += 1;
				continue;
			}
			if (result.disposition === "deferred") {
				report.deferred += 1;
				continue;
			}
			if (result.success) {
				report.completed += 1;
				continue;
			}
			report.failed.push(id);
		} catch {
			report.failed.push(id);
		}
	}
	return report;
}

function dispatch(
	event: RawAutumnEvent,
	idempotencyKey?: string
): Promise<WebhookResult> | WebhookResult {
	switch (event.type) {
		case "balances.limit_reached":
			return handleLimitReached(
				limitReachedSchema.parse(event.data),
				idempotencyKey
			);
		case "balances.usage_alert_triggered":
			return handleUsageAlert(
				usageAlertSchema.parse(event.data),
				idempotencyKey
			);
		case "customer.products.updated":
			return handleProductsUpdated(productsUpdatedSchema.parse(event.data));
		default:
			getAutumnLogger().warn("Unknown webhook type", {
				autumn: { type: event.type },
			});
			return { success: true, message: "Unknown event type" };
	}
}

export const autumnWebhook = new Elysia().post(
	"/autumn",
	async ({ headers, request, set }) => {
		const log = getAutumnLogger();
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
				return { success: false, message: "Webhook temporarily unavailable" };
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
		if (!svixId) {
			set.status = 401;
			return { success: false, message: "Invalid signature" };
		}
		mergeWideEvent({
			webhook_type: event.type,
			svix_id: svixId,
		});
		log.info("Autumn webhook", { autumn: { type: event.type } });

		try {
			const result = await handleVerifiedAutumnEvent(svixId, event);
			if (result.disposition === "deferred") {
				set.status = 202;
				return result;
			}
			if (!result.success) {
				set.status = 502;
			}
			return result;
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
