'use client';

import {
	CalendarIcon,
	ChartBarIcon,
	CheckCircleIcon,
	ClockIcon,
	PauseCircleIcon,
	TrendUpIcon,
} from '@phosphor-icons/react';
import { useMemo } from 'react';
import type { RoadmapItem, RoadmapStats } from './roadmap-types';

interface Props {
	items: RoadmapItem[];
	stats: RoadmapStats;
}

export default function RoadmapStatsComponent({ items, stats }: Props) {
	const categoryStats = useMemo(() => {
		const categories = items.reduce(
			(acc, item) => {
				if (!acc[item.category]) {
					acc[item.category] = {
						total: 0,
						completed: 0,
						inProgress: 0,
						planned: 0,
					};
				}
				acc[item.category].total++;
				if (item.status === 'completed') {
					acc[item.category].completed++;
				}
				if (item.status === 'in-progress') {
					acc[item.category].inProgress++;
				}
				if (item.status === 'planned') {
					acc[item.category].planned++;
				}
				return acc;
			},
			{} as Record<
				string,
				{
					total: number;
					completed: number;
					inProgress: number;
					planned: number;
				}
			>
		);

		return Object.entries(categories)
			.map(([category, data]) => ({
				category,
				...data,
				progress:
					data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
			}))
			.sort((a, b) => b.progress - a.progress);
	}, [items]);

	const priorityStats = useMemo(() => {
		const priorities = items.reduce(
			(acc, item) => {
				if (!acc[item.priority]) {
					acc[item.priority] = {
						total: 0,
						completed: 0,
						inProgress: 0,
					};
				}
				acc[item.priority].total++;
				if (item.status === 'completed') {
					acc[item.priority].completed++;
				}
				if (item.status === 'in-progress') {
					acc[item.priority].inProgress++;
				}
				return acc;
			},
			{} as Record<
				string,
				{ total: number; completed: number; inProgress: number }
			>
		);

		return Object.entries(priorities)
			.map(([priority, data]) => ({
				priority,
				...data,
				progress:
					data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
			}))
			.sort((a, b) => {
				const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
				return (
					priorityOrder[a.priority as keyof typeof priorityOrder] -
					priorityOrder[b.priority as keyof typeof priorityOrder]
				);
			});
	}, [items]);

	const upcomingItems = useMemo(() => {
		const now = new Date();
		const thirtyDaysFromNow = new Date(
			now.getTime() + 30 * 24 * 60 * 60 * 1000
		);

		return items
			.filter((item) => {
				if (!item.targetDate) {
					return false;
				}
				const targetDate = new Date(item.targetDate);
				return (
					targetDate <= thirtyDaysFromNow &&
					targetDate >= now &&
					(item.status === 'in-progress' || item.status === 'planned')
				);
			})
			.sort((a, b) => {
				if (!a.targetDate) {
					return 0;
				}
				if (!b.targetDate) {
					return 0;
				}
				return (
					new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime()
				);
			})
			.slice(0, 5);
	}, [items]);

	const formatCategoryName = (category: string) => {
		return category
			.split('-')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	};

	const formatPriorityName = (priority: string) => {
		return priority.charAt(0).toUpperCase() + priority.slice(1);
	};

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
		});
	};

	return (
		<div className="space-y-8">
			{/* Overall Stats Grid */}
			<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
				<div className="group relative rounded border border-border bg-card/50 p-4 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70">
					<div className="mb-2 flex items-center justify-center">
						<div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
							<CheckCircleIcon
								className="h-4 w-4 text-green-600 dark:text-green-400"
								weight="duotone"
							/>
						</div>
					</div>
					<div className="font-bold text-xl">{stats.completedItems}</div>
					<div className="text-muted-foreground text-xs">Completed</div>

					{/* Sci-fi corners */}
					<div className="pointer-events-none absolute inset-0">
						<div className="absolute top-0 left-0 h-1.5 w-1.5 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-1.5 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-x-[1] absolute top-0 right-0 h-1.5 w-1.5 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-1.5 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-y-[1] absolute bottom-0 left-0 h-1.5 w-1.5 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-1.5 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-[1] absolute right-0 bottom-0 h-1.5 w-1.5 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-1.5 w-0.5 origin-top bg-foreground" />
						</div>
					</div>
				</div>

				<div className="group relative rounded border border-border bg-card/50 p-4 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70">
					<div className="mb-2 flex items-center justify-center">
						<div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
							<ClockIcon
								className="h-4 w-4 text-blue-600 dark:text-blue-400"
								weight="duotone"
							/>
						</div>
					</div>
					<div className="font-bold text-xl">{stats.inProgressItems}</div>
					<div className="text-muted-foreground text-xs">In Progress</div>

					{/* Sci-fi corners */}
					<div className="pointer-events-none absolute inset-0">
						<div className="absolute top-0 left-0 h-1.5 w-1.5 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-1.5 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-x-[1] absolute top-0 right-0 h-1.5 w-1.5 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-1.5 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-y-[1] absolute bottom-0 left-0 h-1.5 w-1.5 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-1.5 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-[1] absolute right-0 bottom-0 h-1.5 w-1.5 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-1.5 w-0.5 origin-top bg-foreground" />
						</div>
					</div>
				</div>

				<div className="group relative rounded border border-border bg-card/50 p-4 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70">
					<div className="mb-2 flex items-center justify-center">
						<div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
							<CalendarIcon
								className="h-4 w-4 text-purple-600 dark:text-purple-400"
								weight="duotone"
							/>
						</div>
					</div>
					<div className="font-bold text-xl">{stats.plannedItems}</div>
					<div className="text-muted-foreground text-xs">Planned</div>

					{/* Sci-fi corners */}
					<div className="pointer-events-none absolute inset-0">
						<div className="absolute top-0 left-0 h-1.5 w-1.5 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-1.5 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-x-[1] absolute top-0 right-0 h-1.5 w-1.5 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-1.5 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-y-[1] absolute bottom-0 left-0 h-1.5 w-1.5 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-1.5 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-[1] absolute right-0 bottom-0 h-1.5 w-1.5 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-1.5 w-0.5 origin-top bg-foreground" />
						</div>
					</div>
				</div>

				<div className="group relative rounded border border-border bg-card/50 p-4 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70">
					<div className="mb-2 flex items-center justify-center">
						<div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
							<PauseCircleIcon
								className="h-4 w-4 text-orange-600 dark:text-orange-400"
								weight="duotone"
							/>
						</div>
					</div>
					<div className="font-bold text-xl">{stats.onHoldItems}</div>
					<div className="text-muted-foreground text-xs">On Hold</div>

					{/* Sci-fi corners */}
					<div className="pointer-events-none absolute inset-0">
						<div className="absolute top-0 left-0 h-1.5 w-1.5 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-1.5 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-x-[1] absolute top-0 right-0 h-1.5 w-1.5 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-1.5 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-y-[1] absolute bottom-0 left-0 h-1.5 w-1.5 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-1.5 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-[1] absolute right-0 bottom-0 h-1.5 w-1.5 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-1.5 w-0.5 origin-top bg-foreground" />
						</div>
					</div>
				</div>
			</div>

			{/* Category Breakdown */}
			<div className="group relative rounded border border-border bg-card/50 p-6 backdrop-blur-sm">
				<h3 className="mb-4 flex items-center gap-2 font-semibold text-foreground text-lg">
					<ChartBarIcon className="h-5 w-5" weight="duotone" />
					Progress by Category
				</h3>
				<div className="space-y-4">
					{categoryStats.map((category) => (
						<div key={category.category}>
							<div className="mb-2 flex items-center justify-between">
								<span className="font-medium text-sm">
									{formatCategoryName(category.category)}
								</span>
								<span className="text-muted-foreground text-xs">
									{category.completed}/{category.total} ({category.progress}%)
								</span>
							</div>
							<div className="h-2 w-full rounded-full bg-muted">
								<div
									className="h-2 rounded-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-500"
									style={{ width: `${category.progress}%` }}
								/>
							</div>
						</div>
					))}
				</div>

				{/* Sci-fi corners */}
				<div className="pointer-events-none absolute inset-0">
					<div className="absolute top-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
				</div>
			</div>

			{/* Priority Breakdown */}
			<div className="group relative rounded border border-border bg-card/50 p-6 backdrop-blur-sm">
				<h3 className="mb-4 flex items-center gap-2 font-semibold text-foreground text-lg">
					<TrendUpIcon className="h-5 w-5" weight="duotone" />
					Progress by Priority
				</h3>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{priorityStats.map((priority) => (
						<div className="text-center" key={priority.priority}>
							<div className="mb-2 font-medium text-sm">
								{formatPriorityName(priority.priority)}
							</div>
							<div className="mb-1 font-bold text-2xl">
								{priority.progress}%
							</div>
							<div className="text-muted-foreground text-xs">
								{priority.completed}/{priority.total} completed
							</div>
						</div>
					))}
				</div>

				{/* Sci-fi corners */}
				<div className="pointer-events-none absolute inset-0">
					<div className="absolute top-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
				</div>
			</div>

			{/* Upcoming Items */}
			{upcomingItems.length > 0 && (
				<div className="group relative rounded border border-border bg-card/50 p-6 backdrop-blur-sm">
					<h3 className="mb-4 flex items-center gap-2 font-semibold text-foreground text-lg">
						<CalendarIcon className="h-5 w-5" weight="duotone" />
						Coming Up Next (30 Days)
					</h3>
					<div className="space-y-3">
						{upcomingItems.map((item) => (
							<div className="flex items-center justify-between" key={item.id}>
								<div>
									<div className="font-medium text-sm">{item.title}</div>
									<div className="text-muted-foreground text-xs">
										{formatCategoryName(item.category)}
									</div>
								</div>
								<div className="text-right">
									<div className="font-medium text-sm">
										{item.targetDate ? formatDate(item.targetDate) : 'TBD'}
									</div>
									<div className="text-muted-foreground text-xs capitalize">
										{item.status.replace('-', ' ')}
									</div>
								</div>
							</div>
						))}
					</div>

					{/* Sci-fi corners */}
					<div className="pointer-events-none absolute inset-0">
						<div className="absolute top-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
