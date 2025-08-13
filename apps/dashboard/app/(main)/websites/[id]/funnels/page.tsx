'use client';

import { FunnelIcon, TrendDownIcon } from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { useAtom } from 'jotai';
import { useParams } from 'next/navigation';
import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react';
import type { DateRange as DayPickerRange } from 'react-day-picker';
import { DateRangePicker } from '@/components/date-range-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
	type CreateFunnelData,
	type Funnel,
	useAutocompleteData,
	useFunnelAnalytics,
	useFunnelAnalyticsByReferrer,
	useFunnels,
} from '@/hooks/use-funnels';
import { useTrackingSetup } from '@/hooks/use-tracking-setup';
import {
	dateRangeAtom,
	formattedDateRangeAtom,
	setDateRangeAndAdjustGranularityAtom,
	timeGranularityAtom,
} from '@/stores/jotai/filterAtoms';
import { WebsitePageHeader } from '../_components/website-page-header';

// Removed PageHeader import - using shared WebsitePageHeader
const FunnelsList = lazy(() =>
	import('./_components/funnels-list').then((m) => ({ default: m.FunnelsList }))
);
const FunnelAnalytics = lazy(() =>
	import('./_components/funnel-analytics').then((m) => ({
		default: m.FunnelAnalytics,
	}))
);
const FunnelAnalyticsByReferrer = lazy(
	() => import('./_components/funnel-analytics-by-referrer')
);
const EditFunnelDialog = lazy(() =>
	import('./_components/edit-funnel-dialog').then((m) => ({
		default: m.EditFunnelDialog,
	}))
);
const DeleteFunnelDialog = lazy(() =>
	import('./_components/delete-funnel-dialog').then((m) => ({
		default: m.DeleteFunnelDialog,
	}))
);

const FunnelsListSkeleton = () => (
	<div className="space-y-3">
		{[...new Array(3)].map((_, i) => (
			<Card
				className="animate-pulse rounded-xl"
				key={`funnel-skeleton-${i + 1}`}
			>
				<div className="p-6">
					<div className="mb-4 flex items-start justify-between">
						<div className="flex-1 space-y-3">
							<div className="flex items-center gap-3">
								<div className="h-6 w-48 rounded-lg bg-muted" />
								<div className="h-4 w-4 rounded bg-muted" />
							</div>
							<div className="flex items-center gap-3">
								<div className="h-5 w-16 rounded-full bg-muted" />
								<div className="h-4 w-20 rounded bg-muted" />
							</div>
						</div>
						<div className="h-8 w-8 rounded bg-muted" />
					</div>
					<div className="space-y-3">
						<div className="h-4 w-2/3 rounded bg-muted" />
						<div className="rounded-lg bg-muted/50 p-3">
							<div className="mb-2 h-3 w-24 rounded bg-muted" />
							<div className="flex gap-2">
								<div className="h-8 w-32 rounded-lg bg-muted" />
								<div className="h-4 w-4 rounded bg-muted" />
								<div className="h-8 w-28 rounded-lg bg-muted" />
							</div>
						</div>
					</div>
				</div>
			</Card>
		))}
	</div>
);

export default function FunnelsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [expandedFunnelId, setExpandedFunnelId] = useState<string | null>(null);
	const [selectedReferrer, setSelectedReferrer] = useState('all');
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingFunnel, setEditingFunnel] = useState<Funnel | null>(null);
	const [deletingFunnelId, setDeletingFunnelId] = useState<string | null>(null);

	// Intersection observer for lazy loading
	const pageRef = useRef<HTMLDivElement>(null);

	// Date range state
	const [currentDateRange] = useAtom(dateRangeAtom);
	const [currentGranularity] = useAtom(timeGranularityAtom);
	const [, setDateRangeAction] = useAtom(setDateRangeAndAdjustGranularityAtom);
	const [formattedDateRangeState] = useAtom(formattedDateRangeAtom);

	const { isTrackingSetup, refetchTrackingSetup } = useTrackingSetup(websiteId);

	// Date picker helpers
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
		}),
		[formattedDateRangeState, currentGranularity]
	);

	const {
		data: funnels,
		isLoading: funnelsLoading,
		error: funnelsError,
		refetch: refetchFunnels,
		createFunnel,
		updateFunnel,
		deleteFunnel,
		isCreating,
		isUpdating,
	} = useFunnels(websiteId);

	const {
		data: analyticsData,
		isLoading: analyticsLoading,
		error: analyticsError,
		refetch: refetchAnalytics,
	} = useFunnelAnalytics(
		websiteId,
		expandedFunnelId || '',
		memoizedDateRangeForTabs,
		{
			enabled: !!expandedFunnelId,
		}
	);

	const {
		data: referrerAnalyticsData,
		isLoading: referrerAnalyticsLoading,
		error: referrerAnalyticsError,
		refetch: refetchReferrerAnalytics,
	} = useFunnelAnalyticsByReferrer(
		websiteId,
		expandedFunnelId || '',
		{
			start_date: formattedDateRangeState.startDate,
			end_date: formattedDateRangeState.endDate,
		},
		{ enabled: !!expandedFunnelId }
	);

	const autocompleteQuery = useAutocompleteData(websiteId);

	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		try {
			const promises: Promise<unknown>[] = [
				refetchFunnels(),
				autocompleteQuery.refetch(),
				refetchTrackingSetup(),
			];
			if (expandedFunnelId) {
				promises.push(refetchAnalytics(), refetchReferrerAnalytics());
			}
			await Promise.all(promises);
		} catch (error) {
			console.error('Failed to refresh funnel data:', error);
		} finally {
			setIsRefreshing(false);
		}
	}, [
		refetchFunnels,
		refetchAnalytics,
		refetchReferrerAnalytics,
		autocompleteQuery.refetch,
		refetchTrackingSetup,
		expandedFunnelId,
	]);

	const handleCreateFunnel = async (data: CreateFunnelData) => {
		try {
			await createFunnel(data);
			setIsDialogOpen(false);
			setEditingFunnel(null);
		} catch (error) {
			console.error('Failed to create funnel:', error);
		}
	};

	const handleUpdateFunnel = async (funnel: Funnel) => {
		try {
			await updateFunnel({
				funnelId: funnel.id,
				updates: {
					name: funnel.name,
					description: funnel.description || '',
					steps: funnel.steps,
					filters: funnel.filters,
				},
			});
			setIsDialogOpen(false);
			setEditingFunnel(null);
		} catch (error) {
			console.error('Failed to update funnel:', error);
		}
	};

	const handleDeleteFunnel = async (funnelId: string) => {
		try {
			await deleteFunnel(funnelId);
			if (expandedFunnelId === funnelId) {
				setExpandedFunnelId(null);
			}
			setDeletingFunnelId(null);
		} catch (error) {
			console.error('Failed to delete funnel:', error);
		}
	};

	const handleToggleFunnel = (funnelId: string) => {
		setExpandedFunnelId(expandedFunnelId === funnelId ? null : funnelId);
		setSelectedReferrer('all');
	};

	const handleReferrerChange = (referrer: string) => {
		setSelectedReferrer(referrer);
	};

	if (funnelsError) {
		return (
			<div className="mx-auto max-w-[1600px] p-3 sm:p-4 lg:p-6">
				<Card className="rounded border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
					<CardContent className="pt-6">
						<div className="flex items-center gap-2">
							<TrendDownIcon
								className="h-5 w-5 text-red-600"
								size={16}
								weight="duotone"
							/>
							<p className="font-medium text-red-600">
								Error loading funnel data
							</p>
						</div>
						<p className="mt-2 text-red-600/80 text-sm">
							{funnelsError.message}
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div
			className="mx-auto max-w-[1600px] space-y-4 p-3 sm:p-4 lg:p-6"
			ref={pageRef}
		>
			<WebsitePageHeader
				createActionLabel="Create Funnel"
				description="Track user journeys and optimize conversion drop-off points"
				hasError={!!funnelsError}
				icon={
					<FunnelIcon
						className="h-6 w-6 text-primary"
						size={16}
						weight="duotone"
					/>
				}
				isLoading={funnelsLoading}
				isRefreshing={isRefreshing}
				onCreateAction={() => {
					setEditingFunnel(null);
					setIsDialogOpen(true);
				}}
				onRefresh={handleRefresh}
				subtitle={
					funnelsLoading
						? undefined
						: `${funnels.length} funnel${funnels.length !== 1 ? 's' : ''}`
				}
				title="Conversion Funnels"
				websiteId={websiteId}
			/>

			{/* Date Range Controls - Only show if tracking is set up */}
			{isTrackingSetup && (
				<div className="mt-3 flex flex-col gap-3 rounded-lg border bg-muted/30 p-2.5">
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
					</div>
				</div>
			)}

			<Suspense fallback={<FunnelsListSkeleton />}>
				<FunnelsList
					expandedFunnelId={expandedFunnelId}
					funnels={funnels}
					isLoading={funnelsLoading}
					onCreateFunnel={() => {
						setEditingFunnel(null);
						setIsDialogOpen(true);
					}}
					onDeleteFunnel={setDeletingFunnelId}
					onEditFunnel={(funnel) => {
						setEditingFunnel(funnel);
						setIsDialogOpen(true);
					}}
					onToggleFunnel={handleToggleFunnel}
				>
					{(funnel) => {
						if (expandedFunnelId !== funnel.id) {
							return null;
						}

						return (
							<Suspense
								fallback={
									<div className="flex items-center justify-center py-8">
										<div className="relative">
											<div className="h-6 w-6 rounded-full border-2 border-muted" />
											<div className="absolute top-0 left-0 h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
										</div>
										<div className="ml-3 text-muted-foreground text-sm">
											Loading analytics...
										</div>
									</div>
								}
							>
								<div
									className="space-y-4"
									onClick={(e) => {
										e.stopPropagation();
									}}
									onKeyDown={(e) => {
										e.stopPropagation();
									}}
									role="tablist"
								>
									<FunnelAnalytics
										data={analyticsData}
										error={analyticsError as Error | null}
										isLoading={analyticsLoading}
										onRetry={refetchAnalytics}
										referrerAnalytics={
											referrerAnalyticsData?.referrer_analytics
										}
										selectedReferrer={selectedReferrer}
									/>

									<div className="border-border/50 border-t pt-4">
										<FunnelAnalyticsByReferrer
											data={referrerAnalyticsData}
											dateRange={{
												start_date: formattedDateRangeState.startDate,
												end_date: formattedDateRangeState.endDate,
											}}
											error={referrerAnalyticsError}
											funnelId={funnel.id}
											isLoading={referrerAnalyticsLoading}
											onReferrerChange={handleReferrerChange}
											websiteId={websiteId}
										/>
									</div>
								</div>
							</Suspense>
						);
					}}
				</FunnelsList>
			</Suspense>

			{isDialogOpen && (
				<Suspense fallback={null}>
					<EditFunnelDialog
						autocompleteData={autocompleteQuery.data}
						funnel={editingFunnel}
						isCreating={isCreating}
						isOpen={isDialogOpen}
						isUpdating={isUpdating}
						onClose={() => {
							setIsDialogOpen(false);
							setEditingFunnel(null);
						}}
						onCreate={handleCreateFunnel}
						onSubmit={handleUpdateFunnel}
					/>
				</Suspense>
			)}

			{!!deletingFunnelId && (
				<Suspense fallback={null}>
					<DeleteFunnelDialog
						isOpen={!!deletingFunnelId}
						onClose={() => setDeletingFunnelId(null)}
						onConfirm={() =>
							deletingFunnelId && handleDeleteFunnel(deletingFunnelId)
						}
					/>
				</Suspense>
			)}
		</div>
	);
}
