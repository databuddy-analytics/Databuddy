import { chQuery } from "@databuddy/db";
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
    timestamp: string;
    message: string;
};

type WebVital = Record<string, unknown> & {
    id: string;
    client_id: string;
    timestamp: string;
    name: string;
    value: number;
};

type ExportData = {
    events: Event[];
    errors: ErrorLog[];
    webVitals: WebVital[];
};

export type ExportMetadata = {
    websiteId: string;
    format: ExportFormat;
    exportDate: string;
    dateRange: { start: string; end: string };
    counts: {
        events: number;
        errors: number;
        webVitals: number;
    };
    totalRecords: number;
    fileSize: number;
};

export type GenerateExportResult = {
    filename: string;
    buffer: Buffer;
    meta: ExportMetadata;
};

export type ValidatedExportDates = {
    startDate?: string;
    endDate?: string;
};

export type ValidateExportDateRangeResult = {
    dates: ValidatedExportDates;
    error?: string;
};

const MAX_HISTORY_DAYS = 365 * 2;
const MAX_RANGE_DAYS = 365;

/**
 * Validates and sanitizes export date inputs.
 */
export function validateExportDateRange(
    startDate?: string,
    endDate?: string
): ValidateExportDateRangeResult {
    const now = dayjs.utc();

    if (!(startDate || endDate)) {
        return { dates: {} };
    }

    let normalizedStart: string | undefined;
    let normalizedEnd: string | undefined;

    if (startDate) {
        const parsedStart = dayjs.utc(startDate, "YYYY-MM-DD", true);

        if (!parsedStart.isValid()) {
            return {
                dates: {},
                error: "Invalid start date format. Use YYYY-MM-DD.",
            };
        }

        if (parsedStart.isAfter(now)) {
            return {
                dates: {},
                error: "Start date cannot be in the future.",
            };
        }

        if (parsedStart.isBefore(now.subtract(MAX_HISTORY_DAYS, "day"))) {
            return {
                dates: {},
                error: `Start date cannot be more than ${MAX_HISTORY_DAYS} days ago.`,
            };
        }

        normalizedStart = parsedStart.format("YYYY-MM-DD");
    }

    if (endDate) {
        const parsedEnd = dayjs.utc(endDate, "YYYY-MM-DD", true);

        if (!parsedEnd.isValid()) {
            return {
                dates: {},
                error: "Invalid end date format. Use YYYY-MM-DD.",
            };
        }

        if (parsedEnd.isAfter(now)) {
            return {
                dates: {},
                error: "End date cannot be in the future.",
            };
        }

        if (parsedEnd.isBefore(now.subtract(MAX_HISTORY_DAYS, "day"))) {
            return {
                dates: {},
                error: `End date cannot be more than ${MAX_HISTORY_DAYS} days ago.`,
            };
        }

        normalizedEnd = parsedEnd.format("YYYY-MM-DD");
    }

    if (normalizedStart && normalizedEnd) {
        const start = dayjs.utc(normalizedStart);
        const end = dayjs.utc(normalizedEnd);

        if (start.isAfter(end)) {
            return {
                dates: {},
                error: "Start date must be before or equal to end date.",
            };
        }

        const rangeDays = end.diff(start, "day");
        if (rangeDays > MAX_RANGE_DAYS) {
            return {
                dates: {},
                error: `Date range cannot exceed ${MAX_RANGE_DAYS} days.`,
            };
        }
    }

    return {
        dates: {
            startDate: normalizedStart,
            endDate: normalizedEnd,
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
    const { filter, params } = buildDateFilter(startDate, endDate);
    const queryParams = { websiteId, ...params };

    const [events, errors, webVitals] = await Promise.all([
        chQuery<Event>(getEventsQuery(filter), queryParams),
        chQuery<ErrorLog>(getErrorsQuery(filter), queryParams),
        chQuery<WebVital>(getWebVitalsQuery(filter), queryParams),
    ]);

    return { events, errors, webVitals };
}

function buildDateFilter(
    startDate?: string,
    endDate?: string
): { filter: string; params: Record<string, string> } {
    const params: Record<string, string> = {};
    const conditions: string[] = [];

    if (startDate) {
        params.startDate = startDate;
        conditions.push("time >= {startDate:String}");
    }

    if (endDate) {
        params.endDate = endDate;
        conditions.push("time <= {endDate:String}");
    }

    const filter =
        conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";
    return { filter, params };
}

function getEventsQuery(dateFilter: string): string {
    return `
		SELECT * EXCEPT(ip, user_agent)
		FROM analytics.events 
		WHERE client_id = {websiteId:String} ${dateFilter}
		ORDER BY time DESC
		LIMIT 100000
	`;
}

function getErrorsQuery(dateFilter: string): string {
    const errorDateFilter = dateFilter.replace(/\btime\b/g, "timestamp");
    return `
		SELECT * EXCEPT(ip, user_agent)
		FROM analytics.errors 
		WHERE client_id = {websiteId:String} ${errorDateFilter}
		ORDER BY timestamp DESC
		LIMIT 50000
	`;
}

function getWebVitalsQuery(dateFilter: string): string {
    const vitalsDateFilter = dateFilter.replace(/\btime\b/g, "timestamp");
    return `
		SELECT * EXCEPT(ip, user_agent)
		FROM analytics.web_vitals 
		WHERE client_id = {websiteId:String} ${vitalsDateFilter}
		ORDER BY timestamp DESC
		LIMIT 25000
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

function convertToCSV<T extends Record<string, unknown>>(data: T[]): string {
    const headers = Object.keys(data[0] || {}).join(",");
    const rows = data
        .map((row) =>
            Object.values(row)
                .map((value) => {
                    if (value === null || value === undefined) {
                        return "";
                    }
                    const str = String(value);
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
                .map((v) => (v == null ? "" : String(v).replace(/[\t\n\r]/g, " ")))
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
                    content += `  ${field}: "${value.replace(/"/g, '\\"').replace(/\n/g, "\\n")}"\n`;
                } else {
                    content += `  ${field}: ${value}\n`;
                }
            }
        }
        content += "}\n";
    }
    return content;
}

