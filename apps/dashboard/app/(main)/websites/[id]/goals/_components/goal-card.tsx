'use client';

import {
	DotsThreeIcon,
	EyeIcon,
	MouseMiddleClickIcon,
	PencilSimpleIcon,
	TrashIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Goal } from '@/hooks/use-goals';

interface GoalCardProps {
	goal: Goal;
	onEdit: () => void;
	onDelete: () => void;
	conversionRate?: number;
	totalUsers?: number;
	completions?: number;
	isLoading?: boolean;
}

export function GoalCard({
	goal,
	onEdit,
	onDelete,
	conversionRate = 0,
	totalUsers = 0,
	completions = 0,
	isLoading = false,
}: GoalCardProps) {
	const getStepIcon = (type: string) => {
		switch (type) {
			case 'PAGE_VIEW':
				return <EyeIcon className="text-muted-foreground" size={16} />;
			case 'EVENT':
				return (
					<MouseMiddleClickIcon className="text-muted-foreground" size={16} />
				);
			default:
				return <EyeIcon className="text-muted-foreground" size={16} />;
		}
	};

	const formatNumber = (num: number) => {
		if (num >= 1_000_000) {
			return `${(num / 1_000_000).toFixed(1)}M`;
		}
		if (num >= 1000) {
			return `${(num / 1000).toFixed(1)}K`;
		}
		return num.toString();
	};

	return (
		<Card className="group transition-shadow hover:shadow-md">
			<CardContent className="p-6">
				<div className="mb-4 flex items-start justify-between">
					<div className="min-w-0 flex-1">
						<div className="mb-3 flex items-center gap-2">
							<h3 className="truncate font-semibold text-foreground text-lg">
								{goal.name}
							</h3>
							{!goal.isActive && (
								<span className="rounded bg-muted px-2 py-1 font-medium text-muted-foreground text-xs">
									Paused
								</span>
							)}
						</div>

						<div className="flex items-center gap-2 text-muted-foreground text-sm">
							{getStepIcon(goal.type)}
							<span className="truncate">{goal.target || 'No target'}</span>
						</div>
					</div>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
								size="sm"
								variant="ghost"
							>
								<DotsThreeIcon size={16} />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={onEdit}>
								<PencilSimpleIcon className="mr-2" size={16} />
								Edit
							</DropdownMenuItem>
							<DropdownMenuItem
								className="text-destructive focus:text-destructive"
								onClick={onDelete}
							>
								<TrashIcon className="mr-2" size={16} />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				<div className="mb-4">
					<div className="relative h-3 w-full overflow-hidden bg-muted">
						<div
							className="absolute top-0 left-0 h-full"
							style={{
								width: `${conversionRate}%`,
								backgroundImage:
									'repeating-linear-gradient(135deg, var(--color-success) 0 4px, transparent 4px 8px)',
								opacity: 0.18,
								pointerEvents: 'none',
							}}
						/>
						<div
							className="absolute top-0 left-0 h-full bg-primary"
							style={{ width: `${conversionRate}%` }}
						/>
						<div className="-translate-y-1/2 absolute top-1/2 right-2 font-semibold text-foreground text-xs">
							{isLoading ? (
								<span className="inline-block h-3 w-8 animate-pulse rounded bg-muted" />
							) : (
								`${conversionRate.toFixed(1)}%`
							)}
						</div>
					</div>
				</div>

				<div className="grid grid-cols-3 gap-4 border-t pt-4">
					<div>
						<div className="mb-1 text-muted-foreground text-xs">Conversion</div>
						<div className="font-semibold text-foreground text-xl">
							{isLoading ? (
								<div className="h-5 w-10 animate-pulse rounded bg-muted" />
							) : (
								`${conversionRate.toFixed(1)}%`
							)}
						</div>
					</div>

					<div>
						<div className="mb-1 text-muted-foreground text-xs">Users</div>
						<div className="font-medium text-foreground text-lg">
							{isLoading ? (
								<div className="h-4 w-8 animate-pulse rounded bg-muted" />
							) : (
								formatNumber(totalUsers)
							)}
						</div>
					</div>

					<div>
						<div className="mb-1 text-muted-foreground text-xs">
							Completions
						</div>
						<div className="font-medium text-foreground text-lg">
							{isLoading ? (
								<div className="h-4 w-8 animate-pulse rounded bg-muted" />
							) : (
								formatNumber(completions)
							)}
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
