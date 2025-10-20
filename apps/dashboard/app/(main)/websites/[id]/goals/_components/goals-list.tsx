'use client';

import { TargetIcon } from '@phosphor-icons/react';
import { EmptyState } from '@/components/empty-state';
import type { Goal } from '@/hooks/use-goals';
import { GoalCard } from './goal-card';

interface GoalsListProps {
	goals: Goal[];
	isLoading: boolean;
	onEditGoal: (goal: Goal) => void;
	onDeleteGoal: (goalId: string) => void;
	onCreateGoal: () => void;
	goalAnalytics?: Record<string, any>;
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
		return null; // Skeleton is handled by parent
	}

	if (goals.length === 0) {
		return (
			<EmptyState
				action={{
					label: 'Create Your First Goal',
					onClick: onCreateGoal,
				}}
				description="Track conversions like sign-ups, purchases, or button clicks to measure key user actions and optimize your conversion rates."
				icon={
					<TargetIcon
						className="h-16 w-16 text-primary"
						size={16}
						weight="duotone"
					/>
				}
				title="No goals yet"
				variant="default"
			/>
		);
	}

	return (
		<div className="space-y-3">
			{goals.map((goal) => {
				const analytics = goalAnalytics[goal.id];

				return (
					<GoalCard
						completions={analytics?.total_users_completed || 0}
						conversionRate={analytics?.overall_conversion_rate || 0}
						goal={goal}
						isLoading={analyticsLoading}
						key={goal.id}
						onDelete={() => onDeleteGoal(goal.id)}
						onEdit={() => onEditGoal(goal)}
						totalUsers={analytics?.total_users_entered || 0}
					/>
				);
			})}
		</div>
	);
}
