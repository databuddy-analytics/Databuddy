import { chQuery } from "@databuddy/db";
import type { Granularity } from "./expressions";
import {
	compileConfigField,
	Expressions,
	normalizeGranularity,
	sessionAttribution,
	time,
} from "./expressions";
import {
	COMMON_RESOLUTION_DEVICE_TYPE,
	type DeviceType,
} from "./screen-resolution-to-device-type";
import type {
	CompiledQuery,
	ConfigField,
	CTEDefinition,
	Filter,
	QueryRequest,
	SimpleQueryConfig,
	TimeBucketConfig,
} from "./types";
import { FilterOperators } from "./types";
import { applyPlugins } from "./utils";

const SPECIAL_FILTER_FIELDS = {
	PATH: "path",
	REFERRER: "referrer",
	DEVICE_TYPE: "device_type",
} as const;

const DANGEROUS_SQL_KEYWORDS = [
	"DROP",
	"DELETE",
	"INSERT",
	"UPDATE",
	"CREATE",
	"ALTER",
	"TRUNCATE",
	"EXEC",
	"EXECUTE",
] as const;

const SQL_EXPRESSIONS = {
	normalizedPath: Expressions.path.normalized as string,
	normalizedReferrer: Expressions.referrer.normalized as string,
} as const;

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
	instagram: "https://instagram.com",
	"instagram.com": "https://instagram.com",
	"www.instagram.com": "https://instagram.com",
	"l.instagram.com": "https://instagram.com",
};

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

function validateNoSqlInjection(field: string, context: string): void {
	const upperField = field.toUpperCase();
	for (const keyword of DANGEROUS_SQL_KEYWORDS) {
		if (upperField.includes(keyword)) {
			throw new Error(
				`${context} field '${field}' contains dangerous keyword: ${keyword}`
			);
		}
	}
}

function buildDeviceTypeSQL(deviceType: DeviceType): string {
	const exactMatches = Object.entries(COMMON_RESOLUTION_DEVICE_TYPE)
		.filter(([, type]) => type === deviceType)
		.map(([resolution]) => `'${resolution}'`)
		.join(", ");

	const widthExpr =
		"toFloat64(if(position(screen_resolution, 'x') > 0, substring(screen_resolution, 1, position(screen_resolution, 'x') - 1), NULL))";
	const heightExpr =
		"toFloat64(if(position(screen_resolution, 'x') > 0, substring(screen_resolution, position(screen_resolution, 'x') + 1), NULL))";
	const longSide = `greatest(${widthExpr}, ${heightExpr})`;
	const shortSide = `least(${widthExpr}, ${heightExpr})`;
	const aspect = `${longSide} / ${shortSide}`;

	const heuristics: Record<DeviceType, string> = {
		mobile: `(${shortSide} <= 480 AND ${shortSide} IS NOT NULL)`,
		tablet: `(${shortSide} <= 900 AND ${shortSide} > 480 AND ${shortSide} IS NOT NULL)`,
		laptop: `(${longSide} <= 1600 AND ${shortSide} > 900 AND ${longSide} IS NOT NULL)`,
		desktop: `(${longSide} <= 3000 AND ${longSide} > 1600 AND ${longSide} IS NOT NULL)`,
		ultrawide: `(${aspect} >= 2.0 AND ${longSide} >= 2560 AND ${longSide} IS NOT NULL)`,
		watch: `(${longSide} <= 400 AND ${aspect} >= 0.85 AND ${aspect} <= 1.15 AND ${longSide} IS NOT NULL)`,
		unknown: "1 = 0",
	};

	const heuristic = heuristics[deviceType] || "1 = 0";
	return exactMatches
		? `(screen_resolution IN (${exactMatches}) OR ${heuristic})`
		: heuristic;
}

type FilterResult = { clause: string; params: Record<string, Filter["value"]> };

function buildGenericFilter(
	filter: Filter,
	key: string,
	operator: string,
	fieldExpr: string,
	valueTransform?: (v: string) => string
): FilterResult {
	const transform = valueTransform || ((v: string) => v);

	if (filter.op === "isNull" || filter.op === "isNotNull") {
		return { clause: `${fieldExpr} ${operator}`, params: {} };
	}

	if (
		filter.op === "like" ||
		filter.op === "ilike" ||
		filter.op === "notLike"
	) {
		const value = transform(String(filter.value));
		return {
			clause: `${fieldExpr} ${operator} {${key}:String}`,
			params: { [key]: `%${value}%` },
		};
	}

	if (filter.op === "in" || filter.op === "notIn") {
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

function buildSessionFieldsSelect(timeField: string): string {
	return sessionAttribution.selectFields(timeField).join(",\n\t\t\t");
}

function buildSessionFieldsJoinSelect(): string {
	return sessionAttribution.joinSelectFields("sa").join(",\n\t\t\t\t");
}

export class SimpleQueryBuilder {
	private readonly config: SimpleQueryConfig;
	private readonly request: QueryRequest;
	private readonly websiteDomain?: string | null;

	constructor(
		config: SimpleQueryConfig,
		request: QueryRequest,
		websiteDomain?: string | null
	) {
		this.config = config;
		this.request = request;
		this.websiteDomain = websiteDomain;
	}

	private buildFilter(filter: Filter, index: number): FilterResult {
		if (
			this.config.allowedFilters &&
			!this.config.allowedFilters.includes(filter.field)
		) {
			throw new Error(`Filter on field '${filter.field}' is not permitted.`);
		}

		const key = `f${index}`;
		const operator = FilterOperators[filter.op];

		if (filter.field === SPECIAL_FILTER_FIELDS.PATH) {
			return buildGenericFilter(filter, key, operator, SQL_EXPRESSIONS.normalizedPath);
		}

		if (filter.field === SPECIAL_FILTER_FIELDS.REFERRER) {
			return buildGenericFilter(
				filter,
				key,
				operator,
				SQL_EXPRESSIONS.normalizedReferrer,
				(v) => normalizeReferrerValue(v, filter.op === "like")
			);
		}

		if (
			filter.field === SPECIAL_FILTER_FIELDS.DEVICE_TYPE &&
			typeof filter.value === "string"
		) {
			return { clause: buildDeviceTypeSQL(filter.value as DeviceType), params: {} };
		}

		return buildGenericFilter(filter, key, operator, filter.field);
	}

	private generateSessionAttributionCTE(
		timeField: string,
		table: string,
		fromParam: string,
		toParam: string
	): string {
		return `session_attribution AS (
			SELECT 
				session_id,
				${buildSessionFieldsSelect(timeField)}
			FROM ${table}
			WHERE client_id = {websiteId:String}
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
				.replace(/NOT domain\(referrer\) ILIKE '%.{websiteDomain}'/g, "1=1")
				.replace(
					/domain\(referrer\) NOT IN \('localhost', '127\.0\.0\.1'\)/g,
					"1=1"
				);
		}
		return sql
			.replace(/\{websiteDomain\}/g, this.websiteDomain)
			.replace(/%.{websiteDomain}/g, `%.${this.websiteDomain}`);
	}

	private formatDateTime(dateStr: string): string {
		return (dateStr.split(".")[0] || dateStr).replace("T", " ");
	}

	compile(): CompiledQuery {
		if (this.config.customSql) {
			const whereClauseParams: Record<string, Filter["value"]> = {};
			const whereClause = this.buildWhereClauseFromFilters(whereClauseParams);

			const helpers = this.config.plugins?.sessionAttribution
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

			const result = this.config.customSql(
				this.request.projectId,
				this.formatDateTime(this.request.from),
				this.formatDateTime(this.request.to),
				this.request.filters,
				this.request.timeUnit,
				this.request.limit,
				this.request.offset,
				this.request.timezone,
				whereClause,
				whereClauseParams,
				helpers
			);

			if (typeof result === "string") {
				return { sql: result, params: {} };
			}
			return { sql: result.sql, params: result.params };
		}

		return this.buildStandardQuery();
	}

	private buildStandardQuery(): CompiledQuery {
		const params: Record<string, Filter["value"]> = {
			websiteId: this.request.projectId,
			from: this.formatDateTime(this.request.from),
			to: this.formatDateTime(this.request.to),
		};

		if (this.config.timeBucket?.timezone && this.getTimezone()) {
			params.timezone = this.getTimezone() as string;
		}

		const hasCTEs =
			this.config.with?.length || this.config.plugins?.sessionAttribution;

		if (this.config.plugins?.sessionAttribution && !this.config.with?.length) {
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

		let sql = ctesStr ? `${ctesStr}\n` : "";
		sql += `SELECT ${fieldsStr} FROM ${fromSource}`;

		if (!this.config.from) {
			const whereClause = this.buildWhereClause(params);
			sql += ` WHERE ${whereClause.join(" AND ")}`;
		} else if (this.config.where?.length) {
			sql += ` WHERE ${this.config.where.join(" AND ")}`;
		}

		sql = this.replaceDomainPlaceholders(sql);
		sql += this.buildGroupByClause();
		sql += this.buildHavingClause(params);
		sql += this.buildOrderByClause();
		sql += this.buildLimitClause();
		sql += this.buildOffsetClause();

		return { sql, params };
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
			whereConditions.push("client_id = {websiteId:String}");
			whereConditions.push(
				`${timeField} >= toDateTime({from:String})`
			);
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

		if (this.config.plugins?.sessionAttribution) {
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

	private getTimezone(): string | undefined {
		return this.request.timezone;
	}

	private buildTimeBucketField(config: TimeBucketConfig): string {
		const granularity = this.getGranularity();
		if (!granularity) {
			return "";
		}

		const field = config.field || this.config.timeField || "time";
		const alias = config.alias || "date";
		const tz = config.timezone ? this.getTimezone() : undefined;

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
		const filterClauses = this.buildWhereClauseFromFilters(params);

		const mainFields = this.compileFields(this.config.fields).replace(
			/, /g,
			",\n\t\t\t"
		);
		const additionalWhere = this.config.where
			? `${this.config.where.join(" AND ")} AND `
			: "";
		const finalWhereClause =
			filterClauses.length > 0 ? filterClauses.join(" AND ") : "1=1";

		let sql = `
		WITH ${this.generateSessionAttributionCTE(timeField, table, "from", "to")},
		attributed_events AS (
			SELECT 
				e.*,
				${buildSessionFieldsJoinSelect()}
			FROM ${table} e
			${this.generateSessionAttributionJoin("e")}
			WHERE e.client_id = {websiteId:String}
				AND e.${timeField} >= toDateTime({from:String})
				AND e.${timeField} <= toDateTime(concat({to:String}, ' 23:59:59'))
				AND e.session_id != ''
				AND ${additionalWhere}${finalWhereClause}
		)
		SELECT ${mainFields}
		FROM attributed_events`;

		sql = this.replaceDomainPlaceholders(sql);
		sql += this.buildGroupByClause();
		sql += this.buildOrderByClause();
		sql += this.buildLimitClause();
		sql += this.buildOffsetClause();

		return { sql, params };
	}

	private buildWhereClause(params: Record<string, Filter["value"]>): string[] {
		const whereClause: string[] = [];

		if (this.config.where) {
			whereClause.push(...this.config.where);
		}

		whereClause.push("client_id = {websiteId:String}");

		if (!this.config.skipDateFilter) {
			const timeField = this.config.timeField || "time";
			whereClause.push(
				`${timeField} >= toDateTime({from:String})`
			);

			if (this.config.appendEndOfDayToTo !== false) {
				whereClause.push(
					`${timeField} <= toDateTime(concat({to:String}, ' 23:59:59'))`
				);
			} else {
				whereClause.push(
					`${timeField} <= toDateTime({to:String})`
				);
			}
		}

		if (this.request.filters) {
			whereClause.push(...this.buildWhereClauseFromFilters(params));
		}

		return whereClause;
	}

	private buildWhereClauseFromFilters(
		params: Record<string, Filter["value"]>
	): string[] {
		const whereClause: string[] = [];

		if (this.request.filters) {
			for (let i = 0; i < this.request.filters.length; i++) {
				const filter = this.request.filters[i];
				if (!filter) {
					continue;
				}
				const { clause, params: filterParams } = this.buildFilter(filter, i);
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

		const groupBy = this.request.groupBy || this.config.groupBy;
		if (groupBy?.length) {
			for (const f of groupBy) {
				validateNoSqlInjection(f, "Grouping");
			}
			groupByFields.push(...groupBy);
		}

		if (groupByFields.length === 0) {
			return "";
		}

		return ` GROUP BY ${groupByFields.join(", ")}`;
	}

	private buildOrderByClause(): string {
		const orderBy = this.request.orderBy || this.config.orderBy;
		if (!orderBy) {
			return "";
		}
		validateNoSqlInjection(orderBy, "Ordering");
		return ` ORDER BY ${orderBy}`;
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
		const rawData = await chQuery(sql, params);
		return applyPlugins(rawData, this.config, this.websiteDomain);
	}
}
