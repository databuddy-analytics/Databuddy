import type { EventsInsert } from "@databuddy/db/clickhouse/tables";

export interface ImportContext {
	clientId: string;
	isLastInSession: (eventId: string) => boolean;
}

export type MapperFn<TRow> = (row: TRow, ctx: ImportContext) => EventsInsert;
