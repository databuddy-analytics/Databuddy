import type { GoalFilter } from "@databuddy/shared/types/api";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";

export interface Goal {
	id: string;
	websiteId: string;
	type: "PAGE_VIEW" | "EVENT" | "CUSTOM";
	target: string;
	name: string;
	description?: string | null;
	filters?: GoalFilter[];
	isActive: boolean;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
	deletedAt?: string | null;
}

export interface CreateGoalData {
	websiteId: string;
	type: "PAGE_VIEW" | "EVENT" | "CUSTOM";
	target: string;
	name: string;
	description?: string;
	filters?: GoalFilter[];
}

export function useGoals(websiteId: string, enabled = true) {
	const queryClient = useQueryClient();
	const query = trpc.goals.list.useQuery(
		{ websiteId },
		{ enabled: enabled && !!websiteId }
	);
	const goalsData = useMemo(
		() =>
			(query.data || []).map((goal) => ({
				...goal,
				type: goal.type as "PAGE_VIEW" | "EVENT" | "CUSTOM",
				filters: (goal.filters as GoalFilter[]) || [],
			})),
		[query.data]
	);

	const createMutation = trpc.goals.create.useMutation({
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [["goals", "list"]] });
		},
	});
	const updateMutation = trpc.goals.update.useMutation({
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [["goals", "list"]] });
			queryClient.invalidateQueries({ queryKey: [["goals", "getAnalytics"]] });
		},
	});
	const deleteMutation = trpc.goals.delete.useMutation({
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [["goals", "list"]] });
			queryClient.invalidateQueries({ queryKey: [["goals", "getAnalytics"]] });
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
			updates: Partial<CreateGoalData>;
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
	return trpc.goals.getById.useQuery(
		{ id: goalId, websiteId },
		{ enabled: enabled && !!websiteId && !!goalId }
	);
}

export function useGoalAnalytics(
	websiteId: string,
	goalId: string,
	dateRange: { start_date: string; end_date: string },
	options: { enabled: boolean } = { enabled: true }
) {
	return trpc.goals.getAnalytics.useQuery(
		{
			goalId,
			websiteId,
			startDate: dateRange?.start_date,
			endDate: dateRange?.end_date,
		},
		{ enabled: options.enabled && !!websiteId && !!goalId }
	);
}

export function useBulkGoalAnalytics(
	websiteId: string,
	goalIds: string[],
	dateRange: { start_date: string; end_date: string },
	options: { enabled: boolean } = { enabled: true }
) {
	return trpc.goals.bulkAnalytics.useQuery(
		{
			websiteId,
			goalIds,
			startDate: dateRange?.start_date,
			endDate: dateRange?.end_date,
		},
		{ enabled: options.enabled && !!websiteId && goalIds.length > 0 }
	);
}
