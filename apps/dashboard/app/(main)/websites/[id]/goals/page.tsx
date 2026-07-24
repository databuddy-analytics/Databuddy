"use client";

import { insightGoalEditChangesSchema } from "@databuddy/shared/insights";
import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { Button } from "@databuddy/ui";
import { DeleteDialog } from "@databuddy/ui/client";
import { ArrowClockwiseIcon, PlusIcon, TargetIcon } from "@databuddy/ui/icons";
import { useAtomValue } from "jotai";
import {
	useParams,
	usePathname,
	useRouter,
	useSearchParams,
} from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FeatureGate } from "@/components/feature-gate";
import { List } from "@/components/ui/composables/list";
import { useAutocompleteData } from "@/hooks/use-autocomplete";
import { useDateFilters } from "@/hooks/use-date-filters";
import {
	type CreateGoalData,
	type Goal,
	useBulkGoalAnalytics,
	useGoals,
} from "@/hooks/use-goals";
import { TopBar } from "@/components/layout/top-bar";
import { dynamicQueryFiltersAtom } from "@/stores/jotai/filterAtoms";
import type { DynamicQueryFilter, GoalFilter } from "@/types/api";
import { EditGoalDialog } from "./_components/edit-goal-dialog";
import { GoalItemSkeleton } from "./_components/goal-item";
import { GoalsList } from "./_components/goals-list";
import { cn } from "@/lib/utils";

function GoalsListSkeleton() {
	return (
		<List className="rounded bg-card">
			{[1, 2, 3].map((i) => (
				<GoalItemSkeleton key={i} />
			))}
		</List>
	);
}

const filterOperatorMap = {
	contains: "contains",
	eq: "equals",
	in: "in",
	ne: "not_equals",
	not_contains: "not_contains",
	not_in: "not_in",
	starts_with: "starts_with",
} satisfies Record<DynamicQueryFilter["operator"], GoalFilter["operator"]>;

function toGoalFilters(filters: DynamicQueryFilter[]): GoalFilter[] {
	return filters.map((filter) => ({
		field: filter.field,
		operator: filterOperatorMap[filter.operator],
		value: Array.isArray(filter.value)
			? filter.value.map(String)
			: String(filter.value),
	}));
}

export default function GoalsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const pathname = usePathname();
	const router = useRouter();
	const searchParams = useSearchParams();
	const isDemoRoute = pathname.startsWith("/demo/");
	const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);
	const [editingGoal, setEditingGoal] = useState<Goal | null>();

	const { dateRange } = useDateFilters();
	const globalFilters = useAtomValue(dynamicQueryFiltersAtom);
	const goalFilters = useMemo(
		() => toGoalFilters(globalFilters),
		[globalFilters]
	);

	const {
		data: goals,
		listOutcome,
		isFetching,
		error,
		refreshAction,
		createGoal,
		updateGoal,
		deleteGoal,
		isCreating,
		isUpdating,
	} = useGoals(websiteId);

	useEffect(() => {
		const command = searchParams.get("command");
		const goalId = searchParams.get("goalId");
		if (isDemoRoute) {
			return;
		}

		if (
			!goalId ||
			(command !== "edit-goal" && command !== "delete-goal") ||
			isFetching ||
			listOutcome.status === "loading" ||
			listOutcome.status === "error"
		) {
			return;
		}

		const goal = goals.find((candidate) => candidate.id === goalId);
		if (!goal) {
			toast.error("This goal no longer exists");
		} else if (command === "edit-goal") {
			const proposal = insightGoalEditChangesSchema.safeParse({
				description: searchParams.get("description"),
				name: searchParams.get("name"),
			});
			if (proposal.success) {
				const proposedGoal = {
					...goal,
					description: proposal.data.description ?? goal.description,
					name: proposal.data.name ?? goal.name,
				};
				if (
					proposedGoal.description === goal.description &&
					proposedGoal.name === goal.name
				) {
					toast.success("This goal already matches the recommendation");
				} else {
					setEditingGoal(proposedGoal);
				}
			} else {
				toast.error("Databuddy's suggested changes could not be loaded");
			}
		} else {
			setDeletingGoalId(goal.id);
		}

		const params = new URLSearchParams(searchParams.toString());
		params.delete("command");
		params.delete("description");
		params.delete("goalId");
		params.delete("name");
		const query = params.toString();
		router.replace(query ? `${pathname}?${query}` : pathname, {
			scroll: false,
		});
	}, [
		goals,
		isDemoRoute,
		isFetching,
		listOutcome.status,
		pathname,
		router,
		searchParams,
	]);

	const goalIds = useMemo(() => goals.map((goal) => goal.id), [goals]);

	const { data: goalAnalytics, isLoading: analyticsLoading } =
		useBulkGoalAnalytics(websiteId, goalIds, dateRange, goalFilters, {
			enabled: goalIds.length > 0,
		});

	const autocompleteQuery = useAutocompleteData(websiteId);

	const handleSaveGoal = async (
		data: Goal | Omit<CreateGoalData, "websiteId">
	) => {
		try {
			if ("id" in data && data.id) {
				await updateGoal({
					goalId: data.id,
					updates: {
						name: data.name,
						description: data.description || undefined,
						type: data.type,
						target: data.target,
						filters: data.filters,
						ignoreHistoricData:
							"ignoreHistoricData" in data
								? data.ignoreHistoricData
								: undefined,
					},
				});
			} else {
				await createGoal({
					name: data.name,
					description: data.description || undefined,
					type: data.type,
					target: data.target,
					filters: data.filters,
					ignoreHistoricData:
						"ignoreHistoricData" in data ? data.ignoreHistoricData : undefined,
					websiteId,
				} as CreateGoalData);
			}
			setEditingGoal(undefined);
		} catch (error) {
			console.error("Failed to save goal:", error);
			toast.error(
				error instanceof Error ? error.message : "Could not save goal"
			);
		}
	};

	const handleDeleteGoal = async (goalId: string) => {
		try {
			await deleteGoal(goalId);
			setDeletingGoalId(null);
		} catch (error) {
			console.error("Failed to delete goal:", error);
			toast.error(
				error instanceof Error ? error.message : "Could not delete goal"
			);
		}
	};

	const deletingGoal = goals.find((goal) => goal.id === deletingGoalId) ?? null;

	return (
		<FeatureGate feature={GATED_FEATURES.GOALS}>
			<div className="relative flex h-full flex-col">
				<TopBar.Title>
					<h1 className="font-semibold text-sm">Goals</h1>
				</TopBar.Title>
				<TopBar.Actions>
					<Button
						aria-label="Refresh"
						disabled={isFetching}
						onClick={refreshAction}
						size="sm"
						variant="secondary"
					>
						<ArrowClockwiseIcon
							className={cn("size-4 shrink-0", isFetching && "animate-spin")}
						/>
					</Button>
					{!isDemoRoute && (
						<Button onClick={() => setEditingGoal(null)} size="sm">
							<PlusIcon className="size-4 shrink-0" />
							Create Goal
						</Button>
					)}
				</TopBar.Actions>

				<div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
					<List.Content
						emptyProps={{
							action: isDemoRoute
								? undefined
								: {
										label: "Create a goal",
										onClick: () => setEditingGoal(null),
									},
							description:
								"Track single-step conversions like signups, purchases, or activation events.",
							icon: <TargetIcon className="size-6" weight="duotone" />,
							title: "No goals yet",
						}}
						errorProps={{
							action: { label: "Retry", onClick: () => refreshAction() },
							description:
								error?.message ??
								"Something went wrong while loading goal data.",
							icon: <TargetIcon className="size-6" weight="duotone" />,
							title: "Failed to load goals",
						}}
						loading={<GoalsListSkeleton />}
						outcome={listOutcome}
					>
						{(items) => (
							<GoalsList
								analyticsLoading={analyticsLoading}
								goalAnalytics={goalAnalytics}
								goals={items}
								onDeleteGoal={(goalId) => setDeletingGoalId(goalId)}
								onEditGoal={setEditingGoal}
								readOnly={isDemoRoute}
							/>
						)}
					</List.Content>
				</div>

				{!isDemoRoute && editingGoal !== undefined && (
					<EditGoalDialog
						autocompleteData={autocompleteQuery.data}
						goal={editingGoal}
						isOpen
						isSaving={isCreating || isUpdating}
						onClose={() => setEditingGoal(undefined)}
						onSave={handleSaveGoal}
					/>
				)}

				{!isDemoRoute && deletingGoalId && (
					<DeleteDialog
						confirmLabel="Delete Goal"
						description={`Delete ${deletingGoal?.name ?? "this goal"}? Historical events remain in your analytics, but the goal will no longer be available for reporting.`}
						isOpen={!!deletingGoalId}
						onClose={() => setDeletingGoalId(null)}
						onConfirm={() => {
							if (deletingGoalId) {
								return handleDeleteGoal(deletingGoalId);
							}
						}}
						title={`Delete ${deletingGoal?.name ?? "goal"}`}
					/>
				)}
			</div>
		</FeatureGate>
	);
}
