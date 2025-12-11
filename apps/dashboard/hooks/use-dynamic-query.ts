import { getCountryCode } from "@databuddy/shared/country-codes";
import type { DateRange, ProfileData } from "@databuddy/shared/types/analytics";
import type {
	BatchQueryResponse,
	DynamicQueryFilter,
	DynamicQueryRequest,
	DynamicQueryResponse,
} from "@databuddy/shared/types/api";
import type {
	ExtractDataTypes,
	ParameterDataMap,
	QueryOptionsResponse,
} from "@databuddy/shared/types/parameters";
import {
	type UseInfiniteQueryOptions,
	type UseQueryOptions,
	useInfiniteQuery,
	useQuery,
} from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { getUserTimezone } from "@/lib/timezone";
import { formatDuration } from "@/lib/utils";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// Base params builder - following use-analytics.ts pattern
function buildParams(
	websiteId: string,
	dateRange?: DateRange,
	additionalParams?: Record<string, string | number>
): URLSearchParams {
	const params = new URLSearchParams({
		website_id: websiteId,
		...additionalParams,
	});

	if (dateRange?.start_date) {
		params.append("start_date", dateRange.start_date);
	}

	if (dateRange?.end_date) {
		params.append("end_date", dateRange.end_date);
	}

	if (dateRange?.granularity) {
		params.append("granularity", dateRange.granularity);
	}

	// Add cache busting
	params.append("_t", Date.now().toString());

	return params;
}

// Common query options
const defaultQueryOptions = {
	staleTime: 2 * 60 * 1000, // 2 minutes (reduced to show loading states more often)
	gcTime: 30 * 60 * 1000, // 30 minutes
	refetchOnWindowFocus: false,
	refetchOnMount: true, // Always refetch on mount to show loading state
	refetchInterval: 10 * 60 * 1000, // Background refetch every 10 minutes
	retry: (failureCount: number, error: Error) => {
		if (error instanceof DOMException && error.name === "AbortError") {
			return false;
		}
		return failureCount < 2;
	},
	networkMode: "online" as const,
	refetchIntervalInBackground: false,
	// Force loading state to show for at least a brief moment
	placeholderData: undefined, // Don't use placeholder data to ensure loading states show
};

function transformFilters(filters?: DynamicQueryRequest["filters"]) {
	return filters?.map(({ field, operator, value }) => ({
		field,
		op: operator,
		value,
	}));
}

// Dynamic query specific fetcher - POST request (supports both single and batch)
async function fetchDynamicQuery(
	websiteId: string,
	dateRange: DateRange,
	queryData: DynamicQueryRequest | DynamicQueryRequest[],
	signal?: AbortSignal
): Promise<DynamicQueryResponse | BatchQueryResponse> {
	const timezone = getUserTimezone();
	const params = buildParams(websiteId, dateRange, { timezone });
	const url = `${API_BASE_URL}/v1/query?${params}`;

	// Prepare the request body
	const requestBody = Array.isArray(queryData)
		? queryData.map((query) => ({
			...query,
			startDate: dateRange.start_date,
			endDate: dateRange.end_date,
			timeZone: timezone,
			limit: query.limit || 100,
			page: query.page || 1,
			filters: transformFilters(query.filters),
			granularity: query.granularity || dateRange.granularity || "daily",
			groupBy: query.groupBy,
		}))
		: {
			...queryData,
			startDate: dateRange.start_date,
			endDate: dateRange.end_date,
			timeZone: timezone,
			limit: queryData.limit || 100,
			page: queryData.page || 1,
			filters: transformFilters(queryData.filters),
			granularity: queryData.granularity || dateRange.granularity || "daily",
			groupBy: queryData.groupBy,
		};

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

/**
 * Hook to fetch dynamic query data - supports both single and batch queries
 */
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

	// Process data into a more usable format
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

	// Extract errors
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

/**
 * Hook to fetch batch dynamic queries
 */
export function useBatchDynamicQuery(
	websiteId: string,
	dateRange: DateRange,
	queries: DynamicQueryRequest[],
	options?: Partial<UseQueryOptions<BatchQueryResponse>>
) {
	const fetchData = useCallback(
		async ({ signal }: { signal?: AbortSignal }) => {
			const result = await fetchDynamicQuery(
				websiteId,
				dateRange,
				queries,
				signal
			);
			// Ensure we return a batch query response
			return result as BatchQueryResponse;
		},
		[websiteId, dateRange, queries]
	);

	const query = useQuery({
		queryKey: [
			"batch-dynamic-query",
			websiteId,
			dateRange.start_date,
			dateRange.end_date,
			dateRange.granularity,
			dateRange.timezone,
			JSON.stringify(queries),
		],
		queryFn: fetchData,
		...defaultQueryOptions,
		...options,
		enabled: options?.enabled !== false && !!websiteId && queries.length > 0,
	});

	// Enhanced processing with better debugging and clearer structure
	const processedResults = useMemo(() => {
		if (!query.data?.results) {
			return [];
		}

		return query.data.results.map((result, _index) => {
			const processedResult = {
				queryId: result.queryId,
				success: false, // Will be set based on parameter results
				data: {} as Record<string, any>,
				errors: [] as Array<{ parameter: string; error?: string }>,
				meta: result.meta,
				rawResult: result, // Keep raw result for debugging
			};

			if (result.data && Array.isArray(result.data)) {
				// Process each parameter result
				for (const paramResult of result.data) {
					if (paramResult.success && paramResult.data) {
						processedResult.data[paramResult.parameter] = paramResult.data;
						processedResult.success = true; // At least one parameter succeeded
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

	// Helper functions for easier data access
	const getDataForQuery = useCallback(
		(queryId: string, parameter: string) => {
			const result = processedResults.find((r) => r.queryId === queryId);
			if (!result?.success) {
				return [];
			}
			const data = result.data[parameter];
			if (!data) {
				return [];
			}
			return data;
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
		// Helper functions
		getDataForQuery,
		hasDataForQuery,
		getErrorsForQuery,
		// Debug info
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

export function useQueryOptions(
	options?: Partial<UseQueryOptions<QueryOptionsResponse>>
) {
	return useQuery({
		queryKey: ["query-options"],
		queryFn: async () => {
			const res = await fetch("/api/query/types");
			if (!res.ok) {
				throw new Error("Failed to fetch query options");
			}
			return res.json();
		},
		staleTime: 60 * 60 * 1000, // 1 hour
		...options,
	});
}

/**
 * Convenience hook for comprehensive performance analytics using batch queries
 */
export function useEnhancedPerformanceData(
	websiteId: string,
	dateRange: DateRange,
	filters: DynamicQueryFilter[],
	options?: Partial<UseQueryOptions<BatchQueryResponse>>
) {
	const queries: DynamicQueryRequest[] = [
		{
			id: "pages",
			parameters: ["slow_pages"],
			limit: 100,
			filters,
		},
		{
			id: "countries",
			parameters: ["performance_by_country"],
			limit: 100,
			filters,
		},
		{
			id: "devices",
			parameters: ["performance_by_device"],
			limit: 100,
			filters,
		},
		{
			id: "browsers",
			parameters: ["performance_by_browser"],
			limit: 100,
			filters,
		},
		{
			id: "operating_systems",
			parameters: ["performance_by_os"],
			limit: 100,
			filters,
		},
		{
			id: "regions",
			parameters: ["performance_by_region"],
			limit: 100,
			filters,
		},
		// Core Web Vitals queries
		{
			id: "web_vitals_time_series",
			parameters: ["web_vitals_time_series"],
			limit: 365, // More data points for time series
			filters,
		},
		{
			id: "web_vitals_by_page",
			parameters: ["web_vitals_by_page"],
			limit: 100,
			filters,
		},
		{
			id: "web_vitals_by_browser",
			parameters: ["web_vitals_by_browser"],
			limit: 100,
			filters,
		},
		{
			id: "web_vitals_by_country",
			parameters: ["web_vitals_by_country"],
			limit: 100,
			filters,
		},
		{
			id: "web_vitals_by_os",
			parameters: ["web_vitals_by_os"],
			limit: 100,
			filters,
		},
		{
			id: "web_vitals_by_region",
			parameters: ["web_vitals_by_region"],
			limit: 100,
			filters,
		},
	];

	return useBatchDynamicQuery(websiteId, dateRange, queries, options);
}

/**
 * Convenience hook for enhanced geographic analytics with individual parameter queries
 */
export function useEnhancedGeographicData(
	websiteId: string,
	dateRange: DateRange,
	options?: Partial<UseQueryOptions<BatchQueryResponse>>
) {
	const queries: DynamicQueryRequest[] = [
		{
			id: "countries",
			parameters: ["country"],
			limit: 100,
		},
		{
			id: "regions",
			parameters: ["region"],
			limit: 100,
		},
		{
			id: "timezones",
			parameters: ["timezone"],
			limit: 100,
		},
		{
			id: "languages",
			parameters: ["language"],
			limit: 100,
		},
	];

	return useBatchDynamicQuery(websiteId, dateRange, queries, options);
}

/**
 * Convenience hook for map location data
 */
export function useMapLocationData(
	websiteId: string,
	dateRange: DateRange,
	filters?: DynamicQueryFilter[],
	options?: Partial<UseQueryOptions<BatchQueryResponse>>
) {
	const queries: DynamicQueryRequest[] = [
		{
			id: "map-countries",
			parameters: ["country"],
			limit: 100,
			filters,
		},
		{
			id: "map-regions",
			parameters: ["region"],
			limit: 100,
			filters,
		},
	];

	return useBatchDynamicQuery(websiteId, dateRange, queries, options);
}

export function useEnhancedErrorData(
	websiteId: string,
	dateRange: DateRange,
	options?: Partial<UseQueryOptions<BatchQueryResponse>> & {
		filters?: DynamicQueryFilter[];
	}
) {
	const filters = options?.filters || [];

	return useBatchDynamicQuery(
		websiteId,
		dateRange,
		[
			{
				id: "recent_errors",
				parameters: ["recent_errors"],
				filters,
			},
			{ id: "error_types", parameters: ["error_types"], filters },
			{
				id: "errors_by_page",
				parameters: ["errors_by_page"],
				filters,
			},
			{ id: "error_summary", parameters: ["error_summary"], filters },
			{ id: "error_chart_data", parameters: ["error_chart_data"], filters },
		],
		{
			...options,
		}
	);
}

/**
 * Hook for sessions with infinite scrolling support
 */
export function useInfiniteSessionsData(
	websiteId: string,
	dateRange: DateRange,
	limit = 25,
	options?: Partial<UseInfiniteQueryOptions<DynamicQueryResponse>>
) {
	return useInfiniteQuery({
		queryKey: ["sessions-infinite", websiteId, dateRange, limit],
		queryFn: async ({ pageParam = 1, signal }) => {
			const result = await fetchDynamicQuery(
				websiteId,
				dateRange,
				{
					id: "sessions-list",
					parameters: ["session_list"],
					limit,
					page: pageParam as number,
				},
				signal
			);
			// Ensure we return DynamicQueryResponse
			if ("batch" in result) {
				throw new Error("Batch queries not supported for infinite sessions");
			}
			return result;
		},
		enabled: !!websiteId,
		staleTime: 5 * 60 * 1000, // 5 minutes
		gcTime: 10 * 60 * 1000, // 10 minutes
		initialPageParam: 1,
		getNextPageParam: (lastPage) => {
			const sessions = (lastPage.data as any)?.session_list || [];
			return sessions.length === limit ? lastPage.meta.page + 1 : undefined;
		},
		getPreviousPageParam: (firstPage) =>
			firstPage.meta.page > 1 ? firstPage.meta.page - 1 : undefined,
		...options,
	});
}

/**
 * Transform sessions data from API2 format to frontend format
 */
function transformSessionsData(sessions: any[]): any[] {
	return sessions.map((session) => {
		// Parse events from tuples to objects
		let events: any[] = [];
		if (session.events && Array.isArray(session.events)) {
			events = session.events
				.map((eventTuple: any) => {
					// Handle tuple format: [id, time, event_name, path, error_message, error_type, properties]
					if (Array.isArray(eventTuple) && eventTuple.length >= 7) {
						const [
							id,
							time,
							event_name,
							path,
							error_message,
							error_type,
							properties,
						] = eventTuple;

						let propertiesObj: Record<string, any> = {};
						if (properties) {
							try {
								propertiesObj = JSON.parse(properties);
							} catch {
								// If parsing fails, keep empty object
							}
						}

						return {
							event_id: id,
							time,
							event_name,
							path,
							error_message,
							error_type,
							properties: propertiesObj,
						};
					}
					return null;
				})
				.filter(Boolean);
		}

		// Calculate visitor session count - for now default to 1 since we don't have this data
		const visitorSessionCount = 1;
		const isReturningVisitor = false;

		// Generate session name
		const sessionName = session.session_id
			? `Session ${session.session_id.slice(-8)}`
			: "Unknown Session";

		// Format duration
		const durationFormatted = formatDuration(session.duration || 0);

		// Parse referrer
		let referrerParsed: any = null;
		if (session.referrer) {
			try {
				const url = new URL(session.referrer);
				referrerParsed = {
					type:
						url.hostname === window.location.hostname ? "internal" : "external",
					name: url.hostname,
					domain: url.hostname,
				};
			} catch {
				referrerParsed = {
					type: "direct",
					name: "Direct",
					domain: null,
				};
			}
		}

		// Map country code and preserve original name
		const countryCode = getCountryCode(session.country || "");
		const countryName = session.country || "Unknown";

		return {
			session_id: session.session_id,
			session_name: sessionName,
			anonymous_id: session.visitor_id,
			session_start: session.first_visit,
			path: session.path,
			referrer: session.referrer,
			device_type: session.device_type,
			browser_name: session.browser_name,
			country: countryCode,
			country_name: countryName,
			user_agent: session.user_agent,
			duration: session.duration,
			duration_formatted: durationFormatted,
			page_views: session.page_views,
			unique_pages: session.unique_pages,
			first_event_time: session.first_visit,
			last_event_time: session.last_visit,
			event_types: session.event_types,
			page_sequence: session.page_sequence,
			visitor_total_sessions: visitorSessionCount,
			is_returning_visitor: isReturningVisitor,
			visitor_session_count: visitorSessionCount,
			referrer_parsed: referrerParsed,
			events,
			// Additional fields for compatibility
			device: session.device_type,
			browser: session.browser_name,
			os: session.os_name,
		};
	});
}

/**
 * Hook for sessions with pagination support
 */
export function useSessionsData(
	websiteId: string,
	dateRange: DateRange,
	limit = 50,
	page = 1,
	options?: Partial<UseQueryOptions<DynamicQueryResponse>>
) {
	const queryResult = useDynamicQuery(
		websiteId,
		dateRange,
		{
			id: "sessions-list",
			parameters: ["session_list"],
			limit,
			page,
		},
		{
			...options,
			staleTime: 5 * 60 * 1000, // 5 minutes
			gcTime: 10 * 60 * 1000, // 10 minutes
		}
	);

	const sessions = useMemo(() => {
		const rawSessions = (queryResult.data as any)?.session_list || [];
		return transformSessionsData(rawSessions);
	}, [queryResult.data]);

	const hasNextPage = useMemo(
		() => sessions.length === limit,
		[sessions.length, limit]
	);

	const hasPrevPage = useMemo(() => page > 1, [page]);

	return {
		...queryResult,
		sessions,
		pagination: {
			page,
			limit,
			hasNext: hasNextPage,
			hasPrev: hasPrevPage,
		},
	};
}

/**
 * Dedupe profiles by visitor_id (API returns one row per session)
 */
function dedupeProfiles(profiles: ProfileData[]): ProfileData[] {
	const seen = new Set<string>();
	return profiles.filter((p) => {
		if (seen.has(p.visitor_id)) {
			return false;
		}
		seen.add(p.visitor_id);
		return true;
	});
}

/**
 * Hook for profiles with pagination support
 */
export function useProfilesData(
	websiteId: string,
	dateRange: DateRange,
	limit = 50,
	page = 1,
	filters?: DynamicQueryFilter[],
	options?: Partial<UseQueryOptions<DynamicQueryResponse>>
) {
	const queryResult = useDynamicQuery(
		websiteId,
		dateRange,
		{
			id: "profiles-list",
			parameters: ["profile_list"],
			limit,
			page,
			filters,
		},
		{
			...options,
			staleTime: 5 * 60 * 1000, // 5 minutes
			gcTime: 10 * 60 * 1000, // 10 minutes
		}
	);

	const profiles = useMemo(() => {
		const rawProfiles = (queryResult.data as any)?.profile_list || [];
		return dedupeProfiles(rawProfiles);
	}, [queryResult.data]);

	const hasNextPage = useMemo(
		() => profiles.length === limit,
		[profiles.length, limit]
	);

	const hasPrevPage = useMemo(() => page > 1, [page]);

	return {
		...queryResult,
		profiles,
		pagination: {
			page,
			limit,
			hasNext: hasNextPage,
			hasPrev: hasPrevPage,
		},
	};
}

/**
 * Hook for fetching a single user's complete profile with sessions and events
 * Uses two separate queries: one for profile info, one for sessions list
 */
export function useUserProfile(
	websiteId: string,
	userId: string,
	dateRange: DateRange,
	options?: Partial<UseQueryOptions<DynamicQueryResponse>>
) {
	const profileQuery = useDynamicQuery(
		websiteId,
		dateRange,
		{
			id: `user-profile-${userId}`,
			parameters: ["profile_detail"],
			filters: [
				{
					field: "anonymous_id",
					operator: "eq",
					value: userId,
				},
			],
		},
		{
			...options,
			staleTime: 5 * 60 * 1000,
			gcTime: 10 * 60 * 1000,
			enabled: Boolean(userId && websiteId),
		}
	);

	const sessionsQuery = useDynamicQuery(
		websiteId,
		dateRange,
		{
			id: `user-sessions-${userId}`,
			parameters: ["profile_sessions"],
			filters: [
				{
					field: "anonymous_id",
					operator: "eq",
					value: userId,
				},
			],
			limit: 100,
		},
		{
			...options,
			staleTime: 5 * 60 * 1000,
			gcTime: 10 * 60 * 1000,
			enabled: Boolean(userId && websiteId),
		}
	);

	const userProfile = useMemo(() => {
		const rawProfile = (profileQuery.data as any)?.profile_detail?.[0];
		if (!rawProfile) {
			return null;
		}

		const rawSessions = (sessionsQuery.data as any)?.profile_sessions || [];

		const sessions = Array.isArray(rawSessions)
			? rawSessions.map((session: any) => ({
				session_id: session.session_id,
				session_name: session.session_name || "Session",
				first_visit: session.first_visit,
				last_visit: session.last_visit,
				duration: session.duration || 0,
				duration_formatted: session.duration_formatted || "0s",
				page_views: session.page_views || 0,
				unique_pages: session.unique_pages || 0,
				device: session.device || "",
				browser: session.browser || "",
				os: session.os || "",
				country: session.country || "",
				region: session.region || "",
				referrer: session.referrer || "direct",
				events:
					Array.isArray(session.events) && session.events.length > 0
						? session.events.map((eventTuple: any[]) => {
							let propertiesObj: Record<string, unknown> = {};
							if (eventTuple[4]) {
								try {
									propertiesObj = JSON.parse(eventTuple[4]);
								} catch {
									// Keep empty object if parsing fails
								}
							}
							return {
								event_id: eventTuple[0],
								time: eventTuple[1],
								event_name: eventTuple[2],
								path: eventTuple[3],
								properties: propertiesObj,
							};
						})
						: [],
			}))
			: [];

		return {
			visitor_id: rawProfile.visitor_id,
			first_visit: rawProfile.first_visit,
			last_visit: rawProfile.last_visit,
			total_sessions: rawProfile.total_sessions,
			total_pageviews: rawProfile.total_pageviews,
			total_duration: rawProfile.total_duration,
			total_duration_formatted: rawProfile.total_duration_formatted,
			device: rawProfile.device,
			browser: rawProfile.browser,
			os: rawProfile.os,
			country: rawProfile.country,
			region: rawProfile.region,
			sessions,
		};
	}, [profileQuery.data, sessionsQuery.data]);

	return {
		userProfile,
		isLoading: profileQuery.isLoading || sessionsQuery.isLoading,
		isError: profileQuery.isError || sessionsQuery.isError,
		error: profileQuery.error || sessionsQuery.error,
	};
}

/**
 * Hook for real-time active user stats. Polls every 5 seconds.
 */
export function useRealTimeStats(
	websiteId: string,
	options?: Partial<UseQueryOptions<DynamicQueryResponse>>
) {
	const dateRange = useMemo(() => {
		const now = new Date();
		const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
		return {
			start_date: fiveMinutesAgo.toISOString(),
			end_date: now.toISOString(),
		};
	}, []);

	const queryResult = useDynamicQuery(
		websiteId,
		dateRange,
		{
			id: "realtime-active-stats",
			parameters: ["active_stats"],
		},
		{
			...options,
			refetchInterval: 5000,
			staleTime: 0,
			gcTime: 10_000,
			refetchOnWindowFocus: true,
			refetchOnMount: true,
		}
	);

	const activeUsers = useMemo(() => {
		const data = (queryResult.data as any)?.active_stats?.[0];
		return data?.active_users || 0;
	}, [queryResult.data]);

	return { ...queryResult, activeUsers };
}
