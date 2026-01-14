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
import type { FunnelFilter, FunnelStep } from "@/hooks/use-funnels";
import { cn } from "@/lib/utils";
import type { FunnelAnalyticsData } from "@/types/funnels";

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
						className="h-full rounded-sm bg-primary transition-all"
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
			target.closest("button") ||
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
				className="group flex cursor-pointer select-none items-center hover:bg-accent/50"
				onClick={handleClick}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						onToggle(funnel.id);
					}
				}}
				tabIndex={0}
				type="button"
			>
				<div className="flex flex-1 items-center gap-4 px-4 py-3 sm:px-6 sm:py-4">
					{/* Expand indicator */}
					<CaretRightIcon
						className={cn(
							"size-4 shrink-0 text-muted-foreground transition-transform duration-200",
							isExpanded && "rotate-90"
						)}
						weight="bold"
					/>

					{/* Name & description */}
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<h3 className="truncate font-medium text-foreground">
								{funnel.name}
							</h3>
							<Badge className="shrink-0" variant="gray">
								{funnel.steps.length} steps
							</Badge>
						</div>
						{funnel.description && (
							<p className="mt-0.5 truncate text-muted-foreground text-sm">
								{funnel.description}
							</p>
						)}
					</div>

					{/* Stats - Desktop */}
					<div className="hidden items-center gap-6 lg:flex">
						{isLoadingAnalytics ? (
							<>
								<Skeleton className="h-6 w-16" />
								<Skeleton className="h-6 w-16" />
								<Skeleton className="h-6 w-20" />
							</>
						) : (
							<>
								{/* Mini funnel visualization */}
								<MiniFunnelPreview steps={stepsData} totalUsers={totalUsers} />

								{/* Users count */}
								<div className="w-16 text-right">
									<div className="font-semibold tabular-nums">
										{formatNumber(totalUsers)}
									</div>
									<div className="text-muted-foreground text-xs">users</div>
								</div>

								{/* Conversion rate */}
								<div className="w-16 text-right">
									<div className="font-semibold text-success tabular-nums">
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
								aria-label="Funnel actions"
								className="size-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
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
		<div className="flex items-center border-border border-b px-4 py-3 sm:px-6 sm:py-4">
			<div className="flex flex-1 items-center gap-4">
				<Skeleton className="size-4 shrink-0" />
				<div className="min-w-0 flex-1 space-y-1.5">
					<div className="flex items-center gap-2">
						<Skeleton className="h-5 w-40" />
						<Skeleton className="h-5 w-16" />
					</div>
					<Skeleton className="h-4 w-64" />
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
