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
	websiteId: string;
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
					Create your first A/B experiment to start testing different variants.
				</p>
				<Button onClick={onCreateExperiment}>
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
								<div className="h-5 w-16 rounded-full bg-muted" />
							</div>
							<div className="h-8 w-8 rounded bg-muted" />
						</div>
						<div className="h-4 w-24 rounded bg-muted" />
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
	websiteId,
}: ExperimentsListProps) {
	if (isLoading) {
		return <LoadingSkeleton />;
	}

	if (!experiments.length) {
		return <EmptyState onCreateExperiment={onCreateExperiment} />;
	}

	return (
		<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
			{experiments.map((experiment) => (
				<ExperimentCard
					experiment={experiment}
					key={experiment.id}
					onDelete={onDeleteExperiment}
					onEdit={onEditExperiment}
					onToggleStatus={onToggleExperimentStatus}
					websiteId={websiteId}
				/>
			))}
		</div>
	);
});
