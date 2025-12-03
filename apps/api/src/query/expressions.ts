/**
 * Type-safe Expression Registry for SQL query building
 * Provides reusable SQL expressions, aggregate functions, and time bucketing utilities
 */

import type { TimeUnit } from "./types";

// ============================================================================
// Core Types
// ============================================================================

/** Supported aggregate functions in ClickHouse */
export type AggregateFn =
	| "count"
	| "countIf"
	| "sum"
	| "sumIf"
	| "avg"
	| "avgIf"
	| "uniq"
	| "uniqIf"
	| "median"
	| "medianIf"
	| "min"
	| "minIf"
	| "max"
	| "maxIf"
	| "any"
	| "argMin"
	| "argMax"
	| "groupArray"
	| "quantile"
	| "quantileIf";

/** Time granularity options */
export type Granularity = "minute" | "hour" | "day" | "week" | "month";

/** SQL expression that can be used as a field */
export type SqlExpression = string & { readonly __brand: "SqlExpression" };

/** Aliased SQL expression with output name */
export type AliasedExpression = {
	readonly expression: SqlExpression;
	readonly alias: string;
};

/** Field that can be used in SELECT clause */
export type SelectField = string | AliasedExpression;

// ============================================================================
// Expression Builders
// ============================================================================

/**
 * Creates a branded SQL expression for type safety
 */
function expr(sql: string): SqlExpression {
	return sql as SqlExpression;
}

/**
 * Creates an aliased expression
 */
function aliased(expression: string, alias: string): AliasedExpression {
	return {
		expression: expr(expression),
		alias,
	};
}

/**
 * Converts a SelectField to SQL string
 */
export function fieldToSql(field: SelectField): string {
	if (typeof field === "string") {
		return field;
	}
	return `${field.expression} as ${field.alias}`;
}

/**
 * Converts array of SelectFields to SQL string array
 */
export function fieldsToSql(fields: SelectField[]): string[] {
	return fields.map(fieldToSql);
}

// ============================================================================
// Aggregate Functions
// ============================================================================

type AggregateBuilder = {
	/** COUNT(*) or COUNT(column) */
	count: (column?: string) => SqlExpression;
	/** COUNT(*) with condition */
	countIf: (condition: string) => SqlExpression;
	/** COUNT(DISTINCT column) */
	uniq: (column: string) => SqlExpression;
	/** COUNT(DISTINCT column) with condition - returns null for non-matching rows */
	uniqIf: (column: string, condition: string) => SqlExpression;
	/** SUM(column) */
	sum: (column: string) => SqlExpression;
	/** SUM with condition */
	sumIf: (column: string, condition: string) => SqlExpression;
	/** AVG(column) */
	avg: (column: string) => SqlExpression;
	/** AVG with condition */
	avgIf: (column: string, condition: string) => SqlExpression;
	/** MEDIAN(column) */
	median: (column: string) => SqlExpression;
	/** MEDIAN with condition */
	medianIf: (column: string, condition: string) => SqlExpression;
	/** MIN(column) */
	min: (column: string) => SqlExpression;
	/** MAX(column) */
	max: (column: string) => SqlExpression;
	/** ANY(column) - returns arbitrary value from group */
	any: (column: string) => SqlExpression;
	/** argMin(column, by) - returns column value at min of by */
	argMin: (column: string, by: string) => SqlExpression;
	/** argMax(column, by) - returns column value at max of by */
	argMax: (column: string, by: string) => SqlExpression;
	/** groupArray(column) - collects values into array */
	groupArray: (column: string) => SqlExpression;
	/** quantile(level)(column) - percentile value */
	quantile: (level: number, column: string) => SqlExpression;
	/** quantileIf(level)(column, condition) - percentile with condition */
	quantileIf: (
		level: number,
		column: string,
		condition: string
	) => SqlExpression;
	/** minIf(column, condition) - min with condition */
	minIf: (column: string, condition: string) => SqlExpression;
	/** maxIf(column, condition) - max with condition */
	maxIf: (column: string, condition: string) => SqlExpression;
	/** ROUND(expr, decimals) */
	round: (expression: string, decimals?: number) => SqlExpression;
	/** dateDiff(unit, start, end) */
	dateDiff: (
		unit: "second" | "minute" | "hour" | "day",
		start: string,
		end: string
	) => SqlExpression;
};

export const agg: AggregateBuilder = {
	count: (column?: string) => expr(column ? `count(${column})` : "count()"),
	countIf: (condition: string) => expr(`countIf(${condition})`),
	uniq: (column: string) => expr(`uniq(${column})`),
	uniqIf: (column: string, condition: string) =>
		expr(`uniq(if(${condition}, ${column}, null))`),
	sum: (column: string) => expr(`sum(${column})`),
	sumIf: (column: string, condition: string) =>
		expr(`sumIf(${column}, ${condition})`),
	avg: (column: string) => expr(`avg(${column})`),
	avgIf: (column: string, condition: string) =>
		expr(`avgIf(${column}, ${condition})`),
	median: (column: string) => expr(`median(${column})`),
	medianIf: (column: string, condition: string) =>
		expr(`medianIf(${column}, ${condition})`),
	min: (column: string) => expr(`min(${column})`),
	max: (column: string) => expr(`max(${column})`),
	any: (column: string) => expr(`any(${column})`),
	argMin: (column: string, by: string) => expr(`argMin(${column}, ${by})`),
	argMax: (column: string, by: string) => expr(`argMax(${column}, ${by})`),
	groupArray: (column: string) => expr(`groupArray(${column})`),
	quantile: (level: number, column: string) =>
		expr(`quantile(${level})(${column})`),
	quantileIf: (level: number, column: string, condition: string) =>
		expr(`quantileIf(${level})(${column}, ${condition})`),
	minIf: (column: string, condition: string) =>
		expr(`minIf(${column}, ${condition})`),
	maxIf: (column: string, condition: string) =>
		expr(`maxIf(${column}, ${condition})`),
	round: (expression: string, decimals = 2) =>
		expr(`round(${expression}, ${decimals})`),
	dateDiff: (unit, start, end) => expr(`dateDiff('${unit}', ${start}, ${end})`),
};

// ============================================================================
// Time Utilities
// ============================================================================

type TimeFunctions = {
	/** Get ClickHouse function for time bucketing */
	bucketFn: (granularity: Granularity) => string;
	/** Create time bucket expression */
	bucket: (
		granularity: Granularity,
		field?: string,
		timezone?: string
	) => SqlExpression;
	/** Create time bucket with timezone and format for output */
	bucketFormatted: (
		granularity: Granularity,
		field?: string,
		timezone?: string
	) => SqlExpression;
	/** Convert timezone */
	toTimezone: (field: string, timezone: string) => SqlExpression;
	/** Parse datetime string */
	parse: (paramName: string) => SqlExpression;
	/** Parse datetime with end of day */
	parseEndOfDay: (paramName: string) => SqlExpression;
};

const granularityToFn: Record<Granularity, string> = {
	minute: "toStartOfMinute",
	hour: "toStartOfHour",
	day: "toDate",
	week: "toStartOfWeek",
	month: "toStartOfMonth",
};

export const time: TimeFunctions = {
	bucketFn: (granularity: Granularity) => granularityToFn[granularity],

	bucket: (granularity: Granularity, field = "time", timezone?: string) => {
		const fn = granularityToFn[granularity];
		const timeExpr = timezone ? `toTimeZone(${field}, '${timezone}')` : field;
		return expr(`${fn}(${timeExpr})`);
	},

	bucketFormatted: (
		granularity: Granularity,
		field = "time",
		timezone?: string
	) => {
		const fn = granularityToFn[granularity];
		const timeExpr = timezone ? `toTimeZone(${field}, '${timezone}')` : field;
		const bucketed = `${fn}(${timeExpr})`;

		// Format based on granularity
		if (granularity === "hour" || granularity === "minute") {
			return expr(`formatDateTime(${bucketed}, '%Y-%m-%d %H:%M:%S')`);
		}
		return expr(bucketed);
	},

	toTimezone: (field: string, timezone: string) =>
		expr(`toTimeZone(${field}, '${timezone}')`),

	parse: (paramName: string) => expr(`toDateTime({${paramName}:String})`),

	parseEndOfDay: (paramName: string) =>
		expr(`toDateTime(concat({${paramName}:String}, ' 23:59:59'))`),
};

/**
 * Normalize TimeUnit from request to Granularity
 */
export function normalizeGranularity(
	unit: TimeUnit | undefined
): Granularity | undefined {
	if (!unit) {
		return;
	}
	if (unit === "hourly") {
		return "hour";
	}
	if (unit === "daily") {
		return "day";
	}
	return unit as Granularity;
}

// ============================================================================
// Common SQL Expressions
// ============================================================================

/**
 * Pre-built SQL expressions for common analytics patterns
 */
export const Expressions = {
	/**
	 * Referrer expressions
	 */
	referrer: {
		/** Normalizes referrer to domain with common site grouping */
		normalized: expr(`
			CASE 
				WHEN referrer = '' OR referrer IS NULL THEN 'direct'
				WHEN domain(referrer) LIKE '%.google.com%' OR domain(referrer) LIKE 'google.com%' THEN 'https://google.com'
				WHEN domain(referrer) LIKE '%.facebook.com%' OR domain(referrer) LIKE 'facebook.com%' THEN 'https://facebook.com'
				WHEN domain(referrer) LIKE '%.twitter.com%' OR domain(referrer) LIKE 'twitter.com%' OR domain(referrer) LIKE 't.co%' THEN 'https://twitter.com'
				WHEN domain(referrer) LIKE '%.instagram.com%' OR domain(referrer) LIKE 'instagram.com%' OR domain(referrer) LIKE 'l.instagram.com%' THEN 'https://instagram.com'
				ELSE concat('https://', domain(referrer))
			END`),

		/** Just extract the domain */
		domain: expr("domain(referrer)"),

		/** Check if referrer is direct/empty */
		isDirect: expr("referrer = '' OR referrer IS NULL"),

		/** Check if referrer is external (not matching website domain) */
		isExternal: (websiteDomain: string) =>
			expr(`
				referrer != '' 
				AND referrer IS NOT NULL 
				AND domain(referrer) != '${websiteDomain}'
				AND NOT domain(referrer) ILIKE '%.${websiteDomain}'
				AND domain(referrer) NOT IN ('localhost', '127.0.0.1')
			`),
	},

	/**
	 * Path expressions
	 */
	path: {
		/** Normalize path - remove trailing slash, ensure leading slash */
		normalized: expr(
			"CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END"
		),

		/** Just the path portion of URL */
		extracted: expr("path(path)"),
	},

	/**
	 * Session expressions
	 */
	session: {
		/** Session duration in seconds */
		duration: expr("dateDiff('second', min(time), max(time))"),

		/** Page count per session */
		pageCount: expr("countIf(event_name = 'screen_view')"),

		/** Check if session is bounce (single page view) */
		isBounce: expr("countIf(event_name = 'screen_view') = 1"),
	},

	/**
	 * Event filters
	 */
	events: {
		/** Filter to screen views only */
		isPageView: "event_name = 'screen_view'",

		/** Filter to custom events (not system events) */
		isCustomEvent:
			"event_name NOT IN ('screen_view', 'page_exit', 'web_vitals', 'link_out')",

		/** Filter out empty sessions */
		hasSession: "session_id != ''",
	},

	/**
	 * Duration bucket expressions
	 */
	duration: {
		/** Bucket session duration into ranges */
		bucket: expr(`
			CASE
				WHEN duration < 30 THEN '0-30s'
				WHEN duration < 60 THEN '30s-1m'
				WHEN duration < 300 THEN '1m-5m'
				WHEN duration < 900 THEN '5m-15m'
				WHEN duration < 3600 THEN '15m-1h'
				ELSE '1h+'
			END`),

		/** Time on page bucket (milliseconds input) */
		timeOnPageBucket: expr(`
			CASE
				WHEN time_on_page < 30000 THEN '0-30s'
				WHEN time_on_page < 60000 THEN '30s-1m'
				WHEN time_on_page < 300000 THEN '1m-5m'
				WHEN time_on_page < 900000 THEN '5m-15m'
				ELSE '15m+'
			END`),
	},
} as const;

// ============================================================================
// Computed Metrics
// ============================================================================

/**
 * Common computed metrics that can be derived from base aggregates
 */
export const ComputedMetrics = {
	/** Bounce rate as percentage */
	bounceRate: (bouncedField: string, totalField: string) =>
		expr(`round(${bouncedField} * 100.0 / nullIf(${totalField}, 0), 2)`),

	/** Percentage of total using window function */
	percentageOfTotal: (field: string) =>
		expr(`round(${field} * 100.0 / sum(${field}) OVER(), 2)`),

	/** Pages per session */
	pagesPerSession: (pageviewsField: string, sessionsField: string) =>
		expr(`round(${pageviewsField} * 1.0 / nullIf(${sessionsField}, 0), 2)`),

	/** Safe division with nullIf */
	safeDiv: (numerator: string, denominator: string, decimals = 2) =>
		expr(`round(${numerator} * 1.0 / nullIf(${denominator}, 0), ${decimals})`),
} as const;

// ============================================================================
// Field Builders - Fluent API for building SELECT fields
// ============================================================================

type FieldBuilder = {
	/** Raw column reference */
	col: (name: string) => FieldChain;
	/** Expression */
	expr: (sql: string) => FieldChain;
	/** Pre-built expression from registry */
	use: (expression: SqlExpression) => FieldChain;
};

type FieldChain = {
	/** Add alias */
	as: (alias: string) => AliasedExpression;
	/** Get raw SQL string */
	sql: () => string;
};

class FieldChainImpl implements FieldChain {
	private readonly expression: string;
	constructor(expression: string) {
		this.expression = expression;
	}

	as(alias: string): AliasedExpression {
		return aliased(this.expression, alias);
	}

	sql(): string {
		return this.expression;
	}
}

export const field: FieldBuilder = {
	col: (name: string) => new FieldChainImpl(name),
	expr: (sql: string) => new FieldChainImpl(sql),
	use: (expression: SqlExpression) => new FieldChainImpl(expression),
};

// ============================================================================
// WHERE Clause Builders
// ============================================================================

type WhereBuilder = {
	/** Standard date range filter */
	dateRange: (
		timeField: string,
		startParam: string,
		endParam: string,
		includeEndOfDay?: boolean
	) => string[];

	/** Client ID filter */
	clientId: (paramName?: string) => string;

	/** Combine conditions with AND */
	and: (...conditions: (string | undefined | null)[]) => string;

	/** Combine conditions with OR */
	or: (...conditions: (string | undefined | null)[]) => string;

	/** Wrap conditions for safety */
	wrap: (conditions: string[]) => string;
};

export const where: WhereBuilder = {
	dateRange: (
		timeField: string,
		startParam: string,
		endParam: string,
		includeEndOfDay = true
	) => {
		const conditions = [`${timeField} >= toDateTime({${startParam}:String})`];

		if (includeEndOfDay) {
			conditions.push(
				`${timeField} <= toDateTime(concat({${endParam}:String}, ' 23:59:59'))`
			);
		} else {
			conditions.push(`${timeField} <= toDateTime({${endParam}:String})`);
		}

		return conditions;
	},

	clientId: (paramName = "websiteId") => `client_id = {${paramName}:String}`,

	and: (...conditions) => {
		const valid = conditions.filter(
			(c): c is string => typeof c === "string" && c.length > 0
		);
		return valid.length > 0 ? valid.join(" AND ") : "1=1";
	},

	or: (...conditions) => {
		const valid = conditions.filter(
			(c): c is string => typeof c === "string" && c.length > 0
		);
		return valid.length > 0 ? `(${valid.join(" OR ")})` : "1=0";
	},

	wrap: (conditions: string[]) =>
		conditions.length > 0 ? `(${conditions.join(" AND ")})` : "1=1",
};

// ============================================================================
// Session Attribution Fields Builder
// ============================================================================

const SESSION_ATTRIBUTION_FIELDS = [
	"referrer",
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"country",
	"device_type",
	"browser_name",
	"os_name",
] as const;

export type SessionAttributionField =
	(typeof SESSION_ATTRIBUTION_FIELDS)[number];

type SessionAttributionBuilder = {
	/** Fields to select in CTE */
	readonly fields: readonly SessionAttributionField[];

	/** Generate SELECT fields for session CTE (argMin pattern) */
	selectFields: (timeField?: string) => string[];

	/** Generate SELECT fields for join (aliased) */
	joinSelectFields: (cteAlias?: string) => string[];

	/** Generate full CTE SQL */
	cte: (
		timeField: string,
		table: string,
		startParam: string,
		endParam: string
	) => string;

	/** Generate JOIN clause */
	join: (alias: string, cteAlias?: string) => string;
};

export const sessionAttribution: SessionAttributionBuilder = {
	fields: SESSION_ATTRIBUTION_FIELDS,

	selectFields: (timeField = "time") =>
		SESSION_ATTRIBUTION_FIELDS.map(
			(f) => `argMin(${f}, ${timeField}) as session_${f}`
		),

	joinSelectFields: (cteAlias = "sa") =>
		SESSION_ATTRIBUTION_FIELDS.map((f) => `${cteAlias}.session_${f} as ${f}`),

	cte: (timeField, table, startParam, endParam) => `
		session_attribution AS (
			SELECT 
				session_id,
				${sessionAttribution.selectFields(timeField).join(",\n\t\t\t\t")}
			FROM ${table}
			WHERE client_id = {websiteId:String}
				AND ${timeField} >= toDateTime({${startParam}:String})
				AND ${timeField} <= toDateTime(concat({${endParam}:String}, ' 23:59:59'))
				AND session_id != ''
			GROUP BY session_id
		)`,

	join: (alias: string, cteAlias = "session_attribution") =>
		`INNER JOIN ${cteAlias} sa ON ${alias}.session_id = sa.session_id`,
};

// ============================================================================
// Query Building Helpers
// ============================================================================

/**
 * Build a complete SELECT statement
 */
export function buildSelect(config: {
	fields: SelectField[];
	from: string;
	where?: string[];
	groupBy?: string[];
	orderBy?: string;
	limit?: number;
	offset?: number;
}): string {
	const parts = [`SELECT ${fieldsToSql(config.fields).join(", ")}`];

	parts.push(`FROM ${config.from}`);

	if (config.where?.length) {
		parts.push(`WHERE ${config.where.join(" AND ")}`);
	}

	if (config.groupBy?.length) {
		parts.push(`GROUP BY ${config.groupBy.join(", ")}`);
	}

	if (config.orderBy) {
		parts.push(`ORDER BY ${config.orderBy}`);
	}

	if (config.limit) {
		parts.push(`LIMIT ${config.limit}`);
	}

	if (config.offset) {
		parts.push(`OFFSET ${config.offset}`);
	}

	return parts.join("\n");
}

/**
 * Build a WITH clause from CTEs
 */
export function buildWith(ctes: Array<{ name: string; sql: string }>): string {
	if (ctes.length === 0) {
		return "";
	}
	return `WITH ${ctes.map((c) => `${c.name} AS (${c.sql})`).join(",\n")}`;
}

// ============================================================================
// Field Definition Compiler
// ============================================================================

// Import types inline to avoid circular dependency issues
type FieldDefinitionType =
	| { type: "column"; source: string; alias?: string }
	| {
		type: "aggregate";
		fn: AggregateFn;
		source?: string;
		condition?: string;
		alias: string;
	}
	| { type: "expression"; expression: string | SqlExpression; alias: string }
	| {
		type: "window";
		fn: AggregateFn;
		source?: string;
		over: { partitionBy?: string[]; orderBy?: string };
		alias: string;
	}
	| {
		type: "computed";
		metric: "bounceRate" | "percentageOfTotal" | "pagesPerSession";
		inputs: string[];
		alias: string;
	};

type AliasedExpressionType = { expression: SqlExpression; alias: string };
type ConfigFieldType = string | FieldDefinitionType | AliasedExpressionType;

/**
 * Check if value is an AliasedExpression
 */
function isAliasedExpression(
	field: ConfigFieldType
): field is AliasedExpressionType {
	return (
		typeof field === "object" &&
		"expression" in field &&
		"alias" in field &&
		!("type" in field)
	);
}

/**
 * Check if value is a FieldDefinition
 */
function isFieldDefinition(
	field: ConfigFieldType
): field is FieldDefinitionType {
	return typeof field === "object" && "type" in field;
}

/**
 * Compile an aggregate function to SQL
 */
function compileAggregate(
	fn: AggregateFn,
	source?: string,
	condition?: string
): string {
	// Handle conditional aggregates
	if (condition) {
		switch (fn) {
			case "count":
				return `countIf(${condition})`;
			case "sum":
				return source
					? `sumIf(${source}, ${condition})`
					: `sumIf(${condition})`;
			case "avg":
				return source
					? `avgIf(${source}, ${condition})`
					: `avgIf(${condition})`;
			case "median":
				return source
					? `medianIf(${source}, ${condition})`
					: `medianIf(${condition})`;
			case "uniq":
				return source
					? `uniq(if(${condition}, ${source}, null))`
					: `uniqIf(${condition})`;
			case "countIf":
				return `countIf(${condition})`;
			case "sumIf":
				return source
					? `sumIf(${source}, ${condition})`
					: `sumIf(1, ${condition})`;
			case "avgIf":
				return source
					? `avgIf(${source}, ${condition})`
					: `avgIf(1, ${condition})`;
			case "medianIf":
				return source
					? `medianIf(${source}, ${condition})`
					: `medianIf(1, ${condition})`;
			case "uniqIf":
				return source
					? `uniq(if(${condition}, ${source}, null))`
					: `uniqIf(${condition})`;
			case "min":
			case "minIf":
				return source
					? `minIf(${source}, ${condition})`
					: `minIf(1, ${condition})`;
			case "max":
			case "maxIf":
				return source
					? `maxIf(${source}, ${condition})`
					: `maxIf(1, ${condition})`;
			case "quantile":
			case "quantileIf":
				// For quantile with condition, source should be "level)(column"
				// e.g., source = "0.50)(metric_value" produces quantileIf(0.50)(metric_value, condition)
				if (!source) {
					throw new Error(
						"quantileIf aggregate function requires a source column (e.g., '0.50)(metric_value')"
					);
				}
				return `quantileIf(${source}, ${condition})`;
			default:
				// For other aggregates, apply condition as WHERE in subquery pattern
				return source
					? `${fn}If(${source}, ${condition})`
					: `${fn}If(${condition})`;
		}
	}

	// Non-conditional aggregates
	switch (fn) {
		case "count":
			return source ? `count(${source})` : "count()";
		case "sum":
			return `sum(${source || "*"})`;
		case "avg":
			return `avg(${source || "*"})`;
		case "median":
			return `median(${source || "*"})`;
		case "uniq":
			return `uniq(${source || "*"})`;
		case "min":
			return `min(${source || "*"})`;
		case "max":
			return `max(${source || "*"})`;
		case "any":
			return `any(${source || "*"})`;
		case "argMin":
			return `argMin(${source || "*"})`;
		case "argMax":
			return `argMax(${source || "*"})`;
		case "groupArray":
			return `groupArray(${source || "*"})`;
		case "quantile":
			// source should be "level)(column" e.g., "0.50)(metric_value"
			if (!source) {
				throw new Error(
					"quantile aggregate function requires a source column (e.g., '0.50)(metric_value')"
				);
			}
			return `quantile(${source})`;
		// Conditional variants without condition just use base
		case "countIf":
			return source ? `count(${source})` : "count()";
		case "sumIf":
			return `sum(${source || "*"})`;
		case "avgIf":
			return `avg(${source || "*"})`;
		case "medianIf":
			return `median(${source || "*"})`;
		case "uniqIf":
			return `uniq(${source || "*"})`;
		case "minIf":
			return `min(${source || "*"})`;
		case "maxIf":
			return `max(${source || "*"})`;
		case "quantileIf":
			if (!source) {
				throw new Error(
					"quantileIf aggregate function requires a source column (e.g., '0.50)(metric_value')"
				);
			}
			return `quantile(${source})`;
		default:
			return `${fn}(${source || "*"})`;
	}
}

/**
 * Compile a window function to SQL
 */
function compileWindow(
	fn: AggregateFn,
	source: string | undefined,
	over: { partitionBy?: string[]; orderBy?: string }
): string {
	const aggSql = compileAggregate(fn, source);

	const overParts: string[] = [];
	if (over.partitionBy?.length) {
		overParts.push(`PARTITION BY ${over.partitionBy.join(", ")}`);
	}
	if (over.orderBy) {
		overParts.push(`ORDER BY ${over.orderBy}`);
	}

	const overClause = overParts.join(" ");
	return `${aggSql} OVER(${overClause})`;
}

/**
 * Compile a computed metric to SQL
 */
function compileComputed(
	metric: "bounceRate" | "percentageOfTotal" | "pagesPerSession",
	inputs: string[]
): string {
	switch (metric) {
		case "bounceRate": {
			const [bounced, total] = inputs;
			if (!(bounced && total)) {
				throw new Error("bounceRate requires [bouncedField, totalField]");
			}
			return `round(${bounced} * 100.0 / nullIf(${total}, 0), 2)`;
		}
		case "percentageOfTotal": {
			const [field] = inputs;
			if (!field) {
				throw new Error("percentageOfTotal requires [field]");
			}
			return `round(${field} * 100.0 / sum(${field}) OVER(), 2)`;
		}
		case "pagesPerSession": {
			const [pageviews, sessions] = inputs;
			if (!(pageviews && sessions)) {
				throw new Error(
					"pagesPerSession requires [pageviewsField, sessionsField]"
				);
			}
			return `round(${pageviews} * 1.0 / nullIf(${sessions}, 0), 2)`;
		}
		default:
			throw new Error(`Unknown computed metric: ${metric}`);
	}
}

/**
 * Compile a single FieldDefinition to SQL string
 */
export function compileField(field: FieldDefinitionType): string {
	switch (field.type) {
		case "column":
			return field.alias ? `${field.source} as ${field.alias}` : field.source;

		case "aggregate": {
			const aggSql = compileAggregate(field.fn, field.source, field.condition);
			return `${aggSql} as ${field.alias}`;
		}

		case "expression": {
			const exprSql =
				typeof field.expression === "string"
					? field.expression
					: field.expression;
			return `${exprSql} as ${field.alias}`;
		}

		case "window": {
			const windowSql = compileWindow(field.fn, field.source, field.over);
			return `${windowSql} as ${field.alias}`;
		}

		case "computed": {
			const computedSql = compileComputed(field.metric, field.inputs);
			return `${computedSql} as ${field.alias}`;
		}

		default:
			throw new Error(
				`Unknown field type: ${(field as FieldDefinitionType).type}`
			);
	}
}

/**
 * Compile a ConfigField to SQL string
 */
export function compileConfigField(field: ConfigFieldType): string {
	if (typeof field === "string") {
		return field;
	}

	if (isAliasedExpression(field)) {
		return `${field.expression} as ${field.alias}`;
	}

	if (isFieldDefinition(field)) {
		return compileField(field);
	}

	throw new Error(`Unknown field format: ${JSON.stringify(field)}`);
}

/**
 * Compile array of ConfigFields to SQL strings
 */
export function compileFields(fields: ConfigFieldType[]): string[] {
	return fields.map(compileConfigField);
}

// ============================================================================
// Type Guards for External Use
// ============================================================================

export { isAliasedExpression, isFieldDefinition };
export type { FieldDefinitionType, ConfigFieldType, AliasedExpressionType };
