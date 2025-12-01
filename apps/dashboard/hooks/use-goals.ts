import type { goals, InferInsertModel, InferSelectModel } from "@databuddy/db";
import type { GoalFilter } from "@databuddy/shared/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { orpc } from "@/lib/orpc";

export type Goal = InferSelectModel<typeof goals>;
export type CreateGoalData = InferInsertModel<typeof goals>;
export type UpdateGoalData = Partial<InferInsertModel<typeof goals>>;

export function useGoals(websiteId: string, enabled = true) {
	const queryClient = useQueryClient();
	const query = useQuery({
		...orpc.goals.list.queryOptions({ input: { websiteId } }),
		enabled: enabled && !!websiteId,
	});

	const goalsData = useMemo(
		() =>
			(query.data ?? []).map((goal) => ({
				...goal,
				type: goal.type as "PAGE_VIEW" | "EVENT" | "CUSTOM",
				filters: (goal.filters as GoalFilter[]) ?? [],
			})),
		[query.data]
	);

	const createMutation = useMutation({
		...orpc.goals.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.goals.list.key({ input: { websiteId } }),
			});
		},
	});

	const updateMutation = useMutation({
		...orpc.goals.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.goals.list.key({ input: { websiteId } }),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.goals.getAnalytics.key(),
			});
		},
	});

	const deleteMutation = useMutation({
		...orpc.goals.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.goals.list.key({ input: { websiteId } }),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.goals.getAnalytics.key(),
			});
		},
	});

	return {
		data: goalsData,
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch,
		createGoal: (goalData: CreateGoalData) =>
			createMutation.mutateAsync(goalData),
		updateGoal: ({
			goalId,
			updates,
		}: {
			goalId: string;
			updates: UpdateGoalData;
		}) => updateMutation.mutateAsync({ id: goalId, ...updates }),
		deleteGoal: (goalId: string) => deleteMutation.mutateAsync({ id: goalId }),
		isCreating: createMutation.isPending,
		isUpdating: updateMutation.isPending,
		isDeleting: deleteMutation.isPending,
		createError: createMutation.error,
		updateError: updateMutation.error,
		deleteError: deleteMutation.error,
	};
}

export function useGoal(websiteId: string, goalId: string, enabled = true) {
	return useQuery({
		...orpc.goals.getById.queryOptions({ input: { id: goalId, websiteId } }),
		enabled: enabled && !!websiteId && !!goalId,
	});
}

export function useGoalAnalytics(
	websiteId: string,
	goalId: string,
	dateRange: { start_date: string; end_date: string },
	options: { enabled: boolean } = { enabled: true }
) {
	return useQuery({
		...orpc.goals.getAnalytics.queryOptions({
			input: {
				goalId,
				websiteId,
				startDate: dateRange?.start_date,
				endDate: dateRange?.end_date,
			},
		}),
		enabled: options.enabled && !!websiteId && !!goalId,
	});
}

export function useBulkGoalAnalytics(
	websiteId: string,
	goalIds: string[],
	dateRange: { start_date: string; end_date: string },
	options: { enabled: boolean } = { enabled: true }
) {
	return useQuery({
		...orpc.goals.bulkAnalytics.queryOptions({
			input: {
				websiteId,
				goalIds,
				startDate: dateRange?.start_date,
				endDate: dateRange?.end_date,
			},
		}),
		enabled: options.enabled && !!websiteId && goalIds.length > 0,
	});
}
