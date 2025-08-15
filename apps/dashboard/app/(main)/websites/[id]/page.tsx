'use client';

import type { DynamicQueryFilter } from '@databuddy/shared';
import { WarningIcon } from '@phosphor-icons/react';
import { useAtom } from 'jotai';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQueryState } from 'nuqs';
import { Suspense, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDateFilters } from '@/hooks/use-date-filters';
import { useTrackingSetup } from '@/hooks/use-tracking-setup';
import { useWebsite } from '@/hooks/use-websites';
import {
	addDynamicFilterAtom,
	dynamicQueryFiltersAtom,
	isAnalyticsRefreshingAtom,
} from '@/stores/jotai/filterAtoms';
import type {
	FullTabProps,
	WebsiteDataTabProps,
} from './_components/utils/types';
import { EmptyState } from './_components/utils/ui-components';

type TabId =
	| 'overview'
	| 'audience'
	| 'performance'
	| 'settings'
	| 'tracking-setup';

const WebsiteOverviewTab = dynamic(
	() =>
		import('./_components/tabs/overview-tab').then((mod) => ({
			default: mod.WebsiteOverviewTab,
		})),
	{ loading: () => <TabLoadingSkeleton />, ssr: false }
);
const WebsiteAudienceTab = dynamic(
	() =>
		import('./_components/tabs/audience-tab').then((mod) => ({
			default: mod.WebsiteAudienceTab,
		})),
	{ loading: () => <TabLoadingSkeleton />, ssr: false }
);
const WebsitePerformanceTab = dynamic(
	() =>
		import('./_components/tabs/performance-tab').then((mod) => ({
			default: mod.WebsitePerformanceTab,
		})),
	{ loading: () => <TabLoadingSkeleton />, ssr: false }
);
const WebsiteSettingsTab = dynamic(
	() =>
		import('./_components/tabs/settings-tab').then((mod) => ({
			default: mod.WebsiteSettingsTab,
		})),
	{ loading: () => <TabLoadingSkeleton />, ssr: false }
);
const WebsiteTrackingSetupTab = dynamic(
	() =>
		import('./_components/tabs/tracking-setup-tab').then((mod) => ({
			default: mod.WebsiteTrackingSetupTab,
		})),
	{ loading: () => <TabLoadingSkeleton />, ssr: false }
);

type TabDefinition = {
	id: TabId;
	label: string;
	className?: string;
};

function WebsiteDetailsPage() {
	const [activeTab, setActiveTab] = useQueryState('tab', {
		defaultValue: 'overview' as TabId,
	});
	const { id } = useParams();
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const [selectedFilters] = useAtom(dynamicQueryFiltersAtom);
	const [, addFilterAction] = useAtom(addDynamicFilterAtom);

	const { dateRange } = useDateFilters();

	const {
		data,
		isLoading,
		isError,
		refetch: refetchWebsiteData,
	} = useWebsite(id as string);

	const { isTrackingSetup } = useTrackingSetup(id as string);

	const addFilter = useCallback(
		(filter: DynamicQueryFilter) => {
			addFilterAction(filter);
		},
		[addFilterAction]
	);

	useEffect(() => {
		if (isTrackingSetup === false && activeTab === 'overview') {
			setActiveTab('tracking-setup');
		} else if (isTrackingSetup === true && activeTab === 'tracking-setup') {
			setActiveTab('overview');
		}
	}, [isTrackingSetup, activeTab, setActiveTab]);

	const renderTabContent = useCallback(
		(tabId: TabId) => {
			if (tabId !== activeTab) {
				return null;
			}

			const key = `${tabId}-${id as string}`;
			const settingsProps: WebsiteDataTabProps = {
				websiteId: id as string,
				dateRange,
				websiteData: data,
				onWebsiteUpdated: refetchWebsiteData,
			};

			const tabProps: FullTabProps = {
				...settingsProps,
				isRefreshing,
				setIsRefreshing,
				filters: selectedFilters,
				addFilter,
			};

			const getTabComponent = () => {
				switch (tabId) {
					case 'overview':
						return <WebsiteOverviewTab {...tabProps} />;
					case 'audience':
						return <WebsiteAudienceTab {...tabProps} />;
					case 'performance':
						return <WebsitePerformanceTab {...tabProps} />;
					case 'settings':
						return <WebsiteSettingsTab {...settingsProps} />;
					case 'tracking-setup':
						return <WebsiteTrackingSetupTab {...settingsProps} />;
					default:
						return null;
				}
			};

			return (
				<Suspense fallback={<TabLoadingSkeleton />} key={key}>
					{getTabComponent()}
				</Suspense>
			);
		},
		[
			activeTab,
			id,
			dateRange,
			data,
			isRefreshing,
			setIsRefreshing,
			refetchWebsiteData,
			selectedFilters,
			addFilter,
		]
	);

	if (isLoading || isTrackingSetup === null) {
		return <TabLoadingSkeleton />;
	}

	if (isError || !data) {
		return (
			<div className="select-none pt-8">
				<EmptyState
					action={
						<Link href="/websites">
							<Button variant="outline">Back to Websites</Button>
						</Link>
					}
					description="The website you are looking for does not exist or you do not have access."
					icon={
						<WarningIcon
							aria-hidden="true"
							className="h-10 w-10"
							weight="duotone"
						/>
					}
					title="Website not found"
				/>
			</div>
		);
	}

	const tabs: TabDefinition[] = isTrackingSetup
		? [
				{ id: 'overview', label: 'Overview', className: 'pt-2 space-y-2' },
				{ id: 'audience', label: 'Audience' },
				{ id: 'performance', label: 'Performance' },
				{ id: 'settings', label: 'Settings' },
			]
		: [
				{ id: 'tracking-setup', label: 'Setup Tracking' },
				{ id: 'settings', label: 'Settings' },
			];

	return (
		<div>
			<Tabs
				className="space-y-4"
				defaultValue="overview"
				onValueChange={(value) => setActiveTab(value as TabId)}
				value={activeTab}
			>
				<div className="relative border-b">
					<TabsList className="h-10 w-full justify-start overflow-x-auto bg-transparent p-0">
						{tabs.map((tab) => (
							<TabsTrigger
								className="relative h-10 cursor-pointer touch-manipulation whitespace-nowrap rounded-none px-2 text-xs transition-colors hover:bg-muted/50 sm:px-4 sm:text-sm"
								key={tab.id}
								onClick={() => setActiveTab(tab.id)}
								value={tab.id}
							>
								{tab.label}
								{activeTab === tab.id && (
									<div className="absolute bottom-0 left-0 h-[2px] w-full bg-primary" />
								)}
							</TabsTrigger>
						))}
					</TabsList>
				</div>
				<TabsContent
					className={`${tabs.find((t) => t.id === activeTab)?.className || ''} animate-fadeIn transition-all duration-200`}
					key={activeTab}
					value={activeTab as TabId}
				>
					{renderTabContent(activeTab as TabId)}
				</TabsContent>
			</Tabs>
		</div>
	);
}

function TabLoadingSkeleton() {
	return (
		<div className="select-none space-y-6 p-4 py-8">
			{/* Key metrics cards skeleton */}
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
				{[1, 2, 3, 4, 5, 6].map((num) => (
					<div
						className="rounded-lg border bg-background p-4"
						key={`metric-skeleton-${num}`}
					>
						<div className="space-y-2">
							<Skeleton className="h-4 w-20" />
							<Skeleton className="h-8 w-16" />
							<Skeleton className="h-3 w-16" />
						</div>
					</div>
				))}
			</div>

			{/* Chart skeleton */}
			<div className="rounded border shadow-sm">
				<div className="flex flex-col items-start justify-between gap-3 border-b p-4 sm:flex-row">
					<div className="space-y-2">
						<Skeleton className="h-5 w-32" />
						<Skeleton className="h-4 w-48" />
					</div>
					<div className="flex gap-2">
						<Skeleton className="h-8 w-20" />
						<Skeleton className="h-8 w-20" />
						<Skeleton className="h-8 w-20" />
					</div>
				</div>
				<div className="p-4">
					<Skeleton className="h-80 w-full" />
				</div>
			</div>

			{/* Data tables skeleton */}
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				{[1, 2].map((tableNum) => (
					<div
						className="rounded-lg border bg-background"
						key={`table-skeleton-${tableNum}`}
					>
						<div className="border-b p-4">
							<Skeleton className="h-5 w-24" />
							<Skeleton className="mt-1 h-4 w-32" />
						</div>
						<div className="space-y-3 p-4">
							{[1, 2, 3, 4, 5].map((rowNum) => (
								<div
									className="flex items-center justify-between"
									key={`row-skeleton-${rowNum}`}
								>
									<div className="flex items-center gap-3">
										<Skeleton className="h-4 w-4" />
										<Skeleton className="h-4 w-32" />
									</div>
									<div className="flex items-center gap-4">
										<Skeleton className="h-4 w-12" />
										<Skeleton className="h-5 w-10 rounded-full" />
									</div>
								</div>
							))}
						</div>
					</div>
				))}
			</div>

			{/* Technology breakdown skeleton */}
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
				{[1, 2, 3].map((techNum) => (
					<div
						className="rounded-lg border bg-background"
						key={`tech-skeleton-${techNum}`}
					>
						<div className="border-b p-4">
							<Skeleton className="h-5 w-20" />
							<Skeleton className="mt-1 h-4 w-28" />
						</div>
						<div className="space-y-3 p-4">
							{[1, 2, 3, 4].map((rowNum) => (
								<div
									className="flex items-center justify-between"
									key={`tech-row-skeleton-${rowNum}`}
								>
									<div className="flex items-center gap-3">
										<Skeleton className="h-6 w-6" />
										<Skeleton className="h-4 w-24" />
									</div>
									<div className="flex items-center gap-3">
										<Skeleton className="h-4 w-8" />
										<Skeleton className="h-5 w-12 rounded-full" />
									</div>
								</div>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

export default function Page() {
	return (
		<Suspense fallback={<PageLoadingSkeleton />}>
			<WebsiteDetailsPage />
		</Suspense>
	);
}

function PageLoadingSkeleton() {
	return (
		<div className="mx-auto max-w-[1600px] select-none p-3 sm:p-4 lg:p-6">
			<header className="border-b pb-3">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<Skeleton className="h-8 w-48" />
						<Skeleton className="h-4 w-64" />
					</div>
					<Skeleton className="h-8 w-32" />
				</div>
			</header>

			<div className="mt-4 space-y-4">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-64 w-full" />
			</div>
		</div>
	);
}
