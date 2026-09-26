/** biome-ignore-all lint/performance/noBarrelFile: barrel file */
export type { NotificationClientConfig } from "./client";
export { NotificationClient } from "./client";
export * from "./providers";
export * from "./types";
export {
	buildAlarmNotificationConfig,
	buildAlarmNotificationTargets,
	MAX_ALARM_DESTINATIONS,
} from "./alarm-config";
