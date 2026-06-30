"use client";

import { List } from "@/components/ui/composables/list";
import type { Goal, GoalAnalyticsRecord } from "@/hooks/use-goals";
import { GoalItem } from "./goal-item";

interface GoalsListProps {
	analyticsLoading?: boolean;
	goalAnalytics?: GoalAnalyticsRecord;
	goals: Goal[];
	onDeleteGoal: (goalId: string) => void;
	onEditGoal: (goal: Goal) => void;
	readOnly?: boolean;
}

const EMPTY_GOAL_ANALYTICS: GoalAnalyticsRecord = {};

export function GoalsList({
	goals,
	onEditGoal,
	onDeleteGoal,
	goalAnalytics = EMPTY_GOAL_ANALYTICS,
	analyticsLoading = false,
	readOnly = false,
}: GoalsListProps) {
	return (
		<List className="rounded bg-card">
			{goals.map((goal) => {
				const analytics = goalAnalytics[goal.id];

				return (
					<GoalItem
						analytics={analytics}
						goal={goal}
						isLoadingAnalytics={analyticsLoading}
						key={goal.id}
						onDelete={onDeleteGoal}
						onEdit={onEditGoal}
						readOnly={readOnly}
					/>
				);
			})}
		</List>
	);
}
