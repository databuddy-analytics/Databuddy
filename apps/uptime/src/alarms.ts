import { db, eq, and } from "@databuddy/db";
import { alarms, alarmTriggerHistory } from "@databuddy/db/drizzle/schema";
import {
	sendSlackWebhook,
	sendDiscordWebhook,
	type NotificationPayload,
} from "@databuddy/notifications";
import { nanoid } from "nanoid";
import { captureError, record } from "./lib/tracing";
import type { UptimeData } from "./types";
import { MonitorStatus } from "./types";

interface AlarmTriggerContext {
	websiteId: string;
	url: string;
	status: MonitorStatus;
	previousStatus?: MonitorStatus;
	uptimeData: UptimeData;
	consecutiveFailures?: number;
	downtimeDuration?: number;
}

interface AlarmRecord {
	id: string;
	name: string;
	enabled: boolean;
	notificationChannels: string[];
	slackWebhookUrl: string | null;
	discordWebhookUrl: string | null;
	emailAddresses: string[] | null;
	webhookUrl: string | null;
	webhookHeaders: Record<string, string> | null;
	triggerConditions: {
		consecutiveFailuresThreshold?: number;
		responseTimeThreshold?: number;
	} | null;
}

// Track which alarms have already fired for consecutive failures
const consecutiveFailureAlerts = new Map<string, number>();

/**
 * Get alarms assigned to a website
 */
export async function getWebsiteAlarms(
	websiteId: string
): Promise<AlarmRecord[]> {
	return record("alarms.get_website_alarms", async () => {
		try {
			const results = await db.query.alarms.findMany({
				where: and(
					eq(alarms.websiteId, websiteId),
					eq(alarms.enabled, true)
				),
			});

			return results as AlarmRecord[];
		} catch (error) {
			captureError(error, { type: "alarm_query_error", websiteId });
			return [];
		}
	});
}

/**
 * Check if alarm should trigger based on conditions
 */
function shouldTriggerAlarm(
	alarm: AlarmRecord,
	context: AlarmTriggerContext
): boolean {
	const conditions = alarm.triggerConditions;

	// Status change: down → up or up → down
	if (context.previousStatus && context.status !== context.previousStatus) {
		// Clear consecutive failure alert tracking on status change
		consecutiveFailureAlerts.delete(alarm.id);
		// Always trigger on status change
		return true;
	}

	// Check consecutive failures threshold
	if (
		conditions?.consecutiveFailuresThreshold &&
		context.consecutiveFailures
	) {
		if (context.consecutiveFailures >= conditions.consecutiveFailuresThreshold) {
			// Only trigger once when threshold is first reached
			const lastAlertedAt = consecutiveFailureAlerts.get(alarm.id);
			if (lastAlertedAt !== context.consecutiveFailures) {
				consecutiveFailureAlerts.set(alarm.id, context.consecutiveFailures);
				return true;
			}
		}
	}

	// Check response time threshold (optional/stretch)
	if (
		conditions?.responseTimeThreshold &&
		context.uptimeData.total_ms > conditions.responseTimeThreshold
	) {
		return true;
	}

	return false;
}

/**
 * Build notification payload for site down
 */
function buildDownNotification(
	context: AlarmTriggerContext
): NotificationPayload {
	const { url, uptimeData, consecutiveFailures } = context;

	return {
		title: `🔴 Site Down: ${new URL(url).hostname}`,
		message: "Your website is not responding.",
		priority: "urgent",
		metadata: {
			url,
			status: uptimeData.http_code || "No response",
			downSince: new Date(uptimeData.timestamp).toISOString(),
			consecutiveFailures: consecutiveFailures || 1,
			error: uptimeData.error || "Unknown error",
			responseTime: `${uptimeData.total_ms}ms`,
		},
	};
}

/**
 * Build notification payload for site up
 */
function buildUpNotification(
	context: AlarmTriggerContext
): NotificationPayload {
	const { url, uptimeData, downtimeDuration } = context;

	const duration = downtimeDuration
		? `${Math.floor(downtimeDuration / 60000)} minutes`
		: "Unknown";

	return {
		title: `🟢 Site Recovered: ${new URL(url).hostname}`,
		message: "Your website is back online.",
		priority: "normal",
		metadata: {
			url,
			status: uptimeData.http_code,
			recoveredAt: new Date(uptimeData.timestamp).toISOString(),
			downtimeDuration: duration,
			responseTime: `${uptimeData.total_ms}ms`,
		},
	};
}

/**
 * Send notification via configured channels
 */
async function sendNotification(
	alarm: AlarmRecord,
	payload: NotificationPayload
): Promise<void> {
	const channels = alarm.notificationChannels;
	const promises: Promise<void>[] = [];

	// Slack
	if (channels.includes("slack") && alarm.slackWebhookUrl) {
		promises.push(
			sendSlackWebhook(alarm.slackWebhookUrl, payload).catch((error) => {
				captureError(error, {
					type: "slack_notification_error",
					alarmId: alarm.id,
				});
			})
		);
	}

	// Discord
	if (channels.includes("discord") && alarm.discordWebhookUrl) {
		promises.push(
			sendDiscordWebhook(alarm.discordWebhookUrl, payload).catch((error) => {
				captureError(error, {
					type: "discord_notification_error",
					alarmId: alarm.id,
				});
			})
		);
	}

	// Email (TODO: implement when email provider is configured)
	// Webhook (TODO: implement custom webhook)

	await Promise.allSettled(promises);
}

/**
 * Log alarm trigger to history
 */
async function logAlarmTrigger(
	alarmId: string,
	websiteId: string,
	triggerType: string,
	status: string,
	metadata: Record<string, unknown>
): Promise<void> {
	try {
		await db.insert(alarmTriggerHistory).values({
			id: nanoid(),
			alarmId,
			websiteId,
			triggerType,
			status,
			metadata,
			createdAt: new Date(),
		});
	} catch (error) {
		captureError(error, { type: "alarm_history_log_error", alarmId });
	}
}

/**
 * Process uptime check and trigger alarms if needed
 */
export async function processUptimeAlarms(
	context: AlarmTriggerContext
): Promise<void> {
	return record("alarms.process_uptime_alarms", async () => {
		try {
			const websiteAlarms = await getWebsiteAlarms(context.websiteId);

			if (websiteAlarms.length === 0) {
				return;
			}

			for (const alarm of websiteAlarms) {
				if (!shouldTriggerAlarm(alarm, context)) {
					continue;
				}

				// Build notification based on status
				const payload =
					context.status === MonitorStatus.DOWN
						? buildDownNotification(context)
						: buildUpNotification(context);

				// Send notification
				await sendNotification(alarm, payload);

				// Log trigger
				await logAlarmTrigger(
					alarm.id,
					context.websiteId,
					"uptime",
					context.status,
					{
						url: context.url,
						httpCode: context.uptimeData.http_code,
						responseTime: context.uptimeData.total_ms,
						error: context.uptimeData.error,
					}
				);
			}
		} catch (error) {
			captureError(error, {
				type: "process_uptime_alarms_error",
				websiteId: context.websiteId,
			});
		}
	});
}
