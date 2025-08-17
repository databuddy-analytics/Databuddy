'use client';

import {
	ChartLineIcon,
	DotsThreeIcon,
	FlaskIcon,
	PauseIcon,
	PencilIcon,
	PlayIcon,
	TrashIcon,
} from '@phosphor-icons/react';
import dayjs from 'dayjs';
import Link from 'next/link';
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
	websiteId: string;
}

const statusConfig = {
	running: { label: 'Running', variant: 'default' as const },
	paused: { label: 'Paused', variant: 'outline' as const },
};

export const ExperimentCard = memo(function ExperimentCardComponent({
	experiment,
	onEdit,
	onDelete,
	onToggleStatus,
	websiteId,
}: ExperimentCardProps) {
	const statusInfo =
		statusConfig[experiment.status as keyof typeof statusConfig];

	const handleToggleStatus = () => {
		if (!onToggleStatus) return;
		const newStatus = experiment.status === 'running' ? 'paused' : 'running';
		onToggleStatus(experiment.id, newStatus);
	};

	return (
		<Card className="group relative rounded transition-all duration-200 hover:border-primary/30 hover:shadow-lg">
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
							<Badge variant={statusInfo?.variant || 'secondary'}>
								{statusInfo?.label || 'Draft'}
							</Badge>
							{onToggleStatus &&
								(experiment.status === 'running' ||
									experiment.status === 'paused') && (
									<Button
										className="h-6 px-2"
										onClick={handleToggleStatus}
										size="sm"
										variant="ghost"
									>
										{experiment.status === 'running' ? (
											<>
												<PauseIcon className="mr-1 h-3 w-3" size={12} />
												Pause
											</>
										) : (
											<>
												<PlayIcon className="mr-1 h-3 w-3" size={12} />
												Start
											</>
										)}
									</Button>
								)}
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
								Edit
							</DropdownMenuItem>
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

			<CardContent className="space-y-3">
				<div className="flex items-center justify-between text-xs">
					<span className="text-muted-foreground">Created</span>
					<span className="font-medium text-foreground">
						{dayjs(experiment.createdAt).format('MMM D, YYYY')}
					</span>
				</div>

				<Link
					href={`/websites/${websiteId}/experiments/${experiment.id}/results`}
				>
					<Button className="w-full" size="sm" variant="outline">
						<ChartLineIcon className="mr-2 h-4 w-4" size={16} />
						View Results
					</Button>
				</Link>
			</CardContent>
		</Card>
	);
});
