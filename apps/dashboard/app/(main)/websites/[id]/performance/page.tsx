'use client';

import type { DynamicQueryFilter } from '@databuddy/shared';
import { useAtom } from 'jotai';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useCallback } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Skeleton } from '@/components/ui/skeleton';
import { useDateFilters } from '@/hooks/use-date-filters';
import { useTrackingSetup } from '@/hooks/use-tracking-setup';
import { useWebsite } from '@/hooks/use-websites';
import {
	addDynamicFilterAtom,
	dynamicQueryFiltersAtom,
	isAnalyticsRefreshingAtom,
} from '@/stores/jotai/filterAtoms';

const PerformanceContent = dynamic(
	() =>
		import('../_components/tabs/performance-tab').then((mod) => ({
			default: mod.WebsitePerformanceTab,
		})),
	{
		loading: () => (
			<div className="space-y-6">
				<div>
					<Skeleton className="mb-2 h-6 w-48" />
					<Skeleton className="h-4 w-64" />
				</div>
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
					{[1, 2].map((num) => (
						<div
							className="rounded border border-sidebar-border bg-sidebar p-4"
							key={`skeleton-${num}`}
						>
							<Skeleton className="h-80 w-full" />
						</div>
					))}
				</div>
			</div>
		),
		ssr: false,
	}
);

export default function PerformancePage() {
	const { id } = useParams();
	const websiteId = id as string;
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const [selectedFilters] = useAtom(dynamicQueryFiltersAtom);
	const [, addFilterAction] = useAtom(addDynamicFilterAtom);

	const { dateRange } = useDateFilters();
	const { data: websiteData } = useWebsite(websiteId);
	const { isTrackingSetup, isTrackingSetupLoading } = useTrackingSetup(websiteId);

	const addFilter = useCallback(
		(filter: DynamicQueryFilter) => {
			addFilterAction(filter);
		},
		[addFilterAction]
	);

	if (isTrackingSetupLoading) {
		return (
			<div className="space-y-4 p-6">
				<Skeleton className="h-10 w-64" />
				<Skeleton className="h-96 w-full" />
			</div>
		);
	}

	if (isTrackingSetup === false) {
		return (
			<div className="p-6">
				<div className="rounded border border-sidebar-border bg-sidebar p-8 text-center">
					<p className="text-muted-foreground">
						Please set up tracking to view performance data.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="p-6">
			<ErrorBoundary>
				<PerformanceContent
					addFilter={addFilter}
					dateRange={dateRange}
					filters={selectedFilters}
					isRefreshing={isRefreshing}
					setIsRefreshing={setIsRefreshing}
					websiteData={websiteData}
					websiteId={websiteId}
				/>
			</ErrorBoundary>
		</div>
	);
}

