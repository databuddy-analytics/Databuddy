import { chQuery } from "@databuddy/db/clickhouse";
import { domainSchema } from "@databuddy/validation";
import {
	normalizeClickHouseDateTime,
	padToClickHouseDateTime,
} from "./date-utils";
import {
	compileConfigField,
	Expressions,
	normalizeGranularity,
	SESSION_ATTRIBUTION_FIELDS,
	sessionAttribution,
	time,
} from "./expressions";
import type {
	CompiledQuery,
	ConfigField,
	CTEDefinition,
	Filter,
	Granularity,
	QueryRequest,
	SimpleQueryConfig,
	TimeBucketConfig,
} from "./types";
import { FilterOperators } from "./types";
import { applyPlugins } from "./utils";

export function getClickHouseQuerySettings(
	noCache?: boolean
): Record<string, string | number> {
	if (noCache) {
		return { use_query_cache: 0 };
	}
	return {
		use_query_cache: 1,
		query_cache_nondeterministic_function_handling: "ignore",
	};
}

const FIELD_ALIAS_PATTERN = /\s+as\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/i;
const SIMPLE_FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]*$/;

// Filters that are always allowed regardless of per-builder allowedFilters
const GLOBAL_ALLOWED_FILTERS = new Set([
	"path",
	"query_string",
	"country",
	"region",
	"city",
	"timezone",
	"language",
	"device_type",
	"browser_name",
	"os_name",
	"referrer",
	"utm_source",
	"utm_medium",
	"utm_campaign",
]);

export function isFilterFieldAllowed(
	config: SimpleQueryConfig,
	field: string
): boolean {
	return (
		GLOBAL_ALLOWED_FILTERS.has(field) ||
		(config.allowedFilters?.includes(field) ?? false)
	);
}

export function allowedFilterFields(config: SimpleQueryConfig): string[] {
	return [
		...new Set([...GLOBAL_ALLOWED_FILTERS, ...(config.allowedFilters ?? [])]),
	];
}

const ALLOWED_GROUPBY_FIELDS = new Set([
	"country",
	"region",
	"city",
	"timezone",
	"language",
	"browser_name",
	"browser_version",
	"os_name",
	"os_version",
	"viewport_size",
	"device_type",
	"path",
	"date",
	"name",
	"referrer",
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"utm_term",
	"utm_content",
	"source",
	"message",
	"error_type",
	"duration_range",
	"depth_range",
]);

const ALLOWED_ORDERBY_FIELDS = new Set([
	"visitors",
	"sessions",
	"pageviews",
	"clicks",
	"count",
	"total",
	"date",
	"time",
	"errors",
	"avg_scroll_depth",
	"uptime_percentage",
	"revenue",
	"samples",
	"total_events",
	"unique_users",
]);

const SQL_EXPRESSIONS = {
	normalizedPath: Expressions.path.normalized,
	normalizedReferrer: Expressions.referrer.normalized,
	queryString: "queryString(url)",
};

const REFERRER_MAPPINGS: Record<string, string> = {
	direct: "direct",
	google: "https://google.com",
	"google.com": "https://google.com",
	"www.google.com": "https://google.com",
	facebook: "https://facebook.com",
	"facebook.com": "https://facebook.com",
	"www.facebook.com": "https://facebook.com",
	twitter: "https://twitter.com",
	"twitter.com": "https://twitter.com",
	"www.twitter.com": "https://twitter.com",
	"t.co": "https://twitter.com",
	x: "https://twitter.com",
	"x.com": "https://twitter.com",
	"www.x.com": "https://twitter.com",
	instagram: "https://instagram.com",
	"instagram.com": "https://instagram.com",
	"www.instagram.com": "https://instagram.com",
	"l.instagram.com": "https://instagram.com",
	linkedin: "https://linkedin.com",
	"linkedin.com": "https://linkedin.com",
	"www.linkedin.com": "https://linkedin.com",
	"l.linkedin.com": "https://linkedin.com",
};

const DATE_PARAM_NAMES = new Set(["from", "to", "startDate", "endDate"]);
const DATE_PARAM_PATTERN = "from|to|startDate|endDate";

const END_OF_DAY_WITH_TZ_REGEX = new RegExp(
	`parseDateTimeBestEffort\\(concat\\(\\{(${DATE_PARAM_PATTERN}):String\\}, ' 23:59:59'\\), \\{timezone:String\\}\\)`,
	"g"
);
const END_OF_DAY_REGEX = new RegExp(
	`toDateTime\\(concat\\(\\{(${DATE_PARAM_PATTERN}):String\\}, ' 23:59:59'\\)\\)`,
	"g"
);
const TO_DATE_TIME_REGEX = new RegExp(
	`toDateTime\\(\\{(${DATE_PARAM_PATTERN}):String\\}\\)`,
	"g"
);

const ORG_SCOPE_ID_FIELDS = ["client_id", "website_id", "owner_id"] as const;
const orgScopeRegexCache = new Map<string, RegExp>();
function orgScopeRegex(field: string): RegExp {
	let regex = orgScopeRegexCache.get(field);
	if (!regex) {
		const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		regex = new RegExp(
			`((?:\\b\\w+\\.)?${escaped})\\s*=\\s*\\{websiteId:String\\}`,
			"g"
		);
		orgScopeRegexCache.set(field, regex);
	}
	return regex;
}

function dateBindingExpression(
	paramName: string,
	withTimezone = false
): string {
	if (withTimezone) {
		return `parseDateTimeBestEffort({${paramName}:String}, {timezone:String})`;
	}
	return `{${paramName}:DateTime}`;
}

function normalizeReferrerValue(value: string, forLikeSearch = false): string {
	const lower = value.toLowerCase();
	const mapped = REFERRER_MAPPINGS[lower];

	if (mapped) {
		return forLikeSearch && lower !== "direct"
			? lower.replace("https://", "")
			: mapped;
	}
	if (value.startsWith("http://") || value.startsWith("https://")) {
		return value;
	}
	return value.includes(".") && !value.includes(" ")
		? `https://${value}`
		: value;
}

export function escapeLikePattern(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&");
}

export function appendFilterClause(conditions: string[] | undefined): string {
	return conditions?.length ? `AND ${conditions.join(" AND ")}` : "";
}

function listAllowed(values: Iterable<string>): string {
	return Array.from(values).sort().join(", ");
}

function validateGroupByField(field: string): void {
	if (!ALLOWED_GROUPBY_FIELDS.has(field)) {
		throw new Error(
			`Grouping by '${field}' is not permitted. Allowed groupBy fields: ${listAllowed(ALLOWED_GROUPBY_FIELDS)}.`
		);
	}
}

const ORDER_BY_REGEX = /^(\w+)(?:\s+(ASC|DESC))?$/i;

function normalizeOrderBy(orderBy: string): string {
	const match = orderBy.trim().match(ORDER_BY_REGEX);
	const field = match?.[1];
	if (!(match && field && ALLOWED_ORDERBY_FIELDS.has(field))) {
		throw new Error(
			`Ordering by '${orderBy}' is not permitted. Use '<field>' or '<field> ASC|DESC' where field is one of: ${listAllowed(ALLOWED_ORDERBY_FIELDS)}.`
		);
	}
	const direction = match[2]?.toUpperCase() ?? "DESC";
	return `${field} ${direction}`;
}

function buildDeviceTypeSQL(
	value: string,
	isNegative: boolean,
	key: string
): FilterResult {
	const lower = value.toLowerCase();
	if (lower === "desktop") {
		const clause = `(device_type = '' OR lower(device_type) = {${key}:String})`;
		return {
			clause: isNegative ? `NOT ${clause}` : clause,
			params: { [key]: "desktop" },
		};
	}
	return {
		clause: isNegative
			? `lower(device_type) != {${key}:String}`
			: `lower(device_type) = {${key}:String}`,
		params: { [key]: lower },
	};
}

function isSessionAttributionField(
	field: string
): field is (typeof SESSION_ATTRIBUTION_FIELDS)[number] {
	return SESSION_ATTRIBUTION_FIELDS.includes(
		field as (typeof SESSION_ATTRIBUTION_FIELDS)[number]
	);
}

interface FilterResult {
	clause: string;
	params: Record<string, Filter["value"]>;
}

function buildGenericFilter(
	filter: Filter,
	key: string,
	operator: string,
	fieldExpr: string,
	valueTransform?: (v: string) => string
): FilterResult {
	const transform = valueTransform || ((v: string) => v);

	if (filter.op === "contains" || filter.op === "not_contains") {
		const value = transform(String(filter.value));
		const escaped = escapeLikePattern(value);
		return {
			clause: `${fieldExpr} ${operator} {${key}:String}`,
			params: { [key]: `%${escaped}%` },
		};
	}

	if (filter.op === "starts_with") {
		const value = transform(String(filter.value));
		const escaped = escapeLikePattern(value);
		return {
			clause: `${fieldExpr} ${operator} {${key}:String}`,
			params: { [key]: `${escaped}%` },
		};
	}

	if (filter.op === "in" || filter.op === "not_in") {
		const values = Array.isArray(filter.value)
			? filter.value.map((v) => transform(String(v)))
			: [transform(String(filter.value))];
		return {
			clause: `${fieldExpr} ${operator} {${key}:Array(String)}`,
			params: { [key]: values },
		};
	}

	return {
		clause: `${fieldExpr} ${operator} {${key}:String}`,
		params: { [key]: transform(String(filter.value)) },
	};
}

export class SimpleQueryBuilder {
	private readonly config: SimpleQueryConfig;
	private readonly request: QueryRequest;
	private readonly websiteDomain: string | null;

	constructor(
		config: SimpleQueryConfig,
		request: QueryRequest,
		websiteDomain?: string | null
	) {
		this.config = config;
		this.request = request;
		this.websiteDomain = websiteDomain
			? (domainSchema.safeParse(websiteDomain).data ?? null)
			: null;
	}

	private buildFilter(
		filter: Filter,
		index: number,
		options?: { sessionAttributionAlias?: string }
	): FilterResult {
		if (!isFilterFieldAllowed(this.config, filter.field)) {
			throw new Error(
				`Filter on field '${filter.field}' is not permitted. Allowed fields for this query: ${listAllowed(allowedFilterFields(this.config))}.`
			);
		}

		const key = `f${index}`;
		const operator = FilterOperators[filter.op];
		const sessionAttributionAlias = options?.sessionAttributionAlias;

		if (sessionAttributionAlias && isSessionAttributionField(filter.field)) {
			return this.buildSessionAttributionFilter(
				filter,
				key,
				operator,
				sessionAttributionAlias
			);
		}

		if (filter.field === "path") {
			return buildGenericFilter(
				filter,
				key,
				operator,
				SQL_EXPRESSIONS.normalizedPath
			);
		}

		if (filter.field === "query_string") {
			return buildGenericFilter(
				filter,
				key,
				operator,
				SQL_EXPRESSIONS.queryString
			);
		}

		if (filter.field === "referrer") {
			return buildGenericFilter(
				filter,
				key,
				operator,
				SQL_EXPRESSIONS.normalizedReferrer,
				(v) =>
					normalizeReferrerValue(
						v,
						filter.op === "contains" || filter.op === "not_contains"
					)
			);
		}

		if (filter.field === "device_type" && typeof filter.value === "string") {
			const isNegative =
				filter.op === "ne" ||
				filter.op === "not_in" ||
				filter.op === "not_contains";
			return buildDeviceTypeSQL(filter.value, isNegative, key);
		}

		if (
			filter.field === "website_id" &&
			filter.op === "eq" &&
			String(filter.value) === ""
		) {
			return {
				clause: "(website_id = '' OR website_id IS NULL)",
				params: {},
			};
		}

		return buildGenericFilter(filter, key, operator, filter.field);
	}

	private buildSessionAttributionFilter(
		filter: Filter,
		key: string,
		operator: string,
		alias: string
	): FilterResult {
		if (filter.field === "referrer") {
			return buildGenericFilter(
				filter,
				key,
				operator,
				String(SQL_EXPRESSIONS.normalizedReferrer).replace(
					/\breferrer\b/g,
					`${alias}.session_referrer`
				),
				(v) =>
					normalizeReferrerValue(
						v,
						filter.op === "contains" || filter.op === "not_contains"
					)
			);
		}

		if (filter.field === "device_type" && typeof filter.value === "string") {
			const fieldExpr = `${alias}.session_device_type`;
			const isNegative =
				filter.op === "ne" ||
				filter.op === "not_in" ||
				filter.op === "not_contains";
			const lower = filter.value.toLowerCase();
			if (lower === "desktop") {
				const clause = `(${fieldExpr} = '' OR lower(${fieldExpr}) = {${key}:String})`;
				return {
					clause: isNegative ? `NOT ${clause}` : clause,
					params: { [key]: "desktop" },
				};
			}
			return {
				clause: isNegative
					? `lower(${fieldExpr}) != {${key}:String}`
					: `lower(${fieldExpr}) = {${key}:String}`,
				params: { [key]: lower },
			};
		}

		return buildGenericFilter(
			filter,
			key,
			operator,
			`${alias}.session_${filter.field}`
		);
	}

	private getIdField(): string {
		return this.config.idField || "client_id";
	}

	private isOrganizationScope(): boolean {
		return Array.isArray(this.request.organizationWebsiteIds);
	}

	private buildIdCondition(field: string): string {
		if (this.isOrganizationScope()) {
			return `${field} IN {websiteIds:Array(String)}`;
		}
		return `${field} = {websiteId:String}`;
	}

	private validateRequiredFilters(): void {
		if (!this.config.requiredFilters?.length) {
			return;
		}

		const requestFilters = this.request.filters ?? [];
		const missingFilters = this.config.requiredFilters.filter(
			(requiredField) =>
				!requestFilters.some(
					(filter) => filter.field === requiredField && !filter.having
				)
		);

		if (missingFilters.length > 0) {
			throw new Error(
				`Missing required filter${missingFilters.length > 1 ? "s" : ""}: ${missingFilters
					.map((field) => `'${field}'`)
					.join(", ")}.`
			);
		}
	}

	private needsSessionAttribution(): boolean {
		if (!this.config.plugins?.sessionAttribution) {
			return false;
		}

		if (
			this.request.filters?.some((filter) =>
				isSessionAttributionField(filter.field)
			)
		) {
			return true;
		}

		if (
			this.request.groupBy?.some((field) => isSessionAttributionField(field))
		) {
			return true;
		}

		const parts = [
			...(this.config.fields ?? []).map((field) => compileConfigField(field)),
			...(this.config.groupBy ?? []),
			...(this.config.where ?? []),
		];
		return parts.some((part) =>
			SESSION_ATTRIBUTION_FIELDS.some((field) =>
				new RegExp(`\\b${field}\\b`).test(part)
			)
		);
	}

	private generateSessionAttributionCTE(
		timeField: string,
		table: string,
		fromParam: string,
		toParam: string
	): string {
		const idField = this.getIdField();
		return `session_attribution AS (
			SELECT 
				session_id,
				${sessionAttribution.selectFields(timeField).join(",\n\t\t\t")}
			FROM ${table}
			WHERE ${this.buildIdCondition(idField)}
				AND ${timeField} >= toDateTime({${fromParam}:String})
				AND ${timeField} <= toDateTime(concat({${toParam}:String}, ' 23:59:59'))
				AND session_id != ''
			GROUP BY session_id
		)`;
	}

	private generateSessionAttributionJoin(alias: string): string {
		return `INNER JOIN session_attribution sa ON ${alias}.session_id = sa.session_id`;
	}

	private replaceDomainPlaceholders(sql: string): string {
		if (!this.websiteDomain) {
			return sql
				.replace(/domain\(referrer\) != '\{websiteDomain\}'/g, "1=1")
				.replace(/NOT domain\(referrer\) ILIKE '%\.\{websiteDomain\}'/g, "1=1")
				.replace(
					/domain\(referrer\) NOT IN \('localhost', '127\.0\.0\.1'\)/g,
					"1=1"
				)
				.replace(/\{websiteDomain\}/g, "__databuddy_no_domain__");
		}
		return sql.replace(/\{websiteDomain\}/g, this.websiteDomain);
	}

	private finalizeCompiledQuery(
		sql: string,
		params: Record<string, Filter["value"]>
	): CompiledQuery {
		const finalParams: Record<string, Filter["value"]> = { ...params };

		for (const [key, value] of Object.entries(finalParams)) {
			if (DATE_PARAM_NAMES.has(key) && typeof value === "string") {
				finalParams[key] = normalizeClickHouseDateTime(value);
			}
		}

		const promoteToEndOfDay = (paramName: string): void => {
			const value = finalParams[paramName];
			if (typeof value === "string") {
				finalParams[paramName] = normalizeClickHouseDateTime(value, {
					endOfDay: true,
				});
			}
		};

		let finalSql = sql.replace(
			END_OF_DAY_WITH_TZ_REGEX,
			(_match, paramName) => {
				promoteToEndOfDay(paramName);
				return dateBindingExpression(paramName, true);
			}
		);

		finalSql = finalSql.replace(END_OF_DAY_REGEX, (_match, paramName) => {
			promoteToEndOfDay(paramName);
			return dateBindingExpression(paramName);
		});

		finalSql = finalSql.replace(TO_DATE_TIME_REGEX, (_match, paramName) =>
			dateBindingExpression(paramName)
		);

		if (finalSql.includes("{timezone:String}") && !finalParams.timezone) {
			finalParams.timezone = this.request.timezone || "UTC";
		}

		if (this.isOrganizationScope()) {
			finalParams.websiteIds = this.request.organizationWebsiteIds ?? [];
			const idFields = new Set<string>(ORG_SCOPE_ID_FIELDS);
			idFields.add(this.getIdField());
			for (const field of idFields) {
				finalSql = finalSql.replace(
					orgScopeRegex(field),
					"$1 IN {websiteIds:Array(String)}"
				);
			}
		}

		for (const key of DATE_PARAM_NAMES) {
			const value = finalParams[key];
			if (typeof value === "string") {
				finalParams[key] = padToClickHouseDateTime(value);
			}
		}

		return { sql: finalSql, params: finalParams };
	}

	compile(): CompiledQuery {
		this.validateRequiredFilters();

		if (this.config.customSql) {
			const whereClauseParams: Record<string, Filter["value"]> = {};
			const needsAttribution = this.needsSessionAttribution();
			const whereClause = this.buildWhereClauseFromFilters(
				whereClauseParams,
				needsAttribution ? { sessionAttributionAlias: "sa" } : undefined
			);

			if (this.request.organizationWebsiteIds) {
				whereClauseParams.__orgLevel = "true";
			}

			const helpers = needsAttribution
				? {
						sessionAttributionCTE: (timeField = "time") =>
							this.generateSessionAttributionCTE(
								timeField,
								"analytics.events",
								"startDate",
								"endDate"
							),
						sessionAttributionJoin: (alias = "e") =>
							this.generateSessionAttributionJoin(alias),
					}
				: undefined;

			const result = this.config.customSql({
				websiteId: this.request.projectId,
				startDate: normalizeClickHouseDateTime(this.request.from),
				endDate: normalizeClickHouseDateTime(this.request.to),
				filters: this.request.filters,
				granularity: this.request.timeUnit,
				limit: this.request.limit,
				offset: this.request.offset,
				timezone: this.request.timezone,
				filterConditions: whereClause,
				filterParams: whereClauseParams,
				helpers,
				orderBy: this.request.orderBy,
			});

			if (typeof result === "string") {
				return this.finalizeCompiledQuery(result, {});
			}
			return this.finalizeCompiledQuery(
				result.sql,
				result.params as Record<string, Filter["value"]>
			);
		}

		return this.buildStandardQuery();
	}

	private buildStandardQuery(): CompiledQuery {
		const params: Record<string, Filter["value"]> = {
			websiteId: this.request.projectId,
			from: normalizeClickHouseDateTime(this.request.from),
			to: normalizeClickHouseDateTime(this.request.to),
		};

		if (this.config.timeBucket?.timezone && this.request.timezone) {
			params.timezone = this.request.timezone as string;
		}

		const needsAttribution = this.needsSessionAttribution();
		const hasCTEs = this.config.with?.length || needsAttribution;

		if (needsAttribution && !this.config.with?.length) {
			return this.buildSessionAttributionQuery(params);
		}

		const fields: string[] = [];
		if (this.config.timeBucket && this.getGranularity()) {
			fields.push(this.buildTimeBucketField(this.config.timeBucket));
		}
		fields.push(this.compileFields(this.config.fields));
		const fieldsStr = fields.filter(Boolean).join(", ");

		const ctesStr = hasCTEs ? this.compileCTEs(params) : "";
		const fromSource = this.config.from || this.config.table;

		let body = `SELECT ${fieldsStr} FROM ${fromSource}`;

		if (!this.config.from) {
			const whereClause = this.buildWhereClause(params);
			body += ` WHERE ${whereClause.join(" AND ")}`;
		} else if (this.config.where?.length) {
			body += ` WHERE ${this.config.where.join(" AND ")}`;
		}

		body = this.replaceDomainPlaceholders(body);
		body += this.buildGroupByClause();
		body += this.buildHavingClause(params);

		const ctePrefix = ctesStr ? `${ctesStr}\n` : "";
		let sql = ctePrefix + this.wrapPercentage(body);
		sql += this.buildOrderByClause();
		sql += this.buildLimitClause();
		sql += this.buildOffsetClause();

		return this.finalizeCompiledQuery(sql, params);
	}

	private wrapPercentage(innerSql: string): string {
		const pct = this.config.percentageOf;
		if (!pct) {
			return innerSql;
		}
		const alias = pct.as ?? "percentage";
		const projection = this.getPercentageProjection(alias);
		return `SELECT ${projection}, ROUND(${pct.of} / sum(${pct.of}) OVER () * 100, 2) AS ${alias} FROM (${innerSql})`;
	}

	private getPercentageProjection(percentageAlias: string): string {
		const outputFields = this.config.meta?.output_fields
			?.map((field) => field.name)
			.filter((name) => name !== percentageAlias);

		if (outputFields?.length) {
			const timeBucketAlias = this.getTimeBucketAlias();
			if (timeBucketAlias && !outputFields.includes(timeBucketAlias)) {
				return [timeBucketAlias, ...outputFields].join(", ");
			}
			return outputFields.join(", ");
		}

		const aliases: string[] = [];
		const timeBucketAlias = this.getTimeBucketAlias();
		if (timeBucketAlias) {
			aliases.push(timeBucketAlias);
		}

		for (const field of this.config.fields ?? []) {
			const alias = this.getFieldAlias(field);
			if (alias && alias !== percentageAlias) {
				aliases.push(alias);
			}
		}

		return aliases.length ? aliases.join(", ") : "*";
	}

	private getFieldAlias(field: ConfigField): string | null {
		if (typeof field !== "string") {
			return field.alias;
		}

		const aliasMatch = field.match(FIELD_ALIAS_PATTERN);
		if (aliasMatch?.[1]) {
			return aliasMatch[1];
		}

		const trimmed = field.trim();
		if (SIMPLE_FIELD_PATTERN.test(trimmed)) {
			return trimmed.split(".").at(-1) ?? trimmed;
		}

		return null;
	}

	private compileFields(fields?: ConfigField[]): string {
		if (!fields?.length) {
			return "*";
		}
		return fields.map((f) => compileConfigField(f)).join(", ");
	}

	private compileCTE(
		cte: CTEDefinition,
		params: Record<string, Filter["value"]>
	): string {
		const source = cte.from || cte.table;
		if (!source) {
			throw new Error(
				`CTE '${cte.name}' must have either 'table' or 'from' defined`
			);
		}

		const fields = this.compileFields(cte.fields);
		const parts = [`SELECT ${fields}`, `FROM ${source}`];
		const whereConditions: string[] = [];

		if (cte.where?.length) {
			whereConditions.push(...cte.where);
		}

		if (cte.table && !this.config.skipDateFilter) {
			const timeField = this.config.timeField || "time";
			const idField = this.getIdField();
			whereConditions.push(this.buildIdCondition(idField));
			whereConditions.push(`${timeField} >= toDateTime({from:String})`);
			whereConditions.push(
				`${timeField} <= toDateTime(concat({to:String}, ' 23:59:59'))`
			);
		}

		const cteFilters = this.request.filters?.filter(
			(f) => f.target === cte.name && !f.having
		);
		if (cteFilters?.length) {
			const baseIdx = Object.keys(params).length;
			for (let i = 0; i < cteFilters.length; i++) {
				const filter = cteFilters[i];
				if (!filter) {
					continue;
				}
				const { clause, params: filterParams } = this.buildFilter(
					filter,
					baseIdx + i
				);
				whereConditions.push(clause);
				Object.assign(params, filterParams);
			}
		}

		if (whereConditions.length > 0) {
			parts.push(`WHERE ${whereConditions.join(" AND ")}`);
		}

		if (cte.groupBy?.length) {
			parts.push(`GROUP BY ${cte.groupBy.join(", ")}`);
		}

		if (cte.orderBy) {
			parts.push(`ORDER BY ${cte.orderBy}`);
		}

		if (cte.limit) {
			parts.push(`LIMIT ${cte.limit}`);
		}

		return `${cte.name} AS (\n\t\t${parts.join("\n\t\t")}\n\t)`;
	}

	private compileCTEs(params: Record<string, Filter["value"]>): string {
		const ctes: string[] = [];

		const needsAttribution = this.needsSessionAttribution();
		if (needsAttribution) {
			const timeField = this.config.timeField || "time";
			const table = this.config.table || "analytics.events";
			ctes.push(
				this.generateSessionAttributionCTE(timeField, table, "from", "to")
			);
		}

		if (this.config.with?.length) {
			for (const cte of this.config.with) {
				ctes.push(this.compileCTE(cte, params));
			}
		}

		return ctes.length > 0 ? `WITH ${ctes.join(",\n\t")}` : "";
	}

	private getGranularity(): Granularity | undefined {
		const requestGranularity = normalizeGranularity(this.request.timeUnit);
		return requestGranularity || this.config.timeBucket?.granularity;
	}

	private buildTimeBucketField(config: TimeBucketConfig): string {
		const granularity = this.getGranularity();
		if (!granularity) {
			return "";
		}

		const field = config.field || this.config.timeField || "time";
		const alias = config.alias || "date";
		const tz = config.timezone ? this.request.timezone : undefined;

		if (
			config.format !== false &&
			(granularity === "hour" || granularity === "minute")
		) {
			return `${time.bucketFormatted(granularity, field, tz)} as ${alias}`;
		}

		return `${time.bucket(granularity, field, tz)} as ${alias}`;
	}

	private getTimeBucketAlias(): string | null {
		if (!this.config.timeBucket) {
			return null;
		}
		if (!this.getGranularity()) {
			return null;
		}
		return this.config.timeBucket.alias || "date";
	}

	private buildHavingClause(params: Record<string, Filter["value"]>): string {
		const conditions: string[] = [];

		if (this.config.having?.length) {
			conditions.push(...this.config.having);
		}

		const havingFilters = this.request.filters?.filter((f) => f.having);
		if (havingFilters?.length) {
			const startIdx = Object.keys(params).length;
			for (let i = 0; i < havingFilters.length; i++) {
				const filter = havingFilters[i];
				if (!filter) {
					continue;
				}
				const { clause, params: filterParams } = this.buildFilter(
					filter,
					startIdx + i
				);
				conditions.push(clause);
				Object.assign(params, filterParams);
			}
		}

		return conditions.length > 0 ? ` HAVING ${conditions.join(" AND ")}` : "";
	}

	private buildSessionAttributionQuery(
		params: Record<string, Filter["value"]>
	): CompiledQuery {
		const timeField = this.config.timeField || "time";
		const table = this.config.table || "analytics.events";
		const filterClauses = this.buildWhereClauseFromFilters(params, {
			sessionAttributionAlias: "sa",
		});

		const mainFields = this.compileFields(this.config.fields).replace(
			/, /g,
			",\n\t\t\t"
		);
		const additionalWhere = this.config.where
			? `${this.config.where.join(" AND ")} AND `
			: "";
		const finalWhereClause =
			filterClauses.length > 0 ? filterClauses.join(" AND ") : "1=1";

		const idField = this.getIdField();
		let body = `
		WITH ${this.generateSessionAttributionCTE(timeField, table, "from", "to")},
		attributed_events AS (
			SELECT
				e.* REPLACE(
					${sessionAttribution.joinSelectFields("sa").join(",\n\t\t\t\t\t")}
				)
			FROM ${table} e
			${this.generateSessionAttributionJoin("e")}
			WHERE ${this.buildIdCondition(`e.${idField}`)}
				AND e.${timeField} >= toDateTime({from:String})
				AND e.${timeField} <= toDateTime(concat({to:String}, ' 23:59:59'))
				AND e.session_id != ''
				AND ${additionalWhere}${finalWhereClause}
		)
		SELECT ${mainFields}
		FROM attributed_events`;

		body = this.replaceDomainPlaceholders(body);
		body += this.buildGroupByClause();

		let sql = this.wrapPercentage(body);
		sql += this.buildOrderByClause();
		sql += this.buildLimitClause();
		sql += this.buildOffsetClause();

		return this.finalizeCompiledQuery(sql, params);
	}

	private buildWhereClause(params: Record<string, Filter["value"]>): string[] {
		const whereClause: string[] = [];

		if (this.config.where) {
			whereClause.push(...this.config.where);
		}

		whereClause.push(this.buildIdCondition(this.getIdField()));

		if (!this.config.skipDateFilter) {
			const timeField = this.config.timeField || "time";
			whereClause.push(`${timeField} >= toDateTime({from:String})`);

			if (this.config.appendEndOfDayToTo === false) {
				whereClause.push(`${timeField} <= toDateTime({to:String})`);
			} else {
				whereClause.push(
					`${timeField} <= toDateTime(concat({to:String}, ' 23:59:59'))`
				);
			}
		}

		if (this.request.filters) {
			whereClause.push(...this.buildWhereClauseFromFilters(params));
		}

		return whereClause;
	}

	private buildWhereClauseFromFilters(
		params: Record<string, Filter["value"]>,
		options?: { sessionAttributionAlias?: string }
	): string[] {
		const whereClause: string[] = [];

		if (this.request.filters) {
			for (let i = 0; i < this.request.filters.length; i++) {
				const filter = this.request.filters[i];
				if (!filter || filter.target || filter.having) {
					continue;
				}
				// Skip filters for fields not supported by this query type rather
				// than throwing — in a multi-query batch, a dimension specific to
				// one query type (e.g. "href" for outbound_links) should simply be
				// ignored by query types that don't know about it.
				const isGloballyAllowed = GLOBAL_ALLOWED_FILTERS.includes(
					filter.field as (typeof GLOBAL_ALLOWED_FILTERS)[number]
				);
				if (
					!(
						isGloballyAllowed ||
						this.config.allowedFilters?.includes(filter.field)
					)
				) {
					continue;
				}
				const { clause, params: filterParams } = this.buildFilter(
					filter,
					i,
					options
				);
				whereClause.push(clause);
				Object.assign(params, filterParams);
			}
		}

		return whereClause;
	}

	private buildGroupByClause(): string {
		const groupByFields: string[] = [];

		const timeBucketAlias = this.getTimeBucketAlias();
		if (timeBucketAlias) {
			groupByFields.push(timeBucketAlias);
		}

		if (this.request.groupBy?.length) {
			for (const f of this.request.groupBy) {
				validateGroupByField(f);
			}
			groupByFields.push(...this.request.groupBy);
		} else if (this.config.groupBy?.length) {
			groupByFields.push(...this.config.groupBy);
		}

		if (groupByFields.length === 0) {
			return "";
		}

		return ` GROUP BY ${groupByFields.join(", ")}`;
	}

	private buildOrderByClause(): string {
		if (this.request.orderBy) {
			return ` ORDER BY ${normalizeOrderBy(this.request.orderBy)}`;
		}
		if (this.config.orderBy) {
			return ` ORDER BY ${this.config.orderBy}`;
		}
		return "";
	}

	private buildLimitClause(): string {
		const limit = this.request.limit || this.config.limit;
		return limit ? ` LIMIT ${limit}` : "";
	}

	private buildOffsetClause(): string {
		return this.request.offset ? ` OFFSET ${this.request.offset}` : "";
	}

	async execute(): Promise<Record<string, unknown>[]> {
		const { sql, params } = this.compile();
		const rawData = await chQuery<Record<string, unknown>>(sql, params, {
			clickhouse_settings: getClickHouseQuerySettings(this.config.noCache),
		});
		return applyPlugins(rawData, this.config, this.websiteDomain);
	}
}
