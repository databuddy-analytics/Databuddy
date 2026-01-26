/**
 * ClickHouse Analytics Schema Definitions
 * Used by both frontend (query builder UI) and backend (SQL validation)
 *
 * NOTE: This only exposes user-facing columns. Internal columns like
 * id, client_id, anonymous_id, session_id, ip, user_agent are handled
 * automatically by the query builder and not exposed to users.
 */

export type ColumnType = "string" | "number" | "datetime" | "boolean" | "array";

export interface TableColumn {
	name: string;
	type: ColumnType;
	nullable: boolean;
	label: string;
	description?: string;
	/** Can use SUM, AVG, MAX, MIN on this field */
	aggregatable: boolean;
	/** Can use in WHERE clause */
	filterable: boolean;
}

export interface TableDefinition {
	name: string;
	database: "analytics" | "uptime" | "observability";
	label: string;
	description: string;
	columns: TableColumn[];
	/** Field used for date range filtering */
	primaryTimeField: string;
	/** Field used for website scoping */
	clientIdField: string;
}

// Helper to create columns with common defaults
function col(
	name: string,
	type: ColumnType,
	label: string,
	options?: Partial<
		Pick<
			TableColumn,
			"nullable" | "description" | "aggregatable" | "filterable"
		>
	>
): TableColumn {
	return {
		name,
		type,
		label,
		nullable: options?.nullable ?? false,
		description: options?.description,
		aggregatable: options?.aggregatable ?? type === "number",
		filterable: options?.filterable ?? true,
	};
}

/**
 * Events table - main analytics data
 */
const EVENTS_TABLE: TableDefinition = {
	name: "events",
	database: "analytics",
	label: "Events",
	description: "Page views, sessions, and user interactions",
	primaryTimeField: "time",
	clientIdField: "client_id",
	columns: [
		// Core event data
		col("event_name", "string", "Event Name", {
			description: "Type of event (screen_view, etc.)",
		}),
		col("referrer", "string", "Referrer", { nullable: true }),
		col("path", "string", "Path"),
		col("title", "string", "Page Title", { nullable: true }),

		// Browser & device
		col("browser_name", "string", "Browser", { nullable: true }),
		col("os_name", "string", "Operating System", { nullable: true }),
		col("device_type", "string", "Device Type", {
			nullable: true,
			description: "desktop, mobile, tablet",
		}),

		// Location
		col("country", "string", "Country", { nullable: true }),
		col("region", "string", "Region", { nullable: true }),
		col("city", "string", "City", { nullable: true }),

		// User preferences
		col("language", "string", "Language", { nullable: true }),

		// Engagement metrics
		col("time_on_page", "number", "Time on Page (s)", { nullable: true }),
		col("scroll_depth", "number", "Scroll Depth (%)", { nullable: true }),
		col("page_count", "number", "Page Count"),

		// UTM tracking
		col("utm_source", "string", "UTM Source", { nullable: true }),
		col("utm_medium", "string", "UTM Medium", { nullable: true }),
		col("utm_campaign", "string", "UTM Campaign", { nullable: true }),

		// Performance
		col("load_time", "number", "Load Time (ms)", { nullable: true }),
		col("ttfb", "number", "Time to First Byte (ms)", { nullable: true }),
	],
};

/**
 * Error spans table - JavaScript errors
 */
const ERROR_SPANS_TABLE: TableDefinition = {
	name: "error_spans",
	database: "analytics",
	label: "Errors",
	description: "JavaScript errors and exceptions",
	primaryTimeField: "timestamp",
	clientIdField: "client_id",
	columns: [
		col("path", "string", "Path"),
		col("message", "string", "Error Message"),
		col("error_type", "string", "Error Type"),
		col("filename", "string", "Filename", { nullable: true }),
	],
};

/**
 * Web Vitals spans table - performance metrics
 */
const WEB_VITALS_SPANS_TABLE: TableDefinition = {
	name: "web_vitals_spans",
	database: "analytics",
	label: "Web Vitals",
	description: "Core Web Vitals performance metrics",
	primaryTimeField: "timestamp",
	clientIdField: "client_id",
	columns: [
		col("path", "string", "Path"),
		col("metric_name", "string", "Metric Name", {
			description: "FCP, LCP, CLS, INP, TTFB",
		}),
		col("metric_value", "number", "Metric Value"),
	],
};

/**
 * Custom event spans table - user-defined events
 */
const CUSTOM_EVENT_SPANS_TABLE: TableDefinition = {
	name: "custom_event_spans",
	database: "analytics",
	label: "Custom Events",
	description: "User-defined custom events",
	primaryTimeField: "timestamp",
	clientIdField: "client_id",
	columns: [
		col("path", "string", "Path"),
		col("event_name", "string", "Event Name"),
	],
};

/**
 * Outgoing links table - external link clicks
 */
const OUTGOING_LINKS_TABLE: TableDefinition = {
	name: "outgoing_links",
	database: "analytics",
	label: "Outgoing Links",
	description: "External link clicks",
	primaryTimeField: "timestamp",
	clientIdField: "client_id",
	columns: [
		col("href", "string", "Link URL"),
		col("text", "string", "Link Text", { nullable: true }),
	],
};

/**
 * All analytics tables available for custom queries
 */
export const ANALYTICS_TABLES: TableDefinition[] = [
	EVENTS_TABLE,
	ERROR_SPANS_TABLE,
	WEB_VITALS_SPANS_TABLE,
	CUSTOM_EVENT_SPANS_TABLE,
	OUTGOING_LINKS_TABLE,
];

function containsSqlInjectionChars(str: string): boolean {
	for (let i = 0; i < str.length; i += 1) {
		const code = str.charCodeAt(i);
		if (
			code === 0x3b || // ;
			code === 0x27 || // '
			code === 0x22 || // "
			code === 0x5c || // \
			code === 0x60 || // `
			(code >= 0x00 && code <= 0x1f) || // control chars
			(code >= 0x7f && code <= 0x9f) // extended control chars
		) {
			return true;
		}
	}
	return false;
}

const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/u;

/**
 * Get a table definition by name
 */
export function getTableDefinition(
	tableName: string
): TableDefinition | undefined {
	return ANALYTICS_TABLES.find((t) => t.name === tableName);
}

/**
 * Get a column definition from a table
 */
export function getColumnDefinition(
	tableName: string,
	columnName: string
): TableColumn | undefined {
	const table = getTableDefinition(tableName);
	return table?.columns.find((c) => c.name === columnName);
}

/**
 * Validate that a string is a safe identifier (no SQL injection patterns)
 */
function isValidIdentifier(value: unknown): value is string {
	if (typeof value !== "string") {
		return false;
	}
	if (value.length === 0 || value.length > 128) {
		return false;
	}
	if (containsSqlInjectionChars(value)) {
		return false;
	}
	return IDENTIFIER_PATTERN.test(value);
}

/**
 * Validate that a table name is allowed
 */
export function isValidTable(tableName: unknown): boolean {
	if (!isValidIdentifier(tableName)) {
		return false;
	}
	return ANALYTICS_TABLES.some((t) => t.name === tableName);
}

/**
 * Validate that a column exists in a table
 */
export function isValidColumn(
	tableName: unknown,
	columnName: unknown
): boolean {
	if (!isValidIdentifier(tableName)) {
		return false;
	}
	if (!isValidIdentifier(columnName)) {
		return false;
	}
	const table = getTableDefinition(tableName);
	return table?.columns.some((c) => c.name === columnName) ?? false;
}

/**
 * Get filterable columns for a table
 */
export function getFilterableColumns(tableName: string): TableColumn[] {
	const table = getTableDefinition(tableName);
	return table?.columns.filter((c) => c.filterable) ?? [];
}

/**
 * Get aggregatable columns for a table
 */
export function getAggregatableColumns(tableName: string): TableColumn[] {
	const table = getTableDefinition(tableName);
	return table?.columns.filter((c) => c.aggregatable) ?? [];
}
