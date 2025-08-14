'use client';

import { type DynamicQueryFilter, filterOptions } from '@databuddy/shared';
import { ArrowClockwiseIcon, WarningIcon, XIcon } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useAtom } from 'jotai';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQueryState } from 'nuqs';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { DateRange as DayPickerRange } from 'react-day-picker';
import { toast } from 'sonner';
import { DateRangePicker } from '@/components/date-range-picker';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { operatorOptions, useFilters } from '@/hooks/use-filters';
import { useTrackingSetup } from '@/hooks/use-tracking-setup';
import { useWebsite } from '@/hooks/use-websites';
import {
	dateRangeAtom,
	formattedDateRangeAtom,
	setDateRangeAndAdjustGranularityAtom,
	timeGranularityAtom,
	timezoneAtom,
} from '@/stores/jotai/filterAtoms';
import {
	AddFilterForm,
	getOperatorShorthand,
} from './_components/utils/add-filters';
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
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [currentDateRange] = useAtom(dateRangeAtom);
	const [currentGranularity, setCurrentGranularityAtomState] =
		useAtom(timeGranularityAtom);
	const [, setDateRangeAction] = useAtom(setDateRangeAndAdjustGranularityAtom);
	const [formattedDateRangeState] = useAtom(formattedDateRangeAtom);
	const [timezone] = useAtom(timezoneAtom);
	const queryClient = useQueryClient();
	const [selectedFilters, setSelectedFilters] = useState<DynamicQueryFilter[]>(
		[]
	);
	const { addFilter, removeFilter } = useFilters({
		filters: selectedFilters,
		onFiltersChange: setSelectedFilters,
	});

	const dayPickerSelectedRange: DayPickerRange | undefined = useMemo(
		() => ({
			from: currentDateRange.startDate,
			to: currentDateRange.endDate,
		}),
		[currentDateRange]
	);

	const quickRanges = useMemo(
		() => [
			{ label: '24h', fullLabel: 'Last 24 hours', hours: 24 },
			{ label: '7d', fullLabel: 'Last 7 days', days: 7 },
			{ label: '30d', fullLabel: 'Last 30 days', days: 30 },
			{ label: '90d', fullLabel: 'Last 90 days', days: 90 },
			{ label: '180d', fullLabel: 'Last 180 days', days: 180 },
			{ label: '365d', fullLabel: 'Last 365 days', days: 365 },
		],
		[]
	);

	const handleQuickRangeSelect = useCallback(
		(range: (typeof quickRanges)[0]) => {
			const now = new Date();
			const start = range.hours
				? dayjs(now).subtract(range.hours, 'hour').toDate()
				: dayjs(now)
						.subtract(range.days || 7, 'day')
						.toDate();
			setDateRangeAction({ startDate: start, endDate: now });
		},
		[setDateRangeAction]
	);

	const memoizedDateRangeForTabs = useMemo(
		() => ({
			start_date: formattedDateRangeState.startDate,
			end_date: formattedDateRangeState.endDate,
			granularity: currentGranularity,
			timezone,
		}),
		[formattedDateRangeState, currentGranularity, timezone]
	);

	const _handleDateRangeChange = useCallback(
		(range: DayPickerRange | undefined) => {
			if (range?.from && range?.to) {
				setDateRangeAction({ startDate: range.from, endDate: range.to });
			}
		},
		[setDateRangeAction]
	);

	const {
		data,
		isLoading,
		isError,
		refetch: refetchWebsiteData,
	} = useWebsite(id as string);

	const { isTrackingSetup } = useTrackingSetup(id as string);

	useEffect(() => {
		if (isTrackingSetup === false && activeTab === 'overview') {
			setActiveTab('tracking-setup');
		} else if (isTrackingSetup === true && activeTab === 'tracking-setup') {
			setActiveTab('overview');
		}
	}, [isTrackingSetup, activeTab, setActiveTab]);

	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: ['websites', id] }),
			queryClient.invalidateQueries({
				queryKey: ['websites', 'isTrackingSetup', id],
			}),
		]);
		setIsRefreshing(false);
		toast.success('Data refreshed');
	}, [id, queryClient]);

	const renderTabContent = useCallback(
		(tabId: TabId) => {
			if (tabId !== activeTab) {
				return null;
			}

			const key = `${tabId}-${id as string}`;
			const settingsProps: WebsiteDataTabProps = {
				websiteId: id as string,
				dateRange: memoizedDateRangeForTabs,
				websiteData: data,
				onWebsiteUpdated: refetchWebsiteData,
			};

			const tabProps: FullTabProps = {
				...settingsProps,
				isRefreshing,
				setIsRefreshing,
				filters: selectedFilters,
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
			memoizedDateRangeForTabs,
			data,
			isRefreshing,
			refetchWebsiteData,
			selectedFilters,
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
		<div className="mx-auto max-w-[1600px] p-3 sm:p-4 lg:p-6">
			<header className="border-b pb-3">
				{/* Only show date range controls if tracking is set up */}
				{isTrackingSetup && (
					<div className="mt-3 flex flex-col gap-3 rounded-lg border bg-muted/30 p-2.5">
						<div className="flex items-center justify-between gap-3">
							<div className="flex h-8 overflow-hidden rounded-md border bg-background shadow-sm">
								<Button
									className={`h-8 cursor-pointer touch-manipulation rounded-none px-2 text-xs sm:px-3 ${currentGranularity === 'daily' ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground'}`}
									onClick={() => setCurrentGranularityAtomState('daily')}
									size="sm"
									title="View daily aggregated data"
									variant="ghost"
								>
									Daily
								</Button>
								<Button
									className={`h-8 cursor-pointer touch-manipulation rounded-none px-2 text-xs sm:px-3 ${currentGranularity === 'hourly' ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground'}`}
									onClick={() => setCurrentGranularityAtomState('hourly')}
									size="sm"
									title="View hourly data (best for 24h periods)"
									variant="ghost"
								>
									Hourly
								</Button>
							</div>

							<Button
								aria-label="Refresh data"
								className="h-8 w-8"
								disabled={isRefreshing}
								onClick={handleRefresh}
								size="icon"
								variant="outline"
							>
								<ArrowClockwiseIcon
									aria-hidden="true"
									className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
								/>
							</Button>
						</div>

						<div className="flex items-center gap-2 overflow-x-auto rounded-md border bg-background p-1 shadow-sm">
							{quickRanges.map((range) => {
								const now = new Date();
								const start = range.hours
									? dayjs(now).subtract(range.hours, 'hour').toDate()
									: dayjs(now)
											.subtract(range.days || 7, 'day')
											.toDate();
								const dayPickerCurrentRange = dayPickerSelectedRange;
								const isActive =
									dayPickerCurrentRange?.from &&
									dayPickerCurrentRange?.to &&
									dayjs(dayPickerCurrentRange.from).format('YYYY-MM-DD') ===
										dayjs(start).format('YYYY-MM-DD') &&
									dayjs(dayPickerCurrentRange.to).format('YYYY-MM-DD') ===
										dayjs(now).format('YYYY-MM-DD');

								return (
									<Button
										className={`h-6 cursor-pointer touch-manipulation whitespace-nowrap px-2 text-xs sm:px-2.5 ${isActive ? 'shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
										key={range.label}
										onClick={() => handleQuickRangeSelect(range)}
										size="sm"
										title={range.fullLabel}
										variant={isActive ? 'default' : 'ghost'}
									>
										<span className="sm:hidden">{range.label}</span>
										<span className="hidden sm:inline">{range.fullLabel}</span>
									</Button>
								);
							})}

							<div className="ml-1 border-border/50 border-l pl-2 sm:pl-3">
								<DateRangePicker
									className="w-auto"
									maxDate={new Date()}
									minDate={new Date(2020, 0, 1)}
									onChange={(range) => {
										if (range?.from && range?.to) {
											setDateRangeAction({
												startDate: range.from,
												endDate: range.to,
											});
										}
									}}
									value={dayPickerSelectedRange}
								/>
							</div>

							<div className="ml-2 flex items-center">
								<AddFilterForm addFilter={addFilter} />
							</div>
						</div>
					</div>
				)}
				{selectedFilters.length > 0 && (
					<div className="mt-3 rounded-lg border bg-muted/30 p-2.5">
						<div className="flex items-center justify-between gap-3">
							<div className="flex items-center gap-2 overflow-x-auto">
								<div className="font-semibold text-sm">Filters</div>
								<div className="flex flex-wrap items-center gap-2">
									{selectedFilters.map((filter, index) => {
										const fieldLabel = filterOptions.find(
											(o) => o.value === filter.field
										)?.label;
										const operatorLabel = operatorOptions.find(
											(o) => getOperatorShorthand(o.value) === filter.operator
										)?.label;
										const valueLabel = Array.isArray(filter.value)
											? filter.value.join(', ')
											: filter.value;

										return (
											<div
												className="flex items-center gap-0 rounded border bg-background py-1 pr-2 pl-3 shadow-sm"
												key={`filter-${index}-${filter.field}-${filter.operator}`}
											>
												<div className="flex items-center gap-1">
													<span className="font-medium text-foreground text-sm">
														{fieldLabel}
													</span>
													<span className="text-muted-foreground/70 text-sm">
														{operatorLabel}
													</span>
													<span className="font-medium text-foreground text-sm">
														{valueLabel}
													</span>
												</div>
												<button
													aria-label={`Remove filter ${fieldLabel} ${operatorLabel} ${valueLabel}`}
													className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted/50"
													onClick={() => removeFilter(index)}
													type="button"
												>
													<XIcon aria-hidden="true" className="h-3 w-3" />
												</button>
											</div>
										);
									})}
								</div>
							</div>

							<Button onClick={() => setSelectedFilters([])} variant="outline">
								Clear all filters
							</Button>
						</div>
					</div>
				)}
			</header>

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
