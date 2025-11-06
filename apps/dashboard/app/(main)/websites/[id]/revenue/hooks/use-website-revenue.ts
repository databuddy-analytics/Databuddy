import type { DateRange } from "@databuddy/shared/types/analytics";
import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Response interfaces
export interface WebsiteRevenueSummary {
	total_revenue: number;
	total_transactions: number;
	avg_order_value: number;
	total_refunds: number;
}

export interface WebsiteRevenueTrend {
	date: string;
	revenue: number;
	transactions: number;
}

export interface WebsiteRevenueTransaction {
	id: string;
	amount: number;
	currency: string;
	created: string;
	status: string;
}

export interface WebsiteRevenueResponse {
	success: boolean;
	summary: WebsiteRevenueSummary;
	trends: WebsiteRevenueTrend[];
	recent_transactions: WebsiteRevenueTransaction[];
	error?: string;
}

// Base params builder - following use-dynamic-query.ts pattern
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

// Base fetcher function - following use-dynamic-query.ts pattern
async function fetchWebsiteRevenue(
	websiteId: string,
	dateRange?: DateRange,
	signal?: AbortSignal
): Promise<WebsiteRevenueResponse> {
	const params = buildParams(websiteId, dateRange);
	const url = `${API_BASE_URL}/v1/revenue/analytics/website/${websiteId}?${params}`;

	const response = await fetch(url, {
		credentials: "include",
		signal,
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch revenue data: ${response.statusText}`);
	}

	const data = await response.json();

	if (!data.success) {
		throw new Error(data.error || "Failed to fetch revenue data");
	}

	return data;
}

// Common query options - following use-dynamic-query.ts pattern
const defaultQueryOptions = {
	staleTime: 5 * 60 * 1000, // 5 minutes
	gcTime: 30 * 60 * 1000, // 30 minutes
	refetchOnWindowFocus: false,
	refetchOnMount: false,
	refetchInterval: 10 * 60 * 1000, // Background refetch every 10 minutes
	retry: (failureCount: number, error: Error) => {
		if (error instanceof DOMException && error.name === "AbortError") {
			return false;
		}
		return failureCount < 2;
	},
	networkMode: "online" as const,
	refetchIntervalInBackground: false,
};

export function useWebsiteRevenue(
	websiteId: string,
	dateRange: DateRange,
	options?: Partial<UseQueryOptions<WebsiteRevenueResponse>>
) {
	const query = useQuery({
		queryKey: [
			"website-revenue",
			websiteId,
			dateRange.start_date,
			dateRange.end_date,
			dateRange.granularity,
		],
		queryFn: ({ signal }) => fetchWebsiteRevenue(websiteId, dateRange, signal),
		...defaultQueryOptions,
		...options,
		enabled: options?.enabled !== false && !!websiteId,
	});

	// Calculate additional summary statistics
	const summaryStats = useMemo(() => {
		if (!query.data) {
			return {
				refundRate: 0,
				hasData: false,
			};
		}

		const { summary } = query.data;

		// Calculate refund rate
		const refundRate =
			summary.total_transactions > 0
				? (summary.total_refunds / summary.total_transactions) * 100
				: 0;

		const hasData = summary.total_revenue > 0 || summary.total_transactions > 0;

		return {
			refundRate: Math.round(refundRate * 100) / 100,
			hasData,
		};
	}, [query.data]);

	return {
		data: query.data || {
			success: false,
			summary: {
				total_revenue: 0,
				total_transactions: 0,
				avg_order_value: 0,
				total_refunds: 0,
			},
			trends: [],
			recent_transactions: [],
		},
		summaryStats,
		isLoading: query.isLoading,
		isError: query.isError,
		error: query.error,
		refetch: query.refetch,
		isFetching: query.isFetching,
	};
}
