import type {
	AliasedExpression,
	Granularity,
	SqlExpression,
	TimeUnit,
} from "./types";

function expr(sql: string): SqlExpression {
	return sql as SqlExpression;
}

interface TimeFunctions {
	bucket: (
		granularity: Granularity,
		field?: string,
		timezone?: string
	) => SqlExpression;
	bucketFormatted: (
		granularity: Granularity,
		field?: string,
		timezone?: string
	) => SqlExpression;
}

const granularityToFn: Record<Granularity, string> = {
	minute: "toStartOfMinute",
	hour: "toStartOfHour",
	day: "toDate",
	week: "toStartOfWeek",
	month: "toStartOfMonth",
};

export const time: TimeFunctions = {
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
				WHEN referrer = '' OR referrer IS NULL OR referrer = 'direct' THEN 'direct'
				WHEN domain(referrer) LIKE '%.google.com%' OR domain(referrer) LIKE 'google.com%' THEN 'https://google.com'
				WHEN domain(referrer) LIKE '%.facebook.com%' OR domain(referrer) LIKE 'facebook.com%' THEN 'https://facebook.com'
				WHEN domain(referrer) LIKE '%.twitter.com%' OR domain(referrer) LIKE 'twitter.com%' OR domain(referrer) LIKE 'x.com%' OR domain(referrer) LIKE '%.x.com%' OR domain(referrer) LIKE 't.co%' THEN 'https://twitter.com'
				WHEN domain(referrer) LIKE '%.instagram.com%' OR domain(referrer) LIKE 'instagram.com%' OR domain(referrer) LIKE 'l.instagram.com%' THEN 'https://instagram.com'
				WHEN domain(referrer) LIKE '%.linkedin.com%' OR domain(referrer) LIKE 'linkedin.com%' THEN 'https://linkedin.com'
				ELSE concat('https://', domain(referrer))
			END`),

		sourceWithDirect: (websiteDomain = "{websiteDomain}") =>
			expr(`
			CASE
				WHEN referrer = '' OR referrer IS NULL OR referrer = 'direct' THEN 'direct'
				WHEN domain(referrer) = '' OR domain(referrer) IN ('localhost', '127.0.0.1') THEN 'direct'
				WHEN domain(referrer) = '${websiteDomain}' OR domain(referrer) ILIKE '%.${websiteDomain}' THEN 'direct'
				WHEN domain(referrer) LIKE '%.google.com%' OR domain(referrer) LIKE 'google.com%' THEN 'https://google.com'
				WHEN domain(referrer) LIKE '%.facebook.com%' OR domain(referrer) LIKE 'facebook.com%' THEN 'https://facebook.com'
				WHEN domain(referrer) LIKE '%.twitter.com%' OR domain(referrer) LIKE 'twitter.com%' OR domain(referrer) LIKE 'x.com%' OR domain(referrer) LIKE '%.x.com%' OR domain(referrer) LIKE 't.co%' THEN 'https://twitter.com'
				WHEN domain(referrer) LIKE '%.instagram.com%' OR domain(referrer) LIKE 'instagram.com%' OR domain(referrer) LIKE 'l.instagram.com%' THEN 'https://instagram.com'
				WHEN domain(referrer) LIKE '%.linkedin.com%' OR domain(referrer) LIKE 'linkedin.com%' THEN 'https://linkedin.com'
				ELSE concat('https://', domain(referrer))
			END`),
	},

	path: {
		normalized: expr(
			"CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END"
		),
	},
} as const;

export const SESSION_ATTRIBUTION_FIELDS = [
	"referrer",
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"country",
	"device_type",
	"browser_name",
	"os_name",
] as const;

interface SessionAttributionBuilder {
	joinSelectFields: (cteAlias?: string) => string[];
	selectFields: (timeField?: string) => string[];
}

export const sessionAttribution: SessionAttributionBuilder = {
	selectFields: (timeField = "time") =>
		SESSION_ATTRIBUTION_FIELDS.map(
			(f) => `argMin(${f}, ${timeField}) as session_${f}`
		),

	joinSelectFields: (cteAlias = "sa") =>
		SESSION_ATTRIBUTION_FIELDS.map((f) => `${cteAlias}.session_${f} as ${f}`),
};

type ConfigFieldType = string | AliasedExpression;

export function compileConfigField(field: ConfigFieldType): string {
	if (typeof field === "string") {
		return field;
	}
	return `${field.expression} as ${field.alias}`;
}
