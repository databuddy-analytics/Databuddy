'use client';

import {
	ChartLineIcon,
	ClockIcon,
	DatabaseIcon,
	PlugIcon,
	SpinnerIcon,
	TableIcon,
} from '@phosphor-icons/react';
import type { ColumnDef } from '@tanstack/react-table';
import { use } from 'react';
import { DataTable } from '@/components/analytics/data-table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';

interface DatabasePageProps {
	params: Promise<{ id: string }>;
}

interface TableStat {
	name: string; // Required by DataTable component
	tableName: string;
	schemaName: string;
	rowCount: number;
	totalSize: string;
	indexSize: string;
	lastVacuum?: string;
	lastAnalyze?: string;
	sequentialScans: number;
	indexScans: number;
	deadTuples: number;
}

// Column definitions for the table statistics
const tableStatsColumns: ColumnDef<TableStat, unknown>[] = [
	{
		accessorKey: 'tableName',
		header: 'Table Name',
		size: 200,
		cell: ({ row }) => (
			<div className="font-medium text-foreground">
				{row.original.tableName}
			</div>
		),
	},
	{
		accessorKey: 'schemaName',
		header: 'Schema',
		size: 120,
		cell: ({ row }) => (
			<div className="text-muted-foreground">{row.original.schemaName}</div>
		),
	},
	{
		accessorKey: 'rowCount',
		header: 'Rows',
		size: 100,
		cell: ({ row }) => (
			<div className="font-mono">
				{row.original.rowCount?.toLocaleString() || '-'}
			</div>
		),
	},
	{
		accessorKey: 'totalSize',
		header: 'Total Size',
		size: 110,
		cell: ({ row }) => (
			<div className="font-mono text-sm">{row.original.totalSize || '-'}</div>
		),
	},
	{
		accessorKey: 'indexSize',
		header: 'Index Size',
		size: 110,
		cell: ({ row }) => (
			<div className="font-mono text-sm">{row.original.indexSize || '-'}</div>
		),
	},
	{
		accessorKey: 'lastVacuum',
		header: 'Last Vacuum',
		size: 140,
		cell: ({ row }) => {
			const lastVacuum = row.original.lastVacuum;
			if (!lastVacuum) {
				return <div className="text-muted-foreground text-sm">-</div>;
			}
			const date = new Date(lastVacuum);
			return (
				<div className="text-sm">
					{date.toLocaleDateString()}{' '}
					{date.toLocaleTimeString([], {
						hour: '2-digit',
						minute: '2-digit',
					})}
				</div>
			);
		},
	},
	{
		accessorKey: 'lastAnalyze',
		header: 'Last Analyze',
		size: 140,
		cell: ({ row }) => {
			const lastAnalyze = row.original.lastAnalyze;
			if (!lastAnalyze) {
				return <div className="text-muted-foreground text-sm">-</div>;
			}
			const date = new Date(lastAnalyze);
			return (
				<div className="text-sm">
					{date.toLocaleDateString()}{' '}
					{date.toLocaleTimeString([], {
						hour: '2-digit',
						minute: '2-digit',
					})}
				</div>
			);
		},
	},
	{
		accessorKey: 'sequentialScans',
		header: 'Seq Scans',
		size: 100,
		cell: ({ row }) => (
			<div className="font-mono text-sm">
				{row.original.sequentialScans.toLocaleString()}
			</div>
		),
	},
	{
		accessorKey: 'indexScans',
		header: 'Index Scans',
		size: 110,
		cell: ({ row }) => (
			<div className="font-mono text-sm">
				{row.original.indexScans.toLocaleString()}
			</div>
		),
	},
	{
		accessorKey: 'deadTuples',
		header: 'Dead Tuples',
		size: 110,
		cell: ({ row }) => {
			const deadTuples = row.original.deadTuples;
			const deadTuplesFormatted = deadTuples.toLocaleString();
			const isHigh = deadTuples > 1000; // Threshold for highlighting

			return (
				<div
					className={`font-mono text-sm ${
						isHigh ? 'text-yellow-600 dark:text-yellow-400' : ''
					}`}
				>
					{deadTuplesFormatted}
				</div>
			);
		},
	},
];

// Database stats overview component
function DatabaseStatsOverview({
	databaseStats,
	isLoading,
	error,
}: {
	databaseStats?: {
		databaseName: string;
		databaseSize: string;
		activeConnections: number;
		maxConnections: number;
		hitRatio: number;
		indexUsage: number;
		totalQueries: number;
		totalInserts: number;
		totalUpdates: number;
		totalDeletes: number;
	};
	isLoading: boolean;
	error?: { message: string } | null;
}) {
	if (isLoading) {
		return (
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
				{Array.from({ length: 6 }).map((_, i) => (
					<div
						className="h-20 animate-pulse rounded bg-muted"
						key={i.toString()}
					/>
				))}
			</div>
		);
	}

	if (error) {
		return (
			<div className="py-8 text-center text-muted-foreground">
				<p className="font-medium text-destructive">
					Failed to load database stats
				</p>
				<p className="mt-1 text-sm">{error.message}</p>
			</div>
		);
	}

	if (!databaseStats) {
		return (
			<div className="py-8 text-center text-muted-foreground">
				<p>No database statistics available</p>
			</div>
		);
	}

	return (
		<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
			<Card className="rounded p-4">
				<div className="flex items-center gap-3">
					<div className="rounded bg-muted p-2">
						<DatabaseIcon
							className="h-4 w-4 text-muted-foreground"
							weight="duotone"
						/>
					</div>
					<div className="space-y-1">
						<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
							Database Size
						</p>
						<p className="font-semibold text-xl">
							{databaseStats.databaseSize}
						</p>
					</div>
				</div>
			</Card>

			<Card className="rounded p-4">
				<div className="flex items-center gap-3">
					<div className="rounded bg-muted p-2">
						<PlugIcon
							className="h-4 w-4 text-muted-foreground"
							weight="duotone"
						/>
					</div>
					<div className="space-y-1">
						<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
							Active Connections
						</p>
						<div className="flex items-baseline gap-2">
							<p className="font-semibold text-xl">
								{databaseStats.activeConnections}
							</p>
							<span className="text-muted-foreground text-sm">
								/ {databaseStats.maxConnections}
							</span>
						</div>
					</div>
				</div>
			</Card>

			<Card className="rounded p-4">
				<div className="flex items-center gap-3">
					<div className="rounded bg-muted p-2">
						<ChartLineIcon
							className="h-4 w-4 text-muted-foreground"
							weight="duotone"
						/>
					</div>
					<div className="space-y-1">
						<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
							Cache Hit Ratio
						</p>
						<p className="font-semibold text-xl">
							{databaseStats.hitRatio.toFixed(1)}%
						</p>
					</div>
				</div>
			</Card>

			<Card className="rounded p-4">
				<div className="flex items-center gap-3">
					<div className="rounded bg-muted p-2">
						<ClockIcon
							className="h-4 w-4 text-muted-foreground"
							weight="duotone"
						/>
					</div>
					<div className="space-y-1">
						<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
							Total Queries
						</p>
						<p className="font-semibold text-xl">
							{databaseStats.totalQueries.toLocaleString()}
						</p>
					</div>
				</div>
			</Card>
		</div>
	);
}

export default function DatabasePage({ params }: DatabasePageProps) {
	const resolvedParams = use(params);
	const connectionId = resolvedParams.id;

	// Get connection details
	const {
		data: connection,
		isLoading: isLoadingConnection,
		error: connectionError,
	} = trpc.dbConnections.getById.useQuery({ id: connectionId });

	// Get database stats
	const {
		data: databaseStats,
		isLoading: isLoadingStats,
		error: statsError,
	} = trpc.dbConnections.getDatabaseStats.useQuery(
		{ id: connectionId },
		{ enabled: !!connection }
	);

	// Get table stats
	const {
		data: tableStats,
		isLoading: isLoadingTables,
		error: tablesError,
	} = trpc.dbConnections.getTableStats.useQuery(
		{ id: connectionId },
		{ enabled: !!connection }
	);

	// Show loading state while connection is loading
	if (isLoadingConnection) {
		return (
				<Card className="rounded">
					<CardContent className="flex items-center justify-center py-12">
						<div className="flex items-center gap-2 text-muted-foreground">
							<SpinnerIcon className="h-4 w-4 animate-spin" />
							<span>Loading database connection...</span>
						</div>
					</CardContent>
				</Card>
		);
	}

	if (connectionError) {
		return (
				<Card className="rounded border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
					<CardContent className="pt-6">
						<div className="flex items-center gap-3 text-red-600">
							<DatabaseIcon className="h-5 w-5" weight="duotone" />
							<p className="font-medium">Failed to load database connection</p>
						</div>
						<p className="mt-2 text-red-600/80 text-sm">
							{connectionError.message}
						</p>
					</CardContent>
				</Card>
		);
	}

	if (!connection) {
		return (
				<Card className="rounded">
					<CardContent className="pt-6">
						<div className="text-center text-muted-foreground">
							<DatabaseIcon
								className="mx-auto mb-4 h-12 w-12"
								weight="duotone"
							/>
							<p className="font-medium">Database connection not found</p>
						</div>
					</CardContent>
				</Card>
		);
	}

	return (
		<>
			{/* Database Stats */}
			<div className="space-y-4">
				<div className="flex items-center gap-2">
					<DatabaseIcon
						className="h-5 w-5 text-muted-foreground"
						weight="duotone"
					/>
					<h2 className="font-semibold text-lg">Database Overview</h2>
				</div>

				<DatabaseStatsOverview
					databaseStats={databaseStats}
					error={statsError}
					isLoading={isLoadingStats}
				/>
			</div>

			{/* Table Stats */}
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<TableIcon
							className="h-5 w-5 text-muted-foreground"
							weight="duotone"
						/>
						<h2 className="font-semibold text-lg">Table Statistics</h2>
					</div>
					{tableStats && tableStats.length > 0 && (
						<Badge className="rounded" variant="secondary">
							{tableStats.length} {tableStats.length === 1 ? 'table' : 'tables'}
						</Badge>
					)}
				</div>

				{isLoadingTables ? (
					<div className="rounded border bg-background p-8">
						<div className="flex items-center justify-center">
							<div className="flex items-center gap-2 text-muted-foreground">
								<SpinnerIcon className="h-4 w-4 animate-spin" />
								<span>Loading table statistics...</span>
							</div>
						</div>
					</div>
				) : tablesError ? (
					<div className="rounded border bg-background p-8">
						<div className="text-center">
							<p className="font-medium text-destructive">
								Failed to load table stats
							</p>
							<p className="mt-1 text-muted-foreground text-sm">
								{tablesError.message}
							</p>
						</div>
					</div>
				) : tableStats && tableStats.length > 0 ? (
					<DataTable
						columns={tableStatsColumns}
						data={tableStats.map((table) => ({
							...table,
							name: table.tableName, // Required by DataTable
						}))}
						description={`${tableStats.length} tables found in this database`}
						emptyMessage="No tables found in this database"
						minHeight={400}
						showSearch={true}
						title="Database Tables"
					/>
				) : (
					<div className="rounded border bg-background p-12 text-center">
						<TableIcon
							className="mx-auto mb-4 h-12 w-12 text-muted-foreground"
							weight="duotone"
						/>
						<p className="font-medium text-muted-foreground">
							No table statistics available
						</p>
						<p className="mt-1 text-muted-foreground text-sm">
							There are no tables to display for this database connection.
						</p>
					</div>
				)}
			</div>
		</>
	);
}
