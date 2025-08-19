export type DynamicQueryFilter = {
	field: string;
	operator: string;
	value: string | number | boolean;
};

export type DynamicQueryRequest = {
	id: string;
	parameters: string[];
	filters?: DynamicQueryFilter[];
	limit?: number;
	page?: number;
	granularity?: string;
};

export type ParameterResult = {
	parameter: string;
	success: boolean;
	data: unknown[];
	error?: string;
};

export type DynamicQueryResponse = {
	success: boolean;
	queryId: string;
	data: ParameterResult[];
	meta: {
		parameters: string[];
		total_parameters: number;
		page: number;
		limit: number;
		filters_applied: number;
	};
};

export type BatchQueryResponse = {
	success: boolean;
	batch: true;
	results: DynamicQueryResponse[];
};
