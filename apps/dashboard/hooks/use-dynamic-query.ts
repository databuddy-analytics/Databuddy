import type {
	BatchQueryResponse,
	DateRange,
	DynamicQueryFilter,
	DynamicQueryRequest,
	DynamicQueryResponse,
	ExtractDataTypes,
	JourneyDropoff,
	JourneyEntryPoint,
	JourneyPath,
	JourneyTransition,
	ParameterDataMap,
	ProfileData,
	QueryOptionsResponse,
	RecentRefundData,
	RecentTransactionData,
	RevenueBreakdownData,
	RevenueSummaryData,
	RevenueTrendData,
} from '@databuddy/shared';
import { getCountryCode, getCountryName } from '@databuddy/shared';
import {
	type UseInfiniteQueryOptions,
	type UseQueryOptions,
	useInfiniteQuery,
	useQuery,
} from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { formatDuration } from '@/app/(main)/websites/[id]/profiles/_components/profile-utils';
import { usePreferences } from './use-preferences';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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
		params.append('start_date', dateRange.start_date);
	}

	if (dateRange?.end_date) {
		params.append('end_date', dateRange.end_date);
	}

	if (dateRange?.granularity) {
		params.append('granularity', dateRange.granularity);
	}

	// Add cache busting
	params.append('_t', Date.now().toString());

	return params;
}

// Common query options
const defaultQueryOptions = {
	staleTime: 5 * 60 * 1000, // 5 minutes
	gcTime: 30 * 60 * 1000, // 30 minutes
	refetchOnWindowFocus: false,
	refetchOnMount: true, // Changed to true to show loading state on refresh
	refetchInterval: 10 * 60 * 1000, // Background refetch every 10 minutes
	retry: (failureCount: number, error: Error) => {
		if (error instanceof DOMException && error.name === 'AbortError') {
			return false;
		}
		return failureCount < 2;
	},
	networkMode: 'online' as const,
	refetchIntervalInBackground: false,
};

/**
 * Hook to get the user's effective timezone
 */
function useUserTimezone(): string {
	const { preferences } = usePreferences();

	// Get browser timezone as fallback
	const browserTimezone = useMemo(() => {
		try {
			return Intl.DateTimeFormat().resolvedOptions().timeZone;
		} catch {
			return 'UTC';
		}
	}, []);

	// Return user's preferred timezone or browser timezone if 'auto'
	if (!preferences) {
		return browserTimezone;
	}

	return preferences.timezone === 'auto'
		? browserTimezone
		: preferences.timezone;
}

function transformFilters(filters?: DynamicQueryRequest['filters']) {
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
	signal?: AbortSignal,
	userTimezone?: string
): Promise<DynamicQueryResponse | BatchQueryResponse> {
	const timezone = userTimezone || 'UTC';
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
				granularity: query.granularity || dateRange.granularity || 'daily',
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
				granularity: queryData.granularity || dateRange.granularity || 'daily',
				groupBy: queryData.groupBy,
			};

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		credentials: 'include',
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
		throw new Error(data.error || 'Failed to fetch dynamic query data');
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
	const userTimezone = useUserTimezone();

	const fetchData = useCallback(
		async ({ signal }: { signal?: AbortSignal }) => {
			const result = await fetchDynamicQuery(
				websiteId,
				dateRange,
				queryData,
				signal,
				userTimezone
			);
			return result as DynamicQueryResponse;
		},
		[websiteId, dateRange, queryData, userTimezone]
	);

	const query = useQuery({
		queryKey: ['dynamic-query', websiteId, dateRange, queryData, userTimezone],
		queryFn: fetchData,
		...defaultQueryOptions,
		...options,
		enabled:
			options?.enabled !== false &&
			!!websiteId &&
			queryData.parameters.length > 0,
	});

	// Process data into a more usable format
	const processedData = useMemo(() => {
		return (
			query.data?.data.reduce(
				(acc, result) => {
					if (result.success) {
						acc[result.parameter] = result.data;
					}
					return acc;
				},
				{} as Record<string, any>
			) || {}
		);
	}, [query.data]);

	// Extract errors
	const errors = useMemo(() => {
		return (
			query.data?.data
				.filter((result) => !result.success)
				.map((result) => ({
					parameter: result.parameter,
					error: result.error,
				})) || []
		);
	}, [query.data]);

	return {
		data: processedData as ExtractDataTypes<T>,
		meta: query.data?.meta,
		errors,
		isLoading: query.isLoading,
		isError: query.isError,
		error: query.error,
		refetch: query.refetch,
		isFetching: query.isFetching,
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
	const userTimezone = useUserTimezone();

	const fetchData = useCallback(
		async ({ signal }: { signal?: AbortSignal }) => {
			const result = await fetchDynamicQuery(
				websiteId,
				dateRange,
				queries,
				signal,
				userTimezone
			);
			// Ensure we return a batch query response
			return result as BatchQueryResponse;
		},
		[websiteId, dateRange, queries, userTimezone]
	);

	const query = useQuery({
		queryKey: [
			'batch-dynamic-query',
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
					parameter: 'query',
					error: 'No data array found in response',
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
		isLoading: query.isLoading || query.isFetching,
		isError: query.isError,
		error: query.error,
		refetch: query.refetch,
		isFetching: query.isFetching,
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
		queryKey: ['query-options'],
		queryFn: async () => {
			const res = await fetch('/api/query/types');
			if (!res.ok) {
				throw new Error('Failed to fetch query options');
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
			id: 'pages',
			parameters: ['slow_pages'],
			limit: 100,
			filters,
		},
		{
			id: 'countries',
			parameters: ['performance_by_country'],
			limit: 100,
			filters,
		},
		{
			id: 'devices',
			parameters: ['performance_by_device'],
			limit: 100,
			filters,
		},
		{
			id: 'browsers',
			parameters: ['performance_by_browser'],
			limit: 100,
			filters,
		},
		{
			id: 'operating_systems',
			parameters: ['performance_by_os'],
			limit: 100,
			filters,
		},
		{
			id: 'regions',
			parameters: ['performance_by_region'],
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
			id: 'countries',
			parameters: ['country'],
			limit: 100,
		},
		{
			id: 'regions',
			parameters: ['region'],
			limit: 100,
		},
		{
			id: 'timezones',
			parameters: ['timezone'],
			limit: 100,
		},
		{
			id: 'languages',
			parameters: ['language'],
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
	options?: Partial<UseQueryOptions<BatchQueryResponse>>
) {
	const queries: DynamicQueryRequest[] = [
		{
			id: 'map-countries',
			parameters: ['country'],
			limit: 100,
		},
		{
			id: 'map-regions',
			parameters: ['region'],
			limit: 100,
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
				id: 'recent_errors',
				parameters: ['recent_errors'],
				limit: 100,
				filters,
			},
			{ id: 'error_types', parameters: ['error_types'], limit: 100, filters },
			{
				id: 'errors_by_page',
				parameters: ['errors_by_page'],
				limit: 25,
				filters,
			},
			{ id: 'error_trends', parameters: ['error_trends'], limit: 30, filters },
			{
				id: 'error_frequency',
				parameters: ['error_frequency'],
				limit: 30,
				filters,
			},
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
		queryKey: ['sessions-infinite', websiteId, dateRange, limit],
		queryFn: async ({ pageParam = 1, signal }) => {
			const result = await fetchDynamicQuery(
				websiteId,
				dateRange,
				{
					id: 'sessions-list',
					parameters: ['session_list'],
					limit,
					page: pageParam as number,
				},
				signal
			);
			// Ensure we return DynamicQueryResponse
			if ('batch' in result) {
				throw new Error('Batch queries not supported for infinite sessions');
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
		getPreviousPageParam: (firstPage) => {
			return firstPage.meta.page > 1 ? firstPage.meta.page - 1 : undefined;
		},
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
			: 'Unknown Session';

		// Format duration
		const durationFormatted = formatDuration(session.duration || 0);

		// Parse referrer
		let referrerParsed = null;
		if (session.referrer) {
			try {
				const url = new URL(session.referrer);
				referrerParsed = {
					type:
						url.hostname === window.location.hostname ? 'internal' : 'external',
					name: url.hostname,
					domain: url.hostname,
				};
			} catch {
				referrerParsed = {
					type: 'direct',
					name: 'Direct',
					domain: null,
				};
			}
		}

		// Map country code and preserve original name
		const countryCode = getCountryCode(session.country || '');
		const countryName = session.country || 'Unknown';

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
			id: 'sessions-list',
			parameters: ['session_list'],
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

	const hasNextPage = useMemo(() => {
		return sessions.length === limit;
	}, [sessions.length, limit]);

	const hasPrevPage = useMemo(() => {
		return page > 1;
	}, [page]);

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
 * Transform profiles data from API2 format to frontend format
 */
function transformProfilesData(profiles: any[]): ProfileData[] {
	const profilesByVisitor = new Map();

	for (const profile of profiles) {
		if (!profilesByVisitor.has(profile.visitor_id)) {
			// Initialize profile data
			profilesByVisitor.set(profile.visitor_id, {
				visitor_id: profile.visitor_id,
				first_visit: profile.first_visit,
				last_visit: profile.last_visit,
				total_sessions: profile.session_count,
				total_pageviews: profile.total_events,
				total_duration: 0,
				total_duration_formatted: '0s',
				device: profile.device_type,
				browser: profile.browser_name,
				os: profile.os_name,
				country: getCountryCode(profile.country || ''),
				country_name: getCountryName(profile.country || ''),
				region: profile.region,
				sessions: [],
			});
		}

		// Add session data if available
		if (profile.session_id) {
			const sessionData = {
				session_id: profile.session_id,
				session_name: `Session ${profile.session_id.slice(-8)}`,
				first_visit: profile.session_start,
				last_visit: profile.session_end,
				duration: profile.duration || 0,
				duration_formatted: formatDuration(profile.duration || 0),
				page_views: profile.page_views || 0,
				unique_pages: profile.session_unique_pages || 0,
				device: profile.session_device_type || profile.device_type,
				browser: profile.session_browser_name || profile.browser_name,
				os: profile.session_os_name || profile.os_name,
				country: getCountryCode(
					profile.session_country || profile.country || ''
				),
				country_name: getCountryName(
					profile.session_country || profile.country || ''
				),
				region: profile.session_region || profile.region,
				referrer: profile.session_referrer || profile.referrer,
				events: [],
			};

			// Parse events if available
			if (profile.events && Array.isArray(profile.events)) {
				sessionData.events = profile.events
					.map((eventTuple: any) => {
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

			profilesByVisitor.get(profile.visitor_id).sessions.push(sessionData);
		}
	}

	// Convert to array and sort sessions by start time
	return Array.from(profilesByVisitor.values()).map((profile) => ({
		...profile,
		sessions: profile.sessions.sort(
			(a: any, b: any) =>
				new Date(b.first_visit).getTime() - new Date(a.first_visit).getTime()
		),
	}));
}

/**
 * Hook for profiles with pagination support
 */
export function useProfilesData(
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
			id: 'profiles-list',
			parameters: ['profile_list'],
			limit,
			page,
		},
		{
			...options,
			staleTime: 5 * 60 * 1000, // 5 minutes
			gcTime: 10 * 60 * 1000, // 10 minutes
		}
	);

	const profiles = useMemo(() => {
		const rawProfiles = (queryResult.data as any)?.profile_list || [];
		return transformProfilesData(rawProfiles);
	}, [queryResult.data]);

	const hasNextPage = useMemo(() => {
		return profiles.length === limit;
	}, [profiles.length, limit]);

	const hasPrevPage = useMemo(() => {
		return page > 1;
	}, [page]);

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
			id: 'realtime-active-stats',
			parameters: ['active_stats'],
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
