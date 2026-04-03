/**
 * Alarm trigger logic for uptime monitoring.
 *
 * Fires alarm notifications when a site transitions between UP and DOWN states.
 * This module is intentionally isolated from the main uptime check flow and
 * called as a non-blocking fire-and-forget to avoid adding latency.
 */

import {
	alarmDestinations,
	alarms,
	and,
	db,
	eq,
	isNull,
	or,
	uptimeSchedules,
} from "@databuddy/db";
import {
	NotificationClient,
	type NotificationChannel,
} from "@databuddy/notifications";
import { log } from "evlog";
import { captureError } from "./tracing";
import { MonitorStatus, type UptimeData } from "../types";

/** Consecutive failures required to fire a "site down" alarm. */
const DOWN_THRESHOLD = 2;

/** In-memory deduplication: tracks last notified status per schedule. */
const lastNotifiedStatus = new Map<string, MonitorStatus>();

type DestinationRow = {
	type: string;
	identifier: string;
	config: Record<string, unknown> | null;
};

/**
 * Build a NotificationClient config and channel list from alarm destinations.
 * Email is intentionally excluded here — it requires a Resend action and is
 * handled separately via uptime-transition-emails.ts.
 */
function buildNotificationClient(destinations: DestinationRow[]): {
	client: NotificationClient;
	channels: NotificationChannel[];
} {
	const clientConfig: Record<string, Record<string, unknown>> = {};
	const channels: NotificationChannel[] = [];

	for (const dest of destinations) {
		const cfg = (dest.config ?? {}) as Record<string, unknown>;
		switch (dest.type) {
			case "slack":
				clientConfig.slack = { webhookUrl: dest.identifier };
				channels.push("slack");
				break;
			case "discord":
				clientConfig.discord = { webhookUrl: dest.identifier };
				channels.push("discord");
				break;
			case "teams":
				clientConfig.teams = { webhookUrl: dest.identifier };
				channels.push("teams");
				break;
			case "google_chat":
				clientConfig.googleChat = { webhookUrl: dest.identifier };
				channels.push("google-chat");
				break;
			case "telegram":
				clientConfig.telegram = {
					botToken: cfg.botToken as string ?? dest.identifier,
					chatId: (cfg.chatId as string) ?? dest.identifier,
				};
				channels.push("telegram");
				break;
			case "webhook":
				clientConfig.webhook = {
					url: dest.identifier,
					headers: cfg.headers as Record<string, string> | undefined,
				};
				channels.push("webhook");
				break;
			case "email":
				// Email is handled by uptime-transition-emails.ts (requires Resend).
				// We log a debug note so it's visible but not an error.
				log.debug({ alarmDestType: "email" }, "email alarm destinations handled by transition-emails");
				break;
			default:
				log.warn({ alarmDestType: dest.type }, "unknown alarm destination type, skipping");
		}
	}

	return { client: new NotificationClient(clientConfig), channels };
}

/**
 * Query alarms that should fire for a given uptime check result.
 *
 * Correct logic (fixes critical bug in competitor PR #351):
 * - Always include org-level alarms (websiteId IS NULL) — these apply to all monitors
 * - When the schedule has a websiteId, ALSO include alarms scoped to that specific website
 * - When the schedule has no websiteId, only include org-level alarms
 *
 * This ensures:
 * - Org-level alarms are never skipped for monitors with a websiteId
 * - Website-specific alarms never fire for unrelated monitors
 */
async function fetchMatchingAlarms(
	organizationId: string,
	websiteId: string | null,
	triggerType: "uptime"
) {
	const baseCondition = and(
		eq(alarms.organizationId, organizationId),
		eq(alarms.enabled, true),
		eq(alarms.triggerType, triggerType)
	);

	// Match org-level alarms (null websiteId) OR website-specific alarms if websiteId present
	const websiteCondition = websiteId
		? or(isNull(alarms.websiteId), eq(alarms.websiteId, websiteId))
		: isNull(alarms.websiteId);

	const matchingAlarms = await db
		.select()
		.from(alarms)
		.where(and(baseCondition, websiteCondition));

	if (matchingAlarms.length === 0) {
		return [];
	}

	// Batch-load all destinations for matched alarms
	const alarmIds = matchingAlarms.map((a) => a.id);
	const allDestinations = await db
		.select()
		.from(alarmDestinations)
		.where(
			alarmIds.length === 1
				? eq(alarmDestinations.alarmId, alarmIds[0])
				: or(...alarmIds.map((id) => eq(alarmDestinations.alarmId, id)))
		);

	const destsByAlarmId = new Map<string, DestinationRow[]>();
	for (const dest of allDestinations) {
		const list = destsByAlarmId.get(dest.alarmId) ?? [];
		list.push({
			type: dest.type,
			identifier: dest.identifier,
			config: (dest.config as Record<string, unknown>) ?? null,
		});
		destsByAlarmId.set(dest.alarmId, list);
	}

	return matchingAlarms.map((alarm) => ({
		...alarm,
		destinations: destsByAlarmId.get(alarm.id) ?? [],
	}));
}

/**
 * Check uptime result and trigger alarm notifications on state transitions.
 *
 * Called as fire-and-forget after each uptime check — errors are captured
 * but never propagate back to the caller.
 *
 * Uses UptimeData.failure_streak to determine consecutive failure count,
 * avoiding an extra DB query.
 */
export async function checkAndTriggerAlarms(
	scheduleId: string,
	uptimeData: UptimeData
): Promise<void> {
	try {
		const schedule = await db.query.uptimeSchedules.findFirst({
			where: eq(uptimeSchedules.id, scheduleId),
			columns: { id: true, organizationId: true, websiteId: true, name: true, url: true },
			with: { website: { columns: { name: true, domain: true } } },
		});

		if (!schedule) {
			log.warn({ scheduleId }, "alarm-trigger: schedule not found");
			return;
		}

		const currentStatus = uptimeData.status as MonitorStatus;
		const lastStatus = lastNotifiedStatus.get(scheduleId);
		const failureStreak = uptimeData.failure_streak;

		// Determine transition type
		const isTransitionDown =
			currentStatus === MonitorStatus.DOWN &&
			lastStatus !== MonitorStatus.DOWN &&
			failureStreak >= DOWN_THRESHOLD;

		const isTransitionUp =
			currentStatus === MonitorStatus.UP &&
			lastStatus === MonitorStatus.DOWN;

		if (!isTransitionDown && !isTransitionUp) {
			return; // No state change — nothing to do
		}

		const matchingAlarms = await fetchMatchingAlarms(
			schedule.organizationId,
			schedule.websiteId,
			"uptime"
		);

		if (matchingAlarms.length === 0) {
			// Update deduplication state even with no alarms
			lastNotifiedStatus.set(scheduleId, currentStatus);
			return;
		}

		const siteName =
			schedule.website?.name ??
			schedule.website?.domain ??
			schedule.name ??
			schedule.url;

		const notificationPayload = isTransitionDown
			? {
					title: `🔴 Site Down: ${siteName}`,
					message: `${siteName} has been unreachable for ${failureStreak} consecutive checks.`,
					priority: "high" as const,
					metadata: {
						template: "uptime_down",
						scheduleId,
						siteName,
						failureStreak,
					},
				}
			: {
					title: `✅ Site Recovered: ${siteName}`,
					message: `${siteName} is back online.`,
					priority: "normal" as const,
					metadata: {
						template: "uptime_recovered",
						scheduleId,
						siteName,
					},
				};

		// Send notifications for each matched alarm
		await Promise.allSettled(
			matchingAlarms.map(async (alarm) => {
				if (alarm.destinations.length === 0) return;
				const { client, channels } = buildNotificationClient(alarm.destinations);
				if (channels.length === 0) return;
				try {
					await client.send(notificationPayload, { channels });
					log.info(
						{ alarmId: alarm.id, scheduleId, transition: isTransitionDown ? "down" : "recovered" },
						"alarm notification sent"
					);
				} catch (err) {
					captureError(err);
					log.error(
						{ alarmId: alarm.id, scheduleId, err },
						"alarm notification failed"
					);
				}
			})
		);

		// Update deduplication state after successful dispatch
		lastNotifiedStatus.set(scheduleId, currentStatus);
	} catch (err) {
		captureError(err);
		log.error({ scheduleId, err }, "alarm-trigger: unexpected error");
	}
}
