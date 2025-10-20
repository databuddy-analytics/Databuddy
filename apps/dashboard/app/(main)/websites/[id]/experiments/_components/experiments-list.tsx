'use client';

import { FlaskIcon } from '@phosphor-icons/react';
import { memo } from 'react';
import { EmptyState } from '@/components/empty-state';
import { Card } from '@/components/ui/card';
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
		return (
			<EmptyState
				action={{
					label: 'Create Experiment',
					onClick: onCreateExperiment,
				}}
				description="Create your first A/B experiment to start testing different variants."
				icon={
					<FlaskIcon
						className="h-8 w-8 text-primary"
						size={32}
						weight="duotone"
					/>
				}
				title="No experiments yet"
			/>
		);
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
