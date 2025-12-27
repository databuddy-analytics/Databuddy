import type { goals, InferInsertModel, InferSelectModel } from "@databuddy/db";
import type { GoalFilter } from "@databuddy/shared/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { orpc } from "@/lib/orpc";

export type Goal = InferSelectModel<typeof goals>;
export type CreateGoalData = InferInsertModel<typeof goals>;
export type UpdateGoalData = Partial<InferInsertModel<typeof goals>>;

// RPC input types matching the API schema exactly
interface CreateGoalInput {
	websiteId: string;
	type: "PAGE_VIEW" | "EVENT" | "CUSTOM";
	target: string;
	name: string;
	description?: string | null;
	filters?: GoalFilter[];
	ignoreHistoricData?: boolean;
}

interface UpdateGoalInput {
	id: string;
	type?: "PAGE_VIEW" | "EVENT" | "CUSTOM";
	target?: string;
	name?: string;
	description?: string | null;
	filters?: GoalFilter[];
	ignoreHistoricData?: boolean;
	isActive?: boolean;
}

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
			toast.success("Goal created successfully");
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
			toast.success("Goal updated successfully");
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
			queryClient.invalidateQueries({
				queryKey: orpc.goals.bulkAnalytics.key(),
			});
			toast.success("Goal deleted successfully");
		},
	});

	return {
		data: goalsData,
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch,
		createGoal: (goalData: CreateGoalData) => {
			const input: CreateGoalInput = {
				websiteId: goalData.websiteId,
				type: goalData.type as "PAGE_VIEW" | "EVENT" | "CUSTOM",
				target: goalData.target,
				name: goalData.name,
				description: goalData.description ?? null,
				filters: goalData.filters as GoalFilter[] | undefined,
				ignoreHistoricData: goalData.ignoreHistoricData,
			};
			return createMutation.mutateAsync(input);
		},
		updateGoal: ({
			goalId,
			updates,
		}: {
			goalId: string;
			updates: UpdateGoalData;
		}) => {
			const input: UpdateGoalInput = {
				id: goalId,
			};

			// Only include RPC-accepted fields, excluding extraneous ones like websiteId/createdBy/createdAt/updatedAt/deletedAt
			if (updates.type !== undefined) {
				input.type = updates.type as "PAGE_VIEW" | "EVENT" | "CUSTOM";
			}
			if (updates.target !== undefined) {
				input.target = updates.target;
			}
			if (updates.name !== undefined) {
				input.name = updates.name;
			}
			if (updates.description !== undefined) {
				input.description = updates.description ?? null;
			}
			if (updates.filters !== undefined) {
				input.filters = updates.filters as GoalFilter[] | undefined;
			}
			if (updates.ignoreHistoricData !== undefined) {
				input.ignoreHistoricData = updates.ignoreHistoricData;
			}
			if (updates.isActive !== undefined) {
				input.isActive = updates.isActive;
			}

			return updateMutation.mutateAsync(input);
		},
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
