'use client';

import type { QueryPerformanceSummary } from '@databuddy/shared';
import { DatabaseIcon } from '@phosphor-icons/react';
import { useQueryState } from 'nuqs';
import { use, useCallback, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/lib/trpc';
import { QueryDetailSheet } from '../performance/_components/query-detail-sheet';
import { QueryRow } from './_components/query-row';

interface QueriesPageProps {
	params: Promise<{ id: string }>;
}

// Loading State
const LoadingState = () => (
	<div className="flex h-full flex-col">
		<div className="border-b bg-gradient-to-r from-background to-muted/20 px-6 py-6">
			<div className="flex items-center gap-4">
				<div className="rounded border border-primary/20 bg-primary/10 p-3">
					<DatabaseIcon className="h-6 w-6 text-primary" weight="duotone" />
				</div>
				<div className="flex-1">
					<Skeleton className="h-8 w-48" />
					<Skeleton className="mt-2 h-4 w-64" />
				</div>
				<Skeleton className="h-6 w-32" />
			</div>
		</div>
		<div className="flex min-h-0 flex-1 flex-col space-y-6 p-6">
			<Skeleton className="h-10 w-full" />
			<div className="space-y-4">
				{Array.from({ length: 6 }, (_, i) => (
					<Skeleton
						className="h-32 w-full rounded-lg"
						key={`query-skeleton-${i.toString()}`}
					/>
				))}
			</div>
		</div>
	</div>
);

type TabId = 'most-called' | 'slowest' | 'resource-hogs' | 'all';

export default function QueriesPage({ params }: QueriesPageProps) {
	const { id: connectionId } = use(params);
	const [selectedQuery, setSelectedQuery] = useState<
		(QueryPerformanceSummary & { name: string }) | null
	>(null);
	const [sheetOpen, setSheetOpen] = useState(false);
	const [activeTab, setActiveTab] = useQueryState('tab', {
		defaultValue: 'most-called' as TabId,
	});

	// Fetch data
	const { data: metrics, isLoading: metricsLoading } =
		trpc.performance.getMetrics.useQuery(
			{ id: connectionId },
			{ refetchInterval: 30_000 }
		);

	const handleQueryClick = useCallback((query: QueryPerformanceSummary) => {
		const queryWithName = { ...query, name: query.query };
		setSelectedQuery(queryWithName);
		setSheetOpen(true);
	}, []);

	// Organize queries by different criteria
	const queryData = useMemo(() => {
		if (!metrics) {
			return { mostCalled: [], slowest: [], resourceHogs: [], all: [] };
		}

		const allQueries = [
			...metrics.top_queries_by_time,
			...metrics.top_queries_by_calls,
			...metrics.slowest_queries,
		];

		// Remove duplicates based on queryid
		const uniqueQueries = allQueries.filter(
			(queryItem, index, self) =>
				self.findIndex((q) => q.queryid === queryItem.queryid) === index
		);

		return {
			mostCalled: [...metrics.top_queries_by_calls].sort(
				(a, b) => b.calls - a.calls
			),
			slowest: [...metrics.slowest_queries].sort(
				(a, b) => b.mean_exec_time - a.mean_exec_time
			),
			resourceHogs: [...metrics.top_queries_by_time].sort(
				(a, b) => b.percentage_of_total_time - a.percentage_of_total_time
			),
			all: uniqueQueries.sort((a, b) => b.calls - a.calls), // Default sort by most called
		};
	}, [metrics]);

	if (metricsLoading) {
		return <LoadingState />;
	}

	if (!metrics) {
		return (
			<div className="flex min-h-[400px] items-center justify-center">
				<div className="text-center">
					<DatabaseIcon className="mx-auto h-12 w-12 text-muted-foreground" />
					<h3 className="mt-4 font-semibold text-lg">No Query Data</h3>
					<p className="text-muted-foreground">
						No performance metrics available for this database.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<div className="border-b bg-gradient-to-r from-background to-muted/20 px-6 py-6">
				<div className="flex items-center gap-4">
					<div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
						<DatabaseIcon className="h-6 w-6 text-primary" weight="duotone" />
					</div>
					<div className="flex-1">
						<h1 className="font-bold text-2xl tracking-tight">
							Database Queries
						</h1>
						<p className="text-muted-foreground text-sm">
							Comprehensive view of all database queries with performance
							metrics
						</p>
					</div>
					<Badge variant="outline">{queryData.all.length} Total Queries</Badge>
				</div>
			</div>

			<div className="flex min-h-0 flex-1 flex-col space-y-6 p-6">
				{/* Tabs for different query views */}
				<Tabs
					className="space-y-4"
					onValueChange={(value) => setActiveTab(value as TabId)}
					value={activeTab}
				>
					<div className="relative border-b">
						<TabsList className="h-10 w-full justify-start overflow-x-auto bg-transparent p-0">
							<TabsTrigger
								className="relative h-10 cursor-pointer touch-manipulation whitespace-nowrap rounded-none px-2 text-xs transition-colors hover:bg-muted/50 sm:px-4 sm:text-sm"
								value="most-called"
							>
								Most Called
								{activeTab === 'most-called' && (
									<div className="absolute bottom-0 left-0 h-[2px] w-full bg-primary" />
								)}
							</TabsTrigger>
							<TabsTrigger
								className="relative h-10 cursor-pointer touch-manipulation whitespace-nowrap rounded-none px-2 text-xs transition-colors hover:bg-muted/50 sm:px-4 sm:text-sm"
								value="slowest"
							>
								Slowest
								{activeTab === 'slowest' && (
									<div className="absolute bottom-0 left-0 h-[2px] w-full bg-primary" />
								)}
							</TabsTrigger>
							<TabsTrigger
								className="relative h-10 cursor-pointer touch-manipulation whitespace-nowrap rounded-none px-2 text-xs transition-colors hover:bg-muted/50 sm:px-4 sm:text-sm"
								value="resource-hogs"
							>
								Resource Hogs
								{activeTab === 'resource-hogs' && (
									<div className="absolute bottom-0 left-0 h-[2px] w-full bg-primary" />
								)}
							</TabsTrigger>
							<TabsTrigger
								className="relative h-10 cursor-pointer touch-manipulation whitespace-nowrap rounded-none px-2 text-xs transition-colors hover:bg-muted/50 sm:px-4 sm:text-sm"
								value="all"
							>
								All Queries
								{activeTab === 'all' && (
									<div className="absolute bottom-0 left-0 h-[2px] w-full bg-primary" />
								)}
							</TabsTrigger>
						</TabsList>
					</div>

					<TabsContent
						className="animate-fadeIn space-y-4 transition-all duration-200"
						key="most-called"
						value="most-called"
					>
						<div className="flex items-center justify-between">
							<h2 className="font-semibold text-lg">
								Most Frequently Called Queries
							</h2>
							<span className="text-muted-foreground text-sm">
								{queryData.mostCalled.length} queries
							</span>
						</div>
						<div className="space-y-4">
							{queryData.mostCalled.map((query) => (
								<QueryRow
									key={query.queryid}
									onClick={() => handleQueryClick(query)}
									query={query}
								/>
							))}
						</div>
					</TabsContent>

					<TabsContent
						className="animate-fadeIn space-y-4 transition-all duration-200"
						key="slowest"
						value="slowest"
					>
						<div className="flex items-center justify-between">
							<h2 className="font-semibold text-lg">Slowest Queries</h2>
							<span className="text-muted-foreground text-sm">
								{queryData.slowest.length} queries
							</span>
						</div>
						<div className="space-y-4">
							{queryData.slowest.map((query) => (
								<QueryRow
									key={query.queryid}
									onClick={() => handleQueryClick(query)}
									query={query}
								/>
							))}
						</div>
					</TabsContent>

					<TabsContent
						className="animate-fadeIn space-y-4 transition-all duration-200"
						key="resource-hogs"
						value="resource-hogs"
					>
						<div className="flex items-center justify-between">
							<h2 className="font-semibold text-lg">
								Resource Intensive Queries
							</h2>
							<span className="text-muted-foreground text-sm">
								{queryData.resourceHogs.length} queries
							</span>
						</div>
						<div className="space-y-4">
							{queryData.resourceHogs.map((query) => (
								<QueryRow
									key={query.queryid}
									onClick={() => handleQueryClick(query)}
									query={query}
								/>
							))}
						</div>
					</TabsContent>

					<TabsContent
						className="animate-fadeIn space-y-4 transition-all duration-200"
						key="all"
						value="all"
					>
						<div className="flex items-center justify-between">
							<h2 className="font-semibold text-lg">All Queries</h2>
							<span className="text-muted-foreground text-sm">
								{queryData.all.length} queries
							</span>
						</div>
						<div className="space-y-4">
							{queryData.all.map((query) => (
								<QueryRow
									key={query.queryid}
									onClick={() => handleQueryClick(query)}
									query={query}
								/>
							))}
						</div>
					</TabsContent>
				</Tabs>

				{/* Query Detail Sheet */}
				<QueryDetailSheet
					isOpen={sheetOpen}
					onClose={() => setSheetOpen(false)}
					query={selectedQuery}
				/>
			</div>
		</div>
	);
}
