"use client";

import { DotsThreeIcon } from "@phosphor-icons/react";
import { EyeIcon } from "@phosphor-icons/react";
import { MouseMiddleClickIcon } from "@phosphor-icons/react";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { List } from "@/components/ui/composables/list";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { Goal } from "@/hooks/use-goals";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface GoalItemProps {
	analytics?: {
		total_users_entered: number;
		total_users_completed: number;
		overall_conversion_rate: number;
	} | null;
	goal: Goal;
	isLoadingAnalytics?: boolean;
	onDelete: (goalId: string) => void;
	onEdit: (goal: Goal) => void;
}

const GOAL_TYPE_CONFIG = {
	PAGE_VIEW: {
		icon: EyeIcon,
		bg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
	},
	EVENT: {
		icon: MouseMiddleClickIcon,
		bg: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
	},
} as const;

function MiniGoalChart({ rate }: { rate: number }) {
	const percentage = Math.max(0, Math.min(100, rate)) / 100;
	const activeLines = Math.floor(percentage * 24);

	return (
		<div className="flex h-5 w-32 items-end gap-[1.5px] lg:w-44">
			{Array.from({ length: 24 }).map((_, i) => (
				<div
					className={cn(
						"h-full w-[2px] rounded-sm",
						i < activeLines ? "bg-chart-1" : "scale-y-[0.6] bg-muted"
					)}
					key={`bar-${i + 1}`}
				/>
			))}
		</div>
	);
}

export function GoalItem({
	goal,
	analytics,
	isLoadingAnalytics,
	onEdit,
	onDelete,
}: GoalItemProps) {
	const rate = analytics?.overall_conversion_rate ?? 0;
	const users = analytics?.total_users_completed ?? 0;
	const config =
		GOAL_TYPE_CONFIG[goal.type as keyof typeof GOAL_TYPE_CONFIG] ??
		GOAL_TYPE_CONFIG.PAGE_VIEW;
	const TypeIcon = config.icon;

	return (
		<List.Row align="start" className={cn(!goal.isActive && "opacity-50")}>
			<List.Cell className="pt-0.5">
				<div
					className={cn(
						"flex size-8 items-center justify-center rounded",
						config.bg
					)}
				>
					<TypeIcon className="size-4" weight="duotone" />
				</div>
			</List.Cell>

			<List.Cell className="w-40 min-w-0 lg:w-52">
				<p className="wrap-break-word text-pretty font-medium text-foreground text-sm">
					{goal.name}
				</p>
			</List.Cell>

			<List.Cell grow>
				<p className="wrap-break-word text-pretty text-muted-foreground text-xs">
					{goal.target}
				</p>
			</List.Cell>

			<List.Cell className="hidden items-start gap-3 pt-0.5 lg:flex">
				{isLoadingAnalytics ? (
					<>
						<Skeleton className="h-5 w-32 rounded lg:w-44" />
						<div className="flex flex-col items-end gap-0.5">
							<Skeleton className="h-4 w-10 rounded" />
							<Skeleton className="h-3 w-8 rounded" />
						</div>
						<div className="flex flex-col items-end gap-0.5">
							<Skeleton className="h-4 w-10 rounded" />
							<Skeleton className="h-3 w-8 rounded" />
						</div>
					</>
				) : (
					<>
						<MiniGoalChart rate={rate} />
						<div className="flex w-16 flex-col items-end">
							<span className="font-semibold text-sm tabular-nums">
								{formatNumber(users)}
							</span>
							<span className="text-muted-foreground text-xs">Users</span>
						</div>
						<div className="flex w-16 flex-col items-end">
							<span className="font-semibold text-sm text-success tabular-nums">
								{rate.toFixed(1)}%
							</span>
							<span className="text-muted-foreground text-xs">Conversion</span>
						</div>
					</>
				)}
			</List.Cell>

			<List.Cell className="w-14 pt-0.5 text-right lg:hidden">
				{isLoadingAnalytics ? (
					<Skeleton className="ms-auto h-4 w-12 rounded" />
				) : (
					<span className="font-semibold text-sm tabular-nums">
						{rate.toFixed(1)}%
					</span>
				)}
			</List.Cell>

			<List.Cell action className="pt-0.5">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							aria-label="Goal actions"
							className="size-8 opacity-50 hover:opacity-100 data-[state=open]:opacity-100"
							data-dropdown-trigger
							size="icon"
							variant="ghost"
						>
							<DotsThreeIcon className="size-5" weight="bold" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-40">
						<DropdownMenuItem className="gap-2" onClick={() => onEdit(goal)}>
							<PencilSimpleIcon className="size-4" weight="duotone" />
							Edit
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="gap-2 text-destructive focus:text-destructive"
							onClick={() => onDelete(goal.id)}
							variant="destructive"
						>
							<TrashIcon className="size-4 fill-destructive" weight="duotone" />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</List.Cell>
		</List.Row>
	);
}

export function GoalItemSkeleton() {
	return (
		<div className="flex h-15 items-center gap-4 border-border/80 border-b px-4 last:border-b-0">
			<Skeleton className="size-8 rounded" />
			<div className="min-w-0 flex-1 space-y-1.5">
				<Skeleton className="h-4 w-36" />
				<Skeleton className="h-3 w-48 max-w-full" />
			</div>
			<div className="hidden items-center gap-3 lg:flex">
				<Skeleton className="h-5 w-32 rounded lg:w-44" />
				<Skeleton className="h-4 w-10 rounded" />
				<Skeleton className="h-4 w-10 rounded" />
			</div>
			<Skeleton className="ms-auto h-4 w-12 rounded lg:hidden" />
			<Skeleton className="size-8 rounded" />
		</div>
	);
}
