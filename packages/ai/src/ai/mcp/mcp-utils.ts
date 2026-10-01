import { AGENT_TABLE_COLUMNS } from "@databuddy/db/clickhouse";
import {
	ANALYTICS_TABLES,
	SCHEMA_SECTIONS,
} from "../prompts/clickhouse-schema";
import { type DatePreset, resolveDatePreset } from "../../lib/date-presets";
import { captureError } from "../../lib/tracing";
import { getQueryBuilder, QueryBuilders } from "../../query/builders";
import {
	allowedFilterFields,
	invalidFilterFieldError,
	publicQueryErrorMessage,
	SANITIZED_QUERY_ERROR,
	suggestQueryTypes,
	truncateQueryErrorForLog,
} from "../../query";
import type {
	Filter,
	FilterOperator,
	QueryRequest,
	SimpleQueryConfig,
} from "../../query/types";
import { z } from "zod";

export const FilterSchema = z.object({
	field: z.string(),
	op: z.enum([
		"eq",
		"ne",
		"contains",
		"not_contains",
		"starts_with",
		"in",
		"not_in",
	]),
	value: z.union([
		z.string(),
		z.number(),
		z.array(z.union([z.string(), z.number()])),
	]),
	target: z.string().optional(),
	having: z.boolean().optional(),
}) satisfies z.ZodType<Filter>;

export { MCP_DATE_PRESETS } from "../../lib/date-presets";

export { SCHEMA_SECTIONS } from "../prompts/clickhouse-schema";

export const MCP_RESULT_ROW_LIMIT = 20;

export function queryFailedMessage(type: string): string {
	return `The ${type} query failed to run. Retry, shorten the date range, or remove filters.`;
}

export interface McpQueryItem {
	filters?: Filter[];
	from?: string;
	groupBy?: string[];
	limit?: number;
	orderBy?: string;
	preset?: DatePreset;
	timeUnit?: "minute" | "hour" | "day" | "week" | "month";
	to?: string;
	type: string;
}

const TOP_QUERY_PREFIX = /^top_/;

const QUERY_TYPE_ALIASES: Record<string, string> = {
	countries: "country",
	top_countries: "country",
	top_browsers: "browsers",
	top_os: "operating_systems",
	top_devices: "device_types",
	top_languages: "language",
	top_timezones: "timezone",
	browser: "browsers",
	os: "operating_systems",
	devices: "device_types",
	referrers: "top_referrers",
	pages: "top_pages",
};

function resolveQueryType(type: string): string {
	return QUERY_TYPE_ALIASES[type] ?? type;
}

interface InvalidBatchQuery {
	error: string;
	inputIndex: number;
	summary: string;
	type: string;
}

interface IndexedQueryRequest extends QueryRequest {
	inputIndex: number;
	keepNewestRows: boolean;
	rowLimit: number;
	summary: string;
	timezone: string;
}

interface McpBatchQueryPlan {
	invalid: InvalidBatchQuery[];
	requests: IndexedQueryRequest[];
}

interface ExecutedQueryResult {
	data: Record<string, unknown>[];
	error?: string;
	type: string;
}

export interface McpQueryResult {
	data: Record<string, unknown>[];
	definition?: string;
	error?: string;
	returnedRows: number;
	rowCount: number;
	summary: string;
	truncated: boolean;
	type: string;
}

const DateOnlySchema = z.iso.date();
const MS_PER_DAY = 86_400_000;
const MAX_DAYS_BY_TIME_UNIT: Partial<
	Record<NonNullable<McpQueryItem["timeUnit"]>, { days: number; wider: string }>
> = {
	minute: { days: 1, wider: "hour" },
	hour: { days: 30, wider: "day" },
};
const MAX_TIME_SERIES_DAYS = 400;
const CUSTOM_SQL_ORDER_BY_TYPES = new Set(["profile_list"]);
const LIST_OPERATORS: readonly FilterOperator[] = ["in", "not_in"];
const TIME_SERIES_TAGS = new Set(["time-series", "timeseries", "trends"]);
const BREAKDOWN_TAG = "breakdown";
const DATE_ASCENDING_ORDER_RE = /^date ASC\b/i;

function timezoneError(timezone: string): string | null {
	let resolved: string;
	try {
		resolved = new Intl.DateTimeFormat("en-US", {
			timeZone: timezone,
		}).resolvedOptions().timeZone;
	} catch {
		return `Invalid timezone: ${timezone}. Use an IANA timezone such as UTC.`;
	}
	if (
		resolved !== timezone &&
		resolved.toLowerCase() === timezone.toLowerCase()
	) {
		return `Timezone names are case-sensitive. Use ${resolved}, not ${timezone}.`;
	}
	return null;
}

function isTimeSeries(config: SimpleQueryConfig): boolean {
	return (
		config.meta?.default_visualization === "timeseries" ||
		(config.meta?.tags ?? []).some((tag) => TIME_SERIES_TAGS.has(tag)) ||
		DATE_ASCENDING_ORDER_RE.test(config.orderBy ?? "")
	);
}

function filterShapeError(filters: Filter[] | undefined): string | null {
	for (const filter of filters ?? []) {
		if (filter.target || filter.having) {
			return `Filter '${filter.field}' sets target or having, which get_data does not accept. Pass field, op, and value only.`;
		}
		if (Array.isArray(filter.value) && !LIST_OPERATORS.includes(filter.op)) {
			return `Filter '${filter.field}' uses op '${filter.op}' with a list of values. Use 'in' or 'not_in' for a list, or pass a single value.`;
		}
	}
	return null;
}

function queryShapeError(
	type: string,
	config: SimpleQueryConfig,
	query: McpQueryItem,
	days: number,
	timeSeries: boolean
): string | null {
	if (config.customSql && query.groupBy?.length) {
		return `${type} returns fixed columns and does not support groupBy. Remove groupBy.`;
	}
	if (
		config.customSql &&
		query.orderBy &&
		!CUSTOM_SQL_ORDER_BY_TYPES.has(type)
	) {
		return `${type} returns rows in a fixed order and does not support orderBy. Remove orderBy.`;
	}
	const supported = config.meta?.supports_granularity ?? [];
	if (
		query.timeUnit &&
		!config.timeBucket &&
		!supported.some((unit) => unit === query.timeUnit)
	) {
		return supported.length > 0
			? `timeUnit '${query.timeUnit}' is not supported for ${type}. Use ${supported.join(" or ")}.`
			: `${type} does not take a timeUnit. Remove timeUnit.`;
	}
	if (!timeSeries) {
		return null;
	}
	const window = query.timeUnit && MAX_DAYS_BY_TIME_UNIT[query.timeUnit];
	if (window && days > window.days) {
		return `timeUnit '${query.timeUnit}' covers at most ${window.days + 1} calendar days. Use '${window.wider}' for longer ranges.`;
	}
	if (days > MAX_TIME_SERIES_DAYS) {
		return `${type} is a time series, so from and to can be at most ${MAX_TIME_SERIES_DAYS} days apart. Split longer ranges into several queries.`;
	}
	return null;
}

function querySummary(input: {
	filters?: Filter[];
	from?: string;
	groupBy?: string[];
	limit?: number;
	orderBy?: string;
	timeUnit?: QueryRequest["timeUnit"];
	timezone: string;
	to?: string;
	type: string;
}): string {
	const filters =
		input.filters && input.filters.length > 0
			? JSON.stringify(input.filters)
			: "none";
	const groupBy =
		input.groupBy && input.groupBy.length > 0
			? JSON.stringify(input.groupBy)
			: "default";
	return `${input.type} | ${input.from ?? "unresolved"} to ${input.to ?? "unresolved"} | timezone=${input.timezone} | filters=${filters} | groupBy=${groupBy} | timeUnit=${input.timeUnit ?? "default"} | orderBy=${input.orderBy ?? "default"} | limit=${input.limit ?? "default"}`;
}

export function buildBatchQueryRequests(
	items: McpQueryItem[],
	websiteId: string,
	timezone = "UTC",
	now = new Date()
): McpBatchQueryPlan {
	const requests: IndexedQueryRequest[] = [];
	const invalid: InvalidBatchQuery[] = [];
	const invalidTimezone = timezoneError(timezone);
	for (const [inputIndex, q] of items.entries()) {
		const resolvedType = resolveQueryType(q.type);
		let from = q.from;
		let to = q.to;
		const reject = (error: string, type = resolvedType) => {
			invalid.push({
				error,
				inputIndex,
				summary: querySummary({ ...q, from, to, timezone, type }),
				type,
			});
		};

		const config = getQueryBuilder(resolvedType);
		if (!config) {
			const hint = suggestQueryTypes(q.type.replace(TOP_QUERY_PREFIX, ""));
			const message = hint.length
				? `Unknown type: ${q.type}. Did you mean: ${hint.join(", ")}?`
				: `Unknown type: ${q.type}. Discover available query types before retrying.`;
			reject(message, q.type);
			continue;
		}
		if (invalidTimezone) {
			reject(invalidTimezone);
			continue;
		}
		const hasFrom = q.from !== undefined;
		const hasTo = q.to !== undefined;
		if (q.preset && (hasFrom || hasTo)) {
			reject("Use either a preset or explicit dates, not both.");
			continue;
		}
		if (!q.preset && hasFrom !== hasTo) {
			reject(
				`Both 'from' and 'to' are required when one is provided. Got from=${q.from ?? "(unset)"}, to=${q.to ?? "(unset)"}. Use a 'preset' (e.g. last_7d) or pass both dates as YYYY-MM-DD.`
			);
			continue;
		}
		const preset = q.preset ?? (hasFrom ? undefined : "last_30d");
		if (preset) {
			const resolved = resolveDatePreset(preset, timezone, now);
			from = resolved.from;
			to = resolved.to;
		}
		if (!(from && to)) {
			reject("Either preset or both from and to required");
			continue;
		}
		if (
			!(
				DateOnlySchema.safeParse(from).success &&
				DateOnlySchema.safeParse(to).success
			)
		) {
			reject("from and to must be valid YYYY-MM-DD dates.");
			continue;
		}
		if (from > to) {
			reject("from must not be after to.");
			continue;
		}
		const timeSeries = isTimeSeries(config);
		const shapeError =
			queryShapeError(
				resolvedType,
				config,
				q,
				(Date.parse(to) - Date.parse(from)) / MS_PER_DAY,
				timeSeries
			) ??
			filterShapeError(q.filters) ??
			invalidFilterFieldError(resolvedType, q.filters);
		if (shapeError) {
			reject(shapeError);
			continue;
		}
		const keepNewestRows =
			timeSeries && !q.orderBy && !config.meta?.tags?.includes(BREAKDOWN_TAG);
		requests.push({
			inputIndex,
			keepNewestRows,
			rowLimit: Math.min(q.limit ?? MCP_RESULT_ROW_LIMIT, MCP_RESULT_ROW_LIMIT),
			summary: querySummary({ ...q, from, to, timezone, type: resolvedType }),
			projectId: websiteId,
			type: resolvedType,
			from,
			to,
			timeUnit: q.timeUnit,
			limit: keepNewestRows ? undefined : q.limit,
			timezone,
			filters: q.filters,
			groupBy: q.groupBy,
			orderBy: q.orderBy,
		});
	}
	return { invalid, requests };
}

export function formatMcpQueryResults(
	plan: McpBatchQueryPlan,
	results: readonly ExecutedQueryResult[]
): McpQueryResult[] {
	const formatted: (McpQueryResult & { inputIndex: number })[] = results.map(
		(result, resultIndex) => {
			const request = plan.requests[resultIndex];
			if (!request) {
				throw new Error("Query result does not match its request");
			}
			const rowCount = result.data.length;
			const data = request.keepNewestRows
				? result.data.slice(Math.max(rowCount - request.rowLimit, 0))
				: result.data.slice(0, request.rowLimit);
			const error = result.error && publicQueryErrorMessage(result.error);
			if (result.error && error === SANITIZED_QUERY_ERROR) {
				captureError(new Error(truncateQueryErrorForLog(result.error)), {
					query_type: result.type,
				});
			}
			return {
				inputIndex: request.inputIndex,
				type: result.type,
				definition: getQueryBuilder(request.type)?.meta?.description,
				summary: request.summary,
				data,
				rowCount,
				returnedRows: data.length,
				truncated: data.length < rowCount,
				...(error && { error }),
			};
		}
	);

	for (const item of plan.invalid) {
		formatted.push({
			inputIndex: item.inputIndex,
			type: item.type,
			summary: item.summary,
			data: [],
			rowCount: 0,
			returnedRows: 0,
			truncated: false,
			error: item.error,
		});
	}

	return formatted
		.sort((a, b) => a.inputIndex - b.inputIndex)
		.map(({ inputIndex: _, ...result }) => result);
}

const SCHEMA_SUMMARY = Object.keys(AGENT_TABLE_COLUMNS)
	.sort()
	.map(
		(table) => `${table}: ${[...(AGENT_TABLE_COLUMNS[table] ?? [])].join(", ")}`
	)
	.join("\n");

const DIRECTIVE_CLAUSE_RE =
	/^(use|uses|prefer|always|must|should|instead|do not|don't|never use)\b|\b(raw sql|quantile\w*|tofloat64)\b/i;
const STORAGE_DETAIL_RE =
	/\b(partitioned|ordered by|bloom filter|indexes?|count\(\*\)|divide by|toyyyymm)\b/i;
const CLAUSE_BREAK_RE = /(?<=\.)\s+|\s+\u2014\s+|;\s+/;
const TRAILING_PERIOD_RE = /\.$/;
const LIST_ITEM_PREFIX = "- ";

function factualClauses(text: string): string[] {
	return text
		.split(CLAUSE_BREAK_RE)
		.map((clause) => clause.trim().replace(TRAILING_PERIOD_RE, ""))
		.filter(
			(clause) =>
				clause &&
				!DIRECTIVE_CLAUSE_RE.test(clause) &&
				!STORAGE_DETAIL_RE.test(clause)
		)
		.map((clause) => clause.charAt(0).toUpperCase() + clause.slice(1));
}

function withoutDirectives(text: string): string | null {
	const clauses = factualClauses(text);
	return clauses.length > 0 ? `${clauses.join(". ")}.` : null;
}

function factualNotes(text: string | undefined): string[] {
	return (text ?? "")
		.split("\n")
		.map((line) => line.trim())
		.flatMap((line) => {
			if (line.startsWith(LIST_ITEM_PREFIX)) {
				const [item] = factualClauses(line.slice(LIST_ITEM_PREFIX.length));
				return item ? [`${LIST_ITEM_PREFIX}${item}`] : [];
			}
			const note = withoutDirectives(line);
			return note ? [note] : [];
		});
}

function columnLine(column: string): string {
	const [definition = column, ...rest] = column.split(" - ");
	const note = withoutDirectives(rest.join(" - "));
	return note ? `- ${definition} - ${note}` : `- ${definition}`;
}

export function getMcpSchemaDocumentation(
	sections: readonly (typeof SCHEMA_SECTIONS)[number][] = SCHEMA_SECTIONS
): string {
	const selected = new Set(sections.length > 0 ? sections : SCHEMA_SECTIONS);
	return ANALYTICS_TABLES.filter((table) => selected.has(table.section))
		.map((table) => {
			const description = withoutDirectives(table.description);
			return [
				`## ${table.name}`,
				...(description ? [description] : []),
				...table.keyColumns.map(columnLine),
				...factualNotes(table.additionalInfo),
			].join("\n");
		})
		.join("\n\n");
}

function getDescription(
	key: string,
	config: { meta?: { description?: string } }
): string {
	return config?.meta?.description ?? `Query: ${key.replace(/_/g, " ")}`;
}

interface QueryTypeInfo {
	allowedFilterOperators?: SimpleQueryConfig["allowedFilterOperators"];
	allowedFilters: string[];
	customizable?: boolean;
	description: string;
	requiredAnyFilter?: string[];
	requiredFilters?: string[];
}

export function getQueryTypeDescriptions(): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, config] of Object.entries(QueryBuilders)) {
		result[key] = getDescription(key, config);
	}
	return result;
}

export function getQueryTypeDetails(): Record<string, QueryTypeInfo> {
	const result: Record<string, QueryTypeInfo> = {};
	for (const [key, config] of Object.entries(QueryBuilders)) {
		result[key] = {
			description: getDescription(key, config),
			allowedFilters: allowedFilterFields(config),
			...(config.requiredFilters?.length && {
				requiredFilters: config.requiredFilters,
			}),
			...(config.requiredAnyFilter?.length && {
				requiredAnyFilter: config.requiredAnyFilter,
			}),
			...(config.allowedFilterOperators && {
				allowedFilterOperators: config.allowedFilterOperators,
			}),
			...(config.customizable !== undefined && {
				customizable: config.customizable,
			}),
		};
	}
	return result;
}

export function getSchemaSummary(): string {
	return SCHEMA_SUMMARY;
}

export const QUERY_CATEGORY_KEYS = [
	...new Set(
		Object.values(QueryBuilders)
			.map((config) => config.meta?.category)
			.filter((c): c is string => typeof c === "string" && c.length > 0)
	),
].sort();

export function getFilteredQueryTypes(opts: {
	category?: string;
	contains?: string;
	detail: "summary" | "full";
}): Record<string, string | QueryTypeInfo> {
	const { category, contains, detail } = opts;
	const needle = contains?.toLowerCase();
	const details = detail === "full" ? getQueryTypeDetails() : null;
	const result: Record<string, string | QueryTypeInfo> = {};
	for (const [key, config] of Object.entries(QueryBuilders)) {
		if (category && config.meta?.category !== category) {
			continue;
		}
		if (needle && !key.toLowerCase().includes(needle)) {
			continue;
		}
		result[key] = details?.[key] ?? getDescription(key, config);
	}
	return result;
}
