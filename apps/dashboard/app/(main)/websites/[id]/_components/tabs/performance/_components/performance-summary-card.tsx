"use client";

import {
	CheckCircleIcon,
	LightningIcon,
	QuestionIcon,
	TrendUpIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PerformanceSummary } from "@/types/performance";
import {
	formatNumber,
	formatPerformanceTime,
	getPerformanceColor,
	getPerformanceRating,
	getPerformanceScoreColor,
} from "../_utils/performance-utils";

type FilterButtonProps = {
	filter: "fast" | "slow";
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	value: number;
	percentage: number;
	colorClass: string;
	activeFilter: "fast" | "slow" | null;
	onFilterChange: (filter: "fast" | "slow" | null) => void;
};

const FilterButton = ({
	filter,
	icon: Icon,
	label,
	value,
	percentage,
	colorClass,
	activeFilter,
	onFilterChange,
}: FilterButtonProps) => {
	const isActive = activeFilter === filter;
	const baseClasses =
		"w-full cursor-pointer rounded border bg-sidebar p-4 text-left transition-all hover:shadow-sm";
	const activeClasses =
		filter === "fast"
			? "bg-green-50 ring-1 ring-green-500/20 border-green-500 dark:bg-green-950/20"
			: "bg-red-50 ring-1 ring-red-500/20 border-red-500 dark:bg-red-950/20";
	const inactiveClasses = "hover:bg-sidebar/80 hover:border-primary/50";
	const badgeClasses =
		filter === "fast"
			? "rounded bg-green-100 px-1.5 py-0.5 text-green-800 text-xs dark:bg-green-900 dark:text-green-200"
			: "rounded bg-red-100 px-1.5 py-0.5 text-red-800 text-xs dark:bg-red-900 dark:text-red-200";

	return (
		<button
			className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
			onClick={() => {
				onFilterChange(isActive ? null : filter);
			}}
			type="button"
		>
			<div className="mb-2 flex items-center gap-2">
				<Icon
					className={`size-4 ${filter === "fast" ? "text-green-500" : "text-red-500"}`}
				/>
				<span className="font-medium text-sidebar-foreground/70 text-sm">
					{label}
				</span>
				{isActive && <span className={badgeClasses}>Active</span>}
			</div>
			<div className={`font-bold text-2xl ${colorClass}`}>
				{formatNumber(value)}
				<span className="ml-1 text-sidebar-foreground/70 text-sm">
					({Math.round(percentage)}%)
				</span>
			</div>
		</button>
	);
};

type PerformanceSummaryCardProps = {
	summary: PerformanceSummary;
	activeFilter: "fast" | "slow" | null;
	onFilterChange: (filter: "fast" | "slow" | null) => void; // TODO: fix this
};

export function PerformanceSummaryCard({
	summary,
	activeFilter,
	onFilterChange,
}: PerformanceSummaryCardProps) {
	const performanceColor = getPerformanceScoreColor(summary.performanceScore);
	const avgLoadTimeColor = getPerformanceColor(summary.avgLoadTime);

	const ratingInfo = getPerformanceRating(summary.performanceScore);

	return (
		<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
			<div className="rounded border bg-sidebar p-4">
				<div className="mb-2 flex items-center gap-2">
					<LightningIcon className="size-4 text-primary" />
					<span className="font-medium text-sidebar-foreground/70 text-sm">
						Performance Score
					</span>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger>
								<QuestionIcon className="size-3 text-sidebar-foreground/50" />
							</TooltipTrigger>
							<TooltipContent>
								<p>
									A weighted score based on page load times and visitor counts.
								</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
				<div className={`font-bold text-2xl ${performanceColor}`}>
					{summary.performanceScore}/100
				</div>
				<div className={`font-medium text-sm ${ratingInfo.className}`}>
					{ratingInfo.rating}
				</div>
			</div>

			<div className="rounded border bg-sidebar p-4">
				<div className="mb-2 flex items-center gap-2">
					<TrendUpIcon className="size-4 text-sidebar-foreground/70" />
					<span className="font-medium text-sidebar-foreground/70 text-sm">
						Avg Load Time
					</span>
				</div>
				<div className={`font-bold text-2xl ${avgLoadTimeColor}`}>
					{formatPerformanceTime(summary.avgLoadTime)}
				</div>
			</div>

			<FilterButton
				activeFilter={activeFilter}
				colorClass="text-green-600"
				filter="fast"
				icon={CheckCircleIcon}
				label="Fast Pages"
				onFilterChange={onFilterChange}
				percentage={(summary.fastPages / summary.totalPages) * 100}
				value={summary.fastPages}
			/>

			<FilterButton
				activeFilter={activeFilter}
				colorClass="text-red-600"
				filter="slow"
				icon={WarningIcon}
				label="Slow Pages"
				onFilterChange={onFilterChange}
				percentage={(summary.slowPages / summary.totalPages) * 100}
				value={summary.slowPages}
			/>
		</div>
	);
}
