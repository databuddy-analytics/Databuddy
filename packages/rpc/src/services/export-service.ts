import { chQuery } from "@databuddy/db/clickhouse";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import JSZip from "jszip";

dayjs.extend(utc);

export type ExportFormat = "csv" | "json" | "txt" | "proto";

type Event = Record<string, unknown> & {
	id: string;
	client_id: string;
	event_name: string;
	time: string;
};

type ErrorLog = Record<string, unknown> & {
	id: string;
	client_id: string;
	anonymous_id: string;
	session_id: string;
	timestamp: string;
	path: string;
	message: string;
	filename?: string;
	lineno?: number;
	colno?: number;
	stack?: string;
	error_type: string;
};

type WebVital = Record<string, unknown> & {
	id: string;
	client_id: string;
	anonymous_id: string;
	session_id: string;
	timestamp: string;
	path: string;
	metric_name: string;
	metric_value: number;
};

interface ExportData {
	errors: ErrorLog[];
	events: Event[];
	webVitals: WebVital[];
}

export interface ExportMetadata {
	counts: {
		events: number;
		errors: number;
		webVitals: number;
	};
	dateRange: { start: string; end: string };
	exportDate: string;
	fileSize: number;
	format: ExportFormat;
	totalRecords: number;
	websiteId: string;
}

export interface GenerateExportResult {
	buffer: Buffer;
	filename: string;
	meta: ExportMetadata;
}

export interface ValidatedExportDates {
	endDate?: string;
	startDate?: string;
}

export interface ValidateExportDateRangeResult {
	dates: ValidatedExportDates;
	error?: string;
}

const MAX_HISTORY_DAYS = 365 * 2;
const MAX_RANGE_DAYS = 365;
const DEFAULT_RANGE_DAYS = 30;
const MAX_ROWS_PER_TABLE = 1_000_000;
const EXPORT_CLICKHOUSE_SETTINGS = {
	max_execution_time: 60,
	max_memory_usage: 2_000_000_000,
	max_rows_to_read: 200_000_000,
	max_bytes_to_read: 20_000_000_000,
	read_overflow_mode: "throw",
	use_query_cache: 0,
} as const;

function parseDate(
	value: string,
	now: dayjs.Dayjs,
	label: "Start" | "End"
):
	| { date: dayjs.Dayjs; error?: undefined }
	| { date?: undefined; error: string } {
	const parsed = dayjs.utc(value, "YYYY-MM-DD", true);
	if (!parsed.isValid()) {
		return {
			error: `Invalid ${label.toLowerCase()} date format. Use YYYY-MM-DD.`,
		};
	}
	if (parsed.isAfter(now)) {
		return { error: `${label} date cannot be in the future.` };
	}
	if (parsed.isBefore(now.subtract(MAX_HISTORY_DAYS, "day"))) {
		return {
			error: `${label} date cannot be more than ${MAX_HISTORY_DAYS} days ago.`,
		};
	}
	return { date: parsed };
}

/**
 * Validates and sanitizes export date inputs. When dates are missing the
 * range defaults to the last DEFAULT_RANGE_DAYS days to bound the export.
 */
export function validateExportDateRange(
	startDate?: string,
	endDate?: string
): ValidateExportDateRangeResult {
	const now = dayjs.utc();

	if (!(startDate || endDate)) {
		return {
			dates: {
				startDate: now.subtract(DEFAULT_RANGE_DAYS, "day").format("YYYY-MM-DD"),
				endDate: now.format("YYYY-MM-DD"),
			},
		};
	}

	let parsedStart: dayjs.Dayjs | undefined;
	let parsedEnd: dayjs.Dayjs | undefined;

	if (startDate) {
		const result = parseDate(startDate, now, "Start");
		if (result.error) {
			return { dates: {}, error: result.error };
		}
		parsedStart = result.date;
	}

	if (endDate) {
		const result = parseDate(endDate, now, "End");
		if (result.error) {
			return { dates: {}, error: result.error };
		}
		parsedEnd = result.date;
	}

	if (parsedStart && parsedEnd) {
		if (parsedStart.isAfter(parsedEnd)) {
			return {
				dates: {},
				error: "Start date must be before or equal to end date.",
			};
		}
		if (parsedEnd.diff(parsedStart, "day") > MAX_RANGE_DAYS) {
			return {
				dates: {},
				error: `Date range cannot exceed ${MAX_RANGE_DAYS} days.`,
			};
		}
	}

	return {
		dates: {
			startDate: parsedStart?.format("YYYY-MM-DD"),
			endDate: parsedEnd?.format("YYYY-MM-DD"),
		},
	};
}

/**
 * Main service to handle data export
 */
export async function generateExport(
	websiteId: string,
	format: ExportFormat = "json",
	startDate?: string,
	endDate?: string
): Promise<GenerateExportResult> {
	const data = await fetchExportData(websiteId, startDate, endDate);

	const zip = new JSZip();
	const extension = getFileExtension(format);

	zip.file(`events.${extension}`, formatData(data.events, format, "Event"));
	zip.file(`errors.${extension}`, formatData(data.errors, format, "Error"));
	zip.file(
		`web_vitals.${extension}`,
		formatData(data.webVitals, format, "WebVital")
	);

	const counts = {
		events: data.events.length,
		errors: data.errors.length,
		webVitals: data.webVitals.length,
	};

	const totalRecords = counts.events + counts.errors + counts.webVitals;
	const metadataPayload = {
		export_date: new Date().toISOString(),
		website_id: websiteId,
		date_range: {
			start: startDate || "all_time",
			end: endDate || "all_time",
		},
		format,
		counts: {
			events: counts.events,
			errors: counts.errors,
			web_vitals: counts.webVitals,
		},
	};

	zip.file("metadata.json", JSON.stringify(metadataPayload, null, 2));

	const buffer = await zip.generateAsync({ type: "nodebuffer" });
	const filename = `databuddy_export_${websiteId}_${dayjs().format(
		"YYYY-MM-DD"
	)}.zip`;

	const meta: ExportMetadata = {
		websiteId,
		format,
		exportDate: metadataPayload.export_date,
		dateRange: {
			start: metadataPayload.date_range.start,
			end: metadataPayload.date_range.end,
		},
		counts,
		totalRecords,
		fileSize: buffer.length,
	};

	return { filename, buffer, meta };
}

// --- Data Fetching ---

async function fetchExportData(
	websiteId: string,
	startDate?: string,
	endDate?: string
): Promise<ExportData> {
	const eventsFilter = buildDateFilter(startDate, endDate, "time");
	const errorsFilter = buildDateFilter(startDate, endDate, "timestamp");
	const webVitalsFilter = buildDateFilter(startDate, endDate, "timestamp");

	const queryParams = { websiteId, ...eventsFilter.params };

	const chOptions = { clickhouse_settings: EXPORT_CLICKHOUSE_SETTINGS };
	const [events, errors, webVitals] = await Promise.all([
		chQuery<Event>(getEventsQuery(eventsFilter.filter), queryParams, chOptions),
		chQuery<ErrorLog>(
			getErrorsQuery(errorsFilter.filter),
			queryParams,
			chOptions
		),
		chQuery<WebVital>(
			getWebVitalsQuery(webVitalsFilter.filter),
			queryParams,
			chOptions
		),
	]);

	return {
		events,
		errors: errors.map((error) => ({
			...error,
			id: `${error.client_id}_${error.timestamp}_${error.session_id}`,
		})),
		webVitals: webVitals.map((vital) => ({
			...vital,
			id: `${vital.client_id}_${vital.timestamp}_${vital.session_id}`,
			name: vital.metric_name,
			value: vital.metric_value,
		})),
	};
}

function buildDateFilter(
	startDate?: string,
	endDate?: string,
	dateColumn = "time"
): { filter: string; params: Record<string, string> } {
	const params: Record<string, string> = {};
	const conditions: string[] = [];

	if (startDate) {
		params.startDate = startDate;
		conditions.push(`${dateColumn} >= {startDate:String}`);
	}

	if (endDate) {
		params.endDate = endDate;
		conditions.push(`${dateColumn} <= {endDate:String}`);
	}

	const filter = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";
	return { filter, params };
}

function getEventsQuery(dateFilter: string): string {
	return `
		SELECT * EXCEPT(ip, user_agent)
		FROM analytics.events
		WHERE client_id = {websiteId:String} ${dateFilter}
		ORDER BY time DESC
		LIMIT ${MAX_ROWS_PER_TABLE}
	`;
}

function getErrorsQuery(dateFilter: string): string {
	return `
		SELECT
			client_id,
			anonymous_id,
			session_id,
			timestamp,
			path,
			message,
			filename,
			lineno,
			colno,
			stack,
			error_type
		FROM analytics.error_spans
		WHERE client_id = {websiteId:String} ${dateFilter}
		ORDER BY timestamp DESC
		LIMIT ${MAX_ROWS_PER_TABLE}
	`;
}

function getWebVitalsQuery(dateFilter: string): string {
	return `
		SELECT
			client_id,
			anonymous_id,
			session_id,
			timestamp,
			path,
			metric_name,
			metric_value
		FROM analytics.web_vitals_spans
		WHERE client_id = {websiteId:String} ${dateFilter}
		ORDER BY timestamp DESC
		LIMIT ${MAX_ROWS_PER_TABLE}
	`;
}

// --- Formatting ---

function getFileExtension(format: ExportFormat): string {
	switch (format) {
		case "csv":
			return "csv";
		case "txt":
			return "txt";
		case "proto":
			return "proto.txt";
		default:
			return "json";
	}
}

function formatData<T extends Record<string, unknown>>(
	data: T[],
	format: ExportFormat,
	typeName: string
): string {
	if (data.length === 0) {
		return "";
	}

	switch (format) {
		case "csv":
			return convertToCSV(data);
		case "txt":
			return convertToTXT(data);
		case "proto":
			return convertToProto(data, typeName);
		default:
			return JSON.stringify(data, null, 2);
	}
}

const FORMULA_PREFIX_PATTERN = /^[\s ]*[=+\-@\t\r]/;

function neutralizeFormula(str: string): string {
	return FORMULA_PREFIX_PATTERN.test(str) ? `'${str}` : str;
}

function convertToCSV<T extends Record<string, unknown>>(data: T[]): string {
	const headers = Object.keys(data[0] || {}).join(",");
	const rows = data
		.map((row) =>
			Object.values(row)
				.map((value) => {
					if (value === null || value === undefined) {
						return "";
					}
					const str = neutralizeFormula(String(value));
					if (str.includes(",") || str.includes('"') || str.includes("\n")) {
						return `"${str.replace(/"/g, '""')}"`;
					}
					return str;
				})
				.join(",")
		)
		.join("\n");
	return `${headers}\n${rows}`;
}

function convertToTXT<T extends Record<string, unknown>>(data: T[]): string {
	const headers = Object.keys(data[0] || {}).join("\t");
	const rows = data
		.map((row) =>
			Object.values(row)
				.map((v) =>
					v == null
						? ""
						: neutralizeFormula(String(v).replace(/[\t\n\r]/g, " "))
				)
				.join("\t")
		)
		.join("\n");
	return `${headers}\n${rows}`;
}

function convertToProto<T extends Record<string, unknown>>(
	data: T[],
	typeName: string
): string {
	let content = `# Protocol Buffer Text Format\n# Type: ${typeName}\n\n`;
	for (const row of data) {
		content += `${typeName} {\n`;
		for (const [key, value] of Object.entries(row)) {
			if (value != null) {
				const field = key.toLowerCase().replace(/[^a-z0-9_]/g, "_");
				if (typeof value === "string") {
					const escaped = value
						.replace(/\\/g, "\\\\")
						.replace(/"/g, '\\"')
						.replace(/\n/g, "\\n");
					content += `  ${field}: "${escaped}"\n`;
				} else {
					content += `  ${field}: ${value}\n`;
				}
			}
		}
		content += "}\n";
	}
	return content;
}
