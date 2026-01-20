import { alarms, and, db, eq } from "@databuddy/db";
import {
	sendDiscordWebhook,
	sendSlackWebhook,
	sendWebhook,
} from "@databuddy/notifications";
import type { NotificationPayload } from "@databuddy/notifications/types";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import { captureError } from "./tracing";

dayjs.extend(duration);
dayjs.extend(relativeTime);

interface UptimeAlarmContext {
	websiteId: string;
	url: string;
	status: "up" | "down";
	httpCode?: number;
	responseTime?: number;
	consecutiveFailures?: number;
	downtimeDuration?: number;
	timestamp: number;
}

interface AlarmState {
	lastStatus?: "up" | "down";
	lastNotificationTime?: number;
	consecutiveFailures: number;
}

const alarmStates = new Map<string, AlarmState>();

const MIN_NOTIFICATION_INTERVAL = 5 * 60 * 1000; // 5 minutes

function getAlarmState(alarmId: string): AlarmState {
	if (!alarmStates.has(alarmId)) {
		alarmStates.set(alarmId, { consecutiveFailures: 0 });
	}
	return alarmStates.get(alarmId)!;
}

function updateAlarmState(
	alarmId: string,
	updates: Partial<AlarmState>
): void {
	const state = getAlarmState(alarmId);
	alarmStates.set(alarmId, { ...state, ...updates });
}

function shouldSendNotification(
	alarmId: string,
	newStatus: "up" | "down"
): boolean {
	const state = getAlarmState(alarmId);
	const now = Date.now();

	if (state.lastStatus === newStatus) {
		if (
			state.lastNotificationTime &&
			now - state.lastNotificationTime < MIN_NOTIFICATION_INTERVAL
		) {
			return false;
		}
	}

	return true;
}

function buildNotificationPayload(
	context: UptimeAlarmContext,
	alarmName: string
): NotificationPayload {
	if (context.status === "down") {
		const metadata: Record<string, unknown> = {
			url: context.url,
			status: context.httpCode || "No response",
			downSince: dayjs(context.timestamp).format("YYYY-MM-DD HH:mm:ss"),
		};

		if (context.responseTime) {
			metadata.responseTime = `${context.responseTime}ms`;
		}

		if (context.consecutiveFailures) {
			metadata.consecutiveFailures = context.consecutiveFailures;
		}

		return {
			title: `🔴 Site Down: ${context.url}`,
			message: `Your website is not responding. Alarm: ${alarmName}`,
			priority: "urgent",
			metadata,
		};
	}

	const metadata: Record<string, unknown> = {
		url: context.url,
		recoveredAt: dayjs(context.timestamp).format("YYYY-MM-DD HH:mm:ss"),
	};

	if (context.downtimeDuration) {
		const duration = dayjs.duration(context.downtimeDuration);
		metadata.downtimeDuration = duration.humanize();
	}

	return {
		title: `🟢 Site Recovered: ${context.url}`,
		message: `Your website is back online. Alarm: ${alarmName}`,
		priority: "normal",
		metadata,
	};
}

async function sendAlarmNotifications(
	alarm: {
		id: string;
		name: string;
		notificationChannels: string[];
		slackWebhookUrl: string | null;
		discordWebhookUrl: string | null;
		webhookUrl: string | null;
		webhookHeaders: unknown;
	},
	payload: NotificationPayload
): Promise<void> {
	const promises: Promise<unknown>[] = [];

	if (
		alarm.notificationChannels.includes("slack") &&
		alarm.slackWebhookUrl
	) {
		promises.push(
			sendSlackWebhook(alarm.slackWebhookUrl, payload).catch((error) => {
				captureError(error, {
					type: "alarm_notification_failed",
					alarmId: alarm.id,
					channel: "slack",
				});
			})
		);
	}

	if (
		alarm.notificationChannels.includes("discord") &&
		alarm.discordWebhookUrl
	) {
		promises.push(
			sendDiscordWebhook(alarm.discordWebhookUrl, payload).catch((error) => {
				captureError(error, {
					type: "alarm_notification_failed",
					alarmId: alarm.id,
					channel: "discord",
				});
			})
		);
	}

	if (
		alarm.notificationChannels.includes("webhook") &&
		alarm.webhookUrl
	) {
		const headers =
			typeof alarm.webhookHeaders === "object" && alarm.webhookHeaders !== null
				? (alarm.webhookHeaders as Record<string, string>)
				: undefined;

		promises.push(
			sendWebhook(alarm.webhookUrl, payload, { headers }).catch((error) => {
				captureError(error, {
					type: "alarm_notification_failed",
					alarmId: alarm.id,
					channel: "webhook",
				});
			})
		);
	}

	await Promise.allSettled(promises);
}

export async function checkAndTriggerAlarms(
	context: UptimeAlarmContext
): Promise<void> {
	try {
		const websiteAlarms = await db
			.select()
			.from(alarms)
			.where(
				and(
					eq(alarms.websiteId, context.websiteId),
					eq(alarms.enabled, true),
					eq(alarms.triggerType, "uptime")
				)
			);

		if (websiteAlarms.length === 0) {
			return;
		}

		for (const alarm of websiteAlarms) {
			const alarmId = alarm.id;

			if (!shouldSendNotification(alarmId, context.status)) {
				continue;
			}

			const payload = buildNotificationPayload(context, alarm.name);

			await sendAlarmNotifications(
				{
					id: alarm.id,
					name: alarm.name,
					notificationChannels: alarm.notificationChannels,
					slackWebhookUrl: alarm.slackWebhookUrl,
					discordWebhookUrl: alarm.discordWebhookUrl,
					webhookUrl: alarm.webhookUrl,
					webhookHeaders: alarm.webhookHeaders,
				},
				payload
			);

			updateAlarmState(alarmId, {
				lastStatus: context.status,
				lastNotificationTime: Date.now(),
				consecutiveFailures:
					context.status === "down"
						? (context.consecutiveFailures || 0)
						: 0,
			});
		}
	} catch (error) {
		captureError(error, {
			type: "alarm_check_failed",
			websiteId: context.websiteId,
		});
	}
}

