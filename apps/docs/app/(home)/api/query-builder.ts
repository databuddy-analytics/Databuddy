'use server';

interface DynamicQueryFilter {
	field: string;
	operator: string;
	value: string | number | boolean;
}

interface DynamicQueryRequest {
	id: string;
	parameters: string[];
	filters?: DynamicQueryFilter[];
	limit?: number;
	page?: number;
	granularity?: string;
}

interface ParameterResult {
	parameter: string;
	success: boolean;
	data: unknown[];
	error?: string;
}

interface DynamicQueryResponse {
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
}

interface BatchQueryResponse {
	success: boolean;
	batch: true;
	results: DynamicQueryResponse[];
}

function buildQueryParams(
	websiteId: string,
	startDate: string,
	endDate: string,
	timezone = 'UTC'
): URLSearchParams {
	const params = new URLSearchParams({
		website_id: websiteId,
		start_date: startDate,
		end_date: endDate,
		timezone,
	});
	return params;
}

async function executeDynamicQuery(
	websiteId: string,
	startDate: string,
	endDate: string,
	queryData: DynamicQueryRequest | DynamicQueryRequest[],
	timezone = 'UTC'
): Promise<DynamicQueryResponse | BatchQueryResponse> {
	try {
		const params = buildQueryParams(websiteId, startDate, endDate, timezone);
		const url = `https://api.databuddy.cc/v1/query?${params}`;

		const requestBody = Array.isArray(queryData)
			? queryData.map((query) => ({
					...query,
					startDate,
					endDate,
					timeZone: timezone,
					limit: query.limit || 100,
					page: query.page || 1,
					filters: query.filters || [],
					granularity: query.granularity || 'daily',
				}))
			: {
					...queryData,
					startDate,
					endDate,
					timeZone: timezone,
					limit: queryData.limit || 100,
					page: queryData.page || 1,
					filters: queryData.filters || [],
					granularity: queryData.granularity || 'daily',
				};

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Api-Key': 'dbdy_poCMquJqsqUc6ktNvMsnvKZO7RyS1TlCpY2yo1EvW8trFLBa',
			},
			body: JSON.stringify(requestBody),
		});

		if (!response.ok) {
			throw new Error(`API responded with status: ${response.status}`);
		}

		const data = await response.json();

		if (!data.success) {
			throw new Error(data.error || 'Failed to fetch dynamic query data');
		}

		return data;
	} catch (error) {
		console.error('Failed to execute dynamic query:', error);
		throw error;
	}
}

export async function executeQuery(
	websiteId: string,
	startDate: string,
	endDate: string,
	queryRequest: DynamicQueryRequest,
	timezone = 'UTC'
): Promise<DynamicQueryResponse> {
	try {
		const result = await executeDynamicQuery(
			websiteId,
			startDate,
			endDate,
			queryRequest,
			timezone
		);

		if ('batch' in result) {
			throw new Error('Unexpected batch response for single query');
		}

		return result;
	} catch {
		return {
			success: false,
			queryId: queryRequest.id,
			data: [],
			meta: {
				parameters: queryRequest.parameters,
				total_parameters: queryRequest.parameters.length,
				page: queryRequest.page || 1,
				limit: queryRequest.limit || 100,
				filters_applied: queryRequest.filters?.length || 0,
			},
		};
	}
}

export async function executeBatchQueries(
	websiteId: string,
	startDate: string,
	endDate: string,
	queries: DynamicQueryRequest[],
	timezone = 'UTC'
): Promise<BatchQueryResponse> {
	try {
		const result = await executeDynamicQuery(
			websiteId,
			startDate,
			endDate,
			queries,
			timezone
		);

		if (!('batch' in result)) {
			throw new Error('Expected batch response for multiple queries');
		}

		return result;
	} catch {
		return {
			success: false,
			batch: true,
			results: queries.map((query) => ({
				success: false,
				queryId: query.id,
				data: [],
				meta: {
					parameters: query.parameters,
					total_parameters: query.parameters.length,
					page: query.page || 1,
					limit: query.limit || 100,
					filters_applied: query.filters?.length || 0,
				},
			})),
		};
	}
}

export type {
	DynamicQueryRequest,
	DynamicQueryResponse,
	BatchQueryResponse,
	DynamicQueryFilter,
	ParameterResult,
};
