import type { DateRange } from "@databuddy/shared/types/analytics";
import {
	useMutation,
	useQueries,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { orpc } from "@/lib/orpc";

export interface FunnelStep {
	type: "PAGE_VIEW" | "EVENT" | "CUSTOM";
	target: string;
	name: string;
	conditions?: Record<string, unknown>;
}

export interface FunnelFilter {
	field: string;
	operator: "equals" | "contains" | "not_equals" | "in" | "not_in";
	value: string | string[];
	label?: string;
}

export interface Funnel {
	id: string;
	name: string;
	description?: string | null;
	steps: FunnelStep[];
	filters?: FunnelFilter[];
	ignoreHistoricData?: boolean;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface FunnelAnalytics {
	step_number: number;
	step_name: string;
	users: number;
	total_users: number;
	conversion_rate: number;
	dropoffs: number;
	dropoff_rate: number;
	step_completion_time?: number;
	avg_time_to_complete?: number;
}

export interface FunnelPerformanceMetrics {
	overall_conversion_rate: number;
	total_users_entered: number;
	total_users_completed: number;
	avg_completion_time: number;
	avg_completion_time_formatted: string;
	biggest_dropoff_step: number;
	biggest_dropoff_rate: number;
	steps_analytics: FunnelAnalytics[];
}

export interface CreateFunnelData {
	name: string;
	description?: string;
	steps: FunnelStep[];
	filters?: FunnelFilter[];
	ignoreHistoricData?: boolean;
}

export interface AutocompleteData {
	customEvents: string[];
	pagePaths: string[];
	browsers: string[];
	operatingSystems: string[];
	countries: string[];
	deviceTypes: string[];
	utmSources: string[];
	utmMediums: string[];
	utmCampaigns: string[];
}
export interface FunnelAnalyticsByReferrerResult {
	referrer: string;
	referrer_parsed: {
		name: string;
		type: string;
		domain: string;
	};
	total_users: number;
	completed_users: number;
	conversion_rate: number;
}

export function useFunnels(websiteId: string, enabled = true) {
	const queryClient = useQueryClient();

	const query = useQuery({
		...orpc.funnels.list.queryOptions({ input: { websiteId } }),
		enabled: enabled && !!websiteId,
	});

	const funnelsData = useMemo(
		() =>
			(query.data ?? []).map((f) => ({
				...f,
				steps: f.steps as FunnelStep[],
				filters: (f.filters as FunnelFilter[]) ?? [],
			})),
		[query.data]
	);

	const createMutation = useMutation({
		...orpc.funnels.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.funnels.list.key({ input: { websiteId } }),
			});
			toast.success("Funnel created successfully");
		},
	});

	const updateMutation = useMutation({
		...orpc.funnels.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.funnels.list.key({ input: { websiteId } }),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.funnels.getAnalytics.key(),
			});
			toast.success("Funnel updated successfully");
		},
	});

	const deleteMutation = useMutation({
		...orpc.funnels.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.funnels.list.key({ input: { websiteId } }),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.funnels.getAnalytics.key(),
			});
			toast.success("Funnel deleted successfully");
		},
	});

	return {
		data: funnelsData,
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch,

		createFunnel: (funnelData: CreateFunnelData) =>
			createMutation.mutateAsync({
				websiteId,
				...funnelData,
			}),
		updateFunnel: ({
			funnelId,
			updates,
		}: {
			funnelId: string;
			updates: Partial<CreateFunnelData>;
		}) =>
			updateMutation.mutateAsync({
				id: funnelId,
				...updates,
			}),
		deleteFunnel: (funnelId: string) =>
			deleteMutation.mutateAsync({ id: funnelId }),

		isCreating: createMutation.isPending,
		isUpdating: updateMutation.isPending,
		isDeleting: deleteMutation.isPending,

		createError: createMutation.error,
		updateError: updateMutation.error,
		deleteError: deleteMutation.error,
	};
}

export function useFunnel(websiteId: string, funnelId: string, enabled = true) {
	return useQuery({
		...orpc.funnels.getById.queryOptions({
			input: { id: funnelId, websiteId },
		}),
		enabled: enabled && !!websiteId && !!funnelId,
	});
}

export function useFunnelAnalytics(
	websiteId: string,
	funnelId: string,
	dateRange: DateRange,
	options: { enabled: boolean } = { enabled: true }
) {
	return useQuery({
		...orpc.funnels.getAnalytics.queryOptions({
			input: {
				funnelId,
				websiteId,
				startDate: dateRange?.start_date,
				endDate: dateRange?.end_date,
			},
		}),
		enabled: options.enabled && !!websiteId && !!funnelId,
	});
}

export function useFunnelAnalyticsByReferrer(
	websiteId: string,
	funnelId: string,
	dateRange?: DateRange,
	options: { enabled: boolean } = { enabled: true }
) {
	return useQuery({
		...orpc.funnels.getAnalyticsByReferrer.queryOptions({
			input: {
				funnelId,
				websiteId,
				startDate: dateRange?.start_date,
				endDate: dateRange?.end_date,
			},
		}),
		enabled: options.enabled && !!websiteId && !!funnelId,
	});
}

export function useEnhancedFunnelAnalytics(
	websiteId: string,
	funnelId: string,
	dateRange: DateRange,
	enabled = true
) {
	const funnelQuery = useFunnel(websiteId, funnelId, enabled);

	const analyticsQuery = useFunnelAnalytics(websiteId, funnelId, dateRange, {
		enabled,
	});

	const enhancedData = useMemo(() => {
		const analytics = analyticsQuery.data;

		if (!analytics) {
			return {
				performance: null,
				stepsBreakdown: [],
				summary: null,
			};
		}

		const summary = {
			totalUsers: analytics.total_users_entered,
			convertedUsers: analytics.total_users_completed,
			conversionRate: analytics.overall_conversion_rate,
			biggestDropoffStep: analytics.biggest_dropoff_step,
			biggestDropoffRate: analytics.biggest_dropoff_rate,
		};

		return {
			performance: analytics,
			stepsBreakdown: analytics.steps_analytics,
			summary,
		};
	}, [analyticsQuery.data]);

	const isLoading = funnelQuery.isLoading || analyticsQuery.isLoading;
	const error = funnelQuery.error || analyticsQuery.error;

	return {
		data: enhancedData,
		isLoading,
		error,
		funnel: funnelQuery.data,
		refetch: () => {
			funnelQuery.refetch();
			analyticsQuery.refetch();
		},
	};
}

export function useFunnelComparison(
	websiteId: string,
	funnelIds: string[],
	dateRange: DateRange,
	enabled = true
) {
	const funnels = useQueries({
		queries: funnelIds.map((funnelId) => ({
			...orpc.funnels.getAnalytics.queryOptions({
				input: {
					websiteId,
					funnelId,
					startDate: dateRange?.start_date,
					endDate: dateRange?.end_date,
				},
			}),
			enabled: enabled && !!websiteId && !!funnelId,
		})),
	});

	const comparisonData = useMemo(
		() =>
			funnels.map((query, index) => {
				const data = query.data;
				return {
					funnelId: funnelIds[index],
					data: data ? data : null,
					isLoading: query.isLoading,
					error: query.error,
				};
			}),
		[funnels, funnelIds]
	);

	return {
		data: comparisonData,
		isLoading: funnels.some((q) => q.isLoading),
	};
}

export function useFunnelPerformance(
	websiteId: string,
	dateRange: DateRange,
	enabled = true
) {
	const { data: funnels, isLoading: funnelsLoading } = useFunnels(
		websiteId,
		enabled
	);

	const results = useQueries({
		queries: (funnels || []).map((funnel) => ({
			...orpc.funnels.getAnalytics.queryOptions({
				input: {
					websiteId,
					funnelId: funnel.id,
					startDate: dateRange?.start_date,
					endDate: dateRange?.end_date,
				},
			}),
			enabled: enabled && !!websiteId && !!funnel.id,
		})),
	});

	const performanceData = useMemo(
		() =>
			results
				.map((result, index) => {
					if (!result.data) {
						return null;
					}
					return {
						funnelId: funnels[index].id,
						funnelName: funnels[index].name,
						...result.data,
					};
				})
				.filter(Boolean),
		[results, funnels]
	);

	return {
		data: performanceData,
		isLoading: funnelsLoading || results.some((r) => r.isLoading),
	};
}

export function useAutocompleteData(websiteId: string, enabled = true) {
	return useQuery({
		...orpc.autocomplete.get.queryOptions({
			input: { websiteId },
		}),
		enabled: enabled && !!websiteId,
		staleTime: 1000 * 60 * 5,
	});
}
