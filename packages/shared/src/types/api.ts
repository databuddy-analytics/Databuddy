// API request and response types

import type { DateRange } from './analytics';

export interface DynamicQueryRequest {
	id?: string;
	parameters: string[];
	limit?: number;
	page?: number;
	filters?: DynamicQueryFilter[];
	granularity?: 'hourly' | 'daily';
	groupBy?: string;
}

export interface DynamicQueryFilter {
	field: string;
	operator:
		| 'eq'
		| 'ne'
		| 'gt'
		| 'gte'
		| 'lt'
		| 'lte'
		| 'in'
		| 'not_in'
		| 'contains'
		| 'starts_with'
		| 'like';
	value: string | number | (string | number)[];
}

export interface DynamicQueryResult {
	parameter: string;
	data: Record<string, unknown>[];
	success: boolean;
	error?: string;
}

export interface DynamicQueryResponse {
	success: boolean;
	queryId?: string;
	data: DynamicQueryResult[];
	meta: {
		parameters: string[];
		total_parameters: number;
		page: number;
		limit: number;
		filters_applied: number;
	};
	error?: string;
	date_range?: DateRange;
}

export interface GoalFilter {
	field: string;
	operator: 'equals' | 'contains' | 'not_equals' | 'in' | 'not_in';
	value: string | string[];
}

export interface BatchQueryResponse {
	success: boolean;
	batch: true;
	results: DynamicQueryResponse[];
	meta: {
		total_queries: number;
		successful_queries: number;
		failed_queries: number;
	};
}
