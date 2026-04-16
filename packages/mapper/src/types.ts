import type { AnalyticsEvent } from "@databuddy/db/clickhouse/schema";

export interface ImportContext {
	clientId: string;
	isLastInSession: (eventId: string) => boolean;
}

export type MapperFn<TRow> = (row: TRow, ctx: ImportContext) => AnalyticsEvent;
