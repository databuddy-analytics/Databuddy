"use client";

import { authClient } from "@databuddy/auth/client";
import { Button } from "@databuddy/ui";
import { DeleteDialog } from "@databuddy/ui/client";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAutocompleteData } from "@/hooks/use-autocomplete";
import {
	type CreateGoalData,
	type Goal,
	type UpdateGoalData,
	useGoal,
	useGoalActions,
} from "@/hooks/use-goals";
import type { NativeRecommendationIntent } from "./recommendation-guards";

const EditGoalDialog = dynamic(
	() =>
		import(
			"@/app/(main)/websites/[id]/goals/_components/edit-goal-dialog"
		).then((module) => module.EditGoalDialog),
	{ ssr: false }
);

type GoalRecommendationIntent = Extract<
	NativeRecommendationIntent,
	{ type: "goal.delete" | "goal.update" }
>;

export function GoalRecommendationAction({
	action,
	goalLabel,
	recommendationId,
	websiteId,
}: {
	action: GoalRecommendationIntent;
	goalLabel: string;
	recommendationId: string;
	websiteId: string;
}) {
	const deleting = action.type === "goal.delete";
	const memberRole = authClient.useActiveMemberRole();
	const accessReason = memberRole.isPending
		? "Checking access…"
		: memberRole.data?.role === "viewer"
			? "You have view-only access to this website."
			: memberRole.data
				? null
				: "You need edit access to change this goal.";
	const label = deleting ? "Delete goal" : "Review goal changes";

	if (accessReason) {
		return (
			<div className="space-y-1.5 sm:max-w-48">
				<Button
					disabled
					size="sm"
					tone={deleting ? "destructive" : "neutral"}
					type="button"
					variant={deleting ? "ghost" : "primary"}
				>
					{label}
				</Button>
				<p className="text-muted-foreground text-xs sm:text-right">
					{accessReason}
				</p>
			</div>
		);
	}

	if (action.type === "goal.update") {
		return (
			<ReviewGoalChangesAction
				action={action}
				recommendationId={recommendationId}
				websiteId={websiteId}
			/>
		);
	}

	return (
		<DeleteGoalAction
			action={action}
			goalLabel={goalLabel}
			recommendationId={recommendationId}
			websiteId={websiteId}
		/>
	);
}

function DeleteGoalAction({
	action,
	goalLabel,
	recommendationId,
	websiteId,
}: {
	action: Extract<GoalRecommendationIntent, { type: "goal.delete" }>;
	goalLabel: string;
	recommendationId: string;
	websiteId: string;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const { deleteGoal, isDeleting } = useGoalActions(websiteId);

	return (
		<>
			<Button
				onClick={() => setIsOpen(true)}
				size="sm"
				tone="destructive"
				type="button"
				variant="ghost"
			>
				Delete goal
			</Button>
			<DeleteDialog
				confirmLabel="Delete Goal"
				description={`Delete ${goalLabel}? Historical events remain in your analytics, but the goal will no longer be available for reporting.`}
				isDeleting={isDeleting}
				isOpen={isOpen}
				onClose={() => setIsOpen(false)}
				onConfirm={async () => {
					await deleteGoal(action.goalId, recommendationId);
					setIsOpen(false);
				}}
				title="Delete Goal"
			/>
		</>
	);
}

function ReviewGoalChangesAction({
	action,
	recommendationId,
	websiteId,
}: {
	action: Extract<GoalRecommendationIntent, { type: "goal.update" }>;
	recommendationId: string;
	websiteId: string;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [reviewGoal, setReviewGoal] = useState<Goal | null>(null);
	const goalQuery = useGoal(action.goalId, false);
	const autocomplete = useAutocompleteData(websiteId, isOpen);
	const { updateGoal, isUpdating } = useGoalActions(websiteId);
	const proposedGoal = useMemo<Goal | null>(() => {
		if (!reviewGoal) {
			return null;
		}
		return {
			...reviewGoal,
			description: action.changes.description ?? reviewGoal.description,
			filters: reviewGoal.filters ?? [],
			name: action.changes.name ?? reviewGoal.name,
			type: reviewGoal.type as Goal["type"],
		};
	}, [action.changes, reviewGoal]);

	const handleSave = async (data: Goal | Omit<CreateGoalData, "websiteId">) => {
		if (!("id" in data && data.id && reviewGoal)) {
			return;
		}
		const updates: UpdateGoalData = {};
		if (data.name !== reviewGoal.name) {
			updates.name = data.name;
		}
		const nextDescription = data.description || null;
		if (nextDescription !== reviewGoal.description) {
			updates.description = nextDescription;
		}
		if (data.target !== reviewGoal.target) {
			updates.target = data.target;
		}
		if (data.type !== reviewGoal.type) {
			updates.type = data.type as Goal["type"];
		}
		if (
			JSON.stringify(data.filters ?? []) !==
			JSON.stringify(reviewGoal.filters ?? [])
		) {
			updates.filters = data.filters ?? [];
		}
		if (data.ignoreHistoricData !== reviewGoal.ignoreHistoricData) {
			updates.ignoreHistoricData = data.ignoreHistoricData;
		}
		try {
			await updateGoal({
				goalId: data.id,
				recommendationId,
				updates,
			});
			setIsOpen(false);
			setReviewGoal(null);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not save goal changes"
			);
		}
	};

	return (
		<>
			<Button
				disabled={isRefreshing}
				loading={isRefreshing}
				onClick={() => {
					setReviewGoal(null);
					setIsRefreshing(true);
					setIsOpen(true);
					goalQuery
						.refetch()
						.then((result) => {
							if (result.isSuccess && result.data) {
								setReviewGoal({
									...result.data,
									filters: result.data.filters ?? [],
									type: result.data.type as Goal["type"],
								});
							}
						})
						.catch(() => undefined)
						.finally(() => setIsRefreshing(false));
				}}
				size="sm"
				type="button"
			>
				Review goal changes
			</Button>
			{isOpen && proposedGoal ? (
				<EditGoalDialog
					autocompleteData={autocomplete.data}
					goal={proposedGoal}
					isOpen
					isSaving={isUpdating}
					onClose={() => {
						setIsOpen(false);
						setReviewGoal(null);
					}}
					onSave={handleSave}
				/>
			) : null}
			{isOpen && !isRefreshing && goalQuery.isError ? (
				<p className="mt-1.5 text-muted-foreground text-xs" role="status">
					Couldn&apos;t load this goal. Try again.
				</p>
			) : null}
		</>
	);
}
