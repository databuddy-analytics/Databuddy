'use client';

import { FlaskIcon } from '@phosphor-icons/react';
import { useAtom } from 'jotai';
import { useParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
	type CreateExperimentData,
	type Experiment,
	useExperiments,
} from '@/hooks/use-experiments';
import { useWebsite } from '@/hooks/use-websites';
import { isAnalyticsRefreshingAtom } from '@/stores/jotai/filterAtoms';
import { WebsitePageHeader } from '../_components/website-page-header';
import { DeleteExperimentDialog } from './_components/delete-experiment-dialog';
import { ExperimentFormDialog } from './_components/experiment-form-dialog';
import { ExperimentsList } from './_components/experiments-list';

const ExperimentsListSkeleton = () => (
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

export default function ExperimentsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingExperiment, setEditingExperiment] = useState<Experiment | null>(
		null
	);
	const [deletingExperimentId, setDeletingExperimentId] = useState<
		string | null
	>(null);

	const [isVisible, setIsVisible] = useState(false);
	const pageRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setIsVisible(true);
					observer.disconnect();
				}
			},
			{ threshold: 0.1 }
		);

		if (pageRef.current) {
			observer.observe(pageRef.current);
		}

		return () => observer.disconnect();
	}, []);

	const { data: websiteData } = useWebsite(websiteId);

	const {
		data: experiments,
		isLoading: experimentsLoading,
		error: experimentsError,
		refetch: refetchExperiments,
		createExperiment,
		updateExperiment,
		deleteExperiment,
		isCreating,
		isUpdating,
		isDeleting,
	} = useExperiments(websiteId);

	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		try {
			await refetchExperiments();
		} catch (error) {
			console.error('Failed to refresh experiment data:', error);
		} finally {
			setIsRefreshing(false);
		}
	}, [refetchExperiments, setIsRefreshing]);

	const handleSaveExperiment = async (
		data: Experiment | Omit<CreateExperimentData, 'websiteId'>
	) => {
		try {
			if ('id' in data && data.id) {
				// Update existing experiment
				await updateExperiment({
					experimentId: data.id,
					updates: {
						name: data.name,
						description: data.description || undefined,
					},
				});
			} else {
				const createData = data as Omit<CreateExperimentData, 'websiteId'>;
				await createExperiment({
					...createData,
					websiteId,
					status: 'running',
				});
			}
			setIsDialogOpen(false);
			setEditingExperiment(null);
		} catch (error) {
			console.error('Failed to save experiment:', error);
		}
	};

	const handleDeleteExperiment = async (experimentId: string) => {
		try {
			await deleteExperiment(experimentId);
			setDeletingExperimentId(null);
		} catch (error) {
			console.error('Failed to delete experiment:', error);
		}
	};

	const handleToggleExperimentStatus = async (
		experimentId: string,
		newStatus: 'running' | 'paused'
	) => {
		try {
			await updateExperiment({
				experimentId,
				updates: { status: newStatus },
			});
		} catch (error) {
			console.error('Failed to update experiment status:', error);
		}
	};

	const deletingExperiment = experiments.find(
		(e) => e.id === deletingExperimentId
	);

	if (experimentsError) {
		return (
			<div className="mx-auto max-w-[1600px] p-3 sm:p-4 lg:p-6">
				<Card className="rounded border-destructive/20 bg-destructive/10">
					<CardContent className="pt-6">
						<div className="flex items-center gap-2">
							<FlaskIcon
								className="h-5 w-5 text-destructive"
								size={16}
								weight="duotone"
							/>
							<p className="font-medium text-destructive">
								Error loading experiment data
							</p>
						</div>
						<p className="mt-2 text-destructive/80 text-sm">
							{experimentsError.message}
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="mx-auto mt-6 max-w-[1600px] space-y-4" ref={pageRef}>
			<WebsitePageHeader
				createActionLabel="Create Experiment"
				description="Test different variants and optimize conversions"
				hasError={!!experimentsError}
				icon={
					<FlaskIcon
						className="h-6 w-6 text-primary"
						size={16}
						weight="duotone"
					/>
				}
				isLoading={experimentsLoading}
				isRefreshing={isRefreshing}
				onCreateAction={() => {
					setEditingExperiment(null);
					setIsDialogOpen(true);
				}}
				onRefresh={handleRefresh}
				subtitle={
					experimentsLoading
						? undefined
						: `${experiments.length} experiment${experiments.length !== 1 ? 's' : ''}`
				}
				title="A/B Experiments"
				websiteId={websiteId}
				websiteName={websiteData?.name || undefined}
			/>

			{isVisible && (
				<Suspense fallback={<ExperimentsListSkeleton />}>
					<ExperimentsList
						experiments={experiments}
						isLoading={experimentsLoading}
						onCreateExperiment={() => {
							setEditingExperiment(null);
							setIsDialogOpen(true);
						}}
						onDeleteExperiment={(experimentId) =>
							setDeletingExperimentId(experimentId)
						}
						onEditExperiment={(experiment) => {
							setEditingExperiment(experiment);
							setIsDialogOpen(true);
						}}
						onToggleExperimentStatus={handleToggleExperimentStatus}
						websiteId={websiteId}
					/>
				</Suspense>
			)}

			{isDialogOpen && (
				<Suspense>
					<ExperimentFormDialog
						experiment={editingExperiment}
						isOpen={isDialogOpen}
						isSaving={isCreating || isUpdating}
						onClose={() => {
							setIsDialogOpen(false);
							setEditingExperiment(null);
						}}
						onSave={handleSaveExperiment}
					/>
				</Suspense>
			)}

			{deletingExperimentId && (
				<Suspense>
					<DeleteExperimentDialog
						experimentName={deletingExperiment?.name}
						isDeleting={isDeleting}
						isOpen={!!deletingExperimentId}
						onClose={() => setDeletingExperimentId(null)}
						onConfirm={() =>
							deletingExperimentId &&
							handleDeleteExperiment(deletingExperimentId)
						}
					/>
				</Suspense>
			)}
		</div>
	);
}
