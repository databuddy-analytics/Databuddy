'use client';

import {
	CalendarIcon,
	ChartLineIcon,
	CodeIcon,
	DotsThreeIcon,
	Eye,
	FlaskIcon,
	LinkIcon,
	PencilIcon,
	PlayIcon,
	StopIcon,
	TrashIcon,
	UsersIcon,
} from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Experiment } from '@/hooks/use-experiments';

interface ExperimentCardProps {
	experiment: Experiment;
	onEdit: (experiment: Experiment) => void;
	onDelete: (experimentId: string) => void;
	onToggleStatus?: (
		experimentId: string,
		newStatus: 'running' | 'paused'
	) => void;
}

const statusConfig = {
	draft: {
		label: 'Draft',
		variant: 'secondary' as const,
		color: 'text-muted-foreground',
		bgColor: 'bg-muted/50',
	},
	running: {
		label: 'Running',
		variant: 'default' as const,
		color: 'text-green-600',
		bgColor: 'bg-green-50 dark:bg-green-950',
	},
	paused: {
		label: 'Paused',
		variant: 'outline' as const,
		color: 'text-orange-600',
		bgColor: 'bg-orange-50 dark:bg-orange-950',
	},
	completed: {
		label: 'Completed',
		variant: 'secondary' as const,
		color: 'text-blue-600',
		bgColor: 'bg-blue-50 dark:bg-blue-950',
	},
};

const getVariantIcon = (type: string, size = 14) => {
	switch (type) {
		case 'visual':
			return <Eye className="text-blue-600" size={size} weight="duotone" />;
		case 'redirect':
			return (
				<LinkIcon className="text-green-600" size={size} weight="duotone" />
			);
		case 'code':
			return (
				<CodeIcon className="text-purple-600" size={size} weight="duotone" />
			);
		default:
			return (
				<FlaskIcon
					className="text-muted-foreground"
					size={size}
					weight="duotone"
				/>
			);
	}
};

export const ExperimentCard = memo(function ExperimentCardComponent({
	experiment,
	onEdit,
	onDelete,
	onToggleStatus,
}: ExperimentCardProps) {
	const statusInfo = statusConfig[experiment.status];
	const hasVariants = Boolean(
		experiment.variants && experiment.variants.length > 0
	);
	const hasGoals = Boolean(experiment.goals && experiment.goals.length > 0);
	const variantTypes = experiment.variants
		? [...new Set(experiment.variants.map((v) => v.type))]
		: [];

	const handleToggleStatus = () => {
		if (!onToggleStatus) {
			return;
		}
		const newStatus = experiment.status === 'running' ? 'paused' : 'running';
		onToggleStatus(experiment.id, newStatus);
	};

	return (
		<Card className="group relative rounded border-border/50 transition-all duration-200 hover:border-primary/30 hover:shadow-lg">
			<CardHeader className="pb-4">
				<div className="flex items-start justify-between">
					<div className="flex-1 space-y-2">
						<div className="flex items-center gap-3">
							<div className="rounded border border-primary/20 bg-primary/10 p-2">
								<FlaskIcon
									className="h-4 w-4 text-primary"
									size={16}
									weight="duotone"
								/>
							</div>
							<div className="min-w-0 flex-1">
								<h3 className="truncate font-semibold text-foreground text-lg leading-tight">
									{experiment.name}
								</h3>
								{experiment.description && (
									<p className="line-clamp-2 text-muted-foreground text-sm leading-relaxed">
										{experiment.description}
									</p>
								)}
							</div>
						</div>

						<div className="flex items-center gap-2">
							<Badge
								className={`font-medium ${statusInfo.bgColor} ${statusInfo.color}`}
								variant={statusInfo.variant}
							>
								{statusInfo.label}
							</Badge>
							<div className="flex items-center gap-1 text-muted-foreground text-xs">
								<UsersIcon size={12} weight="duotone" />
								<span>{experiment.trafficAllocation}% traffic</span>
							</div>
						</div>
					</div>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								className="h-8 w-8 rounded opacity-0 transition-all duration-200 focus:opacity-100 group-hover:opacity-100"
								size="sm"
								variant="ghost"
							>
								<DotsThreeIcon className="h-4 w-4" size={16} weight="bold" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-48">
							<DropdownMenuItem onClick={() => onEdit(experiment)}>
								<PencilIcon className="mr-2 h-4 w-4" size={16} />
								Edit Experiment
							</DropdownMenuItem>
							{onToggleStatus &&
								(experiment.status === 'running' ||
									experiment.status === 'paused') && (
									<DropdownMenuItem onClick={handleToggleStatus}>
										{experiment.status === 'running' ? (
											<>
												<StopIcon className="mr-2 h-4 w-4" size={16} />
												Pause
											</>
										) : (
											<>
												<PlayIcon className="mr-2 h-4 w-4" size={16} />
												Resume
											</>
										)}
									</DropdownMenuItem>
								)}
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="text-destructive focus:text-destructive"
								onClick={() => onDelete(experiment.id)}
							>
								<TrashIcon className="mr-2 h-4 w-4" size={16} />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</CardHeader>

			<CardContent className="space-y-4">
				{/* Experiment Details */}
				<div className="grid grid-cols-2 gap-4 text-sm">
					<div className="space-y-1">
						<div className="flex items-center gap-1 text-muted-foreground">
							<FlaskIcon size={12} weight="duotone" />
							<span>Variants</span>
						</div>
						<div className="font-medium text-foreground">
							{hasVariants ? experiment.variants?.length || 0 : 0}
						</div>
					</div>
					<div className="space-y-1">
						<div className="flex items-center gap-1 text-muted-foreground">
							<ChartLineIcon size={12} weight="duotone" />
							<span>Goals</span>
						</div>
						<div className="font-medium text-foreground">
							{hasGoals ? experiment.goals?.length || 0 : 0}
						</div>
					</div>
				</div>

				{/* Variant Types */}
				{variantTypes.length > 0 && (
					<div className="space-y-2">
						<div className="text-muted-foreground text-xs">Variant Types:</div>
						<div className="flex gap-2">
							{variantTypes.map((type) => (
								<div
									className="flex items-center gap-1 rounded-md bg-muted/50 px-2 py-1 text-xs"
									key={type}
								>
									{getVariantIcon(type, 12)}
									<span className="capitalize">{type}</span>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Timestamps */}
				<div className="space-y-2 border-border/50 border-t pt-3">
					<div className="flex items-center justify-between text-xs">
						<div className="flex items-center gap-1 text-muted-foreground">
							<CalendarIcon size={12} weight="duotone" />
							<span>Created</span>
						</div>
						<span className="font-medium text-foreground">
							{dayjs(experiment.createdAt).format('MMM D, YYYY')}
						</span>
					</div>
					{experiment.startDate && (
						<div className="flex items-center justify-between text-xs">
							<div className="flex items-center gap-1 text-muted-foreground">
								<PlayIcon size={12} weight="duotone" />
								<span>Started</span>
							</div>
							<span className="font-medium text-foreground">
								{dayjs(experiment.startDate).format('MMM D, YYYY')}
							</span>
						</div>
					)}
					{experiment.endDate && (
						<div className="flex items-center justify-between text-xs">
							<div className="flex items-center gap-1 text-muted-foreground">
								<StopIcon size={12} weight="duotone" />
								<span>Ended</span>
							</div>
							<span className="font-medium text-foreground">
								{dayjs(experiment.endDate).format('MMM D, YYYY')}
							</span>
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
});
