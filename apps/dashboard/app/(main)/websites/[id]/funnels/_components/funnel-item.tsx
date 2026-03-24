"use client";

import {
	CaretRightIcon,
	DotsThreeIcon,
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
import { cn } from "@/lib/utils";
import type {
	FunnelAnalyticsData,
	FunnelFilter,
	FunnelStep,
} from "@/types/funnels";

export interface FunnelItemData {
	id: string;
	name: string;
	description?: string | null;
	steps: FunnelStep[];
	filters?: FunnelFilter[];
	ignoreHistoricData?: boolean;
	isActive: boolean;
	createdAt: string | Date;
	updatedAt: string | Date;
}

interface FunnelItemProps {
	funnel: FunnelItemData;
	analytics?: FunnelAnalyticsData | null;
	isExpanded: boolean;
	isLoadingAnalytics?: boolean;
	onToggle: (funnelId: string) => void;
	onEdit: (funnel: FunnelItemData) => void;
	onDelete: (funnelId: string) => void;
	children?: React.ReactNode;
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

// Mini funnel bars for preview
function MiniFunnelPreview({
	steps,
	totalUsers,
}: {
	steps: { users: number }[];
	totalUsers: number;
}) {
	if (steps.length === 0 || totalUsers === 0) {
		return (
			<div className="flex h-6 items-center gap-0.5">
				{[100, 70, 45, 25].map((w, i) => (
					<div
						className="h-full rounded-sm bg-muted"
						key={`placeholder-${i + 1}`}
						style={{ width: `${w * 0.3}px` }}
					/>
				))}
			</div>
		);
	}

	return (
		<div className="flex h-6 items-center gap-0.5">
			{steps.slice(0, 5).map((step, index) => {
				const percentage = (step.users / totalUsers) * 100;
				const width = Math.max(4, percentage * 0.3);
				const opacity = 1 - index * 0.15;

				return (
					<div
						className="h-full rounded-sm bg-chart-1 transition-all"
						key={`step-${index + 1}`}
						style={{
							width: `${width}px`,
							opacity,
						}}
					/>
				);
			})}
		</div>
	);
}

export function FunnelItem({
	funnel,
	analytics,
	isExpanded,
	isLoadingAnalytics,
	onToggle,
	onEdit,
	onDelete,
	className,
	children,
}: FunnelItemProps) {
	const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
		const target = e.target as HTMLElement;
		if (
			target.closest("[data-dropdown-trigger]") ||
			target.closest("[data-radix-popper-content-wrapper]")
		) {
			return;
		}
		onToggle(funnel.id);
	};

	const conversionRate = analytics?.overall_conversion_rate ?? 0;
	const totalUsers = analytics?.total_users_entered ?? 0;
	const stepsData = analytics?.steps_analytics ?? [];

	return (
		<div
			className={cn(
				"border-border border-b",
				className,
				isExpanded && "bg-accent/30"
			)}
		>
			<button
				className="group flex w-full cursor-pointer select-none text-left hover:bg-accent/50"
				onClick={handleClick}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						onToggle(funnel.id);
					}
				}}
				tabIndex={0}
				type="button"
			>
				<div className="flex h-20 min-w-0 flex-1 items-center gap-3 px-4 sm:gap-4 sm:px-5">
					<CaretRightIcon
						className={cn(
							"size-4 shrink-0 text-muted-foreground transition-transform duration-200",
							isExpanded && "rotate-90"
						)}
						weight="bold"
					/>

					<div className="min-w-0 flex-1 overflow-hidden">
						<div className="flex items-baseline gap-2">
							<h3 className="min-w-0 truncate font-medium text-foreground">
								{funnel.name}
							</h3>
							<Badge className="shrink-0" variant="gray">
								{funnel.steps.length} steps
							</Badge>
						</div>
						{funnel.description ? (
							<p className="mt-0.5 line-clamp-1 text-muted-foreground text-sm">
								{funnel.description}
							</p>
						) : null}
					</div>

					<div className="hidden shrink-0 items-center gap-5 lg:flex">
						{isLoadingAnalytics ? (
							<>
								<Skeleton className="h-5 w-14" />
								<Skeleton className="h-5 w-12" />
								<Skeleton className="h-5 w-14" />
							</>
						) : (
							<>
								<MiniFunnelPreview steps={stepsData} totalUsers={totalUsers} />
								<div className="flex flex-col items-end">
									<span className="font-semibold tabular-nums">
										{formatNumber(totalUsers)}
									</span>
									<span className="text-muted-foreground text-xs">Users</span>
								</div>
								<div className="flex flex-col items-end">
									<span className="font-semibold text-success tabular-nums">
										{conversionRate.toFixed(1)}%
									</span>
									<span className="text-muted-foreground text-xs">
										Conversion
									</span>
								</div>
							</>
						)}
					</div>

					<div className="flex shrink-0 lg:hidden">
						{isLoadingAnalytics ? (
							<Skeleton className="h-5 w-12" />
						) : (
							<span className="font-semibold tabular-nums">
								{conversionRate.toFixed(1)}%
							</span>
						)}
					</div>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								aria-label="Funnel actions"
								className="size-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
								data-dropdown-trigger
								size="icon"
								variant="ghost"
							>
								<DotsThreeIcon className="size-5" weight="bold" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-40">
							<DropdownMenuItem onClick={() => onEdit(funnel)}>
								<PencilSimpleIcon className="size-4" weight="duotone" />
								Edit
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="text-destructive focus:text-destructive"
								onClick={() => onDelete(funnel.id)}
							>
								<TrashIcon className="size-4" weight="duotone" />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</button>

			{/* Expanded content */}
			{isExpanded && (
				<section className="border-border border-t bg-background">
					<div className="p-4 sm:p-6">{children}</div>
				</section>
			)}
		</div>
	);
}

export function FunnelItemSkeleton() {
	return (
		<div className="flex h-20 items-center border-border border-b px-4 sm:px-5">
			<div className="flex min-w-0 flex-1 items-center gap-3">
				<Skeleton className="size-4 shrink-0" />
				<div className="min-w-0 flex-1 space-y-1.5">
					<div className="flex items-center gap-2">
						<Skeleton className="h-4 w-36" />
						<Skeleton className="h-5 w-14" />
					</div>
					<Skeleton className="h-3.5 w-48" />
				</div>
				<div className="hidden items-center gap-5 lg:flex">
					<Skeleton className="h-5 w-14" />
					<div className="flex flex-col items-end gap-0.5">
						<Skeleton className="h-4 w-10" />
						<Skeleton className="h-3 w-8" />
					</div>
					<div className="flex flex-col items-end gap-0.5">
						<Skeleton className="h-4 w-10" />
						<Skeleton className="h-3 w-8" />
					</div>
				</div>
				<Skeleton className="size-8 shrink-0" />
			</div>
		</div>
	);
}
