import { describe, expect, test } from "bun:test";
import {
	batchImportRecords,
	type ImportRecord,
	MAX_BATCH_PAGEVIEWS,
	MAX_BATCH_RECORDS,
	PAGEVIEW_EVENT_NAME,
} from "./records";

function page(date: string, pageviews: number): ImportRecord {
	return {
		grain: "rollup",
		date,
		dimension: { kind: "page", value: "/" },
		metrics: { pageviews },
	};
}

function totals(date: string): ImportRecord {
	return { grain: "rollup", date, dimension: null, metrics: { visits: 1 } };
}

function event(index: number): ImportRecord {
	return {
		grain: "event",
		eventName: PAGEVIEW_EVENT_NAME,
		path: "/",
		sessionKey: `s${index}`,
		time: new Date("2026-03-04T10:00:00Z"),
		visitorKey: `v${index}`,
	};
}

describe("batchImportRecords", () => {
	test("keeps every record of a day in the same batch", () => {
		const half = MAX_BATCH_PAGEVIEWS / 2;
		const batches = batchImportRecords([
			page("2026-03-05", half),
			totals("2026-03-04"),
			page("2026-03-04", half),
			totals("2026-03-05"),
			page("2026-03-06", half),
			totals("2026-03-06"),
		]);

		const days = batches.map((batch) => [
			...new Set(
				batch.map((record) => (record.grain === "rollup" ? record.date : ""))
			),
		]);
		expect(days).toEqual([["2026-03-04", "2026-03-05"], ["2026-03-06"]]);
	});

	test("splits events at the record limit", () => {
		const batches = batchImportRecords(
			Array.from({ length: MAX_BATCH_RECORDS + 1 }, (_, index) => event(index))
		);

		expect(batches.map((batch) => batch.length)).toEqual([
			MAX_BATCH_RECORDS,
			1,
		]);
	});

	test("rejects a single day larger than one batch", () => {
		expect(() =>
			batchImportRecords([page("2026-03-04", MAX_BATCH_PAGEVIEWS + 1)])
		).toThrow(/2026-03-04 has more data than one import can hold/);
	});
});
