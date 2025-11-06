"use client";

import type { QueryPerformanceSummary } from "@databuddy/shared/types/performance";
import {
	ChartLineIcon,
	ClockIcon,
	DatabaseIcon,
	EyeIcon,
	TrendUpIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { SqlHighlighter } from "../../performance/_components/sql-highlighter";

interface QueryRowProps {
	query: QueryPerformanceSummary;
	onClick: () => void;
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

const getPerformanceLevel = (time: number) => {
	if (time < 10) {
		return {
			level: "Excellent",
			color: "border-green-500 bg-green-50 text-green-700",
		};
	}
	if (time < 50) {
		return { level: "Good", color: "border-blue-500 bg-blue-50 text-blue-700" };
	}
	if (time < 100) {
		return {
			level: "Fair",
			color: "border-yellow-500 bg-yellow-50 text-yellow-700",
		};
	}
	if (time < 500) {
		return {
			level: "Poor",
			color: "border-orange-500 bg-orange-50 text-orange-700",
		};
	}
	return { level: "Critical", color: "border-red-500 bg-red-50 text-red-700" };
};

const cleanQueryComments = (query: string): string =>
	query
		.replace(/--.*$/gm, "")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.trim();

export const QueryRow = ({ query, onClick }: QueryRowProps) => {
	const performance = getPerformanceLevel(query.mean_exec_time);
	const cleanedQuery = cleanQueryComments(query.query);

	return (
		<button
			className="w-full cursor-pointer rounded border bg-card p-6 text-left transition-all hover:border-primary/20 hover:bg-muted/50 hover:shadow-sm"
			onClick={onClick}
			type="button"
		>
			{/* Header */}
			<div className="mb-4 flex items-center justify-between">
				<div className="flex items-center gap-3">
					<DatabaseIcon
						className="h-5 w-5 text-muted-foreground"
						weight="duotone"
					/>
					<Badge className={`${performance.color} border text-xs`}>
						{performance.level}
					</Badge>
					<span className="text-muted-foreground text-sm">
						ID: {query.queryid}
					</span>
				</div>
				<div className="text-right">
					<div className="font-semibold text-lg">
						{formatTime(query.mean_exec_time)}
					</div>
					<div className="text-muted-foreground text-xs">Average</div>
				</div>
			</div>

			{/* SQL Query */}
			<div className="mb-4">
				<SqlHighlighter className="text-sm" code={cleanedQuery} />
			</div>

			{/* Separator */}
			<div className="mb-4 border-border/50 border-t" />

			{/* Metrics */}
			<div className="grid grid-cols-4 gap-3">
				<div className="rounded bg-muted/30 p-3 text-center">
					<div className="flex items-center justify-center gap-1 text-muted-foreground text-xs">
						<TrendUpIcon className="h-3 w-3" />
						Calls
					</div>
					<div className="font-semibold text-sm">
						{query.calls.toLocaleString()}
					</div>
				</div>
				<div className="rounded bg-muted/30 p-3 text-center">
					<div className="flex items-center justify-center gap-1 text-muted-foreground text-xs">
						<ClockIcon className="h-3 w-3" />
						Total
					</div>
					<div className="font-semibold text-sm">
						{formatTime(query.total_exec_time)}
					</div>
				</div>
				<div className="rounded bg-muted/30 p-3 text-center">
					<div className="flex items-center justify-center gap-1 text-muted-foreground text-xs">
						<EyeIcon className="h-3 w-3" />
						Cache
					</div>
					<div className="font-semibold text-sm">
						{query.cache_hit_ratio.toFixed(1)}%
					</div>
				</div>
				<div className="rounded bg-muted/30 p-3 text-center">
					<div className="flex items-center justify-center gap-1 text-muted-foreground text-xs">
						<ChartLineIcon className="h-3 w-3" />
						Resource
					</div>
					<div className="font-semibold text-sm">
						{query.percentage_of_total_time.toFixed(1)}%
					</div>
				</div>
			</div>
		</button>
	);
};
