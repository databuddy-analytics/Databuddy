import { describe, expect, test } from "bun:test";
import JSZip from "jszip";
import { readImportFile, summarizeImport } from "../index";
import {
	ImportFileError,
	type ImportRecord,
	UnrecognizedImportFileError,
} from "../records";

const VISITORS_HEADER =
	"date,visitors,pageviews,visits,views_per_visit,bounce_rate,visit_duration";

const SINGLE_DAY = {
	"visitors.csv": [
		VISITORS_HEADER,
		"2026-10-11 00:00:00,0,0,0,0.0,0.0,",
		"2026-10-11 09:00:00,2,4,2,2.0,50,40",
		"2026-10-11 13:00:00,3,3,3,1.0,100,0",
		"2026-10-11 18:00:00,1,2,1,2.0,0,60",
	].join("\n"),
	"pages.csv":
		"name,visitors,pageviews,bounce_rate,time_on_page,scroll_depth\n/,4,6,50,20,40\n/pricing,2,3,0,30,60\n",
	"referrers.csv":
		"name,visitors,bounce_rate,visit_duration\nDirect / None,3,66,10\ngoogle.com,2,50,20\n",
	"utm_sources.csv":
		"name,visitors,bounce_rate,visit_duration\nnewsletter,1,0,30\n",
	"countries.csv": "name,visitors\nGermany,4\nFrance,1\n",
	"devices.csv": "name,visitors\nDesktop,4\nMobile,1\n",
	"cities.csv": "name,visitors\nBerlin,4\n",
};

function context() {
	return {
		domain: "databuddy.cc",
		runId: "run-1",
		timezone: "UTC",
		websiteId: "website-1",
	};
}

async function zipFile(entries: Record<string, string>): Promise<File> {
	const zip = new JSZip();
	for (const [name, contents] of Object.entries(entries)) {
		zip.file(name, contents);
	}
	return new File(
		[await zip.generateAsync({ type: "uint8array" })],
		"Plausible export databuddy.cc.zip"
	);
}

function rollups(records: ImportRecord[]) {
	return records.flatMap((record) =>
		record.grain === "rollup" ? [record] : []
	);
}

function pageviewsByDay(records: ImportRecord[], kind: string) {
	const days = new Map<string, number>();
	for (const record of rollups(records)) {
		if (record.dimension?.kind === kind) {
			days.set(
				record.date,
				(days.get(record.date) ?? 0) + (record.metrics.pageviews ?? 0)
			);
		}
	}
	return Object.fromEntries(days);
}

function dimensions(records: ImportRecord[], kind: string) {
	return rollups(records).flatMap((record) =>
		record.dimension?.kind === kind
			? [{ value: record.dimension.value, pageviews: record.metrics.pageviews }]
			: []
	);
}

test("the full data export imports referrers and UTM tags, and leaves direct visits unattributed", async () => {
	const { records } = await readImportFile(
		await zipFile({
			"imported_visitors_20261001_20261001.csv":
				"date,visitors,pageviews,bounces,visits,visit_duration\n2026-10-01,9,12,4,9,300\n",
			"imported_sources_20261001_20261001.csv": [
				"date,source,referrer,utm_source,utm_medium,utm_campaign,utm_content,utm_term,pageviews,visitors,visits,visit_duration,bounces",
				"2026-10-01,Google,google.com,,,,,,5,4,4,100,2",
				"2026-10-01,LinkedIn,android-app://com.linkedin.android,,,,,,2,1,1,10,1",
				"2026-10-01,dubai,,dubai,social,launch,,,1,1,1,0,1",
				"2026-10-01,,,,,,,,4,3,3,190,0",
			].join("\n"),
		}),
		context()
	);

	expect(dimensions(records, "source")).toEqual([
		{ value: "https://google.com", pageviews: 5 },
		{ value: "android-app://com.linkedin.android", pageviews: 2 },
	]);
	expect(dimensions(records, "utm_source")).toEqual([
		{ value: "dubai", pageviews: 1 },
	]);
	expect(dimensions(records, "utm_campaign")).toEqual([
		{ value: "launch", pageviews: 1 },
	]);
});

describe("plausible dashboard download", () => {
	test("a single day download imports its exact totals and breakdowns", async () => {
		const { provider, format, records } = await readImportFile(
			await zipFile(SINGLE_DAY),
			context()
		);

		expect(provider.id).toBe("plausible");
		expect(format).toEqual({
			label: "Plausible dashboard download",
			note: undefined,
		});
		const [totals] = rollups(records).filter(
			(record) => record.dimension === null
		);
		expect(totals).toEqual({
			grain: "rollup",
			date: "2026-10-11",
			dimension: null,
			metrics: {
				visitors: 5,
				visits: 6,
				pageviews: 9,
				bounces: 4,
				durationSeconds: 140,
			},
		});
		for (const kind of ["page", "country", "device"]) {
			expect(pageviewsByDay(records, kind)).toEqual({ "2026-10-11": 9 });
		}
		expect(dimensions(records, "source")).toEqual([
			{ value: "https://google.com", pageviews: 4 },
		]);
		expect(dimensions(records, "utm_source")).toEqual([
			{ value: "newsletter", pageviews: 2 },
		]);
		expect(summarizeImport(records)).toEqual({
			firstDate: "2026-10-11",
			lastDate: "2026-10-11",
			pageviews: 9,
			visitors: 5,
		});
	});

	test("a multi-day download spreads breakdowns over each day's traffic", async () => {
		const { format, records } = await readImportFile(
			await zipFile({
				"visitors.csv": [
					VISITORS_HEADER,
					"2026-10-01,3,4,3,1.3,66,10",
					"2026-10-02,0,0,0,0.0,0.0,",
					"2026-10-03,6,8,6,1.3,50,20",
				].join("\n"),
				"pages.csv": SINGLE_DAY["pages.csv"],
				"devices.csv": SINGLE_DAY["devices.csv"],
			}),
			context()
		);

		expect(format.note).toContain("spread across days");
		expect(pageviewsByDay(records, "page")).toEqual({
			"2026-10-01": 4,
			"2026-10-03": 8,
		});
		expect(pageviewsByDay(records, "device")).toEqual({
			"2026-10-01": 4,
			"2026-10-03": 8,
		});
	});

	test("a download grouped by month is refused with the export to use instead", async () => {
		const read = readImportFile(
			await zipFile({
				"visitors.csv": [
					VISITORS_HEADER,
					"2026-08-01,30,40,30,1.3,50,10",
					"2026-09-01,20,25,20,1.2,50,10",
				].join("\n"),
				"pages.csv": SINGLE_DAY["pages.csv"],
			}),
			context()
		);

		await expect(read).rejects.toBeInstanceOf(ImportFileError);
		await expect(read).rejects.toThrow("Imports & Exports → Export data");
	});
});

test("an unrecognised file is reported as unrecognised rather than broken", async () => {
	const read = readImportFile(
		await zipFile({ "report.csv": "name,value\nsignups,4\n" }),
		context()
	);

	await expect(read).rejects.toBeInstanceOf(UnrecognizedImportFileError);
});
