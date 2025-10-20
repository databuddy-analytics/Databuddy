import type { DateRange } from '@databuddy/shared';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';

export interface FunnelStep {
	type: 'PAGE_VIEW' | 'EVENT' | 'CUSTOM';
	target: string;
	name: string;
	conditions?: Record<string, unknown>;
}

export interface FunnelFilter {
	field: string;
	operator: 'equals' | 'contains' | 'not_equals' | 'in' | 'not_in';
	value: string | string[];
	label?: string;
}

export interface Funnel {
	id: string;
	name: string;
	description?: string | null;
	steps: FunnelStep[];
	filters?: FunnelFilter[];
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

	const query = trpc.funnels.list.useQuery(
		{ websiteId },
		{ enabled: enabled && !!websiteId }
	);

	const funnelsData = useMemo(
		() =>
			(query.data || []).map((f) => ({
				...f,
				steps: f.steps as FunnelStep[],
				filters: (f.filters as FunnelFilter[]) || [],
			})),
		[query.data]
	);

	const createMutation = trpc.funnels.create.useMutation({
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [['funnels', 'list']] });
		},
	});

	const updateMutation = trpc.funnels.update.useMutation({
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [['funnels', 'list']] });
			queryClient.invalidateQueries({
				queryKey: [['funnels', 'getAnalytics']],
			});
		},
	});

	const deleteMutation = trpc.funnels.delete.useMutation({
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [['funnels', 'list']] });
			queryClient.invalidateQueries({
				queryKey: [['funnels', 'getAnalytics']],
			});
		},
	});

	return {
		data: funnelsData,
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch,

		createFunnel: (funnelData: CreateFunnelData) => {
			return createMutation.mutateAsync({
				websiteId,
				...funnelData,
			});
		},
		updateFunnel: ({
			funnelId,
			updates,
		}: {
			funnelId: string;
			updates: Partial<CreateFunnelData>;
		}) => {
			return updateMutation.mutateAsync({
				id: funnelId,
				...updates,
			});
		},
		deleteFunnel: (funnelId: string) => {
			return deleteMutation.mutateAsync({ id: funnelId });
		},

		isCreating: createMutation.isPending,
		isUpdating: updateMutation.isPending,
		isDeleting: deleteMutation.isPending,

		createError: createMutation.error,
		updateError: updateMutation.error,
		deleteError: deleteMutation.error,
	};
}

export function useFunnel(websiteId: string, funnelId: string, enabled = true) {
	return trpc.funnels.getById.useQuery(
		{ id: funnelId, websiteId },
		{ enabled: enabled && !!websiteId && !!funnelId }
	);
}

export function useFunnelAnalytics(
	websiteId: string,
	funnelId: string,
	dateRange: DateRange,
	options: { enabled: boolean } = { enabled: true }
) {
	return trpc.funnels.getAnalytics.useQuery(
		{
			funnelId,
			websiteId,
			startDate: dateRange?.start_date,
			endDate: dateRange?.end_date,
		},
		{ enabled: options.enabled && !!websiteId && !!funnelId }
	);
}

export function useFunnelAnalyticsByReferrer(
	websiteId: string,
	funnelId: string,
	dateRange?: DateRange,
	options: { enabled: boolean } = { enabled: true }
) {
	return trpc.funnels.getAnalyticsByReferrer.useQuery(
		{
			funnelId,
			websiteId,
			startDate: dateRange?.start_date,
			endDate: dateRange?.end_date,
		},
		{ enabled: options.enabled && !!websiteId && !!funnelId }
	);
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
			queryKey: ['funnels', 'getAnalytics', { websiteId, funnelId, dateRange }],
			queryFn: () =>
				// biome-ignore lint/correctness/useHookAtTopLevel: "trpc works this way"
				trpc.funnels.getAnalytics.useQuery({
					websiteId,
					funnelId,
					startDate: dateRange?.start_date,
					endDate: dateRange?.end_date,
				}),
			enabled: enabled && !!websiteId && !!funnelId,
		})),
	});

	const comparisonData = useMemo(() => {
		return funnels.map((query, index) => {
			const data = query.data;
			return {
				funnelId: funnelIds[index],
				data: data ? data : null,
				isLoading: query.isLoading,
				error: query.error,
			};
		});
	}, [funnels, funnelIds]);

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
			queryKey: [
				'funnels',
				'getAnalytics',
				{ websiteId, funnelId: funnel.id, dateRange },
			],
			queryFn: () =>
				// biome-ignore lint/correctness/useHookAtTopLevel: "trpc works this way"
				trpc.funnels.getAnalytics.useQuery({
					websiteId,
					funnelId: funnel.id,
					startDate: dateRange?.start_date,
					endDate: dateRange?.end_date,
				}),
			enabled: enabled && !!websiteId && !!funnel.id,
		})),
	});

	const performanceData = useMemo(() => {
		return results
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
			.filter(Boolean);
	}, [results, funnels]);

	return {
		data: performanceData,
		isLoading: funnelsLoading || results.some((r) => r.isLoading),
	};
}

export function useAutocompleteData(websiteId: string, enabled = true) {
	return trpc.autocomplete.get.useQuery(
		{
			websiteId,
		},
		{
			enabled: enabled && !!websiteId,
			staleTime: 1000 * 60 * 5, // 5 minutes
		}
	);
}
