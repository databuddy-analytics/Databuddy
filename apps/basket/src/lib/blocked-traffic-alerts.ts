import type { BlockedTrafficInsert } from "@databuddy/db/clickhouse/tables";
import { chQuery } from "@databuddy/db/clickhouse";
import {
	db,
	normalizeEmailNotificationSettings,
	type EmailNotificationSettings,
} from "@databuddy/db";
import { config } from "@databuddy/env/app";
import { BlockedTrafficAlertEmail, render } from "@databuddy/email";
import { redis } from "@databuddy/redis";
import {
	getTrackingBlockOriginHost,
	isActionableTrackingBlockReason,
	isIgnoredTrackingBlockOrigin,
	matchesTrackingBlockIgnoredOrigin,
} from "@databuddy/shared/tracking-blocks";
import { captureError } from "@lib/tracing";
import { log } from "evlog";

let warnedEmailUnconfigured = false;
function warnBlockedTrafficEmailUnconfigured(): void {
	if (warnedEmailUnconfigured) {
		return;
	}
	warnedEmailUnconfigured = true;
	log.warn({
		message:
			"Blocked traffic email alerts disabled: RESEND_API_KEY is not configured",
	});
}

const ALERT_WINDOW_MINUTES = 15;
const RECENT_SUCCESS_MINUTES = 30;
const BASELINE_SUCCESS_HOURS = 7 * 24;
const ZERO_TRACKING_BLOCK_THRESHOLD = 3;
const BLOCKED_SPIKE_THRESHOLD = 25;
const MIN_BASELINE_EVENTS = 5;
const SPIKE_MULTIPLIER = 3;

export interface BlockedTrafficAlertContext {
	organizationId?: string | null;
	ownerId?: string | null;
	websiteDomain?: string | null;
	websiteName?: string | null;
}

interface TrackingHealthCounts {
	baselineEvents: number;
	recentEvents: number;
}

interface PreviousBlockedCountRow {
	previousBlocked: number;
}

export interface BlockedTrafficAlertDecision {
	kind: "blocked_spike" | "tracking_zero";
	severity: "critical" | "warning";
}

function getAlertOrigin(event: BlockedTrafficInsert): string {
	return event.origin?.trim() || "";
}

function getAlertOriginKey(event: BlockedTrafficInsert): string {
	return encodeURIComponent(getAlertOrigin(event) || "missing-origin");
}

function getBlockedTrafficSource(
	event: Pick<BlockedTrafficInsert, "origin" | "referrer">
): string | null {
	return event.origin || event.referrer || null;
}

export function matchesTrackingAlertIgnoredOrigin(
	source: string | null,
	patterns: string[]
): boolean {
	return matchesTrackingBlockIgnoredOrigin(source, patterns);
}

export function shouldIgnoreBlockedTrafficAlertEvent(
	event: Pick<
		BlockedTrafficInsert,
		"block_reason" | "client_id" | "origin" | "referrer"
	>
): boolean {
	if (
		!(event.client_id && isActionableTrackingBlockReason(event.block_reason))
	) {
		return true;
	}

	return isIgnoredTrackingBlockOrigin(getBlockedTrafficSource(event));
}

function buildRecommendedFix(event: BlockedTrafficInsert): string {
	const host = getTrackingBlockOriginHost(event.origin ?? null);
	if (event.block_reason === "origin_not_authorized") {
		return host
			? `Update the website domain to ${host}, or add ${host} under Security → Allowed Origins if this is an additional trusted domain.`
			: "Update the website domain or add the trusted origin under Security → Allowed Origins.";
	}

	if (event.block_reason === "origin_missing") {
		return "Browser requests must include an allowed Origin. For server-side events, use the /track API with an API key instead of the browser ingest endpoint.";
	}

	return "Update the website IP allowlist or remove the restriction if browser traffic should be accepted from dynamic client IPs.";
}

function buildDashboardUrl(clientId: string, reason: string): string {
	const section = reason === "origin_not_authorized" ? "general" : "security";
	return `${config.urls.dashboard}/websites/${clientId}/settings/${section}`;
}

async function incrementWindowCounter(
	event: BlockedTrafficInsert
): Promise<number> {
	const key = `blocked-traffic-alert:count:${event.client_id}:${event.block_reason}:${getAlertOriginKey(event)}`;
	const count = await redis.incr(key);
	if (count === 1) {
		await redis.expire(key, ALERT_WINDOW_MINUTES * 60);
	}
	return count;
}

async function getTrackingHealth(
	clientId: string
): Promise<TrackingHealthCounts> {
	const rows = await chQuery<TrackingHealthCounts>(
		`SELECT
			countIf(event_name = 'screen_view' AND time >= now() - INTERVAL ${RECENT_SUCCESS_MINUTES} MINUTE) AS recentEvents,
			countIf(event_name = 'screen_view' AND time >= now() - INTERVAL ${BASELINE_SUCCESS_HOURS} HOUR AND time < now() - INTERVAL ${RECENT_SUCCESS_MINUTES} MINUTE) AS baselineEvents
		FROM analytics.events
		PREWHERE client_id = {clientId:String}`,
		{ clientId }
	);
	return rows[0] ?? { baselineEvents: 0, recentEvents: 0 };
}

async function getPreviousBlockedCount(
	event: BlockedTrafficInsert
): Promise<number> {
	const rows = await chQuery<PreviousBlockedCountRow>(
		`SELECT count() AS previousBlocked
		FROM analytics.blocked_traffic
		PREWHERE timestamp >= now() - INTERVAL ${ALERT_WINDOW_MINUTES * 2} MINUTE
			AND timestamp < now() - INTERVAL ${ALERT_WINDOW_MINUTES} MINUTE
		WHERE client_id = {clientId:String}
			AND block_reason = {reason:String}
			AND ifNull(origin, '') = {origin:String}`,
		{
			clientId: event.client_id,
			origin: getAlertOrigin(event),
			reason: event.block_reason,
		}
	);
	return rows[0]?.previousBlocked ?? 0;
}

export function decideBlockedTrafficAlert(input: {
	baselineEvents: number;
	count: number;
	previousBlocked: number;
	recentEvents: number;
}): BlockedTrafficAlertDecision | null {
	if (
		input.count >= ZERO_TRACKING_BLOCK_THRESHOLD &&
		input.recentEvents === 0 &&
		input.baselineEvents >= MIN_BASELINE_EVENTS
	) {
		return { kind: "tracking_zero", severity: "critical" };
	}

	const spikeFloor = Math.max(
		BLOCKED_SPIKE_THRESHOLD,
		input.previousBlocked * SPIKE_MULTIPLIER
	);
	if (input.count >= spikeFloor) {
		return { kind: "blocked_spike", severity: "warning" };
	}

	return null;
}

export function shouldEvaluateBlockedTrafficAlert(
	windowBlockedCount: number
): boolean {
	return (
		windowBlockedCount === ZERO_TRACKING_BLOCK_THRESHOLD ||
		windowBlockedCount >= BLOCKED_SPIKE_THRESHOLD
	);
}

export function requireBlockedTrafficEmailApiKey(
	apiKey: string | undefined
): string {
	if (!apiKey) {
		throw new Error("Blocked traffic email delivery is not configured");
	}
	return apiKey;
}

function cooldownKey(
	event: BlockedTrafficInsert,
	kind: BlockedTrafficAlertDecision["kind"]
): string {
	return `blocked-traffic-alert:sent:${event.client_id}:${event.block_reason}:${getAlertOriginKey(event)}:${kind}`;
}

async function reserveCooldown(
	event: BlockedTrafficInsert,
	kind: BlockedTrafficAlertDecision["kind"],
	settings: EmailNotificationSettings
): Promise<string | null> {
	const key = cooldownKey(event, kind);
	const seconds = settings.trackingHealth.cooldownMinutes * 60;
	const reserved = await redis.set(key, "1", "EX", seconds, "NX");
	return reserved === "OK" ? key : null;
}

async function getOwnerEmail(ownerId: string): Promise<string | null> {
	const row = await db.query.user.findFirst({
		where: { id: ownerId },
		columns: { email: true },
	});
	if (!row?.email) {
		return null;
	}
	return row.email;
}

async function getOrganizationEmailSettings(
	organizationId: string | null | undefined
): Promise<EmailNotificationSettings> {
	if (!organizationId) {
		return normalizeEmailNotificationSettings(null);
	}

	const row = await db.query.organization.findFirst({
		where: { id: organizationId },
		columns: { emailNotifications: true },
	});
	return normalizeEmailNotificationSettings(row?.emailNotifications);
}

function isAlertMutedBySettings(input: {
	decision: BlockedTrafficAlertDecision;
	event: BlockedTrafficInsert;
	settings: EmailNotificationSettings;
}): boolean {
	const tracking = input.settings.trackingHealth;
	if (tracking.mode === "off") {
		return true;
	}
	if (
		tracking.mode === "critical_only" &&
		input.decision.kind !== "tracking_zero"
	) {
		return true;
	}
	if (
		tracking.ignoredReasons.some(
			(reason) => reason === input.event.block_reason
		)
	) {
		return true;
	}
	return matchesTrackingAlertIgnoredOrigin(
		getBlockedTrafficSource(input.event),
		tracking.ignoredOrigins
	);
}

async function sendAlertEmail(input: {
	context: BlockedTrafficAlertContext;
	decision: BlockedTrafficAlertDecision;
	event: BlockedTrafficInsert;
	trackingHealth: TrackingHealthCounts;
	recipientEmail: string;
	previousBlocked: number;
	windowBlockedCount: number;
}): Promise<void> {
	const apiKey = requireBlockedTrafficEmailApiKey(config.email.resendApiKey);

	const siteLabel =
		input.context.websiteName ||
		input.context.websiteDomain ||
		input.event.client_id ||
		"your site";
	const subject =
		input.decision.kind === "tracking_zero"
			? `[Action required] Tracking may be blocked for ${siteLabel}`
			: `[Databuddy] Blocked tracking increased for ${siteLabel}`;

	const email = BlockedTrafficAlertEmail({
		baselineEvents: input.trackingHealth.baselineEvents,
		baselineHours: BASELINE_SUCCESS_HOURS,
		blockReason: input.event.block_reason,
		blockedCount: input.windowBlockedCount,
		dashboardUrl: buildDashboardUrl(
			input.event.client_id || "",
			input.event.block_reason
		),
		fix: buildRecommendedFix(input.event),
		origin: input.event.origin ?? null,
		previousBlockedCount: input.previousBlocked,
		recentEvents: input.trackingHealth.recentEvents,
		severity: input.decision.severity,
		siteLabel,
		windowMinutes: ALERT_WINDOW_MINUTES,
	});
	const [html, text] = await Promise.all([
		render(email),
		render(email, { plainText: true }),
	]);

	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from: config.email.alertsFrom,
			to: input.recipientEmail,
			subject,
			html,
			text,
		}),
	});

	if (!response.ok) {
		throw new Error(`Resend blocked traffic alert failed: ${response.status}`);
	}
}

async function maybeSendBlockedTrafficAlertAsync(
	event: BlockedTrafficInsert,
	context: BlockedTrafficAlertContext = {}
): Promise<void> {
	if (shouldIgnoreBlockedTrafficAlertEvent(event)) {
		return;
	}
	if (!context.ownerId) {
		return;
	}
	if (!process.env.REDIS_URL) {
		return;
	}

	const windowBlockedCount = await incrementWindowCounter(event);
	if (!shouldEvaluateBlockedTrafficAlert(windowBlockedCount)) {
		return;
	}

	const [trackingHealth, previousBlocked] = await Promise.all([
		getTrackingHealth(event.client_id || ""),
		getPreviousBlockedCount(event),
	]);
	const decision = decideBlockedTrafficAlert({
		baselineEvents: trackingHealth.baselineEvents,
		count: windowBlockedCount,
		previousBlocked,
		recentEvents: trackingHealth.recentEvents,
	});
	if (!decision) {
		return;
	}

	const settings = await getOrganizationEmailSettings(context.organizationId);
	if (isAlertMutedBySettings({ decision, event, settings })) {
		return;
	}

	const recipientEmail = await getOwnerEmail(context.ownerId);
	if (!recipientEmail) {
		return;
	}

	if (!config.email.resendApiKey) {
		warnBlockedTrafficEmailUnconfigured();
		return;
	}

	const reservedKey = await reserveCooldown(event, decision.kind, settings);
	if (!reservedKey) {
		return;
	}

	try {
		await sendAlertEmail({
			context,
			decision,
			event,
			trackingHealth,
			recipientEmail,
			previousBlocked,
			windowBlockedCount,
		});
	} catch (error) {
		await redis.del(reservedKey).catch(() => undefined);
		throw error;
	}
}

export function queueBlockedTrafficAlert(
	event: BlockedTrafficInsert,
	context?: BlockedTrafficAlertContext
): void {
	maybeSendBlockedTrafficAlertAsync(event, context).catch((error) => {
		captureError(error, {
			message: "Failed to evaluate blocked traffic alert",
			...(event.client_id ? { clientId: event.client_id } : {}),
			blockReason: event.block_reason,
		});
	});
}
