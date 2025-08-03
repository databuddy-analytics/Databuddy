'use client';

import { Path, Target } from '@phosphor-icons/react';
import { useAtom } from 'jotai';
import {
	ArrowRight,
	ChevronRight,
	MousePointer,
	RefreshCw,
	Timer,
	TrendingDown,
	TrendingUp,
	Users,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { DataTable } from '@/components/analytics/data-table';
import { StatCard } from '@/components/analytics/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ClosableAlert } from '@/components/ui/closable-alert';
import { useJourneyAnalytics } from '@/hooks/use-dynamic-query';
import { useWebsite } from '@/hooks/use-websites';
import {
	dateRangeAtom,
	formattedDateRangeAtom,
	timeGranularityAtom,
} from '@/stores/jotai/filterAtoms';
import { WebsitePageHeader } from '../_components/website-page-header';

export default function JourneysPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const [isRefreshing, setIsRefreshing] = useState(false);

	const [_currentDateRange] = useAtom(dateRangeAtom);
	const [currentGranularity] = useAtom(timeGranularityAtom);
	const [formattedDateRangeState] = useAtom(formattedDateRangeAtom);

	const memoizedDateRangeForTabs = useMemo(
		() => ({
			start_date: formattedDateRangeState.startDate,
			end_date: formattedDateRangeState.endDate,
			granularity: currentGranularity,
		}),
		[formattedDateRangeState, currentGranularity]
	);

	const { data: websiteData } = useWebsite(websiteId);

	// Use the new simplified journey analytics hook
	const {
		journeyData,
		summaryStats,
		isLoading: isBatchLoading,
		error: batchError,
		refetch: refetchBatch,
		debugInfo,
		hasJourneyData,
		hasPathData,
		hasDropoffData,
		hasEntryPointData,
	} = useJourneyAnalytics(websiteId, memoizedDateRangeForTabs);

	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		try {
			await refetchBatch();
		} catch (error) {
			console.error('Failed to refresh journey data:', error);
		} finally {
			setIsRefreshing(false);
		}
	}, [refetchBatch]);

	// Helper function to create better page display
	const formatPagePath = (url: string) => {
		if (!url) {
			return '/';
		}
		try {
			let path = url.startsWith('http') ? new URL(url).pathname : url;
			if (!path.startsWith('/')) {
				path = `/${path}`;
			}
			return path;
		} catch {
			return url.startsWith('/') ? url : `/${url}`;
		}
	};

	// Helper to get page name from path
	const getPageDisplayName = (path: string) => {
		const cleanPath = formatPagePath(path);
		if (cleanPath === '/') {
			return 'Home';
		}
		return cleanPath.split('/').filter(Boolean).join(' › ') || 'Home';
	};

	// Enhanced page column with better design - simplified
	const createEnhancedPageColumn = (header: string, accessorKey: string) => ({
		id: accessorKey,
		accessorKey,
		header,
		cell: (info: any) => {
			const url = info.getValue() as string;
			const displayName = getPageDisplayName(url);

			return (
				<div className="min-w-0">
					<div
						className="truncate font-medium text-foreground text-sm"
						title={displayName}
					>
						{displayName}
					</div>
					<div
						className="truncate font-mono text-muted-foreground text-xs"
						title={formatPagePath(url)}
					>
						{formatPagePath(url)}
					</div>
				</div>
			);
		},
		minSize: 200,
		size: 250,
	});

	// Journey Flow Columns - clean and sortable with visual elements
	const journeyFlowColumns = useMemo(
		() => [
			{
				...createEnhancedPageColumn('From Page', 'from_page'),
				size: 200,
			},
			{
				id: 'flow_indicator',
				header: '',
				cell: ({ row }: any) => {
					const transitions = row.original.transitions;
					return (
						<div>
							<div>
								<ArrowRight className="h-4 w-4 text-blue-500" />
								<span className="font-mono text-muted-foreground text-xs">
									{transitions.toLocaleString()}
								</span>
							</div>
						</div>
					);
				},
				enableSorting: false,
				size: 80,
			},
			{
				...createEnhancedPageColumn('To Page', 'to_page'),
				size: 200,
			},
			{
				id: 'users',
				accessorKey: 'users',
				header: 'Users',
				cell: (info: any) => (
					<div>
						<div>
							<Users className="h-4 w-4 text-muted-foreground" />
							<span className="font-medium">
								{(info.getValue() as number)?.toLocaleString()}
							</span>
						</div>
					</div>
				),
			},
			{
				id: 'sessions',
				accessorKey: 'sessions',
				header: 'Sessions',
				cell: (info: any) => (
					<div>
						<div className="font-medium">
							{(info.getValue() as number)?.toLocaleString()}
						</div>
					</div>
				),
			},
			{
				id: 'avg_step_in_journey',
				accessorKey: 'avg_step_in_journey',
				header: 'Journey Step',
				cell: (info: any) => (
					<div>
						<Badge className="font-mono text-xs" variant="outline">
							Step {info.getValue()}
						</Badge>
					</div>
				),
			},
		],
		[createEnhancedPageColumn]
	);

	// Journey Paths - with better visualization
	const journeyPathsColumns = useMemo(
		() => [
			{
				id: 'journey_path',
				accessorKey: 'name',
				header: 'Journey Path',
				cell: (info: any) => {
					const pathString = info.getValue() as string;
					const pages = pathString.split(' → ').map((p) => p.trim());

					return (
						<div className="min-w-0 space-y-2">
							<div className="flex flex-wrap items-center gap-1">
								{pages.slice(0, 3).map((page, index) => (
									<div className="flex items-center gap-1" key={index}>
										<div
											className="max-w-[100px] truncate rounded border border-blue-200 bg-blue-50 px-2 py-1 font-medium text-blue-700 text-xs dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
											title={page}
										>
											{getPageDisplayName(page)}
										</div>
										{index < Math.min(pages.length - 1, 2) && (
											<ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
										)}
									</div>
								))}
								{pages.length > 3 && (
									<span className="text-muted-foreground text-xs">
										+{pages.length - 3} more
									</span>
								)}
							</div>
							<div className="flex items-center gap-2 text-muted-foreground text-xs">
								<Target className="h-3 w-3" />
								<span>{pages.length} pages</span>
							</div>
						</div>
					);
				},
				size: 300,
			},
			{
				id: 'frequency',
				accessorKey: 'frequency',
				header: 'Frequency',
				cell: (info: any) => (
					<div>
						<div className="font-bold text-blue-600">
							{(info.getValue() as number)?.toLocaleString()}
						</div>
						<div className="text-muted-foreground text-xs">occurrences</div>
					</div>
				),
			},
			{
				id: 'unique_users',
				accessorKey: 'unique_users',
				header: 'Users',
				cell: (info: any) => (
					<div>
						<div className="font-medium text-green-600">
							{(info.getValue() as number)?.toLocaleString()}
						</div>
						<div className="text-muted-foreground text-xs">unique</div>
					</div>
				),
			},
			{
				id: 'avg_pages_in_path',
				accessorKey: 'avg_pages_in_path',
				header: 'Avg Pages',
				cell: (info: any) => (
					<div>
						<div>
							<span className="font-medium">{info.getValue()}</span>
							<span className="text-muted-foreground text-xs">pages</span>
						</div>
					</div>
				),
			},
			{
				id: 'avg_duration_minutes',
				accessorKey: 'avg_duration_minutes',
				header: 'Duration',
				cell: (info: any) => (
					<div>
						<div className="flex justify-center gap-1">
							<Timer className="h-3 w-3 text-muted-foreground" />
							<span className="font-medium">{info.getValue()}m</span>
						</div>
					</div>
				),
			},
		],
		[getPageDisplayName]
	);

	// Drop-offs - with visual indicators
	const dropoffColumns = useMemo(
		() => [
			{
				...createEnhancedPageColumn('Page', 'name'),
				size: 200,
			},
			{
				id: 'total_visits',
				accessorKey: 'total_visits',
				header: 'Total Visits',
				cell: (info: any) => (
					<div>
						<div className="font-medium">
							{(info.getValue() as number)?.toLocaleString()}
						</div>
						<div className="text-muted-foreground text-xs">visits</div>
					</div>
				),
			},
			{
				id: 'exits',
				accessorKey: 'exits',
				header: 'Exits',
				cell: (info: any) => (
					<div>
						<div>
							<div className="h-2 w-2 rounded-full bg-red-500" />
							<span className="font-medium text-red-600">
								{(info.getValue() as number)?.toLocaleString()}
							</span>
						</div>
					</div>
				),
			},
			{
				id: 'exit_rate',
				accessorKey: 'exit_rate',
				header: 'Exit Rate',
				cell: (info: any) => {
					const rate = info.getValue() as number;
					return (
						<div>
							<div>
								<Badge
									variant={
										rate > 70
											? 'destructive'
											: rate > 40
												? 'secondary'
												: 'default'
									}
								>
									{rate}%
								</Badge>
								{rate > 70 && <TrendingDown className="h-3 w-3 text-red-500" />}
							</div>
						</div>
					);
				},
			},
			{
				id: 'continuations',
				accessorKey: 'continuations',
				header: 'Continuations',
				cell: (info: any) => (
					<div>
						<div>
							<div className="h-2 w-2 rounded-full bg-green-500" />
							<span className="font-medium text-green-600">
								{(info.getValue() as number)?.toLocaleString()}
							</span>
						</div>
					</div>
				),
			},
			{
				id: 'continuation_rate',
				accessorKey: 'continuation_rate',
				header: 'Continue Rate',
				cell: (info: any) => {
					const rate = info.getValue() as number;
					return (
						<div>
							<div>
								<Badge
									variant={
										rate > 60
											? 'default'
											: rate > 30
												? 'secondary'
												: 'destructive'
									}
								>
									{rate}%
								</Badge>
								{rate > 60 && <TrendingUp className="h-3 w-3 text-green-500" />}
							</div>
						</div>
					);
				},
			},
		],
		[createEnhancedPageColumn]
	);

	// Entry Points - with visual enhancements
	const entryPointsColumns = useMemo(
		() => [
			{
				...createEnhancedPageColumn('Entry Page', 'name'),
				size: 200,
			},
			{
				id: 'entries',
				accessorKey: 'entries',
				header: 'Entries',
				cell: (info: any) => (
					<div>
						<div className="font-bold text-blue-600">
							{(info.getValue() as number)?.toLocaleString()}
						</div>
						<div className="text-muted-foreground text-xs">entries</div>
					</div>
				),
			},
			{
				id: 'users',
				accessorKey: 'users',
				header: 'Users',
				cell: (info: any) => (
					<div>
						<div>
							<Users className="h-3 w-3 text-muted-foreground" />
							<span className="font-medium">
								{(info.getValue() as number)?.toLocaleString()}
							</span>
						</div>
					</div>
				),
			},
			{
				id: 'sessions',
				accessorKey: 'sessions',
				header: 'Sessions',
				cell: (info: any) => (
					<div>
						<div className="font-medium text-purple-600">
							{(info.getValue() as number)?.toLocaleString()}
						</div>
						<div className="text-muted-foreground text-xs">sessions</div>
					</div>
				),
			},
			{
				id: 'bounce_rate',
				accessorKey: 'bounce_rate',
				header: 'Bounce Rate',
				cell: (info: any) => {
					const rate = info.getValue() as number;
					const safeRate =
						typeof rate === 'number' && !Number.isNaN(rate) ? rate : 0;
					return (
						<div>
							<Badge
								variant={
									safeRate > 70
										? 'destructive'
										: safeRate > 40
											? 'secondary'
											: 'default'
								}
							>
								{safeRate.toFixed(1)}%
							</Badge>
						</div>
					);
				},
			},
			{
				id: 'avg_pages_per_session',
				accessorKey: 'avg_pages_per_session',
				header: 'Pages/Session',
				cell: (info: any) => {
					const value = info.getValue() as number;
					const safeValue =
						typeof value === 'number' && !Number.isNaN(value) ? value : 0;
					return (
						<div>
							<div>
								<Target className="h-3 w-3 text-muted-foreground" />
								<span className="font-medium">{safeValue.toFixed(1)}</span>
							</div>
						</div>
					);
				},
			},
		],
		[createEnhancedPageColumn]
	);

	// Create tabs structure for DataTable with better organization
	const tabs = useMemo(
		() =>
			[
				{
					id: 'flow',
					label: 'Page Flow',
					description:
						'Track direct page-to-page navigation patterns and user flow directions',
					data: journeyData.transitions.map((item, i) => ({
						...item,
						_uniqueKey: `flow-${i}`,
					})) as any,
					columns: journeyFlowColumns as any,
				},
				{
					id: 'paths',
					label: 'Journey Paths',
					description:
						'View complete sequences of pages users visit in order (up to 5 pages)',
					data: journeyData.paths.map((item, i) => ({
						...item,
						_uniqueKey: `path-${i}`,
					})) as any,
					columns: journeyPathsColumns as any,
				},
				{
					id: 'dropoffs',
					label: 'Drop-off Analysis',
					description:
						'Find pages with high exit rates where users leave your website',
					data: journeyData.dropoffs.map((item, i) => ({
						...item,
						_uniqueKey: `dropoff-${i}`,
					})) as any,
					columns: dropoffColumns as any,
				},
				{
					id: 'entries',
					label: 'Entry Points',
					description:
						'Analyze landing pages and their bounce rates (first page = exit)',
					data: journeyData.entryPoints.map((item, i) => ({
						...item,
						_uniqueKey: `entry-${i}`,
					})) as any,
					columns: entryPointsColumns as any,
				},
			] as any,
		[
			journeyData,
			journeyFlowColumns,
			journeyPathsColumns,
			dropoffColumns,
			entryPointsColumns,
		]
	);

	const isLoading = isBatchLoading || isRefreshing;

	if (batchError) {
		return (
			<div className="mx-auto max-w-[1600px] p-3 sm:p-4 lg:p-6">
				<Card className="rounded-xl border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
					<CardContent className="pt-6">
						<div className="flex flex-col items-center space-y-3 text-center">
							<div className="rounded-full border border-destructive/20 bg-destructive/10 p-3">
								<TrendingDown className="h-6 w-6 text-destructive" />
							</div>
							<div>
								<h4 className="font-semibold text-destructive">
									Error loading journey data
								</h4>
								<p className="mt-1 text-destructive/80 text-sm">
									{batchError.message}
								</p>
							</div>
							<Button
								className="gap-2 rounded-lg"
								onClick={handleRefresh}
								size="sm"
								variant="outline"
							>
								<RefreshCw className="h-4 w-4" />
								Retry
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-[1600px] space-y-6 p-3 sm:p-4 lg:p-6">
			{/* Header */}
			<WebsitePageHeader
				description="Analyze user navigation patterns and identify optimization opportunities"
				icon={<Path className="h-6 w-6 text-primary" weight="duotone" />}
				isRefreshing={isRefreshing}
				onRefresh={handleRefresh}
				title="User Journeys"
				websiteId={websiteId}
				websiteName={websiteData?.name || undefined}
			/>

			{/* Enhanced Summary Stats */}
			<div className="space-y-4">
				<div className="flex items-center gap-2">
					<MousePointer className="h-5 w-5 text-primary" />
					<h2 className="font-semibold text-foreground text-lg">
						Journey Overview
					</h2>
				</div>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<StatCard
						description="Times users navigated from one page to another"
						icon={MousePointer}
						isLoading={isLoading}
						title="Total Page Transitions"
						value={summaryStats.totalTransitions.toLocaleString()}
					/>
					<StatCard
						description="Users who visited more than one page (excludes bounces)"
						icon={Users}
						isLoading={isLoading}
						title="Multi-Page Users"
						value={summaryStats.totalUsers.toLocaleString()}
					/>
					<StatCard
						description="Average step number when users make page transitions"
						icon={ChevronRight}
						isLoading={isLoading}
						title="Avg Journey Position"
						value={summaryStats.avgStepInJourney.toString()}
					/>
					<StatCard
						description="Average % of visitors who leave from each page (not bounces)"
						icon={TrendingDown}
						isLoading={isLoading}
						title="Avg Page Exit Rate"
						value={`${summaryStats.avgExitRate}%`}
					/>
				</div>
			</div>

			{/* Quick Insights Cards */}
			{!isLoading &&
				(hasJourneyData ||
					hasPathData ||
					hasDropoffData ||
					hasEntryPointData) && (
					<div className="space-y-4">
						<div className="space-y-3">
							{/* Drop-off Alert */}
							{journeyData.dropoffs.length > 0 &&
								journeyData.dropoffs[0].exit_rate > 70 && (
									<ClosableAlert
										description={`The page "${getPageDisplayName(journeyData.dropoffs[0].name)}" has an unusually high exit rate. Many users leave your site from here instead of continuing their journey.`}
										icon={TrendingDown}
										id={`high-dropoff-${journeyData.dropoffs[0].name}`}
										title="High Drop-off Page Alert"
										variant="error"
									>
										<div className="space-y-2">
											<div className="flex items-center justify-between">
												<span className="font-medium text-xs">
													Page:{' '}
													{getPageDisplayName(journeyData.dropoffs[0].name)}
												</span>
												<Badge className="text-xs" variant="destructive">
													{journeyData.dropoffs[0].exit_rate}% exit rate
												</Badge>
											</div>
											<div className="flex items-center justify-between text-xs">
												<span className="text-muted-foreground">
													{journeyData.dropoffs[0].exits.toLocaleString()} exits
												</span>
												<span className="text-muted-foreground">
													{journeyData.dropoffs[0].total_visits.toLocaleString()}{' '}
													total visits
												</span>
											</div>
										</div>
									</ClosableAlert>
								)}
						</div>
					</div>
				)}

			<div className="space-y-4">
				<DataTable
					description="Detailed breakdown of user navigation patterns"
					initialPageSize={15}
					isLoading={isLoading}
					minHeight={400}
					tabs={tabs}
					title="Journey Analysis"
				/>
			</div>
		</div>
	);
}
