import type { QueryBuilderMeta } from '@databuddy/shared';

export const FilterOperators = {
	eq: '=',
	ne: '!=',
	like: 'LIKE',
	gt: '>',
	lt: '<',
	in: 'IN',
	notIn: 'NOT IN',
} as const;

export const TimeGranularity = {
	minute: 'toStartOfMinute',
	hour: 'toStartOfHour',
	day: 'toStartOfDay',
	week: 'toStartOfWeek',
	month: 'toStartOfMonth',
} as const;

export type FilterOperator = keyof typeof FilterOperators;
export type TimeUnit = keyof typeof TimeGranularity | 'hourly' | 'daily';

export interface Filter {
	field: string;
	op: FilterOperator;
	value: string | number | (string | number)[];
}

export interface SimpleQueryConfig {
	table?: string;
	fields?: string[];
	where?: string[];
	groupBy?: string[];
	orderBy?: string;
	limit?: number;
	timeField?: string;
	allowedFilters?: string[];
	customizable?: boolean;
	plugins?: {
		parseReferrers?: boolean;
		normalizeUrls?: boolean;
		normalizeGeo?: boolean;
		deduplicateGeo?: boolean;
		mapDeviceTypes?: boolean;
	};
	customSql?: (
		websiteId: string,
		startDate: string,
		endDate: string,
		filters?: Filter[],
		granularity?: TimeUnit,
		limit?: number,
		offset?: number,
		timezone?: string,
		filterConditions?: string[],
		filterParams?: Record<string, Filter['value']>
	) => string | { sql: string; params: Record<string, unknown> };
	appendEndOfDayToTo?: boolean; // If true (default), append ' 23:59:59' to 'to' value. If false, use 'to' as-is.
	meta?: QueryBuilderMeta;
}

export interface QueryRequest {
	projectId: string;
	type: string;
	from: string;
	to: string;
	timeUnit?: TimeUnit;
	filters?: Filter[];
	groupBy?: string[];
	orderBy?: string;
	limit?: number;
	offset?: number;
	timezone?: string;
}

export interface CompiledQuery {
	sql: string;
	params: Record<string, unknown>;
}
