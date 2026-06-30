export interface DynamicQueryFilter {
	field: string;
	operator: string;
	value: string | number | boolean;
}

export interface DynamicQueryRequest {
	endDate?: string;
	filters?: DynamicQueryFilter[];
	granularity?: string;
	id: string;
	limit?: number;
	page?: number;
	parameters: string[];
	startDate?: string;
	timeZone?: string;
}

export interface ParameterResult {
	data: unknown[];
	error?: string;
	parameter: string;
	success: boolean;
}

export interface DynamicQueryResponse {
	data: ParameterResult[];
	meta: {
		parameters: string[];
		total_parameters: number;
		page: number;
		limit: number;
		filters_applied: number;
	};
	queryId: string;
	success: boolean;
}

export interface BatchQueryResponse {
	batch: true;
	results: DynamicQueryResponse[];
	success: boolean;
}
