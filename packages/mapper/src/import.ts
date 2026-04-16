import type { AnalyticsEvent } from "@databuddy/db/clickhouse/schema";
import type { ImportContext, MapperFn } from "./types";

function buildSessionExitMap<TRow>(
	rows: TRow[],
	getSessionId: (row: TRow) => string,
	getEventId: (row: TRow) => string,
	getTime: (row: TRow) => number
): Set<string> {
	const sessionLastEvent = new Map<string, { eventId: string; time: number }>();

	for (const row of rows) {
		const sessionId = getSessionId(row);
		if (!sessionId) {
			continue;
		}

		const time = getTime(row);
		const current = sessionLastEvent.get(sessionId);
		if (!current || time > current.time) {
			sessionLastEvent.set(sessionId, { eventId: getEventId(row), time });
		}
	}

	return new Set(Array.from(sessionLastEvent.values()).map((v) => v.eventId));
}

export function createImport<TRow>(options: {
	clientId: string;
	rows: TRow[];
	mapper: MapperFn<TRow>;
	getSessionId: (row: TRow) => string;
	getEventId: (row: TRow) => string;
	getTime: (row: TRow) => number;
}): AnalyticsEvent[] {
	const exitEventIds = buildSessionExitMap(
		options.rows,
		options.getSessionId,
		options.getEventId,
		options.getTime
	);

	const ctx: ImportContext = {
		clientId: options.clientId,
		isLastInSession: (eventId) => exitEventIds.has(eventId),
	};

	return options.rows.map((row) => options.mapper(row, ctx));
}
