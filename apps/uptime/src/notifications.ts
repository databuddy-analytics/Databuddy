import { alarms, db, eq, uptimeAlarms, uptimeSchedules } from "@databuddy/db";
import {
	sendDiscordWebhook,
	sendSlackWebhook,
	sendWebhook,
} from "@databuddy/notifications";
import type { NotificationPayload } from "@databuddy/notifications";
import { captureError } from "./lib/tracing";

export type MonitorStatus = "up" | "down";

interface MonitorInfo {
	id: string;
	name: string | null;
	url: string;
	consecutiveFailures: number;
	lastStatus: string | null;
}

interface AlarmInfo {
	id: string;
	name: string;
	channel: "slack" | "discord" | "email" | "webhook";
	target: string;
	enabled: boolean;
	failureThreshold: number;
}

function formatDownPayload(monitor: MonitorInfo, httpCode: number): NotificationPayload {
	return {
		title: `Monitor DOWN: ${monitor.name || monitor.url}`,
		message: [
			`**URL:** ${monitor.url}`,
			`**Status Code:** ${httpCode || "Connection failed"}`,
			`**Consecutive Failures:** ${monitor.consecutiveFailures}`,
			`**Time:** ${new Date().toISOString()}`,
		].join("\n"),
		priority: "high",
		metadata: {
			monitorId: monitor.id,
			monitorName: monitor.name,
			url: monitor.url,
			httpCode,
			consecutiveFailures: monitor.consecutiveFailures,
			eventType: "down",
		},
	};
}

function formatRecoveryPayload(monitor: MonitorInfo, downtime: number): NotificationPayload {
	const downtimeStr = downtime > 60
		? `${Math.floor(downtime / 60)} minutes`
		: `${downtime} seconds`;

	return {
		title: `Monitor RECOVERED: ${monitor.name || monitor.url}`,
		message: [
			`**URL:** ${monitor.url}`,
			`**Status:** Back online`,
			`**Was down for:** ~${downtimeStr}`,
			`**Time:** ${new Date().toISOString()}`,
		].join("\n"),
		priority: "normal",
		metadata: {
			monitorId: monitor.id,
			monitorName: monitor.name,
			url: monitor.url,
			downtime,
			eventType: "recovery",
		},
	};
}

async function sendAlarmNotification(
	alarm: AlarmInfo,
	payload: NotificationPayload
): Promise<boolean> {
	try {
		switch (alarm.channel) {
			case "slack":
				await sendSlackWebhook(alarm.target, payload);
				return true;
			case "discord":
				await sendDiscordWebhook(alarm.target, payload);
				return true;
			case "webhook":
				await sendWebhook(alarm.target, payload);
				return true;
			case "email":
				// Email not yet supported for automatic notifications
				console.warn(`[notifications] Email channel not yet supported for alarm ${alarm.id}`);
				return false;
			default:
				console.warn(`[notifications] Unknown channel ${alarm.channel} for alarm ${alarm.id}`);
				return false;
		}
	} catch (error) {
		captureError(error, {
			type: "notification_error",
			alarmId: alarm.id,
			channel: alarm.channel,
		});
		console.error(`[notifications] Failed to send ${alarm.channel} notification:`, error);
		return false;
	}
}

async function getAlarmsForSchedule(scheduleId: string): Promise<AlarmInfo[]> {
	const assignments = await db
		.select({
			alarmId: uptimeAlarms.alarmId,
			failureThreshold: uptimeAlarms.failureThreshold,
			id: alarms.id,
			name: alarms.name,
			channel: alarms.channel,
			target: alarms.target,
			enabled: alarms.enabled,
		})
		.from(uptimeAlarms)
		.innerJoin(alarms, eq(uptimeAlarms.alarmId, alarms.id))
		.where(eq(uptimeAlarms.scheduleId, scheduleId));

	return assignments
		.filter((a) => a.enabled)
		.map((a) => ({
			id: a.id,
			name: a.name,
			channel: a.channel as AlarmInfo["channel"],
			target: a.target,
			enabled: a.enabled,
			failureThreshold: a.failureThreshold,
		}));
}

export async function updateMonitorStatus(
	scheduleId: string,
	isUp: boolean,
	httpCode: number
): Promise<void> {
	const schedule = await db.query.uptimeSchedules.findFirst({
		where: eq(uptimeSchedules.id, scheduleId),
	});

	if (!schedule) {
		console.error(`[notifications] Schedule ${scheduleId} not found`);
		return;
	}

	const wasDown = schedule.lastStatus === "down";
	const newStatus = isUp ? "up" : "down";
	let newConsecutiveFailures = schedule.consecutiveFailures;

	if (!isUp) {
		newConsecutiveFailures += 1;
	} else if (wasDown) {
		// Just recovered
		newConsecutiveFailures = 0;
	}

	// Update the schedule status
	await db
		.update(uptimeSchedules)
		.set({
			consecutiveFailures: newConsecutiveFailures,
			lastStatus: newStatus,
			lastCheckedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(uptimeSchedules.id, scheduleId));

	// Get assigned alarms
	const assignedAlarms = await getAlarmsForSchedule(scheduleId);

	if (assignedAlarms.length === 0) {
		return;
	}

	const monitor: MonitorInfo = {
		id: scheduleId,
		name: schedule.name,
		url: schedule.url,
		consecutiveFailures: newConsecutiveFailures,
		lastStatus: newStatus,
	};

	// Check if we need to send DOWN notifications
	if (!isUp) {
		for (const alarm of assignedAlarms) {
			// Only send if we just hit the threshold
			if (newConsecutiveFailures === alarm.failureThreshold) {
				const payload = formatDownPayload(monitor, httpCode);
				await sendAlarmNotification(alarm, payload);
				console.log(
					`[notifications] Sent DOWN alert for ${schedule.url} to ${alarm.channel}`
				);
			}
		}
	}

	// Check if we need to send RECOVERY notifications
	if (isUp && wasDown && schedule.consecutiveFailures > 0) {
		// Estimate downtime based on consecutive failures and check interval
		const estimatedDowntime = schedule.consecutiveFailures * 60; // rough estimate in seconds

		for (const alarm of assignedAlarms) {
			// Only send recovery if we were past the threshold
			if (schedule.consecutiveFailures >= alarm.failureThreshold) {
				const payload = formatRecoveryPayload(monitor, estimatedDowntime);
				await sendAlarmNotification(alarm, payload);
				console.log(
					`[notifications] Sent RECOVERY alert for ${schedule.url} to ${alarm.channel}`
				);
			}
		}
	}
}
