import {
	and,
	alarmState,
	alarmTriggerHistory,
	alarms,
	db,
	eq,
	inArray,
} from "@databuddy/db";
import {
	createNotificationSenders,
	processUptimeAlarmsWithDeps,
	type AlarmRecord,
	type AlarmStateRecord,
} from "./alarms";
import type { UptimeData } from "./types";

export async function processUptimeAlarms(
	uptimeData: UptimeData,
	websiteId: string | null
): Promise<void> {
	return processUptimeAlarmsWithDeps(uptimeData, websiteId, {
		fetchAlarms: async (targetWebsiteId: string) =>
			db.query.alarms.findMany({
				where: and(
					eq(alarms.websiteId, targetWebsiteId),
					eq(alarms.enabled, true),
					eq(alarms.triggerType, "uptime")
				),
			}) as Promise<AlarmRecord[]>,
		fetchStates: async (alarmIds: string[], targetWebsiteId: string) =>
			db.query.alarmState.findMany({
				where: and(
					inArray(alarmState.alarmId, alarmIds),
					eq(alarmState.websiteId, targetWebsiteId)
				),
			}) as Promise<AlarmStateRecord[]>,
		upsertState: async (state) => {
			await db
				.insert(alarmState)
				.values(state)
				.onConflictDoUpdate({
					target: [alarmState.alarmId, alarmState.websiteId],
					set: {
						status: state.status,
						consecutiveFailures: state.consecutiveFailures,
						downStartedAt: state.downStartedAt,
						lastCheckedAt: state.lastCheckedAt,
						updatedAt: state.updatedAt,
					},
				});
		},
		logHistory: async (entry) => {
			await db.insert(alarmTriggerHistory).values(entry);
		},
		senders: createNotificationSenders(),
	});
}
