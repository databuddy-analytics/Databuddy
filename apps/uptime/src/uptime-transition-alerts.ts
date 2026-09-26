import {
	and,
	db,
	eq,
	normalizeEmailNotificationSettings,
	withTransaction,
} from "@databuddy/db";
import { chQuery } from "@databuddy/db/clickhouse";
import { uptimeSchedules } from "@databuddy/db/schema";
import { config } from "@databuddy/env/app";
import {
	NotificationClient,
	buildAlarmNotificationTargets,
} from "@databuddy/notifications";
import { redis } from "@databuddy/redis";
import { Effect } from "effect";
import { z } from "zod";
import type { ScheduleData } from "./actions";
import { captureError } from "./lib/tracing";
import { MonitorStatus, type UptimeData } from "./types";

const recover = <A, B>(
	run: () => Promise<A>,
	fallback: B,
	attributes: Record<string, string | number | boolean>
) =>
	Effect.promise(() =>
		run().catch((cause: unknown) => {
			captureError(cause, attributes);
			return fallback;
		})
	);

interface LinkedAlarm {
	destinations: Array<{ type: string; identifier: string; config: unknown }>;
	id: string;
}

type TransitionNotificationPayload = Parameters<NotificationClient["send"]>[0];

interface TransitionResult {
	alarms_fired: number;
	transition_kind: "down" | "recovered" | null;
}

export function resolveTransitionKind(
	previous: number | undefined,
	current: number
): "down" | "recovered" | null {
	if (current === MonitorStatus.UP) {
		return previous === MonitorStatus.DOWN ? "recovered" : null;
	}
	if (current === MonitorStatus.DOWN) {
		return previous === MonitorStatus.DOWN ? null : "down";
	}
	return null;
}

export function shouldReleaseTransitionClaim(
	sendableAlarmCount: number,
	firedAlarmCount: number,
	emailDeliveryDeferred = false
): boolean {
	if (firedAlarmCount > 0) {
		// A successful non-email destination owns the transition claim. Releasing
		// it would duplicate that delivery; retrying only the deferred email needs
		// a durable per-destination outbox.
		return false;
	}
	return sendableAlarmCount > 0 || emailDeliveryDeferred;
}

export function resolveUptimeEmailPreference(
	settings: {
		uptime: { downEmails: boolean; recoveryEmails: boolean };
	} | null,
	kind: "down" | "recovered" | "ssl_expiry"
): boolean | null {
	if (settings === null) {
		return null;
	}
	return kind === "recovered"
		? settings.uptime.recoveryEmails
		: settings.uptime.downEmails;
}

function buildSiteLabel(schedule: ScheduleData): string {
	const label =
		schedule.website?.name || schedule.website?.domain || schedule.name;
	if (label) {
		return label;
	}
	try {
		return new URL(schedule.url).hostname;
	} catch {
		return schedule.url;
	}
}

const monitorDashboardUrl = (scheduleId: string) =>
	`${config.urls.dashboard}/monitors/${scheduleId}`;

function formatCheckedAt(timestamp: number): string {
	if (!Number.isFinite(timestamp)) {
		return "an unknown time";
	}
	const checkedAt = new Date(timestamp);
	return Number.isNaN(checkedAt.valueOf())
		? "an unknown time"
		: checkedAt.toISOString();
}

function formatCheckError(error: string): string | undefined {
	const normalized = error.replaceAll(/[\r\n]+/g, " ").trim();
	if (!normalized) {
		return;
	}
	return normalized.length > 200 ? `${normalized.slice(0, 199)}…` : normalized;
}

export function buildTransitionNotificationPayload(input: {
	dashboardUrl: string;
	data: UptimeData;
	kind: "down" | "recovered";
	monitorId: string;
	siteLabel: string;
}): TransitionNotificationPayload {
	const checkedAt = formatCheckedAt(input.data.timestamp);
	const error = formatCheckError(input.data.error);
	const checkContext = [
		`Checked at ${checkedAt}`,
		input.data.http_code > 0
			? `HTTP ${input.data.http_code}`
			: "No HTTP response",
		error ? `Reason: ${error}` : null,
	]
		.filter((value) => value !== null)
		.join(" · ");

	return {
		title:
			input.kind === "down"
				? `Health check failed: ${input.siteLabel}`
				: `Health check passed: ${input.siteLabel}`,
		message:
			input.kind === "down"
				? `A health check failed for ${input.siteLabel}. ${checkContext}. View details: ${input.dashboardUrl}`
				: `A health check passed for ${input.siteLabel} after a previous failed check. Checked at ${checkedAt} · Response time ${input.data.total_ms} ms. View details: ${input.dashboardUrl}`,
		priority: input.kind === "down" ? "high" : "normal",
		metadata: {
			template: "uptime-transition",
			monitorId: input.monitorId,
			monitorName: input.siteLabel,
			url: input.data.url,
			kind: input.kind,
			httpCode: input.data.http_code,
			dashboardUrl: input.dashboardUrl,
		},
	};
}

interface OrgAlarm extends LinkedAlarm {
	triggerConditions: Record<string, unknown>;
}

const ALARM_CACHE_TTL_MS = 30_000;
const ALARM_CACHE_MAX_ORGS = 512;
const alarmCache = new Map<string, { alarms: OrgAlarm[]; fetchedAt: number }>();

const lookupLinkedAlarms = (scheduleId: string, organizationId: string) =>
	Effect.gen(function* () {
		const cached = alarmCache.get(organizationId);
		let alarms: OrgAlarm[];
		if (cached && performance.now() - cached.fetchedAt < ALARM_CACHE_TTL_MS) {
			alarms = cached.alarms;
		} else {
			const fetched = yield* recover(
				(): Promise<OrgAlarm[]> =>
					db.query.alarms.findMany({
						where: { organizationId, enabled: true },
						with: { destinations: true },
					}),
				null,
				{ error_step: "alarm_lookup" }
			);
			if (fetched === null) {
				return null;
			}
			alarms = fetched;
			if (alarmCache.size >= ALARM_CACHE_MAX_ORGS) {
				alarmCache.clear();
			}
			alarmCache.set(organizationId, { alarms, fetchedAt: performance.now() });
		}
		return alarms.filter((alarm) => {
			const monitorIds = alarm.triggerConditions.monitorIds;
			return (
				Array.isArray(monitorIds) && monitorIds.some((id) => id === scheduleId)
			);
		});
	});

const claimTransition = (scheduleId: string, currentStatus: number) =>
	recover(
		() =>
			withTransaction(async (tx) => {
				const [row] = await tx
					.select({ last: uptimeSchedules.lastNotifiedStatus })
					.from(uptimeSchedules)
					.where(eq(uptimeSchedules.id, scheduleId))
					.for("update");

				if (!row) {
					return null;
				}

				const kind = resolveTransitionKind(
					row.last ?? undefined,
					currentStatus
				);
				if (kind === null) {
					return null;
				}

				await tx
					.update(uptimeSchedules)
					.set({ lastNotifiedStatus: currentStatus })
					.where(eq(uptimeSchedules.id, scheduleId));

				return { kind, previousStatus: row.last };
			}),
		null,
		{ error_step: "transition_claim" }
	);

const releaseTransitionClaim = (input: {
	currentStatus: number;
	previousStatus: number | null;
	scheduleId: string;
}) =>
	recover(
		async () => {
			await db
				.update(uptimeSchedules)
				.set({ lastNotifiedStatus: input.previousStatus })
				.where(
					and(
						eq(uptimeSchedules.id, input.scheduleId),
						eq(uptimeSchedules.lastNotifiedStatus, input.currentStatus)
					)
				);
		},
		undefined,
		{ error_step: "transition_claim_release", schedule_id: input.scheduleId }
	);

export function buildUptimeDeliveryPlan(
	alarms: LinkedAlarm[],
	emailPreference: boolean | null
): {
	emailDeliveryDeferred: boolean;
	sendable: LinkedAlarm[];
} {
	return {
		emailDeliveryDeferred: emailPreference === null,
		sendable: alarms
			.map((alarm) =>
				emailPreference === true
					? alarm
					: {
							...alarm,
							destinations: alarm.destinations.filter(
								(dest) => dest.type !== "email"
							),
						}
			)
			.filter((alarm) => alarm.destinations.length > 0),
	};
}

function countSuccesses(
	alarmId: string,
	deliveryResults: Awaited<ReturnType<NotificationClient["send"]>>
): number {
	let successes = 0;
	for (const result of deliveryResults) {
		if (result.success) {
			successes += 1;
		} else {
			captureError(
				new Error(
					result.error ?? `Notification delivery failed for ${result.channel}`
				),
				{
					error_step: "alarm_notification_result",
					alarm_id: alarmId,
					channel: result.channel,
				}
			);
		}
	}
	return successes;
}

const sendToAlarm = (
	alarm: LinkedAlarm,
	payload: TransitionNotificationPayload
) =>
	Effect.all(
		buildAlarmNotificationTargets(alarm.destinations).map((target) =>
			recover(
				async () =>
					countSuccesses(
						alarm.id,
						await new NotificationClient(target.clientConfig).send(payload, {
							channels: [target.channel],
						})
					),
				0,
				{
					error_step: "alarm_notification",
					alarm_id: alarm.id,
					channel: target.channel,
				}
			)
		),
		{ concurrency: "unbounded" }
	).pipe(Effect.map((counts) => counts.reduce((total, n) => total + n, 0)));

const loadEmailSettings = (organizationId: string) =>
	recover(
		async () => {
			const row = await db.query.organization.findFirst({
				where: { id: organizationId },
				columns: { emailNotifications: true },
			});
			return normalizeEmailNotificationSettings(row?.emailNotifications);
		},
		null,
		{
			error_step: "organization_email_settings",
			organization_id: organizationId,
		}
	);

export interface MonitorState {
	failureStreak: number;
	status: number;
}

export type MonitorStateLookup =
	| { kind: "found"; state: MonitorState }
	| { kind: "missing" }
	| { kind: "unavailable" };

const STATE_KEY_PREFIX = "uptime:state:";
const STATE_TTL_SECONDS = 60 * 60 * 24 * 30;

const monitorStateSchema = z.object({
	failureStreak: z.number().int().nonnegative(),
	status: z.number().int(),
});

const lastKnownState = new Map<string, MonitorState>();

const stateKey = (siteId: string) => `${STATE_KEY_PREFIX}${siteId}`;

async function readMonitorState(siteId: string): Promise<MonitorStateLookup> {
	try {
		const raw = await redis.get(stateKey(siteId));
		if (!raw) {
			return { kind: "missing" };
		}
		const parsed = monitorStateSchema.safeParse(JSON.parse(raw));
		return parsed.success
			? { kind: "found", state: parsed.data }
			: { kind: "missing" };
	} catch {
		const cached = lastKnownState.get(siteId);
		return cached ? { kind: "found", state: cached } : { kind: "unavailable" };
	}
}

export async function writeMonitorState(
	siteId: string,
	state: MonitorState
): Promise<void> {
	lastKnownState.set(siteId, state);
	await redis.set(
		stateKey(siteId),
		JSON.stringify(state),
		"EX",
		STATE_TTL_SECONDS
	);
}

async function queryPreviousState(siteId: string): Promise<MonitorStateLookup> {
	if (!process.env.CLICKHOUSE_URL) {
		return { kind: "missing" };
	}
	try {
		const [first] = await chQuery<{ failure_streak: number; status: number }>(
			`SELECT status, failure_streak
       FROM uptime.uptime_monitor
       WHERE site_id = {siteId:String}
         AND timestamp > now() - INTERVAL 30 DAY
       ORDER BY timestamp DESC
       LIMIT 1`,
			{ siteId }
		);
		return first
			? {
					kind: "found",
					state: { failureStreak: first.failure_streak, status: first.status },
				}
			: { kind: "missing" };
	} catch (cause) {
		captureError(cause, { error_step: "previous_monitor_state" });
		return { kind: "unavailable" };
	}
}

export async function getPreviousMonitorState(
	siteId: string
): Promise<MonitorStateLookup> {
	const cached = await readMonitorState(siteId);
	if (cached.kind === "found") {
		return cached;
	}

	const stored = await queryPreviousState(siteId);
	if (stored.kind !== "missing") {
		return stored;
	}

	return cached.kind === "unavailable" ? cached : { kind: "missing" };
}

export function fireTransitionAlerts({
	schedule,
	data,
}: {
	schedule: ScheduleData;
	data: UptimeData;
}): Promise<TransitionResult> {
	return Effect.runPromise(
		Effect.gen(function* () {
			const claim = yield* claimTransition(schedule.id, data.status);

			if (claim === null) {
				return { alarms_fired: 0, transition_kind: null };
			}
			const { kind } = claim;
			const releaseClaim = releaseTransitionClaim({
				currentStatus: data.status,
				previousStatus: claim.previousStatus,
				scheduleId: schedule.id,
			});

			const linkedAlarms = yield* lookupLinkedAlarms(
				schedule.id,
				schedule.organizationId
			);
			if (linkedAlarms === null) {
				yield* releaseClaim;
				return { alarms_fired: 0, transition_kind: kind };
			}

			if (linkedAlarms.length === 0) {
				return { alarms_fired: 0, transition_kind: kind };
			}

			const emailsEnabled = resolveUptimeEmailPreference(
				yield* loadEmailSettings(schedule.organizationId),
				kind
			);

			const siteLabel = buildSiteLabel(schedule);

			const payload = buildTransitionNotificationPayload({
				dashboardUrl: monitorDashboardUrl(schedule.id),
				data,
				kind,
				monitorId: schedule.id,
				siteLabel,
			});

			const { emailDeliveryDeferred, sendable } = buildUptimeDeliveryPlan(
				linkedAlarms,
				emailsEnabled
			);

			const results = yield* Effect.all(
				sendable.map((alarm) => sendToAlarm(alarm, payload)),
				{ concurrency: "unbounded" }
			);

			const fired = results.filter((count) => count > 0).length;
			if (
				shouldReleaseTransitionClaim(
					sendable.length,
					fired,
					emailDeliveryDeferred
				)
			) {
				yield* releaseClaim;
			}
			return { alarms_fired: fired, transition_kind: kind };
		})
	);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SSL_EXPIRY_ALERT_WINDOW_MS = 14 * DAY_MS;
const SSL_EXPIRY_HIGH_PRIORITY_DAYS = 3;
const SSL_ALERT_KEY_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface SslExpiryAlert {
	daysRemaining: number;
	expired: boolean;
	expiresAt: number;
}

export function resolveSslExpiryAlert(
	data: Pick<UptimeData, "ssl_expiry" | "url">,
	now: number
): SslExpiryAlert | null {
	const expiresAt = data.ssl_expiry;
	if (expiresAt === null || !Number.isFinite(expiresAt) || expiresAt <= 0) {
		return null;
	}
	if (!URL.canParse(data.url) || new URL(data.url).protocol !== "https:") {
		return null;
	}
	const remainingMs = expiresAt - now;
	if (remainingMs > SSL_EXPIRY_ALERT_WINDOW_MS) {
		return null;
	}
	return {
		daysRemaining: Math.max(0, Math.ceil(remainingMs / DAY_MS)),
		expiresAt,
		expired: remainingMs <= 0,
	};
}

export const sslExpiryAlertKey = (scheduleId: string, expiresAt: number) =>
	`uptime:ssl-alert:${scheduleId}:${expiresAt}`;

export function buildSslExpiryNotificationPayload(input: {
	alert: SslExpiryAlert;
	dashboardUrl: string;
	monitorId: string;
	siteLabel: string;
	url: string;
}): TransitionNotificationPayload {
	const { alert, siteLabel } = input;
	const expiresAt = new Date(alert.expiresAt).toISOString();
	const dayLabel = alert.daysRemaining === 1 ? "day" : "days";
	return {
		title: alert.expired
			? `SSL certificate expired: ${siteLabel}`
			: `SSL certificate expires in ${alert.daysRemaining} ${dayLabel}: ${siteLabel}`,
		message: alert.expired
			? `The SSL certificate for ${siteLabel} expired at ${expiresAt}. Visitors see browser security warnings until it is renewed. View details: ${input.dashboardUrl}`
			: `The SSL certificate for ${siteLabel} expires at ${expiresAt}. Renew it before then to avoid browser security warnings. View details: ${input.dashboardUrl}`,
		priority:
			alert.expired || alert.daysRemaining <= SSL_EXPIRY_HIGH_PRIORITY_DAYS
				? "high"
				: "normal",
		metadata: {
			template: "uptime-ssl-expiry",
			monitorId: input.monitorId,
			monitorName: siteLabel,
			url: input.url,
			expiresAt,
			daysRemaining: alert.daysRemaining,
			dashboardUrl: input.dashboardUrl,
		},
	};
}

const claimSslAlert = (key: string) =>
	recover(
		async () =>
			(await redis.set(key, "1", "EX", SSL_ALERT_KEY_TTL_SECONDS, "NX")) ===
			"OK",
		false,
		{ error_step: "ssl_alert_claim" }
	);

const releaseSslAlert = (key: string) =>
	recover(
		async () => {
			await redis.del(key);
		},
		undefined,
		{ error_step: "ssl_alert_claim_release" }
	);

export function fireSslExpiryAlerts({
	schedule,
	data,
	now = Date.now(),
}: {
	schedule: ScheduleData;
	data: UptimeData;
	now?: number;
}): Promise<{ alarms_fired: number; ssl_days_remaining: number | null }> {
	return Effect.runPromise(
		Effect.gen(function* () {
			const alert = resolveSslExpiryAlert(data, now);
			if (alert === null) {
				return { alarms_fired: 0, ssl_days_remaining: null };
			}
			const skipped = {
				alarms_fired: 0,
				ssl_days_remaining: alert.daysRemaining,
			};

			const linkedAlarms = yield* lookupLinkedAlarms(
				schedule.id,
				schedule.organizationId
			);
			if (linkedAlarms === null || linkedAlarms.length === 0) {
				return skipped;
			}

			const key = sslExpiryAlertKey(schedule.id, alert.expiresAt);
			if (!(yield* claimSslAlert(key))) {
				return skipped;
			}

			const emailsEnabled = resolveUptimeEmailPreference(
				yield* loadEmailSettings(schedule.organizationId),
				"ssl_expiry"
			);
			const payload = buildSslExpiryNotificationPayload({
				alert,
				dashboardUrl: monitorDashboardUrl(schedule.id),
				monitorId: schedule.id,
				siteLabel: buildSiteLabel(schedule),
				url: data.url,
			});
			const { emailDeliveryDeferred, sendable } = buildUptimeDeliveryPlan(
				linkedAlarms,
				emailsEnabled
			);

			const results = yield* Effect.all(
				sendable.map((alarm) => sendToAlarm(alarm, payload)),
				{ concurrency: "unbounded" }
			);

			const fired = results.filter((count) => count > 0).length;
			if (
				shouldReleaseTransitionClaim(
					sendable.length,
					fired,
					emailDeliveryDeferred
				)
			) {
				yield* releaseSslAlert(key);
			}
			return { alarms_fired: fired, ssl_days_remaining: alert.daysRemaining };
		})
	);
}
