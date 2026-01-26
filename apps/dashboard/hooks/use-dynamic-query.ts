import type { DateRange } from "@databuddy/shared/types/analytics";
import type {
	BatchQueryResponse,
	DynamicQueryRequest,
	DynamicQueryResponse,
} from "@databuddy/shared/types/api";
import type {
	ExtractDataTypes,
	ParameterDataMap,
} from "@databuddy/shared/types/parameters";
import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { getUserTimezone } from "@/lib/timezone";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface BuildParamsOptions {
	websiteId?: string;
	scheduleId?: string;
	linkId?: string;
	dateRange?: DateRange;
	additionalParams?: Record<string, string | number>;
}

function buildParams({
	websiteId,
	scheduleId,
	linkId,
	dateRange,
	additionalParams,
}: BuildParamsOptions): URLSearchParams {
	const params = new URLSearchParams(
		additionalParams as Record<string, string>
	);

	// Use appropriate ID based on context
	if (linkId) {
		params.set("link_id", linkId);
	} else if (scheduleId) {
		params.set("schedule_id", scheduleId);
	} else if (websiteId) {
		params.set("website_id", websiteId);
	}

	if (dateRange?.start_date) {
		params.append("start_date", dateRange.start_date);
	}

	if (dateRange?.end_date) {
		params.append("end_date", dateRange.end_date);
	}

	if (dateRange?.granularity) {
		params.append("granularity", dateRange.granularity);
	}

	params.append("_t", Date.now().toString());

	return params;
}

const defaultQueryOptions = {
	staleTime: 2 * 60 * 1000,
	gcTime: 30 * 60 * 1000,
	refetchOnWindowFocus: false,
	refetchOnMount: true,
	refetchInterval: 10 * 60 * 1000,
	retry: (failureCount: number, error: Error) => {
		if (error instanceof DOMException && error.name === "AbortError") {
			return false;
		}
		return failureCount < 2;
	},
	networkMode: "online" as const,
	refetchIntervalInBackground: false,
	placeholderData: undefined,
};

function transformFilters(filters?: DynamicQueryRequest["filters"]) {
	return filters?.map(({ field, operator, value }) => ({
		field,
		op: operator,
		value,
	}));
}

interface FetchOptions {
	websiteId?: string;
	scheduleId?: string;
	linkId?: string;
}

async function fetchDynamicQuery(
	idOrOptions: string | FetchOptions,
	dateRange: DateRange,
	queryData: DynamicQueryRequest | DynamicQueryRequest[],
	signal?: AbortSignal
): Promise<DynamicQueryResponse | BatchQueryResponse> {
	const timezone = getUserTimezone();

	// Support both old string API (websiteId) and new options object
	const options: FetchOptions =
		typeof idOrOptions === "string" ? { websiteId: idOrOptions } : idOrOptions;

	const params = buildParams({
		websiteId: options.websiteId,
		scheduleId: options.scheduleId,
		linkId: options.linkId,
		dateRange,
		additionalParams: { timezone },
	});
	const url = `${API_BASE_URL}/v1/query?${params}`;

	const buildQuery = (query: DynamicQueryRequest) => ({
		...query,
		startDate: dateRange.start_date,
		endDate: dateRange.end_date,
		timeZone: timezone,
		limit: query.limit || 100,
		page: query.page || 1,
		filters: transformFilters(query.filters),
		granularity: query.granularity || dateRange.granularity || "daily",
		groupBy: query.groupBy,
	});

	const requestBody = Array.isArray(queryData)
		? queryData.map(buildQuery)
		: buildQuery(queryData);

	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		credentials: "include",
		signal,
		body: JSON.stringify(requestBody),
	});

	if (!response.ok) {
		throw new Error(
			`Failed to fetch dynamic query data: ${response.statusText}`
		);
	}

	const data = await response.json();

	if (!data.success) {
		throw new Error(data.error || "Failed to fetch dynamic query data");
	}

	return data;
}

export function useDynamicQuery<T extends (keyof ParameterDataMap)[]>(
	websiteId: string,
	dateRange: DateRange,
	queryData: DynamicQueryRequest,
	options?: Partial<UseQueryOptions<DynamicQueryResponse>>
) {
	const fetchData = useCallback(
		async ({ signal }: { signal?: AbortSignal }) => {
			const result = await fetchDynamicQuery(
				websiteId,
				dateRange,
				queryData,
				signal
			);
			return result as DynamicQueryResponse;
		},
		[websiteId, dateRange, queryData]
	);

	const query = useQuery({
		queryKey: ["dynamic-query", websiteId, dateRange, queryData],
		queryFn: fetchData,
		...defaultQueryOptions,
		...options,
		enabled:
			options?.enabled !== false &&
			!!websiteId &&
			queryData.parameters.length > 0,
	});

	const processedData = useMemo(
		() =>
			query.data?.data.reduce(
				(acc, result) => {
					if (result.success) {
						acc[result.parameter] = result.data;
					}
					return acc;
				},
				{} as Record<string, any>
			) || {},
		[query.data]
	);

	const errors = useMemo(
		() =>
			query.data?.data
				.filter((result) => !result.success)
				.map((result) => ({
					parameter: result.parameter,
					error: result.error,
				})) || [],
		[query.data]
	);

	return {
		data: processedData as ExtractDataTypes<T>,
		meta: query.data?.meta,
		errors,
		isLoading: query.isLoading || query.isFetching || query.isPending,
		isError: query.isError,
		error: query.error,
		refetch: query.refetch,
		isFetching: query.isFetching,
		isPending: query.isPending,
	};
}

interface BatchQueryOptions {
	websiteId?: string;
	scheduleId?: string;
	linkId?: string;
}

export function useBatchDynamicQuery(
	idOrOptions: string | BatchQueryOptions,
	dateRange: DateRange,
	queries: DynamicQueryRequest[],
	options?: Partial<UseQueryOptions<BatchQueryResponse>>
) {
	// Support both old string API (websiteId) and new options object
	const queryOptions: BatchQueryOptions =
		typeof idOrOptions === "string" ? { websiteId: idOrOptions } : idOrOptions;

	const effectiveId =
		queryOptions.websiteId || queryOptions.scheduleId || queryOptions.linkId;

	const fetchData = useCallback(
		async ({ signal }: { signal?: AbortSignal }) => {
			const result = await fetchDynamicQuery(
				queryOptions,
				dateRange,
				queries,
				signal
			);
			return result as BatchQueryResponse;
		},
		[queryOptions, dateRange, queries]
	);

	const query = useQuery({
		queryKey: [
			"batch-dynamic-query",
			queryOptions.websiteId,
			queryOptions.scheduleId,
			queryOptions.linkId,
			dateRange.start_date,
			dateRange.end_date,
			dateRange.granularity,
			dateRange.timezone,
			JSON.stringify(queries),
		],
		queryFn: fetchData,
		...defaultQueryOptions,
		...options,
		enabled: options?.enabled !== false && !!effectiveId && queries.length > 0,
	});

	const processedResults = useMemo(() => {
		if (!query.data?.results) {
			return [];
		}

		return query.data.results.map((result) => {
			const processedResult = {
				queryId: result.queryId,
				success: false,
				data: {} as Record<string, any>,
				errors: [] as Array<{ parameter: string; error?: string }>,
				meta: result.meta,
				rawResult: result,
			};

			if (result.data && Array.isArray(result.data)) {
				for (const paramResult of result.data) {
					if (paramResult.success && paramResult.data) {
						processedResult.data[paramResult.parameter] = paramResult.data;
						processedResult.success = true;
					} else {
						processedResult.errors.push({
							parameter: paramResult.parameter,
							error: paramResult.error,
						});
					}
				}
			} else {
				processedResult.errors.push({
					parameter: "query",
					error: "No data array found in response",
				});
			}

			return processedResult;
		});
	}, [query.data]);

	const getDataForQuery = useCallback(
		(queryId: string, parameter: string) => {
			const result = processedResults.find((r) => r.queryId === queryId);
			if (!result?.success) {
				return [];
			}
			const data = result.data[parameter];
			return data || [];
		},
		[processedResults]
	);

	const hasDataForQuery = useCallback(
		(queryId: string, parameter: string) => {
			const result = processedResults.find((r) => r.queryId === queryId);
			return (
				result?.success &&
				result.data[parameter] &&
				Array.isArray(result.data[parameter]) &&
				result.data[parameter].length > 0
			);
		},
		[processedResults]
	);

	const getErrorsForQuery = useCallback(
		(queryId: string) => {
			const result = processedResults.find((r) => r.queryId === queryId);
			return result?.errors || [];
		},
		[processedResults]
	);

	return {
		results: processedResults,
		meta: query.data?.meta,
		isLoading: query.isLoading || query.isFetching || query.isPending,
		isError: query.isError,
		error: query.error,
		refetch: query.refetch,
		isFetching: query.isFetching,
		isPending: query.isPending,
		getDataForQuery,
		hasDataForQuery,
		getErrorsForQuery,
		debugInfo: {
			queryCount: queries.length,
			successfulQueries: processedResults.filter((r) => r.success).length,
			failedQueries: processedResults.filter((r) => !r.success).length,
			totalParameters: processedResults.reduce(
				(sum, r) => sum + Object.keys(r.data).length,
				0
			),
		},
	};
}
