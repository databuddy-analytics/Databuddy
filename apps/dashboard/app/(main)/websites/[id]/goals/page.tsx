"use client";

import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { TargetIcon } from "@phosphor-icons/react/dist/ssr/Target";
import { TrendDownIcon } from "@phosphor-icons/react/dist/ssr/TrendDown";
import { useAtomValue } from "jotai";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { FeatureGate } from "@/components/feature-gate";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { useAutocompleteData } from "@/hooks/use-autocomplete";
import { useDateFilters } from "@/hooks/use-date-filters";
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
	const isRefreshing = useAtomValue(isAnalyticsRefreshingAtom);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
	const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);

	const { dateRange } = useDateFilters();

	const {
		data: goals,
		isLoading: goalsLoading,
		error: goalsError,
		createGoal,
		updateGoal,
		deleteGoal,
		isCreating,
		isUpdating,
	} = useGoals(websiteId);

	const goalIds = useMemo(() => goals.map((goal) => goal.id), [goals]);

	const { data: goalAnalytics, isLoading: analyticsLoading } =
		useBulkGoalAnalytics(websiteId, goalIds, dateRange);

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
					currentUsage={goals.length}
					description="Track key conversions and measure success"
					feature={GATED_FEATURES.GOALS}
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
					subtitle={
						goalsLoading
							? undefined
							: `${goals.length} goal${goals.length === 1 ? "" : "s"}`
					}
					title="Goals"
					websiteId={websiteId}
				/>

				<div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
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
				</div>

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
