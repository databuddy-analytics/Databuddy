import type { AnalyticsEvent } from "@databuddy/db";
import type { AnalyticsEventAdapter } from "./types";

/**
 * Maps an array of input rows to AnalyticsEvent using the provided adapter.
 * @param adapter AnalyticsEventAdapter for the input type
 * @param rows Array of input rows
 * @returns Array of AnalyticsEvent
 */
export function mapEvents<T>(
	adapter: AnalyticsEventAdapter<T>,
	rows: T[]
): AnalyticsEvent[] {
	return rows.map((row) => adapter.mapRowToEvent(row));
}
