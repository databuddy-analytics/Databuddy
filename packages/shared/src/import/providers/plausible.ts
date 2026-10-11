import {
	csvNumber,
	type ImportContext,
	type ImportEntry,
	ImportFileError,
	type ImportFormat,
	type ImportProvider,
	type ImportRecord,
	type ImportSource,
	parseCsv,
	type RollupDimensionKind,
} from "../records";

const VISITORS_TABLE = "imported_visitors";
const PAGES_TABLE = "imported_pages";
const SOURCES_TABLE = "imported_sources";
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const DIRECT_LABEL = "Direct / None";
const UTM_COLUMNS = [
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"utm_term",
	"utm_content",
] as const satisfies readonly RollupDimensionKind[];
const DATE_RANGE_SUFFIX = /_\d{8}_\d{8}\.csv$/;
const CSV_SUFFIX = /\.csv$/;
const DAY_MS = 86_400_000;

const DATA_EXPORT: ImportFormat = { label: "Plausible data export" };
const DASHBOARD_LABEL = "Plausible dashboard download";
const DASHBOARD_VISITORS = "visitors";
const DASHBOARD_BREAKDOWNS: Record<
	string,
	{
		kind: RollupDimensionKind;
		partial?: boolean;
		value?: (name: string) => string | null;
		weight: "pageviews" | "visitors";
	}
> = {
	pages: { kind: "page", weight: "pageviews" },
	referrers: {
		kind: "source",
		partial: true,
		value: referrerUrl,
		weight: "visitors",
	},
	countries: { kind: "country", weight: "visitors" },
	devices: { kind: "device", weight: "visitors" },
	browsers: { kind: "browser", weight: "visitors" },
	operating_systems: { kind: "os", weight: "visitors" },
	utm_sources: { kind: "utm_source", partial: true, weight: "visitors" },
	utm_mediums: { kind: "utm_medium", partial: true, weight: "visitors" },
	utm_campaigns: { kind: "utm_campaign", partial: true, weight: "visitors" },
	utm_terms: { kind: "utm_term", partial: true, weight: "visitors" },
	utm_contents: { kind: "utm_content", partial: true, weight: "visitors" },
};
const SPREAD_NOTE =
	"Daily totals are exact. Plausible's dashboard download has no per-day breakdowns, so pages, sources, countries, browsers and devices are spread across days in proportion to each day's pageviews. For exact daily breakdowns, export from Site Settings → Imports & Exports → Export data in Plausible.";
const GROUPED_INTERVAL =
	"This Plausible download is grouped by week or month, so it has no daily totals. In Plausible, set the graph interval to days before downloading, or export your full history from Site Settings → Imports & Exports → Export data.";

const DIMENSION_TABLES: Record<
	string,
	{ kind: RollupDimensionKind; column: string }
> = {
	imported_entry_pages: { kind: "entry_page", column: "entry_page" },
	imported_exit_pages: { kind: "exit_page", column: "exit_page" },
	imported_browsers: { kind: "browser", column: "browser" },
	imported_devices: { kind: "device", column: "device" },
	imported_operating_systems: { kind: "os", column: "operating_system" },
	imported_locations: { kind: "country", column: "country" },
	imported_custom_events: { kind: "custom_event", column: "name" },
};

function referrerUrl(referrer: string): string | null {
	const value = referrer.trim();
	if (!value || value === DIRECT_LABEL) {
		return null;
	}
	return URL_SCHEME.test(value) ? value : `https://${value}`;
}

function* sourceRecords(text: string): Generator<ImportRecord> {
	for (const row of parseCsv(text)) {
		if (!row.date) {
			continue;
		}
		const metrics = {
			visitors: csvNumber(row.visitors),
			visits: csvNumber(row.visits),
			pageviews: csvNumber(row.pageviews),
		};
		const referrer = referrerUrl(row.referrer ?? "");
		if (referrer) {
			yield {
				grain: "rollup",
				date: row.date,
				dimension: { kind: "source", value: referrer },
				metrics,
			};
		}
		for (const kind of UTM_COLUMNS) {
			const value = row[kind];
			if (value) {
				yield {
					grain: "rollup",
					date: row.date,
					dimension: { kind, value },
					metrics,
				};
			}
		}
	}
}

function tableNameOf(entryName: string): string {
	const base = entryName.split("/").pop() ?? entryName;
	if (!base.endsWith(".csv")) {
		return "";
	}
	return base.replace(DATE_RANGE_SUFFIX, "").replace(CSV_SUFFIX, "");
}

async function* sourceEntries(
	source: ImportSource
): AsyncIterable<ImportEntry> {
	if (source.kind === "archive") {
		yield* source.entries();
		return;
	}
	if (source.kind === "file") {
		yield { name: source.name, text: () => source.text() };
	}
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

interface DashboardDay {
	bounces: number;
	date: string;
	durationSeconds: number;
	hourly: boolean;
	pageviews: number;
	visitors: number;
	visits: number;
}

function dashboardDays(text: string): DashboardDay[] | null {
	const rows = parseCsv(text);
	if (!(rows[0] && "date" in rows[0] && "bounce_rate" in rows[0])) {
		return null;
	}
	const days = new Map<string, DashboardDay>();
	for (const row of rows) {
		if (!row.date) {
			continue;
		}
		const date = row.date.slice(0, 10);
		const visits = csvNumber(row.visits);
		const day = days.get(date) ?? {
			date,
			hourly: row.date.length > 10,
			visitors: 0,
			visits: 0,
			pageviews: 0,
			bounces: 0,
			durationSeconds: 0,
		};
		day.visitors += csvNumber(row.visitors);
		day.visits += visits;
		day.pageviews += csvNumber(row.pageviews);
		day.bounces += Math.round((visits * csvNumber(row.bounce_rate)) / 100);
		day.durationSeconds += visits * csvNumber(row.visit_duration);
		days.set(date, day);
	}
	return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function trafficDays(days: DashboardDay[]): DashboardDay[] {
	return days.filter((day) => day.pageviews > 0);
}

function hasDailyGaps(days: DashboardDay[]): boolean {
	return days.some((day, index) => {
		const previous = days[index - 1];
		return (
			previous !== undefined &&
			!day.hourly &&
			Date.parse(day.date) - Date.parse(previous.date) > DAY_MS
		);
	});
}

function allocate(total: number, weights: number[]): number[] {
	const sum = weights.reduce((acc, weight) => acc + weight, 0);
	if (sum <= 0 || total <= 0) {
		return weights.map(() => 0);
	}
	const exact = weights.map((weight) => (weight * total) / sum);
	const floored = exact.reduce((acc, value) => acc + Math.floor(value), 0);
	const roundedUp = new Set(
		exact
			.map((value, index) => ({ index, remainder: value - Math.floor(value) }))
			.sort((a, b) => b.remainder - a.remainder)
			.slice(0, total - floored)
			.map(({ index }) => index)
	);
	return exact.map(
		(value, index) => Math.floor(value) + (roundedUp.has(index) ? 1 : 0)
	);
}

async function* dashboardRecords(
	source: ImportSource
): AsyncGenerator<ImportRecord> {
	let days: DashboardDay[] = [];
	const breakdowns: Array<{
		kind: RollupDimensionKind;
		partial: boolean;
		rows: Array<{ value: string; weight: number }>;
	}> = [];
	for await (const entry of sourceEntries(source)) {
		const table = tableNameOf(entry.name);
		if (table === DASHBOARD_VISITORS) {
			days = dashboardDays(await entry.text()) ?? [];
			continue;
		}
		const breakdown = DASHBOARD_BREAKDOWNS[table];
		if (breakdown) {
			breakdowns.push({
				kind: breakdown.kind,
				partial: breakdown.partial ?? false,
				rows: parseCsv(await entry.text()).flatMap((row) => {
					const value = row.name ? (breakdown.value ?? String)(row.name) : null;
					return value
						? [{ value, weight: csvNumber(row[breakdown.weight]) }]
						: [];
				}),
			});
		}
	}

	if (hasDailyGaps(days)) {
		throw new ImportFileError(GROUPED_INTERVAL);
	}
	days = trafficDays(days);

	const devices = breakdowns.find((breakdown) => breakdown.kind === "device");
	const onlyDay = days.length === 1 ? days[0] : undefined;

	const deviceVisitors =
		devices?.rows.reduce((acc, row) => acc + row.weight, 0) ?? 0;
	if (onlyDay?.hourly && deviceVisitors > 0) {
		onlyDay.visitors = Math.min(onlyDay.visitors, deviceVisitors);
	}
	const periodVisitors =
		deviceVisitors || days.reduce((acc, day) => acc + day.visitors, 0);
	for (const day of days) {
		yield {
			grain: "rollup",
			date: day.date,
			dimension: null,
			metrics: {
				visitors: day.visitors,
				visits: day.visits,
				pageviews: day.pageviews,
				bounces: day.bounces,
				durationSeconds: day.durationSeconds,
			},
		};
		for (const { kind, partial, rows } of breakdowns) {
			const weights = rows.map((row) => row.weight);
			const listed = weights.reduce((acc, weight) => acc + weight, 0);
			const unlisted = partial ? Math.max(0, periodVisitors - listed) : 0;
			const shares = allocate(day.pageviews, [...weights, unlisted]);
			for (const [index, row] of rows.entries()) {
				const pageviews = shares[index] ?? 0;
				if (pageviews > 0) {
					yield {
						grain: "rollup",
						date: day.date,
						dimension: { kind, value: row.value },
						metrics: { pageviews },
					};
				}
			}
		}
	}
}

export const plausibleProvider: ImportProvider = {
	id: "plausible",
	label: "Plausible",
	grain: "rollup",
	exportHelp:
		"In Plausible, open Site Settings → Imports & Exports → Export data for your full history. A dashboard Download CSV works too.",

	async detect(source) {
		let dashboard: DashboardDay[] | null = null;
		for await (const entry of sourceEntries(source)) {
			const table = tableNameOf(entry.name);
			if (table === VISITORS_TABLE) {
				return DATA_EXPORT;
			}
			if (table === DASHBOARD_VISITORS) {
				dashboard = dashboardDays(await entry.text());
			}
		}
		if (!dashboard) {
			return null;
		}
		return {
			label: DASHBOARD_LABEL,
			note: trafficDays(dashboard).length > 1 ? SPREAD_NOTE : undefined,
		};
	},

	async *parse(source: ImportSource, _context: ImportContext) {
		if ((await plausibleProvider.detect(source))?.label === DASHBOARD_LABEL) {
			yield* dashboardRecords(source);
			return;
		}
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
			if (table === SOURCES_TABLE) {
				yield* sourceRecords(await entry.text());
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
