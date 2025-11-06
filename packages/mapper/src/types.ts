import type { AnalyticsEvent } from "@databuddy/db";
export interface AnalyticsEventAdapter<T> {
	mapRowToEvent(row: T): AnalyticsEvent;
}
