"use client";

import { List } from "@/components/ui/composables/list";
import { Skeleton } from "@databuddy/ui";
import type { Goal, GoalAnalyticsResult } from "@/hooks/use-goals";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
	DotsThreeIcon,
	PencilSimpleIcon,
	TargetIcon,
	TrashIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";
import { DropdownMenu } from "@databuddy/ui/client";

interface GoalItemProps {
	analytics?: GoalAnalyticsResult;
	goal: Goal;
	isLoadingAnalytics?: boolean;
	onDelete: (goalId: string) => void;
	onEdit: (goal: Goal) => void;
	readOnly?: boolean;
}

function GoalProgress({ rate }: { rate: number }) {
	const clampedRate = Math.max(0, Math.min(100, rate));
	return (
		<span className="block h-5 w-32 overflow-hidden rounded bg-muted lg:w-44">
			<div
				className="h-full rounded bg-chart-1 transition-[width]"
				style={{ width: `${clampedRate}%` }}
			/>
		</span>
	);
}

function formatGoalType(type: Goal["type"]) {
	if (type === "PAGE_VIEW") {
		return "Page View";
	}
	if (type === "EVENT") {
		return "Event";
	}
	return "Custom";
}

function GoalMetadata({ goal }: { goal: Goal }) {
	return (
		<p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-muted-foreground text-xs">
			<span className="shrink-0">{formatGoalType(goal.type)}</span>
			<span aria-hidden="true" className="shrink-0">
				·
			</span>
			<span className="min-w-0 max-w-full truncate font-mono">
				{goal.target}
			</span>
			{goal.description ? (
				<>
					<span aria-hidden="true" className="shrink-0">
						·
					</span>
					<span className="min-w-0 max-w-full truncate">
						{goal.description}
					</span>
				</>
			) : null}
		</p>
	);
}

export function GoalItem({
	goal,
	analytics,
	isLoadingAnalytics,
	onEdit,
	onDelete,
	readOnly = false,
}: GoalItemProps) {
	const analyticsData = analytics?.ok ? analytics.data : null;
	const analyticsError = analytics && !analytics.ok ? analytics.error : null;
	const rate = analyticsData?.overall_conversion_rate ?? 0;
	const users = analyticsData?.total_users_completed ?? 0;

	return (
		<List.Row className={cn(!goal.isActive && "opacity-50")}>
			<List.Cell>
				<div className="flex size-8 shrink-0 items-center justify-center rounded border border-transparent bg-muted text-muted-foreground">
					<TargetIcon className="size-4" weight="duotone" />
				</div>
			</List.Cell>

			<List.Cell grow>
				<div className="min-w-0 flex-1 text-start">
					<p className="truncate font-medium text-foreground text-sm">
						{goal.name}
					</p>
					<GoalMetadata goal={goal} />
				</div>
			</List.Cell>

			<List.Cell className="hidden items-center gap-3 lg:flex">
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
				) : analyticsError ? (
					<div className="flex w-72 items-center justify-end gap-2 text-destructive text-xs">
						<WarningCircleIcon className="size-4 shrink-0" weight="duotone" />
						<span className="truncate">{analyticsError}</span>
					</div>
				) : (
					<>
						<GoalProgress rate={rate} />
						<div className="flex w-16 flex-col items-end">
							<span className="font-semibold text-sm tabular-nums">
								{formatNumber(users)}
							</span>
							<span className="text-muted-foreground text-xs">Completions</span>
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

			<List.Cell className="w-14 text-right lg:hidden">
				{isLoadingAnalytics ? (
					<Skeleton className="ms-auto h-4 w-12 rounded" />
				) : analyticsError ? (
					<WarningCircleIcon
						className="ms-auto size-4 text-destructive"
						weight="duotone"
					/>
				) : (
					<span className="font-semibold text-sm tabular-nums">
						{rate.toFixed(1)}%
					</span>
				)}
			</List.Cell>

			{!readOnly && (
				<List.Cell action>
					<DropdownMenu>
						<DropdownMenu.Trigger
							aria-label="Goal actions"
							className="inline-flex size-8 items-center justify-center gap-1.5 rounded-md bg-transparent p-0 font-medium text-muted-foreground opacity-50 transition-all duration-(--duration-quick) ease-(--ease-smooth) hover:bg-interactive-hover hover:text-foreground hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 data-[state=open]:opacity-100"
							data-dropdown-trigger
						>
							<DotsThreeIcon className="size-5" weight="bold" />
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" className="w-40">
							<DropdownMenu.Item className="gap-2" onClick={() => onEdit(goal)}>
								<PencilSimpleIcon className="size-4" weight="duotone" />
								Edit
							</DropdownMenu.Item>
							<DropdownMenu.Separator />
							<DropdownMenu.Item
								className="gap-2 text-destructive focus:text-destructive"
								onClick={() => onDelete(goal.id)}
								variant="destructive"
							>
								<TrashIcon
									className="size-4 fill-destructive"
									weight="duotone"
								/>
								Delete
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu>
				</List.Cell>
			)}
		</List.Row>
	);
}

export function GoalItemSkeleton() {
	return (
		<div className="flex h-15 items-center gap-4 border-border/80 border-b px-4 py-3 last:border-b-0">
			<Skeleton className="size-8 shrink-0 rounded" />
			<div className="min-w-0 flex-1 space-y-1.5">
				<Skeleton className="h-4 w-36 max-w-full" />
				<Skeleton className="h-3 w-48 max-w-full" />
			</div>
			<div className="hidden shrink-0 items-center gap-3 lg:flex">
				<Skeleton className="h-5 w-32 rounded lg:w-44" />
				<Skeleton className="h-4 w-10 rounded" />
				<Skeleton className="h-4 w-10 rounded" />
			</div>
			<Skeleton className="ms-auto h-4 w-12 shrink-0 rounded lg:hidden" />
			<Skeleton className="size-8 shrink-0 rounded" />
		</div>
	);
}
