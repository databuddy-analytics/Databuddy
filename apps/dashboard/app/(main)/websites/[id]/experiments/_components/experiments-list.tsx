'use client';

import { FlaskIcon, PlusIcon } from '@phosphor-icons/react';
import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { Experiment } from '@/hooks/use-experiments';
import { ExperimentCard } from './experiment-card';

interface ExperimentsListProps {
	experiments: Experiment[];
	isLoading: boolean;
	onCreateExperiment: () => void;
	onEditExperiment: (experiment: Experiment) => void;
	onDeleteExperiment: (experimentId: string) => void;
	onToggleExperimentStatus?: (
		experimentId: string,
		newStatus: 'running' | 'paused'
	) => void;
}

const EmptyState = memo(function EmptyExperimentsState({
	onCreateExperiment,
}: {
	onCreateExperiment: () => void;
}) {
	return (
		<Card className="rounded border-border/50">
			<CardContent className="flex flex-col items-center justify-center py-16 text-center">
				<div className="mb-4 rounded border border-primary/20 bg-primary/10 p-4">
					<FlaskIcon
						className="h-8 w-8 text-primary"
						size={32}
						weight="duotone"
					/>
				</div>
				<h3 className="mb-2 font-semibold text-foreground text-lg">
					No experiments yet
				</h3>
				<p className="mb-6 max-w-md text-muted-foreground text-sm">
					Create your first A/B experiment to start testing different variants
					and optimizing conversions.
				</p>
				<Button
					className="rounded bg-gradient-to-r from-primary to-primary/90 shadow-lg transition-all duration-200 hover:from-primary/90 hover:to-primary hover:shadow-xl"
					onClick={onCreateExperiment}
				>
					<PlusIcon className="mr-2 h-4 w-4" size={16} />
					Create Experiment
				</Button>
			</CardContent>
		</Card>
	);
});

const LoadingSkeleton = memo(function ExperimentsLoadingSkeleton() {
	return (
		<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
			{[...new Array(6)].map((_, i) => (
				<Card
					className="animate-pulse rounded"
					key={`experiment-skeleton-${i + 1}`}
				>
					<div className="p-6">
						<div className="mb-4 flex items-start justify-between">
							<div className="flex-1 space-y-3">
								<div className="flex items-center gap-3">
									<div className="h-8 w-8 rounded bg-muted" />
									<div className="space-y-2">
										<div className="h-5 w-48 rounded bg-muted" />
										<div className="h-4 w-32 rounded bg-muted" />
									</div>
								</div>
								<div className="flex items-center gap-3">
									<div className="h-5 w-16 rounded-full bg-muted" />
									<div className="h-4 w-20 rounded bg-muted" />
								</div>
							</div>
							<div className="h-8 w-8 rounded bg-muted" />
						</div>
						<div className="space-y-3">
							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<div className="h-3 w-16 rounded bg-muted" />
									<div className="h-4 w-8 rounded bg-muted" />
								</div>
								<div className="space-y-2">
									<div className="h-3 w-16 rounded bg-muted" />
									<div className="h-4 w-8 rounded bg-muted" />
								</div>
							</div>
							<div className="rounded bg-muted/50 p-3">
								<div className="mb-2 h-3 w-24 rounded bg-muted" />
								<div className="flex gap-2">
									<div className="h-6 w-16 rounded bg-muted" />
									<div className="h-6 w-20 rounded bg-muted" />
								</div>
							</div>
							<div className="space-y-2 border-border/50 border-t pt-3">
								<div className="flex justify-between">
									<div className="h-3 w-16 rounded bg-muted" />
									<div className="h-3 w-20 rounded bg-muted" />
								</div>
							</div>
						</div>
					</div>
				</Card>
			))}
		</div>
	);
});

export const ExperimentsList = memo(function ExperimentsListComponent({
	experiments,
	isLoading,
	onCreateExperiment,
	onEditExperiment,
	onDeleteExperiment,
	onToggleExperimentStatus,
}: ExperimentsListProps) {
	if (isLoading) {
		return <LoadingSkeleton />;
	}

	if (!experiments.length) {
		return <EmptyState onCreateExperiment={onCreateExperiment} />;
	}

	return (
		<div className="space-y-4">
			{/* Stats Summary */}
			<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
				<Card className="rounded border-border/50">
					<CardContent className="p-4">
						<div className="space-y-1">
							<p className="text-muted-foreground text-xs">Total</p>
							<p className="font-semibold text-foreground text-xl">
								{experiments.length}
							</p>
						</div>
					</CardContent>
				</Card>
				<Card className="rounded border-border/50">
					<CardContent className="p-4">
						<div className="space-y-1">
							<p className="text-muted-foreground text-xs">Running</p>
							<p className="font-semibold text-foreground text-xl">
								{experiments.filter((e) => e.status === 'running').length}
							</p>
						</div>
					</CardContent>
				</Card>
				<Card className="rounded border-border/50">
					<CardContent className="p-4">
						<div className="space-y-1">
							<p className="text-muted-foreground text-xs">Draft</p>
							<p className="font-semibold text-foreground text-xl">
								{experiments.filter((e) => e.status === 'draft').length}
							</p>
						</div>
					</CardContent>
				</Card>
				<Card className="rounded border-border/50">
					<CardContent className="p-4">
						<div className="space-y-1">
							<p className="text-muted-foreground text-xs">Completed</p>
							<p className="font-semibold text-foreground text-xl">
								{experiments.filter((e) => e.status === 'completed').length}
							</p>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Experiments Grid */}
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
				{experiments.map((experiment) => (
					<ExperimentCard
						experiment={experiment}
						key={experiment.id}
						onDelete={onDeleteExperiment}
						onEdit={onEditExperiment}
						onToggleStatus={onToggleExperimentStatus}
					/>
				))}
			</div>
		</div>
	);
});
