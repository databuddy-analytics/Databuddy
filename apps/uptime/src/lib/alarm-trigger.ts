import { alarms, and, db, eq, isNull, or, uptimeSchedules } from "@databuddy/db";
import {
	sendDiscordWebhook,
	sendSlackWebhook,
	sendWebhook,
} from "@databuddy/notifications";
import type { UptimeData } from "../types";
import { MonitorStatus } from "../types";
import { captureError } from "./tracing";

interface AlarmRecord {
	id: string;
	name: string;
	enabled: boolean;
	notificationChannels: string[];
	slackWebhookUrl: string | null;
	discordWebhookUrl: string | null;
	emailAddresses: string[] | null;
	webhookUrl: string | null;
	webhookHeaders: unknown;
	triggerType: string;
	triggerConditions: unknown;
}

/**
 * Track consecutive failures per monitor to avoid duplicate notifications.
 * Key: scheduleId, Value: { consecutiveFailures, lastNotifiedStatus }
 */
const monitorState = new Map<
	string,
	{ consecutiveFailures: number; lastNotifiedStatus: number }
>();

export function getConsecutiveFailureThreshold(
	triggerConditions: unknown
): number {
	if (
		triggerConditions &&
		typeof triggerConditions === "object" &&
		"consecutiveFailures" in triggerConditions
	) {
		const threshold = (triggerConditions as { consecutiveFailures: number })
			.consecutiveFailures;
		if (typeof threshold === "number" && threshold > 0) {
			return threshold;
		}
	}
	return 3;
}

async function sendAlarmNotifications(
	alarm: AlarmRecord,
	payload: {
		title: string;
		message: string;
		priority: "low" | "normal" | "high" | "urgent";
		metadata: Record<string, unknown>;
	}
): Promise<void> {
	const channels = alarm.notificationChannels;

	for (const channel of channels) {
		try {
			if (channel === "slack" && alarm.slackWebhookUrl) {
				await sendSlackWebhook(alarm.slackWebhookUrl, payload);
			} else if (channel === "discord" && alarm.discordWebhookUrl) {
				await sendDiscordWebhook(alarm.discordWebhookUrl, payload);
			} else if (channel === "webhook" && alarm.webhookUrl) {
				await sendWebhook(alarm.webhookUrl, payload, {
					headers:
						(alarm.webhookHeaders as Record<string, string>) ?? undefined,
				});
			} else {
				captureError(new Error(`Unsupported notification channel: ${channel}`), {
					type: "alarm_notification_error",
					alarmId: alarm.id,
					channel,
				});
			}
		} catch (error) {
			captureError(error, {
				type: "alarm_notification_error",
				alarmId: alarm.id,
				channel,
			});
		}
	}
}

/**
 * Check and trigger alarms for a given uptime check result.
 * Called after each uptime check completes.
 */
export async function checkAndTriggerAlarms(
	scheduleId: string,
	uptimeData: UptimeData
): Promise<void> {
	try {
		const schedule = await db.query.uptimeSchedules.findFirst({
			where: eq(uptimeSchedules.id, scheduleId),
		});

		if (!schedule) {
			return;
		}

		const websiteId = schedule.websiteId;
		const organizationId = schedule.organizationId;

		// Match alarms correctly:
		// - If schedule has websiteId: match website-specific alarms OR org-level alarms (websiteId IS NULL)
		// - If schedule has no websiteId: match only org-level alarms (websiteId IS NULL)
		const websiteCondition = websiteId
			? or(eq(alarms.websiteId, websiteId), isNull(alarms.websiteId))
			: isNull(alarms.websiteId);

		const matchingAlarms = await db.query.alarms.findMany({
			where: and(
				eq(alarms.enabled, true),
				eq(alarms.triggerType, "uptime"),
				eq(alarms.organizationId, organizationId),
				websiteCondition,
			),
		});

		if (matchingAlarms.length === 0) {
			return;
		}

		const state = monitorState.get(scheduleId) ?? {
			consecutiveFailures: 0,
			lastNotifiedStatus: MonitorStatus.UP,
		};

		const isDown = uptimeData.status === MonitorStatus.DOWN;
		const wasDown = state.lastNotifiedStatus === MonitorStatus.DOWN;

		if (isDown) {
			state.consecutiveFailures += 1;
		} else {
			state.consecutiveFailures = 0;
		}

		for (const alarm of matchingAlarms) {
			const typedAlarm = alarm as AlarmRecord;
			const threshold = getConsecutiveFailureThreshold(
				typedAlarm.triggerConditions
			);

			if (isDown && state.consecutiveFailures === threshold && !wasDown) {
				await sendAlarmNotifications(typedAlarm, {
					title: `Site Down: ${uptimeData.url}`,
					message: `Your website ${uptimeData.url} is not responding after ${threshold} consecutive failures.`,
					priority: "urgent",
					metadata: {
						url: uptimeData.url,
						status: uptimeData.http_code,
						error: uptimeData.error,
						consecutiveFailures: state.consecutiveFailures,
						detectedAt: new Date().toISOString(),
						probeRegion: uptimeData.probe_region,
					},
				});
			}

			if (!isDown && wasDown) {
				await sendAlarmNotifications(typedAlarm, {
					title: `Site Recovered: ${uptimeData.url}`,
					message: `Your website ${uptimeData.url} is back online.`,
					priority: "normal",
					metadata: {
						url: uptimeData.url,
						status: uptimeData.http_code,
						recoveredAt: new Date().toISOString(),
						responseTime: uptimeData.total_ms,
						probeRegion: uptimeData.probe_region,
					},
				});
			}
		}

		state.lastNotifiedStatus = isDown
			? MonitorStatus.DOWN
			: MonitorStatus.UP;
		monitorState.set(scheduleId, state);
	} catch (error) {
		captureError(error, {
			type: "alarm_trigger_error",
			scheduleId,
		});
	}
}
