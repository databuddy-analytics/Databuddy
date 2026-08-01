import type { DateRange } from "@/types/analytics";
import {
	useMutation,
	useQueries,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { listQueryOutcome } from "@/lib/list-query-outcome";
import { orpc } from "@/lib/orpc";
import type {
	CreateFunnelData,
	FunnelAnalyticsData,
	FunnelFilter,
	FunnelStep,
} from "@/types/funnels";

export function useFunnelActions(websiteId: string) {
	const queryClient = useQueryClient();
	const invalidateAll = () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: orpc.funnels.list.key({ input: { websiteId } }),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.funnels.getById.key(),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.funnels.getAnalytics.key(),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.funnels.getAnalyticsByReferrer.key(),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.funnels.getAnalyticsByLink.key(),
			}),
		]);

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
			invalidateAll();
			toast.success("Funnel updated successfully");
		},
	});

	const deleteMutation = useMutation({
		...orpc.funnels.delete.mutationOptions(),
		onSuccess: () => {
			invalidateAll();
			toast.success("Funnel deleted successfully");
		},
	});

	return {
		refreshAction: invalidateAll,

		createAction: (data: CreateFunnelData) =>
			createMutation.mutateAsync({ websiteId, ...data }),
		updateAction: (funnelId: string, updates: Partial<CreateFunnelData>) =>
			updateMutation.mutateAsync({ id: funnelId, ...updates }),
		deleteAction: (funnelId: string) =>
			deleteMutation.mutateAsync({ id: funnelId }),

		isCreating: createMutation.isPending,
		isUpdating: updateMutation.isPending,
		isDeleting: deleteMutation.isPending,
	};
}

export function useFunnels(
	websiteId: string,
	options?: { dateRange?: DateRange; enabled?: boolean }
) {
	const enabled = options?.enabled ?? true;
	const dateRange = options?.dateRange;
	const query = useQuery({
		...orpc.funnels.list.queryOptions({ input: { websiteId } }),
		enabled: enabled && !!websiteId,
	});
	const actions = useFunnelActions(websiteId);

	const funnels = useMemo(
		() =>
			(query.data ?? []).map((f) => ({
				...f,
				steps: f.steps as FunnelStep[],
				filters: (f.filters as FunnelFilter[]) ?? [],
			})),
		[query.data]
	);

	const analyticsResults = useQueries({
		queries: funnels.map((funnel) => ({
			...orpc.funnels.getAnalytics.queryOptions({
				input: {
					websiteId,
					funnelId: funnel.id,
					startDate: dateRange?.start_date,
					endDate: dateRange?.end_date,
				},
			}),
			enabled: enabled && !!websiteId && !!funnel.id && !!dateRange,
		})),
	});

	const analyticsMap = useMemo(() => {
		const map = new Map<string, FunnelAnalyticsData | null>();
		for (const [index, result] of analyticsResults.entries()) {
			if (result.data && funnels[index]) {
				map.set(funnels[index].id, result.data);
			}
		}
		return map;
	}, [analyticsResults, funnels]);

	const loadingIds = useMemo(() => {
		const set = new Set<string>();
		for (const [index, result] of analyticsResults.entries()) {
			if ((result.isLoading || result.isFetching) && funnels[index]) {
				set.add(funnels[index].id);
			}
		}
		return set;
	}, [analyticsResults, funnels]);

	const listOutcome = useMemo(
		() =>
			listQueryOutcome({
				data: funnels,
				isError: query.isError,
				isPending: query.isPending,
				isSuccess: query.isSuccess,
			}),
		[funnels, query.isError, query.isPending, query.isSuccess]
	);

	return {
		funnels,
		analyticsMap,
		loadingIds,
		listOutcome,
		isLoading: query.isLoading,
		isFetching: query.isFetching || analyticsResults.some((r) => r.isFetching),
		error: query.error,
		...actions,
	};
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
