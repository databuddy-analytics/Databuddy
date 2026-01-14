"use client";

import { TargetIcon } from "@phosphor-icons/react";
import { EmptyState } from "@/components/empty-state";
import type { Goal } from "@/hooks/use-goals";
import { GoalItem } from "./goal-item";

interface GoalsListProps {
	goals: Goal[];
	isLoading: boolean;
	onEditGoal: (goal: Goal) => void;
	onDeleteGoal: (goalId: string) => void;
	onCreateGoal: () => void;
	goalAnalytics?: Record<
		string,
		| {
				total_users_entered: number;
				total_users_completed: number;
				overall_conversion_rate: number;
		  }
		| { error: string }
	>;
	analyticsLoading?: boolean;
}

export function GoalsList({
	goals,
	isLoading,
	onEditGoal,
	onDeleteGoal,
	onCreateGoal,
	goalAnalytics = {},
	analyticsLoading = false,
}: GoalsListProps) {
	if (isLoading) {
		return null;
	}

	if (goals.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center py-16">
				<EmptyState
					action={{
						label: "Create Your First Goal",
						onClick: onCreateGoal,
					}}
					description="Track conversions like sign-ups, purchases, or button clicks to measure key user actions and optimize your conversion rates."
					icon={<TargetIcon weight="duotone" />}
					title="No goals yet"
					variant="minimal"
				/>
			</div>
		);
	}

	return (
		<div>
			{goals.map((goal) => {
				const analytics = goalAnalytics[goal.id];
				const validAnalytics =
					analytics && !("error" in analytics) ? analytics : null;

				return (
					<GoalItem
						analytics={validAnalytics}
						goal={goal}
						isLoadingAnalytics={analyticsLoading}
						key={goal.id}
						onDelete={onDeleteGoal}
						onEdit={onEditGoal}
					/>
				);
			})}
		</div>
	);
}
