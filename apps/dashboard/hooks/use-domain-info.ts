"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export interface DomainRankData {
	status_code: number;
	error: string;
	page_rank_integer: number;
	page_rank_decimal: number;
	rank: string | null;
	domain: string;
}

interface BatchDomainRankResponse {
	success: boolean;
	error?: string;
	data: Record<string, DomainRankData | null>;
}

const CACHE_TIME = 60 * 60 * 1000;
const STALE_TIME = 30 * 60 * 1000;

const queryOptions = {
	staleTime: STALE_TIME,
	gcTime: CACHE_TIME + 5 * 60 * 1000,
	refetchOnWindowFocus: false,
	refetchOnMount: true,
	retry: (failureCount: number, error: Error) => {
		if (
			error.message.includes("HTTP 4") &&
			!error.message.includes("HTTP 408")
		) {
			return false;
		}
		return failureCount < 3;
	},
	retryDelay: (attemptIndex: number) =>
		Math.min(1000 * 2 ** attemptIndex, 30_000),
} as const;

async function fetchDomainRanks(): Promise<BatchDomainRankResponse> {
	const response = await fetch(`${API_BASE_URL}/v1/domain-info/batch/all`, {
		credentials: "include",
		headers: {
			"Content-Type": "application/json",
		},
	});

	if (!response.ok) {
		const errorText = await response.text().catch(() => "Unknown error");
		throw new Error(`HTTP ${response.status}: ${errorText}`);
	}

	const data = await response.json();

	if (!data.success) {
		throw new Error(data.error || "Failed to fetch domain ranks");
	}

	return data;
}

export function useDomainRanks() {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ["domain-ranks"],
		queryFn: fetchDomainRanks,
		...queryOptions,
	});

	const invalidateAndRefetch = () => {
		queryClient.invalidateQueries({ queryKey: ["domain-ranks"] });
		return query.refetch();
	};

	const forceRefresh = () => {
		queryClient.removeQueries({ queryKey: ["domain-ranks"] });
		return query.refetch();
	};

	return {
		ranks: query.data?.data ?? {},

		isLoading: query.isLoading,
		isFetching: query.isFetching,
		isRefetching: query.isRefetching,

		isError: query.isError,
		error: query.error,

		status: query.status,
		fetchStatus: query.fetchStatus,

		refetch: query.refetch,
		invalidateAndRefetch,
		forceRefresh,

		dataUpdatedAt: query.dataUpdatedAt,
		errorUpdatedAt: query.errorUpdatedAt,

		isStale: query.isStale,
		isPending: query.isPending,
	};
}
