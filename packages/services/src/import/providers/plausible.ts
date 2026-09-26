import {
	csvNumber,
	type ImportContext,
	type ImportProvider,
	type ImportRecord,
	type ImportSource,
	parseCsv,
	type RollupDimensionKind,
	sourceEntries,
} from "../pipeline";

const VISITORS_TABLE = "imported_visitors";
const PAGES_TABLE = "imported_pages";
const DATE_RANGE_SUFFIX = /_\d{8}_\d{8}\.csv$/;
const CSV_SUFFIX = /\.csv$/;

const DIMENSION_TABLES: Record<
	string,
	{ kind: RollupDimensionKind; column: string }
> = {
	imported_sources: { kind: "source", column: "source" },
	imported_entry_pages: { kind: "entry_page", column: "entry_page" },
	imported_exit_pages: { kind: "exit_page", column: "exit_page" },
	imported_browsers: { kind: "browser", column: "browser" },
	imported_devices: { kind: "device", column: "device" },
	imported_operating_systems: { kind: "os", column: "operating_system" },
	imported_locations: { kind: "country", column: "country" },
	imported_custom_events: { kind: "custom_event", column: "name" },
};

function tableNameOf(entryName: string): string {
	const base = entryName.split("/").pop() ?? entryName;
	if (!base.endsWith(".csv")) {
		return "";
	}
	return base.replace(DATE_RANGE_SUFFIX, "").replace(CSV_SUFFIX, "");
}

function* visitorRecords(text: string): Generator<ImportRecord> {
	for (const row of parseCsv(text)) {
		if (!row.date) {
			continue;
		}
		yield {
			grain: "rollup",
			date: row.date,
			dimension: null,
			metrics: {
				visitors: csvNumber(row.visitors),
				visits: csvNumber(row.visits),
				pageviews: csvNumber(row.pageviews),
				bounces: csvNumber(row.bounces),
				durationSeconds: csvNumber(row.visit_duration),
			},
		};
	}
}

function* pageRecords(text: string): Generator<ImportRecord> {
	for (const row of parseCsv(text)) {
		if (!(row.date && row.page)) {
			continue;
		}
		yield {
			grain: "rollup",
			date: row.date,
			dimension: {
				kind: "page",
				value: row.page,
				hostname: row.hostname || undefined,
			},
			metrics: {
				pageviews: csvNumber(row.pageviews),
				visits: csvNumber(row.visits),
				visitors: csvNumber(row.visitors),
			},
		};
	}
}

function* dimensionRecords(
	text: string,
	kind: RollupDimensionKind,
	column: string
): Generator<ImportRecord> {
	for (const row of parseCsv(text)) {
		const value = row[column];
		if (!(row.date && value)) {
			continue;
		}
		yield {
			grain: "rollup",
			date: row.date,
			dimension: { kind, value },
			metrics: {
				visitors: csvNumber(row.visitors),
				visits: csvNumber(row.visits),
				pageviews: csvNumber(row.pageviews),
			},
		};
	}
}

export const plausibleProvider: ImportProvider = {
	id: "plausible",
	label: "Plausible",
	grain: "rollup",

	async detect(source) {
		for await (const entry of sourceEntries(source)) {
			if (tableNameOf(entry.name) === VISITORS_TABLE) {
				return true;
			}
		}
		return false;
	},

	async *parse(source: ImportSource, _context: ImportContext) {
		for await (const entry of sourceEntries(source)) {
			const table = tableNameOf(entry.name);
			if (table === VISITORS_TABLE) {
				yield* visitorRecords(await entry.text());
				continue;
			}
			if (table === PAGES_TABLE) {
				yield* pageRecords(await entry.text());
				continue;
			}
			const dimension = DIMENSION_TABLES[table];
			if (dimension) {
				yield* dimensionRecords(
					await entry.text(),
					dimension.kind,
					dimension.column
				);
			}
		}
	},
};
