import type { InferInsertModel, InferSelectModel } from "@databuddy/db";
import type { goals } from "@databuddy/db/schema";
import type { DateRange } from "@/types/analytics";
import type { GoalFilter } from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { listQueryOutcome } from "@/lib/list-query-outcome";
import { orpc } from "@/lib/orpc";

export type Goal = InferSelectModel<typeof goals>;
export type CreateGoalData = InferInsertModel<typeof goals>;
export type UpdateGoalData = Partial<InferInsertModel<typeof goals>>;

export interface GoalAnalyticsData {
	avg_completion_time: number;
	avg_completion_time_formatted: string;
	biggest_dropoff_rate: number;
	biggest_dropoff_step: number;
	error_insights: {
		total_errors: number;
		sessions_with_errors: number;
		dropoffs_with_errors: number;
		error_correlation_rate: number;
	};
	overall_conversion_rate: number;
	steps_analytics: {
		avg_time_to_complete: number;
		conversion_rate: number;
		dropoff_rate: number;
		dropoffs: number;
		error_count: number;
		error_rate: number;
		step_name: string;
		step_number: number;
		top_errors: {
			count: number;
			error_type: string;
			message: string;
		}[];
		total_users: number;
		users: number;
	}[];
	time_series?: {
		avg_time: number;
		conversion_rate: number;
		conversions: number;
		date: string;
		dropoffs: number;
		users: number;
	}[];
	total_users_completed: number;
	total_users_entered: number;
}

export type GoalAnalyticsResult =
	| { ok: true; data: GoalAnalyticsData }
	| { ok: false; error: string };

export type GoalAnalyticsRecord = Record<string, GoalAnalyticsResult>;

// RPC input types matching the API schema exactly
interface CreateGoalInput {
	description?: string | null;
	filters?: GoalFilter[];
	ignoreHistoricData?: boolean;
	name: string;
	target: string;
	type: "PAGE_VIEW" | "EVENT" | "CUSTOM";
	websiteId: string;
}

interface UpdateGoalInput {
	description?: string | null;
	filters?: GoalFilter[];
	id: string;
	ignoreHistoricData?: boolean;
	isActive?: boolean;
	name?: string;
	target?: string;
	type?: "PAGE_VIEW" | "EVENT" | "CUSTOM";
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

	const listOutcome = useMemo(
		() =>
			listQueryOutcome({
				data: goalsData,
				isError: query.isError,
				isPending: query.isPending,
				isSuccess: query.isSuccess,
			}),
		[goalsData, query.isError, query.isPending, query.isSuccess]
	);

	const invalidateAll = () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: orpc.goals.list.key({ input: { websiteId } }),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.goals.getById.key(),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.goals.getAnalytics.key(),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.goals.bulkAnalytics.key(),
			}),
		]);

	const createMutation = useMutation({
		...orpc.goals.create.mutationOptions(),
		onSuccess: () => {
			invalidateAll();
			toast.success("Goal created successfully");
		},
	});

	const updateMutation = useMutation({
		...orpc.goals.update.mutationOptions(),
		onSuccess: () => {
			invalidateAll();
			toast.success("Goal updated successfully");
		},
	});

	const deleteMutation = useMutation({
		...orpc.goals.delete.mutationOptions(),
		onSuccess: () => {
			invalidateAll();
			toast.success("Goal deleted successfully");
		},
	});

	return {
		data: goalsData,
		listOutcome,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
		error: query.error,
		refetch: query.refetch,
		refreshAction: invalidateAll,
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

export function useGoal(goalId: string, enabled = true) {
	return useQuery({
		...orpc.goals.getById.queryOptions({ input: { id: goalId } }),
		enabled: enabled && !!goalId,
	});
}

export function useGoalAnalytics(
	websiteId: string,
	goalId: string,
	dateRange: { start_date: string; end_date: string },
	filters: GoalFilter[] = [],
	options: { enabled: boolean } = { enabled: true }
) {
	return useQuery({
		...orpc.goals.getAnalytics.queryOptions({
			input: {
				goalId,
				websiteId,
				startDate: dateRange?.start_date,
				endDate: dateRange?.end_date,
				filters,
			},
		}),
		enabled: options.enabled && !!websiteId && !!goalId,
	});
}

export function useBulkGoalAnalytics(
	websiteId: string,
	goalIds: string[],
	dateRange: DateRange,
	filters: GoalFilter[] = [],
	options: { enabled: boolean } = { enabled: true }
) {
	return useQuery({
		...orpc.goals.bulkAnalytics.queryOptions({
			input: {
				websiteId,
				goalIds,
				startDate: dateRange?.start_date,
				endDate: dateRange?.end_date,
				filters,
			},
		}),
		enabled: options.enabled && !!websiteId && goalIds.length > 0,
	});
}
