export const PAGEVIEW_EVENT_NAME = "screen_view";
export const PAGE_EXIT_EVENT_NAME = "page_exit";

export const MAX_BATCH_RECORDS = 10_000;
export const MAX_BATCH_PAGEVIEWS = 100_000;

const SECONDS_PER_DAY = 86_400;
const WWW_PREFIX = /^www\./;

type ImportGrain = "event" | "rollup";

export type RollupDimensionKind =
	| "page"
	| "entry_page"
	| "exit_page"
	| "source"
	| "country"
	| "browser"
	| "os"
	| "device"
	| "custom_event"
	| "utm_source"
	| "utm_medium"
	| "utm_campaign"
	| "utm_term"
	| "utm_content";

export type RollupMetric =
	| "visitors"
	| "visits"
	| "pageviews"
	| "bounces"
	| "durationSeconds";

interface RollupDimension {
	hostname?: string;
	kind: RollupDimensionKind;
	value: string;
}

interface ImportedRollup {
	date: string;
	dimension: RollupDimension | null;
	metrics: Partial<Record<RollupMetric, number>>;
}

export interface ImportedEvent {
	browserName?: string | null;
	city?: string | null;
	country?: string | null;
	deviceType?: string | null;
	eventName: typeof PAGEVIEW_EVENT_NAME | typeof PAGE_EXIT_EVENT_NAME;
	hostname?: string;
	language?: string | null;
	osName?: string | null;
	path: string;
	referrer?: string | null;
	region?: string | null;
	sessionKey: string;
	time: Date;
	timeOnPage?: number | null;
	utmCampaign?: string | null;
	utmContent?: string | null;
	utmMedium?: string | null;
	utmSource?: string | null;
	utmTerm?: string | null;
	visitorKey: string;
}

export type ImportRecord =
	| ({ grain: "event" } & ImportedEvent)
	| ({ grain: "rollup" } & ImportedRollup);

export interface ImportEntry {
	name: string;
	text(): Promise<string>;
}

export type ImportSource =
	| { kind: "archive"; entries(): AsyncIterable<ImportEntry> }
	| { kind: "file"; name: string; text(): Promise<string> };

export interface ImportContext {
	domain: string;
	runId: string;
	timezone: string;
	websiteId: string;
}

export interface ImportFormat {
	label: string;
	note?: string;
}

export interface ImportProvider {
	detect(source: ImportSource): Promise<ImportFormat | null>;
	exportHelp: string;
	grain: ImportGrain;
	id: string;
	label: string;
	parse(
		source: ImportSource,
		context: ImportContext
	): AsyncIterable<ImportRecord>;
}

export function parseCsv(text: string): Record<string, string>[] {
	const rows: string[][] = [];
	let field = "";
	let row: string[] = [];
	let quoted = false;

	for (let i = 0; i < text.length; i += 1) {
		const char = text[i];

		if (quoted) {
			if (char !== '"') {
				field += char;
				continue;
			}
			if (text[i + 1] === '"') {
				field += '"';
				i += 1;
				continue;
			}
			quoted = false;
			continue;
		}

		if (char === '"') {
			quoted = true;
			continue;
		}
		if (char === ",") {
			row.push(field);
			field = "";
			continue;
		}
		if (char === "\r") {
			continue;
		}
		if (char === "\n") {
			row.push(field);
			rows.push(row);
			field = "";
			row = [];
			continue;
		}
		field += char;
	}

	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}

	const header = (rows.shift() ?? []).map((name) => name.trim());
	return rows
		.filter((entry) => entry.some((value) => value.length > 0))
		.map((entry) =>
			Object.fromEntries(
				header.map((name, index) => [name, entry[index] ?? ""])
			)
		);
}

export function csvNumber(value: string | undefined): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function offsetMs(at: Date, timeZone: string): number {
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hour12: false,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	const parts = formatter.formatToParts(at);
	const part = (type: string) =>
		Number(parts.find((entry) => entry.type === type)?.value ?? "0");
	const asUtc = Date.UTC(
		part("year"),
		part("month") - 1,
		part("day"),
		part("hour") % 24,
		part("minute"),
		part("second")
	);
	return asUtc - at.getTime();
}

export function timeZoneOffsetMs(at: Date, timeZone: string): number {
	try {
		return offsetMs(at, timeZone);
	} catch {
		return 0;
	}
}

export function endOfLocalDay(at: Date, timeZone: string): Date {
	const dayMs = SECONDS_PER_DAY * 1000;
	const offset = timeZoneOffsetMs(at, timeZone);
	const local = at.getTime() + offset;
	return new Date(Math.floor(local / dayMs) * dayMs + dayMs - 1 - offset);
}

export function isSameSite(
	hostname: string | undefined,
	domain: string
): boolean {
	if (!hostname) {
		return true;
	}
	const host = hostname.toLowerCase().replace(WWW_PREFIX, "");
	const site = domain.toLowerCase().replace(WWW_PREFIX, "");
	return host === site || host.endsWith(`.${site}`);
}

export function allocate(total: number, weights: number[]): number[] {
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

export class ImportFileError extends Error {}

export class UnrecognizedImportFileError extends ImportFileError {}

export function rollupPageviews(records: ImportRecord[]): number {
	let pageviews = 0;
	for (const record of records) {
		if (record.grain === "rollup" && record.dimension?.kind === "page") {
			pageviews += record.metrics.pageviews ?? 0;
		}
	}
	return pageviews;
}

export function batchImportRecords(records: ImportRecord[]): ImportRecord[][] {
	const batches: ImportRecord[][] = [];
	const events: ImportRecord[] = [];
	const days = new Map<string, ImportRecord[]>();
	for (const record of records) {
		if (record.grain === "event") {
			events.push(record);
			continue;
		}
		const day = days.get(record.date) ?? [];
		day.push(record);
		days.set(record.date, day);
	}

	for (let start = 0; start < events.length; start += MAX_BATCH_RECORDS) {
		batches.push(events.slice(start, start + MAX_BATCH_RECORDS));
	}

	let batch: ImportRecord[] = [];
	let batchPageviews = 0;
	for (const [date, day] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
		const pageviews = rollupPageviews(day);
		if (day.length > MAX_BATCH_RECORDS || pageviews > MAX_BATCH_PAGEVIEWS) {
			throw new ImportFileError(
				`${date} has more data than one import can hold (${MAX_BATCH_PAGEVIEWS.toLocaleString("en-US")} pageviews or ${MAX_BATCH_RECORDS.toLocaleString("en-US")} rows a day). Contact support to import this export.`
			);
		}
		if (
			batch.length + day.length > MAX_BATCH_RECORDS ||
			batchPageviews + pageviews > MAX_BATCH_PAGEVIEWS
		) {
			batches.push(batch);
			batch = [];
			batchPageviews = 0;
		}
		batch.push(...day);
		batchPageviews += pageviews;
	}
	if (batch.length > 0) {
		batches.push(batch);
	}
	return batches;
}
