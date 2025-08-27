'use client';

import type { QueryPerformanceSummary } from '@databuddy/shared';
import {
	ArrowClockwiseIcon,
	ChartLineIcon,
	ClockIcon,
	DatabaseIcon,
	EyeIcon,
	TrendUpIcon,
	WarningIcon,
} from '@phosphor-icons/react';
import { use, useCallback, useMemo, useState } from 'react';
import { DataTable, StatCard } from '@/components/analytics';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMetricNumber } from '@/lib/formatters';
import { trpc } from '@/lib/trpc';
import {
	ResourceConsumptionChart,
	ResponseTimeChart,
} from './_components/performance-charts';
import { QueryDetailSheet } from './_components/query-detail-sheet';

interface PerformancePageProps {
	params: Promise<{ id: string }>;
}

function LoadingState() {
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<Skeleton className="h-8 w-64" />
				<Skeleton className="h-4 w-96" />
			</div>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<div
						className="rounded border border-sidebar-border bg-sidebar p-6 shadow-sm"
						key={i.toString()}
					>
						<Skeleton className="h-8 w-16" />
						<Skeleton className="mt-2 h-4 w-24" />
					</div>
				))}
			</div>
			<div className="grid gap-6 lg:grid-cols-2">
				{Array.from({ length: 4 }).map((_, cardIndex) => (
					<div
						className="rounded border border-sidebar-border bg-sidebar shadow-sm"
						key={cardIndex.toString()}
					>
						<div className="border-sidebar-border border-b px-4 py-3">
							<Skeleton className="h-6 w-48" />
						</div>
						<div className="p-4">
							<Skeleton className="h-64 w-full" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function ExtensionNotEnabledState({ connectionId }: { connectionId: string }) {
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<div className="flex items-center gap-2">
					<ChartLineIcon
						className="h-6 w-6 text-muted-foreground"
						weight="duotone"
					/>
					<h1 className="font-bold text-2xl">Query Performance</h1>
				</div>
				<p className="text-muted-foreground text-sm">
					Monitor and analyze database query performance with detailed metrics
					and visualizations
				</p>
			</div>

			<Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
				<WarningIcon className="h-4 w-4 text-amber-600" />
				<AlertDescription className="text-amber-800 dark:text-amber-200">
					<div className="space-y-3">
						<div className="space-y-1">
							<p className="font-medium">
								pg_stat_statements Extension Required
							</p>
							<p className="text-sm">
								The pg_stat_statements extension is required to view query
								performance data. This extension tracks execution statistics for
								all SQL statements.
							</p>
						</div>
						<Button
							onClick={() => {
								window.location.href = `/observability/database/${connectionId}/plugins`;
							}}
							size="sm"
							variant="outline"
						>
							Install Extension
						</Button>
					</div>
				</AlertDescription>
			</Alert>
		</div>
	);
}

function ResetStatsDialog({
	open,
	onOpenChange,
	connectionId,
	onSuccess,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	connectionId: string;
	onSuccess: () => void;
}) {
	const resetMutation = trpc.performance.resetStats.useMutation({
		onSuccess: () => {
			onSuccess();
			onOpenChange(false);
		},
	});

	const handleReset = () => {
		resetMutation.mutate({ id: connectionId });
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Reset Performance Statistics</DialogTitle>
					<DialogDescription>
						This will clear all query performance statistics and start
						collecting fresh data. This action cannot be undone.
					</DialogDescription>
				</DialogHeader>
				{resetMutation.error && (
					<Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20">
						<WarningIcon className="h-4 w-4 text-red-600" />
						<AlertDescription className="text-red-800 dark:text-red-200">
							{resetMutation.error.message}
						</AlertDescription>
					</Alert>
				)}
				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} variant="outline">
						Cancel
					</Button>
					<Button
						disabled={resetMutation.isPending}
						onClick={handleReset}
						variant="destructive"
					>
						{resetMutation.isPending ? 'Resetting...' : 'Reset Statistics'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

const formatTime = (ms: number): string => {
	if (ms < 1) {
		return `${(ms * 1000).toFixed(0)}μs`;
	}
	if (ms < 1000) {
		return `${ms.toFixed(1)}ms`;
	}
	return `${(ms / 1000).toFixed(2)}s`;
};

interface CellInfo {
	getValue: () => unknown;
	row: { original: QueryPerformanceSummary & { name: string } };
}

const createQueryColumns = () => [
	{
		id: 'query',
		accessorKey: 'query',
		header: 'Query',
		cell: (info: CellInfo) => {
			const query = info.getValue() as string;
			const cleanQuery = query
				.replace(/--.*$/gm, '')
				.replace(/\/\*[\s\S]*?\*\//g, '')
				.trim();
			const displayQuery =
				cleanQuery.length > 60 ? `${cleanQuery.slice(0, 60)}...` : cleanQuery;
			return (
				<div className="max-w-sm">
					<div className="font-mono text-sm" title={cleanQuery}>
						{displayQuery}
					</div>
				</div>
			);
		},
	},
	{
		id: 'calls',
		accessorKey: 'calls',
		header: 'Calls',
		cell: (info: CellInfo) => {
			const calls = info.getValue() as number;
			return <div>{calls.toLocaleString()}</div>;
		},
	},
	{
		id: 'mean_exec_time',
		accessorKey: 'mean_exec_time',
		header: 'Avg Time',
		cell: (info: CellInfo) => {
			const time = info.getValue() as number;
			return <div>{formatTime(time)}</div>;
		},
	},
	{
		id: 'cache_hit_ratio',
		accessorKey: 'cache_hit_ratio',
		header: 'Cache Hit',
		cell: (info: CellInfo) => {
			const ratio = info.getValue() as number;
			return <div>{ratio.toFixed(1)}%</div>;
		},
	},
];

export default function PerformancePage({ params }: PerformancePageProps) {
	const [resetDialog, setResetDialog] = useState(false);
	const [success, setSuccess] = useState<string | null>(null);
	const [selectedQuery, setSelectedQuery] = useState<
		(QueryPerformanceSummary & { name: string }) | null
	>(null);
	const [sheetOpen, setSheetOpen] = useState(false);

	const resolvedParams = use(params);
	const connectionId = resolvedParams.id;

	const utils = trpc.useUtils();

	const { data: extensionStatus, isLoading: extensionLoading } =
		trpc.performance.checkExtensionStatus.useQuery({ id: connectionId });

	const { data: metrics, isLoading: metricsLoading } =
		trpc.performance.getMetrics.useQuery(
			{ id: connectionId },
			{ enabled: extensionStatus?.enabled === true }
		);

	const { data: userInfo } = trpc.performance.getUserInfo.useQuery(
		{ id: connectionId },
		{ enabled: extensionStatus?.enabled === true }
	);

	const handleSuccess = (message: string) => {
		utils.performance.getMetrics.invalidate({ id: connectionId });
		setSuccess(message);
		setTimeout(() => setSuccess(null), 5000);
	};

	const transformQueryData = useCallback(
		(queries: QueryPerformanceSummary[]) => {
			return queries.map((query) => ({
				...query,
				name: query.query, // Use query text as name for DataTable compatibility
			}));
		},
		[]
	);

	const handleQueryClick = useCallback(
		(query: QueryPerformanceSummary & { name: string }) => {
			setSelectedQuery(query);
			setSheetOpen(true);
		},
		[]
	);

	const queryTabs = useMemo(
		() => [
			{
				id: 'all_queries',
				label: 'All Queries',
				data: transformQueryData(
					[
						...(metrics?.top_queries_by_time.slice(0, 10) || []),
						...(metrics?.top_queries_by_calls.slice(0, 5) || []),
						...(metrics?.slowest_queries.slice(0, 5) || []),
					]
						.filter(
							(query, index, self) =>
								self.findIndex((q) => q.queryid === query.queryid) === index
						)
						.slice(0, 15)
				),
				columns: createQueryColumns(),
			} as const,
		],
		[metrics, transformQueryData]
	);

	if (extensionLoading) {
		return <LoadingState />;
	}

	if (!extensionStatus?.enabled) {
		return <ExtensionNotEnabledState connectionId={connectionId} />;
	}

	if (metricsLoading) {
		return <LoadingState />;
	}

	if (!metrics) {
		return (
			<div className="space-y-6">
				<Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20">
					<WarningIcon className="h-4 w-4 text-red-600" />
					<AlertDescription className="text-red-800 dark:text-red-200">
						Failed to load performance metrics. Please try again.
					</AlertDescription>
				</Alert>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-center gap-2">
						<ChartLineIcon className="h-6 w-6" weight="duotone" />
						<h1 className="font-bold text-2xl">Performance Analytics</h1>
					</div>
					<p className="text-muted-foreground text-sm">
						Real-time query performance monitoring and optimization insights
					</p>
				</div>
				<Button onClick={() => setResetDialog(true)} variant="outline">
					<ArrowClockwiseIcon className="mr-2 h-4 w-4" />
					Reset Stats
				</Button>
			</div>

			{/* Success Banner */}
			{success && (
				<Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20">
					<DatabaseIcon className="h-4 w-4 text-green-600" />
					<AlertDescription className="flex items-center justify-between">
						<span className="text-green-800 dark:text-green-200">
							{success}
						</span>
						<Button onClick={() => setSuccess(null)} size="sm" variant="ghost">
							Dismiss
						</Button>
					</AlertDescription>
				</Alert>
			)}

			{/* Performance Health Summary */}
			{metrics.p99_exec_time > 1000 && (
				<Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20">
					<WarningIcon className="h-4 w-4 text-red-600" />
					<AlertDescription className="text-red-800 dark:text-red-200">
						<strong>Performance Issue Detected:</strong> P99 response time is{' '}
						{metrics.p99_exec_time.toFixed(0)}ms. Consider optimizing slow
						queries or adding database indexes.
					</AlertDescription>
				</Alert>
			)}

			{/* Query Text Permission Info */}
			{metrics.top_queries_by_time.some((q) =>
				q.query.includes('Query ID:')
			) && (
				<Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20">
					<DatabaseIcon className="h-4 w-4 text-blue-600" />
					<AlertDescription className="text-blue-800 dark:text-blue-200">
						<div className="space-y-2">
							<div>
								<strong>Limited Query Visibility:</strong> Query text is hidden
								due to database permissions. Performance metrics are still
								accurate.
							</div>
							{userInfo && (
								<div className="space-y-1 text-xs">
									<div>
										<strong>Current User:</strong> {userInfo.username}
									</div>
									<div>
										<strong>Has pg_read_all_stats:</strong>{' '}
										{userInfo.hasReadAllStats ? '✅ Yes' : '❌ No'}
									</div>
									{userInfo.roles.length > 0 && (
										<div>
											<strong>Roles:</strong> {userInfo.roles.join(', ')}
										</div>
									)}
								</div>
							)}
							<div>
								<strong>To fix:</strong> Run as superuser:
								<code className="mx-1 rounded bg-blue-100 px-1 text-xs dark:bg-blue-900">
									GRANT pg_read_all_stats TO {userInfo?.username || 'your_user'}
								</code>
								Then <strong>reconnect</strong> to refresh permissions.
							</div>
						</div>
					</AlertDescription>
				</Alert>
			)}

			{/* Key Performance Metrics */}
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<StatCard
					description="99th percentile response time"
					icon={ClockIcon}
					title="P99 RESPONSE"
					value={`${metrics.p99_exec_time.toFixed(0)}ms`}
					variant={
						metrics.p99_exec_time > 1000
							? 'danger'
							: metrics.p99_exec_time > 500
								? 'warning'
								: 'success'
					}
				/>
				<StatCard
					description="Median query response time"
					icon={TrendUpIcon}
					title="P50 RESPONSE"
					value={`${metrics.p50_exec_time.toFixed(0)}ms`}
					variant={metrics.p50_exec_time > 100 ? 'warning' : 'success'}
				/>
				<StatCard
					description="Buffer cache effectiveness"
					icon={EyeIcon}
					title="CACHE HIT RATE"
					value={`${metrics.cache_hit_ratio.toFixed(1)}%`}
					variant={
						metrics.cache_hit_ratio > 95
							? 'success'
							: metrics.cache_hit_ratio > 85
								? 'warning'
								: 'danger'
					}
				/>
				<StatCard
					description={`${formatMetricNumber(metrics.total_queries)} unique queries`}
					icon={DatabaseIcon}
					title="TOTAL CALLS"
					value={formatMetricNumber(metrics.total_calls)}
				/>
			</div>

			{/* Performance Charts */}
			<div className="grid gap-6 lg:grid-cols-2">
				<ResourceConsumptionChart
					onQueryClick={(query) => {
						const queryWithName = { ...query, name: query.query };
						handleQueryClick(queryWithName);
					}}
					topQueriesByTime={metrics.top_queries_by_time}
				/>
				<ResponseTimeChart
					onQueryClick={(query) => {
						const queryWithName = { ...query, name: query.query };
						handleQueryClick(queryWithName);
					}}
					slowestQueries={metrics.slowest_queries}
				/>
			</div>

			{/* Query Analysis Table */}
			<div className="rounded-xl border bg-card shadow-sm">
				<div className="border-b px-6 py-4">
					<h2 className="font-semibold text-lg">Query Analysis</h2>
					<p className="text-muted-foreground text-sm">
						Click on any query to view detailed performance analysis
					</p>
				</div>
				<div className="p-0">
					<DataTable
						emptyMessage="No query performance data available"
						initialPageSize={10}
						isLoading={metricsLoading}
						minHeight={400}
						onRowClick={(_, value) => {
							const allQueries = [
								...transformQueryData(metrics?.top_queries_by_time || []),
								...transformQueryData(metrics?.top_queries_by_calls || []),
								...transformQueryData(metrics?.slowest_queries || []),
							];
							const query = allQueries.find(
								(q) => q.query === value || q.name === value
							);
							if (query) {
								handleQueryClick(query);
							}
						}}
						showSearch={true}
						tabs={queryTabs}
						title=""
					/>
				</div>
			</div>

			{/* Query Detail Sheet */}
			<QueryDetailSheet
				isOpen={sheetOpen}
				onClose={() => setSheetOpen(false)}
				query={selectedQuery}
			/>

			{/* Reset Dialog */}
			<ResetStatsDialog
				connectionId={connectionId}
				onOpenChange={setResetDialog}
				onSuccess={() =>
					handleSuccess('Performance statistics reset successfully')
				}
				open={resetDialog}
			/>
		</div>
	);
}
