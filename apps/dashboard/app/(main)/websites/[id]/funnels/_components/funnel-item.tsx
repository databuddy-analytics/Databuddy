"use client";

import { CaretRightIcon } from "@phosphor-icons/react";
import { DotsThreeIcon } from "@phosphor-icons/react";
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
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type {
	FunnelAnalyticsData,
	FunnelFilter,
	FunnelStep,
} from "@/types/funnels";

export interface FunnelItemData {
	createdAt: string | Date;
	description?: string | null;
	filters?: FunnelFilter[];
	id: string;
	ignoreHistoricData?: boolean;
	isActive: boolean;
	name: string;
	steps: FunnelStep[];
	updatedAt: string | Date;
}

interface FunnelItemProps {
	analytics?: FunnelAnalyticsData | null;
	children?: React.ReactNode;
	className?: string;
	funnel: FunnelItemData;
	isExpanded: boolean;
	isLast?: boolean;
	isLoadingAnalytics?: boolean;
	onDelete: (funnelId: string) => void;
	onEdit: (funnel: FunnelItemData) => void;
	onToggle: (funnelId: string) => void;
}

function MiniFunnelPreview({
	steps,
	totalUsers,
}: {
	steps: { users: number }[];
	totalUsers: number;
}) {
	if (steps.length === 0 || totalUsers === 0) {
		return (
			<div className="flex h-5 w-32 items-end gap-[1.5px] lg:w-44">
				{[100, 70, 45, 25].map((w, i) => (
					<div
						className="h-full flex-1 rounded-sm bg-muted"
						key={`placeholder-${i + 1}`}
						style={{ width: `${w * 0.3}px` }}
					/>
				))}
			</div>
		);
	}

	return (
		<div className="flex h-5 w-32 items-end gap-[1.5px] lg:w-44">
			{steps.slice(0, 5).map((step, index) => {
				const percentage = (step.users / totalUsers) * 100;
				const width = Math.max(4, percentage * 0.3);
				const opacity = 1 - index * 0.15;

				return (
					<div
						className="h-full rounded-sm bg-chart-1"
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
	isLast = false,
	isLoadingAnalytics,
	onToggle,
	onEdit,
	onDelete,
	className,
	children,
}: FunnelItemProps) {
	const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
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
		<div className={cn("w-full", className)}>
			<List.Row
				asChild
				className={cn(
					"cursor-pointer",
					isExpanded && "bg-accent/30",
					isLast && "border-b-0"
				)}
			>
				{/* biome-ignore lint/a11y/useSemanticElements: List.Row asChild replaces this element; a real <button> would nest inside the dropdown-menu trigger */}
				<div
					onClick={handleClick}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							onToggle(funnel.id);
						}
					}}
					role="button"
					tabIndex={0}
				>
					<List.Cell>
						<div
							className={cn(
								"flex size-8 shrink-0 items-center justify-center rounded border transition-colors",
								isExpanded
									? "border-border bg-accent/40 text-foreground"
									: "border-transparent bg-muted text-muted-foreground"
							)}
						>
							<CaretRightIcon
								className={cn(
									"size-4 transition-transform duration-200",
									isExpanded && "rotate-90"
								)}
								weight="fill"
							/>
						</div>
					</List.Cell>

					<List.Cell className="min-w-0" grow>
						<div className="w-full text-start">
							<p className="wrap-break-word text-pretty font-medium text-foreground text-sm">
								{funnel.name}
							</p>
							{funnel.description ? (
								<p className="wrap-break-word mt-1 text-pretty text-muted-foreground text-xs">
									{funnel.description}
								</p>
							) : null}
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
						) : (
							<>
								<MiniFunnelPreview steps={stepsData} totalUsers={totalUsers} />
								<div className="flex w-16 flex-col items-end">
									<span className="font-semibold text-sm tabular-nums">
										{formatNumber(totalUsers)}
									</span>
									<span className="text-muted-foreground text-xs">Users</span>
								</div>
								<div className="flex w-16 flex-col items-end">
									<span className="font-semibold text-sm text-success tabular-nums">
										{conversionRate.toFixed(1)}%
									</span>
									<span className="text-muted-foreground text-xs">
										Conversion
									</span>
								</div>
							</>
						)}
					</List.Cell>

					<List.Cell className="w-14 text-right lg:hidden">
						{isLoadingAnalytics ? (
							<Skeleton className="ms-auto h-4 w-12 rounded" />
						) : (
							<span className="font-semibold text-sm tabular-nums">
								{conversionRate.toFixed(1)}%
							</span>
						)}
					</List.Cell>

					<List.Cell action>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									aria-label="Funnel actions"
									className="size-8 opacity-50 hover:opacity-100 data-[state=open]:opacity-100"
									data-dropdown-trigger
									size="icon"
									variant="ghost"
								>
									<DotsThreeIcon className="size-5" weight="bold" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-40">
								<DropdownMenuItem
									className="gap-2"
									onClick={() => onEdit(funnel)}
								>
									<PencilSimpleIcon className="size-4" weight="duotone" />
									Edit
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									className="gap-2 text-destructive focus:text-destructive"
									onClick={() => onDelete(funnel.id)}
									variant="destructive"
								>
									<TrashIcon
										className="size-4 fill-destructive"
										weight="duotone"
									/>
									Delete
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</List.Cell>
				</div>
			</List.Row>

			{isExpanded ? (
				<section className="border-border/80 border-t bg-background">
					<div className="p-4 sm:p-6">{children}</div>
				</section>
			) : null}
		</div>
	);
}

export function FunnelItemSkeleton() {
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
