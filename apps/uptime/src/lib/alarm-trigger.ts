import {
	alarms,
	alarmTriggers,
	and,
	db,
	desc,
	eq,
	isNull,
} from "@databuddy/db";
import type { NotificationPayload } from "@databuddy/notifications";
import {
	sendDiscordWebhook,
	sendSlackWebhook,
	sendWebhook,
} from "@databuddy/notifications";
import { randomUUIDv7 } from "bun";
import { captureError } from "./tracing";

interface TriggerResult {
	channel: string;
	success: boolean;
	error?: string;
}

/**
 * Evaluates uptime alarms for a website after each check.
 * - On DOWN: fires alarm notifications (deduplicates by checking last trigger)
 * - On UP after DOWN: fires recovery notifications
 */
export async function evaluateUptimeAlarms(
	websiteId: string,
	url: string,
	isDown: boolean,
	httpCode: number,
	errorMessage: string
): Promise<void> {
	try {
		// Find all enabled uptime alarms for this website
		const websiteAlarms = await db
			.select()
			.from(alarms)
			.where(
				and(
					eq(alarms.websiteId, websiteId),
					eq(alarms.enabled, true),
					eq(alarms.triggerType, "uptime"),
					isNull(alarms.deletedAt)
				)
			);

		if (websiteAlarms.length === 0) {
			return;
		}

		for (const alarm of websiteAlarms) {
			await processAlarm(alarm, websiteId, url, isDown, httpCode, errorMessage);
		}
	} catch (error) {
		captureError(error, { type: "alarm_evaluation_error", websiteId });
	}
}

async function processAlarm(
	alarm: typeof alarms.$inferSelect,
	websiteId: string,
	url: string,
	isDown: boolean,
	httpCode: number,
	errorMessage: string
): Promise<void> {
	// Check last trigger for this alarm to prevent duplicates
	const [lastTrigger] = await db
		.select()
		.from(alarmTriggers)
		.where(
			and(
				eq(alarmTriggers.alarmId, alarm.id),
				eq(alarmTriggers.websiteId, websiteId)
			)
		)
		.orderBy(desc(alarmTriggers.createdAt))
		.limit(1);

	const lastEvent = lastTrigger?.triggerEvent;
	const lastStatus = lastTrigger?.status;

	if (isDown) {
		// Only fire if last trigger was not already a 'down' that is 'fired' (prevent spam)
		if (lastEvent === "down" && lastStatus === "fired") {
			return;
		}

		const payload: NotificationPayload = {
			title: `Site Down: ${url}`,
			message: `Your monitored site ${url} is unreachable. HTTP ${httpCode || "N/A"}${errorMessage ? ` — ${errorMessage}` : ""}`,
			priority: "high",
			metadata: {
				alarmId: alarm.id,
				alarmName: alarm.name,
				websiteId,
				url,
				httpCode,
				event: "down",
			},
		};

		const results = await sendAlarmNotifications(alarm, payload);

		await db.insert(alarmTriggers).values({
			id: randomUUIDv7(),
			alarmId: alarm.id,
			websiteId,
			triggerEvent: "down",
			status: "fired",
			httpCode,
			errorMessage: errorMessage || null,
			notificationResults: results,
		});
	} else {
		// Site is UP — only send recovery if previous state was 'down'+'fired'
		if (lastEvent !== "down" || lastStatus !== "fired") {
			return;
		}

		const payload: NotificationPayload = {
			title: `Site Recovered: ${url}`,
			message: `Your monitored site ${url} is back online. HTTP ${httpCode}.`,
			priority: "normal",
			metadata: {
				alarmId: alarm.id,
				alarmName: alarm.name,
				websiteId,
				url,
				httpCode,
				event: "recovery",
			},
		};

		const results = await sendAlarmNotifications(alarm, payload);

		await db.insert(alarmTriggers).values({
			id: randomUUIDv7(),
			alarmId: alarm.id,
			websiteId,
			triggerEvent: "recovery",
			status: "resolved",
			httpCode,
			errorMessage: null,
			notificationResults: results,
		});
	}
}

async function sendAlarmNotifications(
	alarm: typeof alarms.$inferSelect,
	payload: NotificationPayload
): Promise<TriggerResult[]> {
	const channels = (alarm.notificationChannels as string[]) || [];
	const results: TriggerResult[] = [];

	for (const channel of channels) {
		try {
			switch (channel) {
				case "slack": {
					if (alarm.slackWebhookUrl) {
						const result = await sendSlackWebhook(
							alarm.slackWebhookUrl,
							payload
						);
						results.push({
							channel: "slack",
							success: result.success,
							error: result.error,
						});
					}
					break;
				}
				case "discord": {
					if (alarm.discordWebhookUrl) {
						const result = await sendDiscordWebhook(
							alarm.discordWebhookUrl,
							payload
						);
						results.push({
							channel: "discord",
							success: result.success,
							error: result.error,
						});
					}
					break;
				}
				case "webhook": {
					if (alarm.webhookUrl) {
						const result = await sendWebhook(alarm.webhookUrl, payload, {
							headers:
								(alarm.webhookHeaders as Record<string, string>) || undefined,
						});
						results.push({
							channel: "webhook",
							success: result.success,
							error: result.error,
						});
					}
					break;
				}
				case "email": {
					// Email requires a transactional email provider (e.g. Resend, SES)
					// configured at the dashboard app level. The uptime worker cannot
					// send emails directly. Log a warning so operators can diagnose.
					console.warn(
						`[alarm ${alarm.id}] Email channel selected but not available in uptime worker`
					);
					results.push({
						channel: "email",
						success: false,
						error:
							"Email notifications are not yet supported. Please use Slack, Discord, or Webhook channels instead.",
					});
					break;
				}
				default:
					results.push({
						channel,
						success: false,
						error: `Unknown channel: ${channel}`,
					});
			}
		} catch (err) {
			results.push({
				channel,
				success: false,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	return results;
}
