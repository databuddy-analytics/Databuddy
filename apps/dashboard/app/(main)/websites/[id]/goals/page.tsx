'use client';

import { TargetIcon } from '@phosphor-icons/react';
import { format, subDays, subHours } from 'date-fns';
import { useAtom } from 'jotai';
import { useParams } from 'next/navigation';
import {
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import type { DateRange as DayPickerRange } from 'react-day-picker';
import { DateRangePicker } from '@/components/date-range-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAutocompleteData } from '@/hooks/use-funnels';
import {
	type CreateGoalData,
	type Goal,
	useBulkGoalAnalytics,
	useGoals,
} from '@/hooks/use-goals';
import { useWebsite } from '@/hooks/use-websites';
import { trpc } from '@/lib/trpc';
import {
	dateRangeAtom,
	formattedDateRangeAtom,
	setDateRangeAndAdjustGranularityAtom,
	timeGranularityAtom,
} from '@/stores/jotai/filterAtoms';
import { WebsitePageHeader } from '../_components/website-page-header';
import { DeleteGoalDialog } from './_components/delete-goal-dialog';
import { EditGoalDialog } from './_components/edit-goal-dialog';
import { GoalsList } from './_components/goals-list';

const GoalsListSkeleton = () => (
	<div className="space-y-3">
		{[...new Array(3)].map((_, i) => (
			<Card className="animate-pulse rounded-xl" key={`goal-skeleton-${i + 1}`}>
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

export default function GoalsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
	const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);

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

	const [currentDateRange] = useAtom(dateRangeAtom);
	const [currentGranularity] = useAtom(timeGranularityAtom);
	const [, setDateRangeAction] = useAtom(setDateRangeAndAdjustGranularityAtom);
	const [formattedDateRangeState] = useAtom(formattedDateRangeAtom);

	const { data: trackingSetupData, isLoading: isTrackingSetupLoading } =
		trpc.websites.isTrackingSetup.useQuery(
			{ websiteId },
			{ enabled: !!websiteId }
		);

	const isTrackingSetup = useMemo(() => {
		if (isTrackingSetupLoading) {
			return null;
		}
		return trackingSetupData?.tracking_setup ?? false;
	}, [isTrackingSetupLoading, trackingSetupData?.tracking_setup]);

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
				? subHours(now, range.hours)
				: subDays(now, range.days || 7);
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

	const { data: websiteData } = useWebsite(websiteId);

	const {
		data: goals,
		isLoading: goalsLoading,
		error: goalsError,
		refetch: refetchGoals,
		createGoal,
		updateGoal,
		deleteGoal,
		isCreating,
		isUpdating,
	} = useGoals(websiteId);

	const goalIds = useMemo(() => goals.map((goal) => goal.id), [goals]);

	const {
		data: goalAnalytics,
		isLoading: analyticsLoading,
		refetch: refetchAnalytics,
	} = useBulkGoalAnalytics(websiteId, goalIds, memoizedDateRangeForTabs);

	const autocompleteQuery = useAutocompleteData(websiteId);

	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		try {
			await Promise.all([refetchGoals(), autocompleteQuery.refetch()]);
			if (goalIds.length > 0) {
				refetchAnalytics();
			}
		} catch (error) {
			console.error('Failed to refresh goal data:', error);
		} finally {
			setIsRefreshing(false);
		}
	}, [
		refetchGoals,
		refetchAnalytics,
		goalIds.length,
		autocompleteQuery.refetch,
	]);

	const handleSaveGoal = async (
		data: Goal | Omit<CreateGoalData, 'websiteId'>
	) => {
		try {
			if ('id' in data) {
				await updateGoal({
					goalId: data.id,
					updates: {
						name: data.name,
						description: data.description || undefined,
						type: data.type,
						target: data.target,
						filters: data.filters,
					},
				});
			} else {
				await createGoal({
					...data,
					websiteId,
				});
			}
			setIsDialogOpen(false);
			setEditingGoal(null);
		} catch (error) {
			console.error('Failed to save goal:', error);
		}
	};

	const handleDeleteGoal = async (goalId: string) => {
		try {
			await deleteGoal(goalId);
			setDeletingGoalId(null);
		} catch (error) {
			console.error('Failed to delete goal:', error);
		}
	};

	if (goalsError) {
		return (
			<div className="mx-auto max-w-[1600px] p-3 sm:p-4 lg:p-6">
				<Card className="rounded border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
					<CardContent className="pt-6">
						<div className="flex items-center gap-2">
							<TargetIcon
								className="h-5 w-5 text-red-600"
								size={16}
								weight="duotone"
							/>
							<p className="font-medium text-red-600">
								Error loading goal data
							</p>
						</div>
						<p className="mt-2 text-red-600/80 text-sm">{goalsError.message}</p>
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
				createActionLabel="Create Goal"
				description="Track key conversions and measure success"
				hasError={!!goalsError}
				icon={
					<TargetIcon
						className="h-6 w-6 text-primary"
						size={16}
						weight="duotone"
					/>
				}
				isLoading={goalsLoading}
				isRefreshing={isRefreshing}
				onCreateAction={() => {
					setEditingGoal(null);
					setIsDialogOpen(true);
				}}
				onRefresh={handleRefresh}
				subtitle={
					goalsLoading
						? undefined
						: `${goals.length} active goal${goals.length !== 1 ? 's' : ''}`
				}
				title="Goals"
				websiteId={websiteId}
				websiteName={websiteData?.name || undefined}
			/>

			{isTrackingSetup && (
				<div className="mt-3 flex flex-col gap-3 rounded-lg border bg-muted/30 p-2.5">
					<div className="flex items-center gap-2 overflow-x-auto rounded-md border bg-background p-1 shadow-sm">
						{quickRanges.map((range) => {
							const now = new Date();
							const start = range.hours
								? subHours(now, range.hours)
								: subDays(now, range.days || 7);
							const dayPickerCurrentRange = dayPickerSelectedRange;
							const isActive =
								dayPickerCurrentRange?.from &&
								dayPickerCurrentRange?.to &&
								format(dayPickerCurrentRange.from, 'yyyy-MM-dd') ===
									format(start, 'yyyy-MM-dd') &&
								format(dayPickerCurrentRange.to, 'yyyy-MM-dd') ===
									format(now, 'yyyy-MM-dd');

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

			{isVisible && (
				<Suspense fallback={<GoalsListSkeleton />}>
					<GoalsList
						analyticsLoading={analyticsLoading}
						goalAnalytics={goalAnalytics}
						goals={goals}
						isLoading={goalsLoading}
						onCreateGoal={() => {
							setEditingGoal(null);
							setIsDialogOpen(true);
						}}
						onDeleteGoal={(goalId) => setDeletingGoalId(goalId)}
						onEditGoal={(goal) => {
							setEditingGoal(goal);
							setIsDialogOpen(true);
						}}
					/>
				</Suspense>
			)}

			{isDialogOpen && (
				<Suspense>
					<EditGoalDialog
						autocompleteData={autocompleteQuery.data}
						goal={editingGoal}
						isOpen={isDialogOpen}
						isSaving={isCreating || isUpdating}
						onClose={() => {
							setIsDialogOpen(false);
							setEditingGoal(null);
						}}
						onSave={handleSaveGoal}
					/>
				</Suspense>
			)}

			{deletingGoalId && (
				<Suspense>
					<DeleteGoalDialog
						isOpen={!!deletingGoalId}
						onClose={() => setDeletingGoalId(null)}
						onConfirm={() => deletingGoalId && handleDeleteGoal(deletingGoalId)}
					/>
				</Suspense>
			)}
		</div>
	);
}
