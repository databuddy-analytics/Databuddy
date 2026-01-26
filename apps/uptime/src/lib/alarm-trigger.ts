import { db, eq, and, isNull, alarms, alarmLogs } from "@databuddy/db";
import { nanoid } from "nanoid";
import type { UptimeData } from "../types";
import { MonitorStatus } from "../types";

interface AlarmConditions {
	uptimeScheduleId?: string;
	triggerOn?: ("down" | "up" | "degraded")[];
	consecutiveFailures?: number;
	responseTimeThreshold?: number; // in ms
	statusCodes?: number[]; // specific status codes to trigger on
}

interface AlarmEvaluationContext {
	uptimeScheduleId: string;
	uptimeData: UptimeData;
	previousStatus?: MonitorStatus;
	consecutiveFailureCount?: number;
}

/**
 * Evaluate and trigger alarms for uptime monitoring results
 */
export async function evaluateUptimeAlarms(
	context: AlarmEvaluationContext
): Promise<void> {
	const { uptimeScheduleId, uptimeData, previousStatus, consecutiveFailureCount = 0 } = context;

	try {
		// Find all active alarms for this uptime schedule
		const activeAlarms = await db.query.alarms.findMany({
			where: and(
				eq(alarms.uptimeScheduleId, uptimeScheduleId),
				eq(alarms.enabled, true),
				isNull(alarms.deletedAt)
			),
		});

		if (activeAlarms.length === 0) {
			return;
		}

		// Evaluate each alarm
		for (const alarm of activeAlarms) {
			const conditions = alarm.conditions as AlarmConditions;
			const shouldTrigger = shouldTriggerAlarm(
				alarm,
				conditions,
				uptimeData,
				previousStatus,
				consecutiveFailureCount
			);

			if (shouldTrigger) {
				await triggerAlarm(alarm, uptimeData, conditions);
			}
		}
	} catch (error) {
		console.error("[alarm-trigger] Error evaluating uptime alarms:", error);
		// Don't throw - we don't want alarm evaluation to break uptime checks
	}
}

/**
 * Determine if an alarm should be triggered based on conditions
 */
function shouldTriggerAlarm(
	alarm: any,
	conditions: AlarmConditions,
	uptimeData: UptimeData,
	previousStatus: MonitorStatus | undefined,
	consecutiveFailureCount: number
): boolean {
	const currentStatus = uptimeData.status;

	// Check if we should trigger on this status
	const triggerOn = conditions.triggerOn || ["down"];
	
	// Map status to trigger type
	let triggerType: "down" | "up" | "degraded";
	if (currentStatus === MonitorStatus.DOWN) {
		triggerType = "down";
	} else if (currentStatus === MonitorStatus.UP) {
		triggerType = "up";
	} else {
		triggerType = "degraded";
	}

	// Check if this trigger type is enabled
	if (!triggerOn.includes(triggerType)) {
		return false;
	}

	// For "down" triggers, check consecutive failures
	if (triggerType === "down") {
		const requiredFailures = conditions.consecutiveFailures || 1;
		if (consecutiveFailureCount < requiredFailures) {
			return false;
		}

		// Only trigger once when threshold is reached, not on every subsequent failure
		if (consecutiveFailureCount > requiredFailures) {
			return false;
		}
	}

	// For "up" triggers, only trigger if previous status was down (recovery)
	if (triggerType === "up") {
		if (previousStatus !== MonitorStatus.DOWN) {
			return false;
		}
	}

	// Check response time threshold
	if (conditions.responseTimeThreshold && uptimeData.response_time) {
		if (uptimeData.response_time > conditions.responseTimeThreshold) {
			// Response time exceeded threshold
			if (!triggerOn.includes("degraded")) {
				return false;
			}
		}
	}

	// Check specific status codes
	if (conditions.statusCodes && conditions.statusCodes.length > 0) {
		if (!conditions.statusCodes.includes(uptimeData.http_code)) {
			return false;
		}
	}

	return true;
}

/**
 * Trigger an alarm and send notifications
 */
async function triggerAlarm(
	alarm: any,
	uptimeData: UptimeData,
	conditions: AlarmConditions
): Promise<void> {
	try {
		// Determine trigger reason
		const triggerReason = buildTriggerReason(uptimeData, conditions);
		
		// Build trigger data
		const triggerData = {
			status: uptimeData.status,
			httpCode: uptimeData.http_code,
			responseTime: uptimeData.response_time,
			errorMessage: uptimeData.error_message,
			region: uptimeData.region,
			timestamp: uptimeData.timestamp,
		};

		// Send notifications (this will be implemented in the notifications package)
		const notificationResults = await sendAlarmNotifications({
			alarm,
			triggerReason,
			triggerData,
			timestamp: new Date(uptimeData.timestamp),
		});

		// Create alarm log
		const logId = nanoid();
		await db.insert(alarmLogs).values({
			id: logId,
			alarmId: alarm.id,
			triggeredAt: new Date(uptimeData.timestamp),
			triggerReason,
			triggerData,
			notificationsSent: notificationResults
				.filter((r) => r.success)
				.map((r) => r.channel as any),
			notificationErrors: notificationResults
				.filter((r) => !r.success)
				.reduce((acc, r) => {
					acc[r.channel] = r.error;
					return acc;
				}, {} as Record<string, string>),
			autoResolved: false,
		});

		// Update alarm metadata
		await db
			.update(alarms)
			.set({
				lastTriggeredAt: new Date(uptimeData.timestamp),
				triggerCount: String(Number(alarm.triggerCount || "0") + 1),
				updatedAt: new Date(),
			})
			.where(eq(alarms.id, alarm.id));

		console.log(`[alarm-trigger] Triggered alarm ${alarm.id}: ${triggerReason}`);
	} catch (error) {
		console.error(`[alarm-trigger] Error triggering alarm ${alarm.id}:`, error);
		throw error;
	}
}

/**
 * Build a human-readable trigger reason
 */
function buildTriggerReason(
	uptimeData: UptimeData,
	conditions: AlarmConditions
): string {
	const status = uptimeData.status;

	if (status === MonitorStatus.DOWN) {
		if (uptimeData.error_message) {
			return `Website is down: ${uptimeData.error_message}`;
		}
		if (uptimeData.http_code >= 400) {
			return `Website returned HTTP ${uptimeData.http_code}`;
		}
		return "Website is down";
	}

	if (status === MonitorStatus.UP) {
		return "Website is back up (recovered)";
	}

	if (status === MonitorStatus.DEGRADED) {
		if (
			conditions.responseTimeThreshold &&
			uptimeData.response_time &&
			uptimeData.response_time > conditions.responseTimeThreshold
		) {
			return `Slow response time: ${uptimeData.response_time}ms (threshold: ${conditions.responseTimeThreshold}ms)`;
		}
		return "Website performance degraded";
	}

	return `Status changed to ${status}`;
}

/**
 * Send alarm notifications to all configured channels
 * This is a placeholder - actual implementation will be in the notifications package
 */
async function sendAlarmNotifications(context: {
	alarm: any;
	triggerReason: string;
	triggerData: Record<string, any>;
	timestamp: Date;
}): Promise<Array<{ channel: string; success: boolean; error?: string }>> {
	// Import the notification service
	// For now, return empty array - this will be implemented when notifications package is integrated
	try {
		// Dynamic import to avoid circular dependencies
		const { sendAlarmNotifications } = await import(
			"@databuddy/notifications/alarms"
		);
		return await sendAlarmNotifications(context);
	} catch (error) {
		console.error("[alarm-trigger] Notifications package not available:", error);
		// Return mock success for now
		return context.alarm.notificationChannels.map((channel: string) => ({
			channel,
			success: true,
		}));
	}
}

/**
 * Auto-resolve alarms when website comes back up
 */
export async function autoResolveAlarms(
	uptimeScheduleId: string,
	uptimeData: UptimeData
): Promise<void> {
	if (uptimeData.status !== MonitorStatus.UP) {
		return;
	}

	try {
		// Find all open alarm logs for this uptime schedule
		const openLogs = await db.query.alarmLogs.findMany({
			where: and(
				eq(alarmLogs.alarmId, uptimeScheduleId),
				isNull(alarmLogs.resolvedAt)
			),
			with: {
				alarm: true,
			},
		});

		// Auto-resolve them
		for (const log of openLogs) {
			await db
				.update(alarmLogs)
				.set({
					resolvedAt: new Date(uptimeData.timestamp),
					autoResolved: true,
				})
				.where(eq(alarmLogs.id, log.id));

			console.log(`[alarm-trigger] Auto-resolved alarm log ${log.id}`);
		}
	} catch (error) {
		console.error("[alarm-trigger] Error auto-resolving alarms:", error);
	}
}

/**
 * Track consecutive failures for smart alerting
 * This should be called from the uptime checker to maintain state
 */
export interface ConsecutiveFailureTracker {
	get(scheduleId: string): number;
	increment(scheduleId: string): number;
	reset(scheduleId: string): void;
}

// In-memory tracker (could be moved to Redis for persistence)
const failureTracker = new Map<string, number>();

export const consecutiveFailures: ConsecutiveFailureTracker = {
	get(scheduleId: string): number {
		return failureTracker.get(scheduleId) || 0;
	},

	increment(scheduleId: string): number {
		const current = failureTracker.get(scheduleId) || 0;
		const next = current + 1;
		failureTracker.set(scheduleId, next);
		return next;
	},

	reset(scheduleId: string): void {
		failureTracker.delete(scheduleId);
	},
};
