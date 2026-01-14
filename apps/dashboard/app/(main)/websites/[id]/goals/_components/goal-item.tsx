"use client";

import {
	DotsThreeIcon,
	EyeIcon,
	MouseMiddleClickIcon,
	PencilSimpleIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { Goal } from "@/hooks/use-goals";
import { cn } from "@/lib/utils";

interface GoalItemProps {
	goal: Goal;
	analytics?: {
		total_users_entered: number;
		total_users_completed: number;
		overall_conversion_rate: number;
	} | null;
	isLoadingAnalytics?: boolean;
	onEdit: (goal: Goal) => void;
	onDelete: (goalId: string) => void;
	className?: string;
}

function formatNumber(num: number): string {
	if (num >= 1_000_000) {
		return `${(num / 1_000_000).toFixed(1)}M`;
	}
	if (num >= 1000) {
		return `${(num / 1000).toFixed(1)}K`;
	}
	return num.toLocaleString();
}

function GoalTypeIcon({ type }: { type: string }) {
	if (type === "EVENT") {
		return (
			<MouseMiddleClickIcon
				className="size-4 text-muted-foreground"
				weight="duotone"
			/>
		);
	}
	return <EyeIcon className="size-4 text-muted-foreground" weight="duotone" />;
}

function MiniProgressLines({ conversionRate }: { conversionRate: number }) {
	const lineCount = 24;
	const percentage = Math.max(0, Math.min(100, conversionRate)) / 100;
	const activeLines = Math.floor(percentage * lineCount);

	return (
		<div className="flex h-7 w-32 items-center gap-[3px]">
			{Array.from({ length: lineCount }).map((_, index) => {
				const isActive = index < activeLines;
				return (
					<div
						className="h-full w-[2px] rounded-sm transition-all"
						key={`line-${index}`}
						style={{
							backgroundColor: isActive ? "var(--primary)" : "var(--muted)",
							transform: isActive ? "scaleY(1)" : "scaleY(0.6)",
						}}
					/>
				);
			})}
		</div>
	);
}

export function GoalItem({
	goal,
	analytics,
	isLoadingAnalytics,
	onEdit,
	onDelete,
	className,
}: GoalItemProps) {
	const conversionRate = analytics?.overall_conversion_rate ?? 0;
	const totalUsers = analytics?.total_users_entered ?? 0;

	return (
		<div className={cn("border-border border-b", className)}>
			{/* Main row */}
			<div className="group flex items-center hover:bg-accent/50">
				<div className="flex flex-1 items-center gap-4 px-4 py-3 sm:px-6 sm:py-4">
					{/* Type icon */}
					<GoalTypeIcon type={goal.type} />

					{/* Name & target */}
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<h3 className="truncate font-medium text-foreground">
								{goal.name}
							</h3>
							<Badge className="shrink-0" variant="gray">
								{goal.type === "PAGE_VIEW" ? "Page" : "Event"}
							</Badge>
							{!goal.isActive && (
								<Badge className="shrink-0" variant="secondary">
									Paused
								</Badge>
							)}
						</div>
						<p className="mt-0.5 truncate text-muted-foreground text-sm">
							{goal.target}
						</p>
					</div>

					{/* Stats - Desktop */}
					<div className="hidden items-center gap-6 lg:flex">
						{isLoadingAnalytics ? (
							<>
								<Skeleton className="h-6 w-20" />
								<Skeleton className="h-6 w-16" />
								<Skeleton className="h-6 w-16" />
							</>
						) : (
							<>
								{/* Mini line visualization */}
								<MiniProgressLines conversionRate={conversionRate} />

								{/* Users count */}
								<div className="w-16 text-right">
									<div className="font-semibold tabular-nums">
										{formatNumber(totalUsers)}
									</div>
									<div className="text-muted-foreground text-xs">users</div>
								</div>

								{/* Conversion rate */}
								<div className="w-16 text-right">
									<div className="font-semibold text-primary tabular-nums">
										{conversionRate.toFixed(1)}%
									</div>
									<div className="text-muted-foreground text-xs">
										conversion
									</div>
								</div>
							</>
						)}
					</div>

					{/* Stats - Mobile */}
					<div className="flex items-center gap-3 lg:hidden">
						{isLoadingAnalytics ? (
							<Skeleton className="h-5 w-12" />
						) : (
							<span className="font-semibold text-primary tabular-nums">
								{conversionRate.toFixed(1)}%
							</span>
						)}
					</div>

					{/* Actions */}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								aria-label="Goal actions"
								className="size-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
								size="icon"
								variant="ghost"
							>
								<DotsThreeIcon className="size-5" weight="bold" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-40">
							<DropdownMenuItem onClick={() => onEdit(goal)}>
								<PencilSimpleIcon className="size-4" weight="duotone" />
								Edit
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="text-destructive focus:text-destructive"
								onClick={() => onDelete(goal.id)}
							>
								<TrashIcon className="size-4" weight="duotone" />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		</div>
	);
}

export function GoalItemSkeleton() {
	return (
		<div className="flex items-center border-border border-b px-4 py-3 sm:px-6 sm:py-4">
			<div className="flex flex-1 items-center gap-4">
				<Skeleton className="size-4 shrink-0" />
				<div className="min-w-0 flex-1 space-y-1.5">
					<div className="flex items-center gap-2">
						<Skeleton className="h-5 w-40" />
						<Skeleton className="h-5 w-12" />
					</div>
					<Skeleton className="h-4 w-48" />
				</div>
				<div className="hidden items-center gap-6 lg:flex">
					<Skeleton className="h-6 w-20" />
					<div className="w-16 space-y-1 text-right">
						<Skeleton className="ml-auto h-5 w-12" />
						<Skeleton className="ml-auto h-3 w-10" />
					</div>
					<div className="w-16 space-y-1 text-right">
						<Skeleton className="ml-auto h-5 w-10" />
						<Skeleton className="ml-auto h-3 w-14" />
					</div>
				</div>
				<Skeleton className="size-8 shrink-0" />
			</div>
		</div>
	);
}
