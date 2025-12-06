"use client";

import { TargetIcon, TrendDownIcon } from "@phosphor-icons/react";
import { useAtom } from "jotai";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { FeatureGate } from "@/components/feature-gate";
import { GATED_FEATURES } from "@/components/providers/billing-provider";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useAutocompleteData } from "@/hooks/use-funnels";
import {
	type CreateGoalData,
	type Goal,
	useBulkGoalAnalytics,
	useGoals,
} from "@/hooks/use-goals";
import { isAnalyticsRefreshingAtom } from "@/stores/jotai/filterAtoms";
import { WebsitePageHeader } from "../_components/website-page-header";
import { EditGoalDialog } from "./_components/edit-goal-dialog";
import { GoalItemSkeleton } from "./_components/goal-item";
import { GoalsList } from "./_components/goals-list";

function GoalsListSkeleton() {
	return (
		<div>
			{[1, 2, 3].map((i) => (
				<GoalItemSkeleton key={i} />
			))}
		</div>
	);
}

export default function GoalsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
	const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);

	const { dateRange } = useDateFilters();

	const {
		data: goals,
		isLoading: goalsLoading,
		error: goalsError,
		refetch: refetchGoals,
		createGoal,
		updateGoal,
		deleteGoal,
		isCreating,
		isUpdating,
	} = useGoals(websiteId);

	const goalIds = useMemo(() => goals.map((goal) => goal.id), [goals]);

	const {
		data: goalAnalytics,
		isLoading: analyticsLoading,
		refetch: refetchAnalytics,
	} = useBulkGoalAnalytics(websiteId, goalIds, dateRange);

	const autocompleteQuery = useAutocompleteData(websiteId);

	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		try {
			await Promise.all([refetchGoals(), autocompleteQuery.refetch()]);
			if (goalIds.length > 0) {
				refetchAnalytics();
			}
		} catch (error) {
			console.error("Failed to refresh goal data:", error);
		} finally {
			setIsRefreshing(false);
		}
	}, [
		refetchGoals,
		refetchAnalytics,
		goalIds.length,
		autocompleteQuery.refetch,
		setIsRefreshing,
	]);

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
			setIsDialogOpen(false);
			setEditingGoal(null);
		} catch (error) {
			console.error("Failed to save goal:", error);
		}
	};

	const handleDeleteGoal = async (goalId: string) => {
		try {
			await deleteGoal(goalId);
			setDeletingGoalId(null);
		} catch (error) {
			console.error("Failed to delete goal:", error);
		}
	};

	if (goalsError) {
		return (
			<div className="p-4">
				<Card className="border-destructive/20 bg-destructive/5">
					<CardContent className="pt-6">
						<div className="flex items-center gap-2">
							<TrendDownIcon
								className="size-5 text-destructive"
								weight="duotone"
							/>
							<p className="font-medium text-destructive">
								Error loading goal data
							</p>
						</div>
						<p className="mt-2 text-destructive/80 text-sm">
							{goalsError.message}
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<FeatureGate feature={GATED_FEATURES.GOALS}>
			<div className="relative flex h-full flex-col">
				<WebsitePageHeader
					createActionLabel="Create Goal"
					description="Track key conversions and measure success"
					hasError={!!goalsError}
					icon={
						<TargetIcon
							className="size-6 text-accent-foreground"
							weight="duotone"
						/>
					}
					isLoading={goalsLoading}
					isRefreshing={isRefreshing}
					onCreateAction={() => {
						setEditingGoal(null);
						setIsDialogOpen(true);
					}}
					onRefreshAction={handleRefresh}
					subtitle={
						goalsLoading
							? undefined
							: `${goals.length} goal${goals.length !== 1 ? "s" : ""}`
					}
					title="Goals"
					websiteId={websiteId}
				/>

				{goalsLoading ? (
					<GoalsListSkeleton />
				) : (
					<GoalsList
						analyticsLoading={analyticsLoading}
						goalAnalytics={goalAnalytics}
						goals={goals}
						isLoading={goalsLoading}
						onCreateGoal={() => {
							setEditingGoal(null);
							setIsDialogOpen(true);
						}}
						onDeleteGoal={(goalId) => setDeletingGoalId(goalId)}
						onEditGoal={(goal) => {
							setEditingGoal(goal);
							setIsDialogOpen(true);
						}}
					/>
				)}

				{isDialogOpen && (
					<EditGoalDialog
						autocompleteData={autocompleteQuery.data}
						goal={editingGoal}
						isOpen={isDialogOpen}
						isSaving={isCreating || isUpdating}
						onClose={() => {
							setIsDialogOpen(false);
							setEditingGoal(null);
						}}
						onSave={handleSaveGoal}
					/>
				)}

				{deletingGoalId && (
					<DeleteDialog
						confirmLabel="Delete Goal"
						description="Are you sure you want to delete this goal? This action cannot be undone and will permanently remove all associated analytics data."
						isOpen={!!deletingGoalId}
						onClose={() => setDeletingGoalId(null)}
						onConfirm={() => deletingGoalId && handleDeleteGoal(deletingGoalId)}
						title="Delete Goal"
					/>
				)}
			</div>
		</FeatureGate>
	);
}
