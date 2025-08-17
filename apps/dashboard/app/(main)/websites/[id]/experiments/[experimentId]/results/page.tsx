'use client';

import {
	CalendarIcon,
	FlaskIcon,
	TrendUpIcon,
	UsersIcon,
} from '@phosphor-icons/react';
import { useAtom } from 'jotai';
import { useParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useExperiment } from '@/hooks/use-experiments';
import { useWebsite } from '@/hooks/use-websites';
import { isAnalyticsRefreshingAtom } from '@/stores/jotai/filterAtoms';
import { WebsitePageHeader } from '../../../_components/website-page-header';
import { ConversionChart } from './_components/conversion-chart';
import { ExperimentResultsHeader } from './_components/experiment-results-header';
import { ExperimentSummaryCards } from './_components/experiment-summary-cards';
import { MetricsTable } from './_components/metrics-table';
import { StatisticalDetails } from './_components/statistical-details';
import { VariantComparison } from './_components/variant-comparison';

const ResultsLoadingSkeleton = () => (
	<div className="space-y-6">
		<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
			{[...Array(4)].map((_, i) => (
				<Card className="animate-pulse" key={i}>
					<CardHeader className="pb-2">
						<Skeleton className="h-4 w-24" />
					</CardHeader>
					<CardContent>
						<Skeleton className="h-8 w-16" />
					</CardContent>
				</Card>
			))}
		</div>
		<Card className="animate-pulse">
			<CardHeader>
				<Skeleton className="h-6 w-48" />
			</CardHeader>
			<CardContent>
				<Skeleton className="h-64 w-full" />
			</CardContent>
		</Card>
	</div>
);

export default function ExperimentResultsPage() {
	const { id, experimentId } = useParams();
	const websiteId = id as string;
	const expId = experimentId as string;
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		setIsVisible(true);
	}, []);

	const { data: websiteData } = useWebsite(websiteId);
	// Mock experiment data for now - replace with real API call when backend is ready
	const experiment = {
		id: expId,
		websiteId,
		name: 'Homepage CTA Test',
		description: 'Testing new call-to-action button design',
		status: 'running' as const,
		trafficAllocation: 100,
		createdBy: 'user123',
		createdAt: '2024-10-15T00:00:00Z',
		updatedAt: '2024-10-15T00:00:00Z',
	};
	const experimentLoading = false;
	const experimentError = null;

	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		try {
			// Refresh experiment results data
			// await refetchExperimentResults();
		} catch (error) {
			console.error('Failed to refresh experiment results:', error);
		} finally {
			setIsRefreshing(false);
		}
	}, []);

	if (experimentError) {
		return (
			<div className="mx-auto max-w-[1600px] p-3 sm:p-4 lg:p-6">
				<Card className="rounded border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
					<CardContent className="pt-6">
						<div className="flex items-center gap-2">
							<FlaskIcon
								className="h-5 w-5 text-red-600"
								size={16}
								weight="duotone"
							/>
							<p className="font-medium text-red-600">
								Error loading experiment results
							</p>
						</div>
						<p className="mt-2 text-red-600/80 text-sm">
							Failed to load experiment
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="mx-auto mt-6 max-w-[1600px] space-y-6">
			<WebsitePageHeader
				description="A/B test performance data"
				icon={
					<FlaskIcon
						className="h-6 w-6 text-primary"
						size={16}
						weight="duotone"
					/>
				}
				isLoading={experimentLoading}
				isRefreshing={isRefreshing}
				onRefresh={handleRefresh}
				showBackButton={true}
				title={experiment?.name || 'Experiment Results'}
				variant="minimal"
				websiteId={websiteId}
				websiteName={websiteData?.name || undefined}
			/>

			{isVisible && (
				<Suspense fallback={<ResultsLoadingSkeleton />}>
					{experiment && (
						<div className="space-y-6">
							<ExperimentSummaryCards experiment={experiment} />
							<ConversionChart experiment={experiment} />

							<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
								<MetricsTable experiment={experiment} />
								<VariantComparison experiment={experiment} />
							</div>

							<StatisticalDetails experiment={experiment} />
						</div>
					)}
				</Suspense>
			)}
		</div>
	);
}
