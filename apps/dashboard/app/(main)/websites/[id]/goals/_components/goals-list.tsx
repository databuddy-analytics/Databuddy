"use client";

import { TargetIcon } from "@phosphor-icons/react/dist/ssr/Target";
import { EmptyState } from "@/components/empty-state";
import { List } from "@/components/ui/composables/list";
import type { Goal } from "@/hooks/use-goals";
import { GoalItem } from "./goal-item";

type GoalAnalyticsRecord = Record<
	string,
	| {
			total_users_entered: number;
			total_users_completed: number;
			overall_conversion_rate: number;
	  }
	| { error: string }
>;

interface GoalsListProps {
	analyticsLoading?: boolean;
	goalAnalytics?: GoalAnalyticsRecord;
	goals: Goal[];
	isLoading: boolean;
	onCreateGoal: () => void;
	onDeleteGoal: (goalId: string) => void;
	onEditGoal: (goal: Goal) => void;
}

const EMPTY_GOAL_ANALYTICS: GoalAnalyticsRecord = {};

export function GoalsList({
	goals,
	isLoading,
	onEditGoal,
	onDeleteGoal,
	onCreateGoal,
	goalAnalytics = EMPTY_GOAL_ANALYTICS,
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
		<List className="rounded bg-card">
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
		</List>
	);
}
