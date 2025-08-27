'use client';

import {
	ArrowUpRightIcon,
	CalendarIcon,
	CheckCircleIcon,
	ClockIcon,
	GitBranchIcon,
	PauseCircleIcon,
	TagIcon,
	UsersIcon,
	XCircleIcon,
} from '@phosphor-icons/react';
import { useMemo } from 'react';
import { SciFiCard } from '@/components/scifi-card';
import type {
	RoadmapItem,
	RoadmapPriority,
	RoadmapStatus,
} from './roadmap-types';

interface Props {
	items: RoadmapItem[];
}

const getStatusConfig = (status: RoadmapStatus) => {
	switch (status) {
		case 'completed':
			return {
				icon: CheckCircleIcon,
				color: 'text-green-600 dark:text-green-400',
				bgColor: 'bg-green-100 dark:bg-green-900/30',
				borderColor: 'border-green-500',
				label: 'Completed',
				labelColor:
					'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
			};
		case 'in-progress':
			return {
				icon: ClockIcon,
				color: 'text-blue-600 dark:text-blue-400',
				bgColor: 'bg-blue-100 dark:bg-blue-900/30',
				borderColor: 'border-blue-500',
				label: 'In Progress',
				labelColor:
					'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
			};
		case 'planned':
			return {
				icon: CalendarIcon,
				color: 'text-purple-600 dark:text-purple-400',
				bgColor: 'bg-purple-100 dark:bg-purple-900/30',
				borderColor: 'border-purple-500',
				label: 'Planned',
				labelColor:
					'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
			};
		case 'on-hold':
			return {
				icon: PauseCircleIcon,
				color: 'text-orange-600 dark:text-orange-400',
				bgColor: 'bg-orange-100 dark:bg-orange-900/30',
				borderColor: 'border-orange-500',
				label: 'On Hold',
				labelColor:
					'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
			};
		case 'cancelled':
			return {
				icon: XCircleIcon,
				color: 'text-red-600 dark:text-red-400',
				bgColor: 'bg-red-100 dark:bg-red-900/30',
				borderColor: 'border-red-500',
				label: 'Cancelled',
				labelColor:
					'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
			};
		default:
			return {
				icon: CalendarIcon,
				color: 'text-gray-600 dark:text-gray-400',
				bgColor: 'bg-gray-100 dark:bg-gray-900/30',
				borderColor: 'border-gray-500',
				label: 'Unknown',
				labelColor:
					'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300',
			};
	}
};

const getPriorityConfig = (priority: RoadmapPriority) => {
	switch (priority) {
		case 'critical':
			return {
				label: 'Critical',
				color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
			};
		case 'high':
			return {
				label: 'High',
				color:
					'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
			};
		case 'medium':
			return {
				label: 'Medium',
				color:
					'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
			};
		case 'low':
			return {
				label: 'Low',
				color:
					'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300',
			};
		default:
			return {
				label: 'Unknown',
				color:
					'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300',
			};
	}
};

const formatDate = (dateString: string) => {
	return new Date(dateString).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
};

const getTimeSince = (dateString: string) => {
	const date = new Date(dateString);
	const now = new Date();
	const diffTime = Math.abs(now.getTime() - date.getTime());
	const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

	if (diffDays === 0) {
		return 'Today';
	}
	if (diffDays === 1) {
		return '1 day ago';
	}
	if (diffDays < 30) {
		return `${diffDays} days ago`;
	}
	if (diffDays < 365) {
		const months = Math.floor(diffDays / 30);
		return months === 1 ? '1 month ago' : `${months} months ago`;
	}
	const years = Math.floor(diffDays / 365);
	return years === 1 ? '1 year ago' : `${years} years ago`;
};

const getTimeUntil = (dateString: string) => {
	const date = new Date(dateString);
	const now = new Date();
	const diffTime = date.getTime() - now.getTime();
	const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

	if (diffDays < 0) {
		return getTimeSince(dateString);
	}
	if (diffDays === 0) {
		return 'Today';
	}
	if (diffDays === 1) {
		return 'Tomorrow';
	}
	if (diffDays < 30) {
		return `in ${diffDays} days`;
	}
	if (diffDays < 365) {
		const months = Math.ceil(diffDays / 30);
		return months === 1 ? 'in 1 month' : `in ${months} months`;
	}
	const years = Math.ceil(diffDays / 365);
	return years === 1 ? 'in 1 year' : `in ${years} years`;
};

export default function RoadmapTimeline({ items }: Props) {
	const sortedItems = useMemo(() => {
		return [...items].sort((a, b) => {
			// Sort by status priority first (completed, in-progress, planned, on-hold, cancelled)
			const statusOrder = {
				completed: 0,
				'in-progress': 1,
				planned: 2,
				'on-hold': 3,
				cancelled: 4,
			};
			const statusDiff = statusOrder[a.status] - statusOrder[b.status];
			if (statusDiff !== 0) {
				return statusDiff;
			}

			// Then by target date (earliest first)
			if (a.targetDate && b.targetDate) {
				return (
					new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime()
				);
			}
			if (a.targetDate) {
				return -1;
			}
			if (b.targetDate) {
				return 1;
			}

			// Finally by priority
			const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
			return priorityOrder[a.priority] - priorityOrder[b.priority];
		});
	}, [items]);

	if (!sortedItems.length) {
		return (
			<SciFiCard className="rounded border border-border bg-card/50 p-8 backdrop-blur-sm">
				<div className="py-8 text-center text-muted-foreground">
					No roadmap items available
				</div>
			</SciFiCard>
		);
	}

	return (
		<SciFiCard className="rounded border border-border bg-card/50 p-6 backdrop-blur-sm">
			<div className="space-y-8">
				{sortedItems.map((item, index) => {
					const statusConfig = getStatusConfig(item.status);
					const priorityConfig = getPriorityConfig(item.priority);
					const StatusIcon = statusConfig.icon;

					return (
						<div className="relative" key={item.id}>
							{/* Timeline line */}
							{index < sortedItems.length - 1 && (
								<div className="absolute top-12 left-6 h-full w-px bg-border" />
							)}

							<div className="flex gap-6">
								{/* Timeline dot */}
								<div
									className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 ${statusConfig.borderColor} ${statusConfig.bgColor}`}
								>
									<StatusIcon
										className={`h-6 w-6 ${statusConfig.color}`}
										weight="duotone"
									/>
								</div>

								{/* Content */}
								<div className="min-w-0 flex-1 pb-4">
									{/* Header */}
									<div className="mb-3">
										<div className="mb-2 flex flex-wrap items-start justify-between gap-2">
											<h3 className="font-semibold text-foreground text-lg">
												{item.title}
											</h3>
											<div className="flex flex-wrap gap-2">
												<span
													className={`rounded px-2 py-1 font-medium text-xs ${statusConfig.labelColor}`}
												>
													{statusConfig.label}
												</span>
												<span
													className={`rounded px-2 py-1 font-medium text-xs ${priorityConfig.color}`}
												>
													{priorityConfig.label}
												</span>
											</div>
										</div>
										<p className="text-muted-foreground text-sm leading-relaxed">
											{item.description}
										</p>
									</div>

									{/* Progress Bar (for in-progress items) */}
									{item.status === 'in-progress' &&
										item.progress !== undefined && (
											<div className="mb-4">
												<div className="mb-1 flex justify-between text-xs">
													<span className="font-medium">Progress</span>
													<span className="font-bold">{item.progress}%</span>
												</div>
												<div className="h-2 w-full rounded-full bg-muted">
													<div
														className="h-2 rounded-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-500"
														style={{ width: `${item.progress}%` }}
													/>
												</div>
											</div>
										)}

									{/* Features List */}
									{item.features && item.features.length > 0 && (
										<div className="mb-4">
											<h4 className="mb-2 font-medium text-foreground text-sm">
												Key Features:
											</h4>
											<ul className="grid grid-cols-1 gap-1 text-muted-foreground text-sm sm:grid-cols-2">
												{item.features.map((feature) => (
													<li className="flex items-center gap-2" key={feature}>
														<div className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
														{feature}
													</li>
												))}
											</ul>
										</div>
									)}

									{/* Metadata */}
									<div className="flex flex-wrap items-center gap-4 text-muted-foreground text-xs">
										{/* Dates */}
										{item.completedDate && (
											<div className="flex items-center gap-1">
												<CheckCircleIcon className="h-3 w-3" />
												<span>Completed {formatDate(item.completedDate)}</span>
											</div>
										)}
										{item.targetDate && !item.completedDate && (
											<div className="flex items-center gap-1">
												<CalendarIcon className="h-3 w-3" />
												<span>
													Due {formatDate(item.targetDate)} (
													{getTimeUntil(item.targetDate)})
												</span>
											</div>
										)}

										{/* Category */}
										<div className="flex items-center gap-1">
											<TagIcon className="h-3 w-3" />
											<span className="capitalize">
												{item.category.replace('-', ' ')}
											</span>
										</div>

										{/* Assignees */}
										{item.assignees && item.assignees.length > 0 && (
											<div className="flex items-center gap-1">
												<UsersIcon className="h-3 w-3" />
												<span>{item.assignees.join(', ')}</span>
											</div>
										)}
									</div>

									{/* Links */}
									{(item.githubIssue || item.githubPR) && (
										<div className="mt-3 flex flex-wrap gap-3">
											{item.githubIssue && (
												<a
													className="inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
													href={item.githubIssue}
													rel="noopener"
													target="_blank"
												>
													<GitBranchIcon className="h-3 w-3" />
													Issue
													<ArrowUpRightIcon className="h-3 w-3" />
												</a>
											)}
											{item.githubPR && (
												<a
													className="inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
													href={item.githubPR}
													rel="noopener"
													target="_blank"
												>
													<GitBranchIcon className="h-3 w-3" />
													Pull Request
													<ArrowUpRightIcon className="h-3 w-3" />
												</a>
											)}
										</div>
									)}

									{/* Tags */}
									{item.tags && item.tags.length > 0 && (
										<div className="mt-3 flex flex-wrap gap-1">
											{item.tags.map((tag) => (
												<span
													className="rounded bg-muted px-2 py-1 text-muted-foreground text-xs"
													key={tag}
												>
													#{tag}
												</span>
											))}
										</div>
									)}
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</SciFiCard>
	);
}
