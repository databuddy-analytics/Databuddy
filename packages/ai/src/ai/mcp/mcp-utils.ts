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
import { suggestQueryTypes } from "../../query";
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

export {
	MCP_DATE_PRESETS,
	resolveDatePreset as resolveDatePresetForMcp,
} from "../../lib/date-presets";

export {
	CLICKHOUSE_SCHEMA_DOCS,
	SCHEMA_SECTIONS,
	type SchemaSection,
} from "../prompts/clickhouse-schema";

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
	type: string;
}

export function buildBatchQueryRequests(
	items: McpQueryItem[],
	websiteId: string,
	timezone: string
): { invalid: InvalidBatchQuery[]; requests: QueryRequest[] } {
	const requests: QueryRequest[] = [];
	const invalid: InvalidBatchQuery[] = [];
	for (const q of items) {
		const resolvedType = resolveQueryType(q.type);
		if (!(resolvedType in QueryBuilders)) {
			const hint = suggestQueryTypes(q.type.replace(TOP_QUERY_PREFIX, ""));
			const message = hint.length
				? `Unknown type: ${q.type}. Did you mean: ${hint.join(", ")}?`
				: `Unknown type: ${q.type}. Use the capabilities tool to see valid types.`;
			invalid.push({ error: message, type: q.type });
			continue;
		}
		q.type = resolvedType;
		let from = q.from;
		let to = q.to;
		if (!q.preset && Boolean(from) !== Boolean(to)) {
			invalid.push({
				error: `Both 'from' and 'to' are required when one is provided. Got from=${q.from ?? "(unset)"}, to=${q.to ?? "(unset)"}. Use a 'preset' (e.g. last_7d) or pass both dates as YYYY-MM-DD.`,
				type: q.type,
			});
			continue;
		}
		const preset = q.preset ?? (from && to ? undefined : "last_7d");
		if (preset && MCP_DATE_PRESETS.includes(preset as DatePreset)) {
			const resolved = resolveDatePreset(preset as DatePreset, timezone);
			from = resolved.from;
			to = resolved.to;
		}
		if (!(from && to)) {
			invalid.push({
				error: "Either preset or both from and to required",
				type: q.type,
			});
			continue;
		}
		requests.push({
			projectId: websiteId,
			type: q.type,
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
