import type { TimeUnit } from "./types";

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

export type Granularity = "minute" | "hour" | "day" | "week" | "month";

export type SqlExpression = string & { readonly __brand: "SqlExpression" };

export interface AliasedExpression {
	readonly alias: string;
	readonly expression: SqlExpression;
}

export type SelectField = string | AliasedExpression;

function expr(sql: string): SqlExpression {
	return sql as SqlExpression;
}

function aliased(expression: string, alias: string): AliasedExpression {
	return {
		expression: expr(expression),
		alias,
	};
}

export function fieldToSql(field: SelectField): string {
	if (typeof field === "string") {
		return field;
	}
	return `${field.expression} as ${field.alias}`;
}

export function fieldsToSql(fields: SelectField[]): string[] {
	return fields.map(fieldToSql);
}

interface AggregateBuilder {
	any: (column: string) => SqlExpression;
	argMax: (column: string, by: string) => SqlExpression;
	argMin: (column: string, by: string) => SqlExpression;
	avg: (column: string) => SqlExpression;
	avgIf: (column: string, condition: string) => SqlExpression;
	count: (column?: string) => SqlExpression;
	countIf: (condition: string) => SqlExpression;
	dateDiff: (
		unit: "second" | "minute" | "hour" | "day",
		start: string,
		end: string
	) => SqlExpression;
	groupArray: (column: string) => SqlExpression;
	max: (column: string) => SqlExpression;
	maxIf: (column: string, condition: string) => SqlExpression;
	median: (column: string) => SqlExpression;
	medianIf: (column: string, condition: string) => SqlExpression;
	min: (column: string) => SqlExpression;
	minIf: (column: string, condition: string) => SqlExpression;
	quantile: (level: number, column: string) => SqlExpression;
	quantileIf: (
		level: number,
		column: string,
		condition: string
	) => SqlExpression;
	round: (expression: string, decimals?: number) => SqlExpression;
	sum: (column: string) => SqlExpression;
	sumIf: (column: string, condition: string) => SqlExpression;
	uniq: (column: string) => SqlExpression;
	// uniqIf collapses non-matching rows to NULL so uniq() ignores them.
	uniqIf: (column: string, condition: string) => SqlExpression;
}

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

interface TimeFunctions {
	bucket: (
		granularity: Granularity,
		field?: string,
		timezone?: string
	) => SqlExpression;
	bucketFn: (granularity: Granularity) => string;
	bucketFormatted: (
		granularity: Granularity,
		field?: string,
		timezone?: string
	) => SqlExpression;
	parse: (paramName: string) => SqlExpression;
	parseEndOfDay: (paramName: string) => SqlExpression;
	toTimezone: (field: string, timezone: string) => SqlExpression;
}

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

export const Expressions = {
	referrer: {
		normalized: expr(`
			CASE 
				WHEN referrer = '' OR referrer IS NULL THEN 'direct'
				WHEN domain(referrer) LIKE '%.google.com%' OR domain(referrer) LIKE 'google.com%' THEN 'https://google.com'
				WHEN domain(referrer) LIKE '%.facebook.com%' OR domain(referrer) LIKE 'facebook.com%' THEN 'https://facebook.com'
				WHEN domain(referrer) LIKE '%.twitter.com%' OR domain(referrer) LIKE 'twitter.com%' OR domain(referrer) LIKE 't.co%' THEN 'https://twitter.com'
				WHEN domain(referrer) LIKE '%.instagram.com%' OR domain(referrer) LIKE 'instagram.com%' OR domain(referrer) LIKE 'l.instagram.com%' THEN 'https://instagram.com'
				ELSE concat('https://', domain(referrer))
			END`),

		domain: expr("domain(referrer)"),

		isDirect: expr("referrer = '' OR referrer IS NULL"),

		isExternal: (websiteDomain: string) =>
			expr(`
				referrer != '' 
				AND referrer IS NOT NULL 
				AND domain(referrer) != '${websiteDomain}'
				AND NOT domain(referrer) ILIKE '%.${websiteDomain}'
				AND domain(referrer) NOT IN ('localhost', '127.0.0.1')
			`),
	},

	path: {
		normalized: expr(
			"CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END"
		),

		extracted: expr("path(path)"),
	},

	session: {
		duration: expr("dateDiff('second', min(time), max(time))"),

		pageCount: expr("countIf(event_name = 'screen_view')"),

		isBounce: expr("countIf(event_name = 'screen_view') = 1"),
	},

	events: {
		isPageView: "event_name = 'screen_view'",

		isCustomEvent:
			"event_name NOT IN ('screen_view', 'page_exit', 'web_vitals', 'link_out')",

		hasSession: "session_id != ''",
	},

	duration: {
		bucket: expr(`
			CASE
				WHEN duration < 30 THEN '0-30s'
				WHEN duration < 60 THEN '30s-1m'
				WHEN duration < 300 THEN '1m-5m'
				WHEN duration < 900 THEN '5m-15m'
				WHEN duration < 3600 THEN '15m-1h'
				ELSE '1h+'
			END`),

		// time_on_page is milliseconds, not seconds.
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

export const ComputedMetrics = {
	bounceRate: (bouncedField: string, totalField: string) =>
		expr(`round(${bouncedField} * 100.0 / nullIf(${totalField}, 0), 2)`),

	percentageOfTotal: (field: string) =>
		expr(`round(${field} * 100.0 / sum(${field}) OVER(), 2)`),

	pagesPerSession: (pageviewsField: string, sessionsField: string) =>
		expr(`round(${pageviewsField} * 1.0 / nullIf(${sessionsField}, 0), 2)`),

	safeDiv: (numerator: string, denominator: string, decimals = 2) =>
		expr(`round(${numerator} * 1.0 / nullIf(${denominator}, 0), ${decimals})`),
} as const;

interface FieldBuilder {
	col: (name: string) => FieldChain;
	expr: (sql: string) => FieldChain;
	use: (expression: SqlExpression) => FieldChain;
}

interface FieldChain {
	as: (alias: string) => AliasedExpression;
	sql: () => string;
}

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

interface WhereBuilder {
	and: (...conditions: (string | undefined | null)[]) => string;
	clientId: (paramName?: string) => string;
	dateRange: (
		timeField: string,
		startParam: string,
		endParam: string,
		includeEndOfDay?: boolean
	) => string[];
	or: (...conditions: (string | undefined | null)[]) => string;
	wrap: (conditions: string[]) => string;
}

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

interface SessionAttributionBuilder {
	cte: (
		timeField: string,
		table: string,
		startParam: string,
		endParam: string
	) => string;
	readonly fields: readonly SessionAttributionField[];
	join: (alias: string, cteAlias?: string) => string;
	joinSelectFields: (cteAlias?: string) => string[];
	selectFields: (timeField?: string) => string[];
}

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

export function buildWith(ctes: Array<{ name: string; sql: string }>): string {
	if (ctes.length === 0) {
		return "";
	}
	return `WITH ${ctes.map((c) => `${c.name} AS (${c.sql})`).join(",\n")}`;
}

// Types duplicated locally to avoid a circular dependency with ./types.
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

interface AliasedExpressionType {
	alias: string;
	expression: SqlExpression;
}
type ConfigFieldType = string | FieldDefinitionType | AliasedExpressionType;

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

function isFieldDefinition(
	field: ConfigFieldType
): field is FieldDefinitionType {
	return typeof field === "object" && "type" in field;
}

function compileAggregate(
	fn: AggregateFn,
	source?: string,
	condition?: string
): string {
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
				// quantileIf requires a pre-split `level)(column` source (e.g. "0.50)(metric_value")
				// so the final SQL becomes `quantileIf(0.50)(metric_value, condition)`.
				if (!source) {
					throw new Error(
						"quantileIf aggregate function requires a source column (e.g., '0.50)(metric_value')"
					);
				}
				return `quantileIf(${source}, ${condition})`;
			default:
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

export function compileFields(fields: ConfigFieldType[]): string[] {
	return fields.map(compileConfigField);
}

export type { AliasedExpressionType, ConfigFieldType, FieldDefinitionType };
export { isAliasedExpression, isFieldDefinition };
