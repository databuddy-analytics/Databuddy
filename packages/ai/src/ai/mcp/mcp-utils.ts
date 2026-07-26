import {
	AGENT_TABLE_COLUMNS,
	AGENT_TENANT_COLUMN_BY_TABLE,
} from "@databuddy/db/clickhouse";
import {
	type SchemaDocOptions,
	generateSchemaDocumentation,
} from "../prompts/clickhouse-schema";
import {
	type DatePreset,
	MCP_DATE_PRESETS,
	resolveDatePreset,
} from "../../lib/date-presets";
import { QueryBuilders } from "../../query/builders";
import {
	invalidFilterFieldError,
	publicQueryErrorMessage,
	suggestQueryTypes,
} from "../../query";
import type { Filter, QueryRequest } from "../../query/types";
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

export interface McpQueryItem {
	filters?: Filter[];
	from?: string;
	groupBy?: string[];
	limit?: number;
	orderBy?: string;
	preset?: string;
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

export interface InvalidBatchQuery {
	error: string;
	inputIndex: number;
	summary: string;
	type: string;
}

interface IndexedQueryRequest extends QueryRequest {
	inputIndex: number;
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
	error?: string;
	returnedRows: number;
	rowCount: number;
	summary: string;
	truncated: boolean;
	type: string;
}

const AGENT_RESULT_ROW_LIMIT = 20;

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
	timezone: string
): McpBatchQueryPlan {
	const requests: IndexedQueryRequest[] = [];
	const invalid: InvalidBatchQuery[] = [];
	for (const [inputIndex, q] of items.entries()) {
		const resolvedType = resolveQueryType(q.type);
		let from = q.from;
		let to = q.to;
		const reject = (error: string, type = resolvedType) => {
			invalid.push({
				error,
				inputIndex,
				summary: querySummary({
					filters: q.filters,
					from,
					groupBy: q.groupBy,
					limit: q.limit,
					orderBy: q.orderBy,
					timeUnit: q.timeUnit,
					timezone,
					to,
					type,
				}),
				type,
			});
		};

		if (!(resolvedType in QueryBuilders)) {
			const hint = suggestQueryTypes(q.type.replace(TOP_QUERY_PREFIX, ""));
			const message = hint.length
				? `Unknown type: ${q.type}. Did you mean: ${hint.join(", ")}?`
				: `Unknown type: ${q.type}. Use the capabilities tool to see valid types.`;
			reject(message, q.type);
			continue;
		}
		if (!q.preset && Boolean(from) !== Boolean(to)) {
			reject(
				`Both 'from' and 'to' are required when one is provided. Got from=${q.from ?? "(unset)"}, to=${q.to ?? "(unset)"}. Use a 'preset' (e.g. last_7d) or pass both dates as YYYY-MM-DD.`
			);
			continue;
		}
		const preset = q.preset ?? (from && to ? undefined : "last_7d");
		if (preset && MCP_DATE_PRESETS.includes(preset as DatePreset)) {
			const resolved = resolveDatePreset(preset as DatePreset, timezone);
			from = resolved.from;
			to = resolved.to;
		}
		if (!(from && to)) {
			reject("Either preset or both from and to required");
			continue;
		}
		const filterError = invalidFilterFieldError(
			resolvedType,
			q.filters as Filter[] | undefined
		);
		if (filterError) {
			reject(filterError);
			continue;
		}
		requests.push({
			inputIndex,
			projectId: websiteId,
			type: resolvedType,
			from,
			to,
			timeUnit: q.timeUnit,
			limit: q.limit,
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
	const formatted = results.map((result, resultIndex) => {
		const request = plan.requests[resultIndex];
		if (!request) {
			throw new Error("Query result does not match its request");
		}
		const rowCount = result.data.length;
		const data =
			QueryBuilders[request.type]?.meta?.default_visualization === "timeseries"
				? result.data.slice(-AGENT_RESULT_ROW_LIMIT)
				: result.data.slice(0, AGENT_RESULT_ROW_LIMIT);
		return {
			inputIndex: request.inputIndex,
			type: result.type,
			summary: querySummary(request),
			data,
			rowCount,
			returnedRows: data.length,
			truncated: data.length < rowCount,
			...(result.error && { error: publicQueryErrorMessage(result.error) }),
		};
	});

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

const SCHEMA_SUMMARY = Object.keys(AGENT_TENANT_COLUMN_BY_TABLE)
	.sort()
	.map((table) => {
		const tenant = AGENT_TENANT_COLUMN_BY_TABLE[table];
		const columns = [...(AGENT_TABLE_COLUMNS[table] ?? [])].join(", ");
		return `${table} [tenant=${tenant}]: ${columns}`;
	})
	.join("\n");

function getDescription(
	key: string,
	config: { meta?: { description?: string } }
): string {
	return config?.meta?.description ?? `Query: ${key.replace(/_/g, " ")}`;
}

interface QueryTypeInfo {
	allowedFilters?: string[];
	customizable?: boolean;
	description: string;
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
			...(config?.allowedFilters?.length && {
				allowedFilters: config.allowedFilters,
			}),
			...(config?.customizable !== undefined && {
				customizable: config.customizable,
			}),
		};
	}
	return result;
}

export function getSchemaSummary(): string {
	return SCHEMA_SUMMARY;
}

export function getSchemaDocumentation(opts: SchemaDocOptions = {}): string {
	return generateSchemaDocumentation(opts);
}

export const QUERY_CATEGORY_KEYS = [
	...new Set(
		Object.values(QueryBuilders)
			.map((config) => config.meta?.category)
			.filter((c): c is string => typeof c === "string" && c.length > 0)
	),
].sort();

export function getFilteredQueryTypeDescriptions(opts: {
	category?: string;
	contains?: string;
}): Record<string, string> {
	const { category, contains } = opts;
	const needle = contains?.toLowerCase();
	const result: Record<string, string> = {};
	for (const [key, config] of Object.entries(QueryBuilders)) {
		if (category && config.meta?.category !== category) {
			continue;
		}
		if (needle && !key.toLowerCase().includes(needle)) {
			continue;
		}
		result[key] = getDescription(key, config);
	}
	return result;
}
