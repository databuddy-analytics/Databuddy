"use client";

import type { QueryPerformanceSummary } from "@databuddy/shared/types/performance";
import { CopyIcon, DatabaseIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { SqlHighlighter } from "./sql-highlighter";

interface QueryDetailSheetProps {
	query: (QueryPerformanceSummary & { name: string }) | null;
	isOpen: boolean;
	onClose: () => void;
}

const InfoRow = ({
	label,
	value,
}: {
	label: string;
	value: string | number;
}) => (
	<div className="space-y-2">
		<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
			{label}
		</span>
		<div className="rounded border bg-muted/30 px-4 py-3">
			<span className="break-all font-mono text-sm">{value}</span>
		</div>
	</div>
);

const formatTime = (ms: number): string => {
	if (ms < 1) {
		return `${(ms * 1000).toFixed(0)}μs`;
	}
	if (ms < 1000) {
		return `${ms.toFixed(1)}ms`;
	}
	return `${(ms / 1000).toFixed(2)}s`;
};

export const QueryDetailSheet = ({
	query,
	isOpen,
	onClose,
}: QueryDetailSheetProps) => {
	const [copiedSection, setCopiedSection] = useState<string | null>(null);

	if (!query) {
		return null;
	}

	const copyToClipboard = async (text: string, section: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopiedSection(section);
			toast.success(`${section} copied to clipboard`);
			setTimeout(() => setCopiedSection(null), 2000);
		} catch (err) {
			toast.error("Failed to copy to clipboard", {
				description: err instanceof Error ? err.message : "Unknown error",
			});
		}
	};

	const getPerformanceLevel = (time: number) => {
		if (time < 10) {
			return {
				level: "Excellent",
				color: "bg-green-100 text-green-800 border-green-200",
			};
		}
		if (time < 50) {
			return {
				level: "Good",
				color: "bg-muted text-muted-foreground border-border",
			};
		}
		if (time < 100) {
			return {
				level: "Fair",
				color: "bg-yellow-100 text-yellow-800 border-yellow-200",
			};
		}
		if (time < 500) {
			return {
				level: "Poor",
				color: "bg-orange-100 text-orange-800 border-orange-200",
			};
		}
		return {
			level: "Critical",
			color: "bg-red-100 text-red-800 border-red-200",
		};
	};

	const performance = getPerformanceLevel(query.mean_exec_time);

	const copyAllDetails = () => {
		const fullDetails = `
Query Performance Analysis
========================

Performance Level: ${performance.level}
Average Response Time: ${formatTime(query.mean_exec_time)}

Query Pattern:
${query.query}

Execution Statistics:
- Total Executions: ${query.calls.toLocaleString()}
- Total Time: ${formatTime(query.total_exec_time)}
- Average Time: ${formatTime(query.mean_exec_time)}
- Min Time: ${formatTime(query.min_exec_time)}
- Max Time: ${formatTime(query.max_exec_time)}
- Std Deviation: ${formatTime(query.stddev_exec_time)}

Resource Usage:
- Rows Processed: ${query.rows.toLocaleString()}
- Cache Hit Ratio: ${query.cache_hit_ratio.toFixed(1)}%
- Blocks Hit (Cache): ${query.shared_blks_hit.toLocaleString()}
- Blocks Read (Disk): ${query.shared_blks_read.toLocaleString()}
- Resource Share: ${query.percentage_of_total_time.toFixed(2)}%
- Query ID: ${query.queryid}
		`.trim();

		copyToClipboard(fullDetails, "Full query details");
	};

	return (
		<Sheet onOpenChange={onClose} open={isOpen}>
			<SheetContent className="w-full max-w-2xl p-4 sm:max-w-4xl lg:max-w-5xl">
				<SheetHeader className="pb-4">
					<SheetTitle className="flex items-center gap-2">
						<DatabaseIcon className="h-5 w-5 text-primary" weight="duotone" />
						Query Performance Details
					</SheetTitle>
				</SheetHeader>

				<ScrollArea className="h-[calc(100vh-120px)]">
					<div className="space-y-6 pr-4">
						{/* Performance Overview */}
						<div className="space-y-4">
							<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
								<div className="flex items-center gap-2">
									<Badge className={`${performance.color} border`}>
										{performance.level}
									</Badge>
									<span className="text-muted-foreground text-sm">
										Avg: {formatTime(query.mean_exec_time)}
									</span>
								</div>
							</div>

							<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
								<div className="rounded border bg-card p-4">
									<div className="font-bold text-xl sm:text-2xl">
										{formatTime(query.mean_exec_time)}
									</div>
									<div className="text-muted-foreground text-xs sm:text-sm">
										Average Response
									</div>
								</div>
								<div className="rounded border bg-card p-4">
									<div className="font-bold text-xl sm:text-2xl">
										{query.calls.toLocaleString()}
									</div>
									<div className="text-muted-foreground text-xs sm:text-sm">
										Total Executions
									</div>
								</div>
								<div className="rounded border bg-card p-4">
									<div className="font-bold text-xl sm:text-2xl">
										{query.cache_hit_ratio.toFixed(1)}%
									</div>
									<div className="text-muted-foreground text-xs sm:text-sm">
										Cache Hit Rate
									</div>
								</div>
								<div className="rounded border bg-card p-4">
									<div className="font-bold text-xl sm:text-2xl">
										{query.percentage_of_total_time.toFixed(1)}%
									</div>
									<div className="text-muted-foreground text-xs sm:text-sm">
										Resource Share
									</div>
								</div>
							</div>
						</div>

						<Separator />

						{/* Query Pattern */}
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<h3 className="font-semibold text-base sm:text-lg">
									Query Pattern
								</h3>
								<Button
									onClick={() => copyToClipboard(query.query, "Query pattern")}
									size="sm"
									variant="ghost"
								>
									<CopyIcon
										className={`h-4 w-4 ${
											copiedSection === "Query pattern" ? "text-green-600" : ""
										}`}
									/>
								</Button>
							</div>
							<SqlHighlighter code={query.query} />
						</div>

						<Separator />

						{/* Detailed Metrics */}
						<div className="space-y-4">
							<h3 className="font-semibold text-base sm:text-lg">
								Detailed Metrics
							</h3>
							<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
								<div className="space-y-4">
									<h4 className="font-medium text-muted-foreground text-sm">
										Execution Statistics
									</h4>
									<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
										<InfoRow
											label="Total Executions"
											value={query.calls.toLocaleString()}
										/>
										<InfoRow
											label="Total Time"
											value={formatTime(query.total_exec_time)}
										/>
										<InfoRow
											label="Average Time"
											value={formatTime(query.mean_exec_time)}
										/>
										<InfoRow
											label="Min Time"
											value={formatTime(query.min_exec_time)}
										/>
										<InfoRow
											label="Max Time"
											value={formatTime(query.max_exec_time)}
										/>
										<InfoRow
											label="Std Deviation"
											value={formatTime(query.stddev_exec_time)}
										/>
									</div>
								</div>

								<div className="space-y-4">
									<h4 className="font-medium text-muted-foreground text-sm">
										Resource Usage
									</h4>
									<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
										<InfoRow
											label="Rows Processed"
											value={query.rows.toLocaleString()}
										/>
										<InfoRow
											label="Cache Hit Ratio"
											value={`${query.cache_hit_ratio.toFixed(1)}%`}
										/>
										<InfoRow
											label="Blocks Hit (Cache)"
											value={query.shared_blks_hit.toLocaleString()}
										/>
										<InfoRow
											label="Blocks Read (Disk)"
											value={query.shared_blks_read.toLocaleString()}
										/>
										<InfoRow
											label="Resource Share"
											value={`${query.percentage_of_total_time.toFixed(2)}%`}
										/>
										<InfoRow
											label="Query ID"
											value={query.queryid.toString()}
										/>
									</div>
								</div>
							</div>
						</div>

						<Separator />

						{/* Optimization Recommendations */}
						<div className="space-y-4">
							<h3 className="font-semibold text-base sm:text-lg">
								Optimization Recommendations
							</h3>
							<div className="space-y-3">
								{query.mean_exec_time > 100 && (
									<div className="rounded border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-950/20">
										<div className="flex items-start gap-3">
											<div className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-orange-500" />
											<div className="min-w-0">
												<p className="font-medium text-orange-900 dark:text-orange-100">
													Slow Query Detected
												</p>
												<p className="mt-1 text-orange-800 text-sm dark:text-orange-200">
													Consider adding indexes, optimizing WHERE clauses, or
													reviewing query structure for better performance.
												</p>
											</div>
										</div>
									</div>
								)}

								{query.cache_hit_ratio < 90 && (
									<div className="rounded border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/20">
										<div className="flex items-start gap-3">
											<div className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
											<div className="min-w-0">
												<p className="font-medium text-foreground">
													Low Cache Hit Rate
												</p>
												<p className="mt-1 text-muted-foreground text-sm">
													Consider increasing shared_buffers, optimizing data
													access patterns, or reviewing query selectivity.
												</p>
											</div>
										</div>
									</div>
								)}

								{query.calls > 10_000 && (
									<div className="rounded border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-950/20">
										<div className="flex items-start gap-3">
											<div className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-purple-500" />
											<div className="min-w-0">
												<p className="font-medium text-purple-900 dark:text-purple-100">
													High Frequency Query
												</p>
												<p className="mt-1 text-purple-800 text-sm dark:text-purple-200">
													Consider result caching, connection pooling
													optimizations, or query result materialization.
												</p>
											</div>
										</div>
									</div>
								)}

								{query.percentage_of_total_time > 10 && (
									<div className="rounded border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/20">
										<div className="flex items-start gap-3">
											<div className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
											<div className="min-w-0">
												<p className="font-medium text-red-900 dark:text-red-100">
													Resource Intensive Query
												</p>
												<p className="mt-1 text-red-800 text-sm dark:text-red-200">
													This query consumes significant database resources.
													Consider it a priority optimization target.
												</p>
											</div>
										</div>
									</div>
								)}

								{query.mean_exec_time <= 50 &&
									query.cache_hit_ratio >= 95 &&
									query.percentage_of_total_time <= 5 && (
										<div className="rounded border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/20">
											<div className="flex items-start gap-3">
												<div className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-green-500" />
												<div className="min-w-0">
													<p className="font-medium text-green-900 dark:text-green-100">
														Well Optimized Query
													</p>
													<p className="mt-1 text-green-800 text-sm dark:text-green-200">
														This query shows good performance characteristics.
														No immediate optimization needed.
													</p>
												</div>
											</div>
										</div>
									)}
							</div>
						</div>

						{/* Actions */}
						<div className="flex flex-col gap-2 pt-4 sm:flex-row sm:justify-end">
							<Button
								className="w-full sm:w-auto"
								onClick={copyAllDetails}
								variant="outline"
							>
								<CopyIcon className="mr-2 h-4 w-4" />
								Copy All Details
							</Button>
						</div>
					</div>
				</ScrollArea>
			</SheetContent>
		</Sheet>
	);
};
