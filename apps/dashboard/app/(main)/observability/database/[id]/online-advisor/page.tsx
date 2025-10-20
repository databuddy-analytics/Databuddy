'use client';

import {
	ArrowClockwiseIcon,
	CheckIcon,
	DatabaseIcon,
	PlayIcon,
	SparkleIcon,
	WarningIcon,
} from '@phosphor-icons/react';
import { use, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDbConnection } from '@/hooks/use-db-connections';
import { trpc } from '@/lib/trpc';

interface OnlineAdvisorPageProps {
	params: Promise<{ id: string }>;
}

function LoadingState() {
	return (
		<div className="flex h-full flex-col">
			<div className="border-b bg-gradient-to-r from-background to-muted/20 px-6 py-6">
				<div className="flex items-center gap-4">
					<div className="rounded border border-primary/20 bg-primary/10 p-3">
						<SparkleIcon className="h-6 w-6 text-primary" weight="duotone" />
					</div>
					<div className="flex-1">
						<Skeleton className="h-8 w-64" />
						<Skeleton className="mt-2 h-4 w-96" />
					</div>
					<Skeleton className="h-6 w-16" />
				</div>
			</div>
			<div className="flex min-h-0 flex-1 flex-col space-y-6 p-6">
				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					{Array.from({ length: 6 }).map((_, i) => (
						<Skeleton className="h-48 w-full rounded" key={i.toString()} />
					))}
				</div>
			</div>
		</div>
	);
}

function RecommendationCard({
	title,
	sql,
	impact,
	metric,
	onApply,
	isApplying = false,
}: {
	title: string;
	sql: string;
	impact: number | string;
	metric: string;
	onApply: () => void;
	isApplying?: boolean;
}) {
	const [showFullSQL, setShowFullSQL] = useState(false);
	const truncatedSQL = sql.length > 120 ? `${sql.substring(0, 120)}...` : sql;

	return (
		<Card className="group transition-all duration-200 hover:border-primary/20 hover:shadow-lg">
			<CardHeader className="pb-4">
				<div className="flex items-start justify-between">
					<div className="flex-1">
						<div className="mb-1 flex items-center gap-2">
							<SparkleIcon className="h-4 w-4 text-primary" weight="duotone" />
							<CardTitle className="text-base">{title}</CardTitle>
						</div>
						<CardDescription className="flex items-center gap-2">
							<span className="text-muted-foreground">{metric}:</span>
							<Badge className="font-medium text-xs" variant="outline">
								{impact}
							</Badge>
						</CardDescription>
					</div>
					<Badge className="text-xs" variant="secondary">
						<DatabaseIcon className="mr-1 h-3 w-3" weight="duotone" />
						Recommendation
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="rounded-lg border bg-muted/50 p-3">
					<div className="mb-2 flex items-center gap-2">
						<span className="font-medium text-muted-foreground text-xs">
							SQL Command:
						</span>
						{sql.length > 120 && (
							<Button
								className="h-auto p-0 text-xs"
								onClick={() => setShowFullSQL(!showFullSQL)}
								variant="link"
							>
								{showFullSQL ? 'Show less' : 'Show more'}
							</Button>
						)}
					</div>
					<code className="block font-mono text-muted-foreground text-xs">
						{showFullSQL ? sql : truncatedSQL}
					</code>
				</div>
				<div className="flex items-center justify-between pt-2">
					<div className="text-muted-foreground text-xs">
						Click apply to execute this recommendation
					</div>
					<Button
						className="gap-2 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
						disabled={isApplying}
						onClick={onApply}
						size="sm"
					>
						{isApplying ? (
							<>
								<ArrowClockwiseIcon className="h-3 w-3 animate-spin" />
								Applying...
							</>
						) : (
							<>
								<CheckIcon className="h-3 w-3" />
								Apply Recommendation
							</>
						)}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

export default function OnlineAdvisorPage({ params }: OnlineAdvisorPageProps) {
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [applyingRecommendations, setApplyingRecommendations] = useState<
		Set<string>
	>(new Set());

	const resolvedParams = use(params);
	const connectionId = resolvedParams.id;

	const utils = trpc.useUtils();

	const { data: connection } = useDbConnection(connectionId);

	const { data: advisorStatus, isLoading: statusLoading } =
		trpc.performance.checkOnlineAdvisorStatus.useQuery({ id: connectionId });

	const { data: indexRecommendations, isLoading: indexLoading } =
		trpc.performance.getIndexRecommendations.useQuery(
			{ id: connectionId },
			{ enabled: advisorStatus?.enabled }
		);

	const { data: statisticsRecommendations, isLoading: statsLoading } =
		trpc.performance.getStatisticsRecommendations.useQuery(
			{ id: connectionId },
			{ enabled: advisorStatus?.enabled }
		);

	const { data: executorStats } = trpc.performance.getExecutorStats.useQuery(
		{ id: connectionId },
		{ enabled: advisorStatus?.enabled }
	);

	const activateMutation = trpc.performance.activateOnlineAdvisor.useMutation({
		onSuccess: () => {
			utils.performance.checkOnlineAdvisorStatus.invalidate({
				id: connectionId,
			});
			utils.performance.getIndexRecommendations.invalidate({
				id: connectionId,
			});
			utils.performance.getStatisticsRecommendations.invalidate({
				id: connectionId,
			});
			setError(null);
			setSuccess('online_advisor has been activated successfully');
			setTimeout(() => setSuccess(null), 5000);
		},
		onError: (err) => {
			setError(`Failed to activate online_advisor: ${err.message}`);
			setSuccess(null);
		},
	});

	const installMutation = trpc.dbConnections.installExtension.useMutation({
		onSuccess: () => {
			utils.performance.checkOnlineAdvisorStatus.invalidate({
				id: connectionId,
			});
			setError(null);
			setSuccess('online_advisor installed successfully');
			setTimeout(() => setSuccess(null), 5000);
		},
		onError: (err) => {
			setError(`Failed to install online_advisor: ${err.message}`);
			setSuccess(null);
		},
	});

	const applyIndexMutation =
		trpc.performance.applyIndexRecommendation.useMutation({
			onSuccess: (result, variables) => {
				if (result.success) {
					utils.performance.getIndexRecommendations.invalidate({
						id: connectionId,
					});
					setApplyingRecommendations((prev) => {
						const next = new Set(prev);
						next.delete(variables.sql);
						return next;
					});
					setError(null);
					setSuccess('Index recommendation applied successfully');
					setTimeout(() => setSuccess(null), 5000);
				} else {
					setError(`Failed to apply recommendation: ${result.message}`);
					setApplyingRecommendations((prev) => {
						const next = new Set(prev);
						next.delete(variables.sql);
						return next;
					});
				}
			},
			onError: (err, variables) => {
				setError(`Failed to apply recommendation: ${err.message}`);
				setApplyingRecommendations((prev) => {
					const next = new Set(prev);
					next.delete(variables.sql);
					return next;
				});
				setSuccess(null);
			},
		});

	const applyStatsMutation =
		trpc.performance.applyStatisticsRecommendation.useMutation({
			onSuccess: (result, variables) => {
				if (result.success) {
					utils.performance.getStatisticsRecommendations.invalidate({
						id: connectionId,
					});
					setApplyingRecommendations((prev) => {
						const next = new Set(prev);
						next.delete(variables.sql);
						return next;
					});
					setError(null);
					setSuccess('Statistics recommendation applied successfully');
					setTimeout(() => setSuccess(null), 5000);
				} else {
					setError(`Failed to apply recommendation: ${result.message}`);
					setApplyingRecommendations((prev) => {
						const next = new Set(prev);
						next.delete(variables.sql);
						return next;
					});
				}
			},
			onError: (err, variables) => {
				setError(`Failed to apply recommendation: ${err.message}`);
				setApplyingRecommendations((prev) => {
					const next = new Set(prev);
					next.delete(variables.sql);
					return next;
				});
				setSuccess(null);
			},
		});

	const handleApplyIndex = (sql: string) => {
		setApplyingRecommendations((prev) => new Set(prev).add(sql));
		applyIndexMutation.mutate({ id: connectionId, sql });
	};

	const handleApplyStatistics = (sql: string) => {
		setApplyingRecommendations((prev) => new Set(prev).add(sql));
		applyStatsMutation.mutate({ id: connectionId, sql });
	};

	if (statusLoading || !connection) {
		return <LoadingState />;
	}

	const isExtensionEnabled = advisorStatus?.enabled;

	return (
		<div className="flex h-full flex-col">
			<div className="border-b bg-gradient-to-r from-background to-muted/20 px-6 py-6">
				<div className="flex items-center gap-4">
					<div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
						<SparkleIcon className="h-6 w-6 text-primary" weight="duotone" />
					</div>
					<div className="flex-1">
						<h1 className="font-bold text-2xl tracking-tight">
							Online Advisor
						</h1>
						<p className="text-muted-foreground text-sm">
							Get intelligent recommendations for indexes, statistics, and
							prepared statements
						</p>
					</div>
					{isExtensionEnabled && (
						<Badge className="text-xs" variant="secondary">
							<CheckIcon className="mr-1 h-3 w-3" />
							Active
						</Badge>
					)}
				</div>
			</div>

			<div className="flex min-h-0 flex-1 flex-col space-y-6 p-6">
				{/* Success/Error Messages */}
				{success && (
					<Alert>
						<CheckIcon className="h-4 w-4" />
						<AlertDescription className="flex items-center justify-between">
							<span>{success}</span>
							<Button
								onClick={() => setSuccess(null)}
								size="sm"
								variant="ghost"
							>
								Dismiss
							</Button>
						</AlertDescription>
					</Alert>
				)}

				{error && (
					<Alert>
						<WarningIcon className="h-4 w-4" />
						<AlertDescription className="flex items-center justify-between">
							<span>{error}</span>
							<Button onClick={() => setError(null)} size="sm" variant="ghost">
								Dismiss
							</Button>
						</AlertDescription>
					</Alert>
				)}

				{isExtensionEnabled ? (
					<div className="space-y-4">
						<div className="flex items-center justify-between">
							<h2 className="font-semibold text-lg">
								Performance Recommendations
							</h2>
							<Button
								className="gap-2"
								onClick={() => {
									utils.performance.getIndexRecommendations.invalidate({
										id: connectionId,
									});
									utils.performance.getStatisticsRecommendations.invalidate({
										id: connectionId,
									});
									utils.performance.getExecutorStats.invalidate({
										id: connectionId,
									});
								}}
								size="sm"
								variant="outline"
							>
								<ArrowClockwiseIcon className="h-4 w-4" />
								Refresh
							</Button>
						</div>

						<Tabs className="space-y-4" defaultValue="indexes">
							<TabsList className="grid h-12 w-full grid-cols-3">
								<TabsTrigger
									className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
									value="indexes"
								>
									<div className="flex items-center gap-2">
										<SparkleIcon className="h-4 w-4" weight="duotone" />
										<span>Indexes ({indexRecommendations?.length || 0})</span>
									</div>
								</TabsTrigger>
								<TabsTrigger
									className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
									value="statistics"
								>
									<div className="flex items-center gap-2">
										<DatabaseIcon className="h-4 w-4" weight="duotone" />
										<span>
											Statistics ({statisticsRecommendations?.length || 0})
										</span>
									</div>
								</TabsTrigger>
								<TabsTrigger
									className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
									value="performance"
								>
									<div className="flex items-center gap-2">
										<ArrowClockwiseIcon className="h-4 w-4" weight="duotone" />
										<span>Performance</span>
									</div>
								</TabsTrigger>
							</TabsList>

							<TabsContent className="space-y-4" value="indexes">
								{indexLoading ? (
									<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
										{Array.from({ length: 3 }).map((_, i) => (
											<Skeleton
												className="h-48 w-full rounded"
												key={i.toString()}
											/>
										))}
									</div>
								) : indexRecommendations && indexRecommendations.length > 0 ? (
									<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
										{indexRecommendations.map((rec, index) => (
											<RecommendationCard
												impact={`${rec.elapsed_sec?.toFixed(2)}s`}
												isApplying={applyingRecommendations.has(
													rec.create_index
												)}
												key={index.toString()}
												metric="Time Saved"
												onApply={() => handleApplyIndex(rec.create_index)}
												sql={rec.create_index}
												title={`Index on ${rec.table_name || 'table'}`}
											/>
										))}
									</div>
								) : (
									<Card>
										<CardContent className="flex flex-col items-center justify-center py-12">
											<DatabaseIcon
												className="mb-4 h-12 w-12 text-muted-foreground"
												weight="duotone"
											/>
											<h3 className="mb-2 font-semibold">
												No Index Recommendations
											</h3>
											<p className="text-center text-muted-foreground text-sm">
												Run your workload to generate index recommendations
												based on query patterns.
											</p>
										</CardContent>
									</Card>
								)}
							</TabsContent>

							<TabsContent className="space-y-4" value="statistics">
								{statsLoading ? (
									<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
										{Array.from({ length: 3 }).map((_, i) => (
											<Skeleton
												className="h-48 w-full rounded"
												key={i.toString()}
											/>
										))}
									</div>
								) : statisticsRecommendations &&
									statisticsRecommendations.length > 0 ? (
									<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
										{statisticsRecommendations.map((rec, index) => (
											<RecommendationCard
												impact={`${rec.misestimation?.toFixed(1)}x`}
												isApplying={applyingRecommendations.has(
													rec.create_statistics
												)}
												key={index.toString()}
												metric="Misestimation Ratio"
												onApply={() =>
													handleApplyStatistics(rec.create_statistics)
												}
												sql={rec.create_statistics}
												title="Extended Statistics"
											/>
										))}
									</div>
								) : (
									<Card>
										<CardContent className="flex flex-col items-center justify-center py-12">
											<DatabaseIcon
												className="mb-4 h-12 w-12 text-muted-foreground"
												weight="duotone"
											/>
											<h3 className="mb-2 font-semibold">
												No Statistics Recommendations
											</h3>
											<p className="text-center text-muted-foreground text-sm">
												Run queries with complex WHERE clauses to generate
												extended statistics recommendations.
											</p>
										</CardContent>
									</Card>
								)}
							</TabsContent>

							<TabsContent className="space-y-4" value="performance">
								{executorStats ? (
									<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
										<Card>
											<CardHeader className="pb-2">
												<CardTitle className="font-medium text-sm">
													Planning Overhead
												</CardTitle>
											</CardHeader>
											<CardContent>
												<div className="font-bold text-2xl">
													{executorStats.avg_planning_overhead?.toFixed(2) ||
														'0.00'}
												</div>
												<p className="text-muted-foreground text-xs">
													{(executorStats.avg_planning_overhead || 0) > 1
														? 'Consider prepared statements'
														: 'Planning efficiency is good'}
												</p>
											</CardContent>
										</Card>
										<Card>
											<CardHeader className="pb-2">
												<CardTitle className="font-medium text-sm">
													Total Calls
												</CardTitle>
											</CardHeader>
											<CardContent>
												<div className="font-bold text-2xl">
													{executorStats.total_calls?.toLocaleString() || '0'}
												</div>
												<p className="text-muted-foreground text-xs">
													Query executions tracked
												</p>
											</CardContent>
										</Card>
										<Card>
											<CardHeader className="pb-2">
												<CardTitle className="font-medium text-sm">
													Avg Planning Time
												</CardTitle>
											</CardHeader>
											<CardContent>
												<div className="font-bold text-2xl">
													{executorStats.avg_planning_time?.toFixed(2) ||
														'0.00'}
													ms
												</div>
												<p className="text-muted-foreground text-xs">
													Time spent planning queries
												</p>
											</CardContent>
										</Card>
										<Card>
											<CardHeader className="pb-2">
												<CardTitle className="font-medium text-sm">
													Avg Execution Time
												</CardTitle>
											</CardHeader>
											<CardContent>
												<div className="font-bold text-2xl">
													{executorStats.avg_execution_time?.toFixed(2) ||
														'0.00'}
													ms
												</div>
												<p className="text-muted-foreground text-xs">
													Time spent executing queries
												</p>
											</CardContent>
										</Card>
									</div>
								) : (
									<Card>
										<CardContent className="flex flex-col items-center justify-center py-12">
											<DatabaseIcon
												className="mb-4 h-12 w-12 text-muted-foreground"
												weight="duotone"
											/>
											<h3 className="mb-2 font-semibold">
												No Performance Data
											</h3>
											<p className="text-center text-muted-foreground text-sm">
												Performance statistics will appear after running queries
												on your database.
											</p>
										</CardContent>
									</Card>
								)}
							</TabsContent>
						</Tabs>
					</div>
				) : (
					<div className="space-y-6">
						<Alert>
							<DatabaseIcon className="h-4 w-4" />
							<AlertDescription className="space-y-4">
								<div>
									<p className="font-medium">
										online_advisor Extension Required
									</p>
									<p className="text-muted-foreground text-sm">
										The online_advisor extension is not installed or activated
										on this database connection.
									</p>
								</div>
								<div className="flex gap-3">
									<Button
										className="gap-2"
										disabled={activateMutation.isPending}
										onClick={() =>
											activateMutation.mutate({ id: connectionId })
										}
										size="sm"
									>
										{activateMutation.isPending ? (
											<>
												<ArrowClockwiseIcon className="h-4 w-4 animate-spin" />
												Activating...
											</>
										) : (
											<>
												<PlayIcon className="h-4 w-4" />
												Activate Extension
											</>
										)}
									</Button>
									<Button
										className="gap-2"
										disabled={installMutation.isPending}
										onClick={() =>
											installMutation.mutate({
												id: connectionId,
												extensionName: 'online_advisor',
												schema: 'public',
											})
										}
										size="sm"
										variant="outline"
									>
										{installMutation.isPending ? (
											<>
												<ArrowClockwiseIcon className="h-4 w-4 animate-spin" />
												Installing...
											</>
										) : (
											<>
												<DatabaseIcon className="h-4 w-4" />
												Install Extension
											</>
										)}
									</Button>
								</div>
							</AlertDescription>
						</Alert>

						{/* Getting Started Documentation */}
						<Card>
							<CardHeader>
								<div className="flex items-start gap-4">
									<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
										<DatabaseIcon
											className="h-6 w-6 text-primary-foreground"
											weight="duotone"
										/>
									</div>
									<div className="flex-1">
										<CardTitle className="text-xl">
											Getting Started with online_advisor
										</CardTitle>
										<CardDescription>
											Learn how to set up and use the online_advisor extension
											for PostgreSQL performance optimization
										</CardDescription>
									</div>
								</div>
							</CardHeader>
							<CardContent className="space-y-6 p-6">
								{/* Installation Steps */}
								<div>
									<h4 className="mb-4 font-semibold text-lg">
										Installation Steps
									</h4>
									<div className="space-y-4">
										<div className="rounded-lg border-l-4 p-4">
											<div className="mb-2 flex items-center gap-2">
												<div className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground text-xs">
													1
												</div>
												<p className="font-medium text-sm">
													Install the extension
												</p>
											</div>
											<code className="rounded bg-muted px-2 py-1 text-sm">
												CREATE EXTENSION online_advisor;
											</code>
										</div>
										<div className="rounded-lg border-l-4 p-4">
											<div className="mb-2 flex items-center gap-2">
												<div className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground text-xs">
													2
												</div>
												<p className="font-medium text-sm">
													Activate monitoring
												</p>
											</div>
											<code className="rounded bg-muted px-2 py-1 text-sm">
												SELECT get_executor_stats();
											</code>
										</div>
										<div className="rounded-lg border-l-4 p-4">
											<div className="mb-2 flex items-center gap-2">
												<div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 font-semibold text-purple-800 text-xs dark:bg-purple-900/20 dark:text-purple-400">
													3
												</div>
												<p className="font-medium text-sm">Run your workload</p>
											</div>
											<p className="text-muted-foreground text-sm">
												Execute your normal database queries to collect
												performance data and generate recommendations.
											</p>
										</div>
									</div>
								</div>

								{/* What it provides */}
								<div>
									<h4 className="mb-4 font-semibold text-lg">
										What You'll Get
									</h4>
									<div className="grid gap-4 md:grid-cols-3">
										<div className="rounded-lg border p-4 transition-colors hover:bg-muted">
											<div className="mb-3 flex items-center gap-3">
												<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
													<SparkleIcon className="h-5 w-5" weight="duotone" />
												</div>
												<div>
													<h5 className="font-medium text-sm">
														Index Recommendations
													</h5>
													<p className="text-muted-foreground text-xs">
														For slow queries
													</p>
												</div>
											</div>
											<p className="text-muted-foreground text-sm">
												Automatically suggests indexes when queries filter many
												rows, showing potential time savings.
											</p>
										</div>
										<div className="rounded-lg border p-4 transition-colors hover:bg-muted">
											<div className="mb-3 flex items-center gap-3">
												<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
													<DatabaseIcon className="h-5 w-5" weight="duotone" />
												</div>
												<div>
													<h5 className="font-medium text-sm">
														Statistics Suggestions
													</h5>
													<p className="text-muted-foreground text-xs">
														Better planning
													</p>
												</div>
											</div>
											<p className="text-muted-foreground text-sm">
												Identifies when extended statistics could improve query
												planner row estimates.
											</p>
										</div>
										<div className="rounded-lg border p-4 transition-colors hover:bg-muted">
											<div className="mb-3 flex items-center gap-3">
												<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
													<ArrowClockwiseIcon
														className="h-5 w-5"
														weight="duotone"
													/>
												</div>
												<div>
													<h5 className="font-medium text-sm">
														Performance Insights
													</h5>
													<p className="text-muted-foreground text-xs">
														Optimization tips
													</p>
												</div>
											</div>
											<p className="text-muted-foreground text-sm">
												Shows planning overhead and suggests when to use
												prepared statements.
											</p>
										</div>
									</div>
								</div>

								{/* Example Usage */}
								<div>
									<h4 className="mb-4 font-semibold text-lg">Example Usage</h4>
									<div className="space-y-3">
										<div>
											<p className="mb-2 font-medium text-sm">
												View recommendations:
											</p>
											<div className="rounded-lg bg-muted p-3">
												<code className="text-sm">
													SELECT * FROM proposed_indexes ORDER BY elapsed_sec
													DESC;
												</code>
											</div>
										</div>
										<div>
											<p className="mb-2 font-medium text-sm">
												Check planning efficiency:
											</p>
											<div className="rounded-lg bg-muted p-3">
												<code className="text-sm">
													SELECT * FROM get_executor_stats(false);
												</code>
											</div>
										</div>
									</div>
								</div>

								{/* Requirements */}
								<div className="rounded-lg border p-4">
									<div className="mb-2 flex items-center gap-2">
										<WarningIcon className="h-4 w-4" />
										<h5 className="font-medium text-sm">Requirements</h5>
									</div>
									<ul className="space-y-1 text-muted-foreground text-sm">
										<li>• PostgreSQL 17 or later</li>
										<li>• Database admin privileges for installation</li>
										<li>• Available on Neon Serverless Postgres</li>
										<li>
											• Extension must be created in each database separately
										</li>
									</ul>
								</div>

								{/* Call to Action */}
								<div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-4">
									<div>
										<h5 className="font-medium text-sm">
											Ready to get started?
										</h5>
										<p className="text-muted-foreground text-sm">
											Click the "Activate Extension" button above to begin
											collecting recommendations.
										</p>
									</div>
									<ArrowClockwiseIcon
										className="h-8 w-8 text-primary"
										weight="duotone"
									/>
								</div>
							</CardContent>
						</Card>
					</div>
				)}
			</div>
		</div>
	);
}
