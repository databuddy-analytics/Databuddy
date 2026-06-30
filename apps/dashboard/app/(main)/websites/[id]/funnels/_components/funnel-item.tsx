"use client";

import { List } from "@/components/ui/composables/list";
import { Button, Skeleton } from "@databuddy/ui";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type {
	FunnelAnalyticsData,
	FunnelFilter,
	FunnelStep,
} from "@/types/funnels";
import {
	CaretRightIcon,
	DotsThreeIcon,
	PencilSimpleIcon,
	TrashIcon,
} from "@databuddy/ui/icons";
import { DropdownMenu } from "@databuddy/ui/client";

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
	readOnly?: boolean;
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
			<span className="flex h-5 w-32 items-end gap-[1.5px] lg:w-44">
				{[100, 70, 45, 25].map((w, i) => (
					<span
						className="h-full flex-1 rounded-sm bg-muted"
						key={`placeholder-${i + 1}`}
						style={{ width: `${w * 0.3}px` }}
					/>
				))}
			</span>
		);
	}

	return (
		<span className="flex h-5 w-32 items-end gap-[1.5px] lg:w-44">
			{steps.slice(0, 5).map((step, index) => {
				const percentage = (step.users / totalUsers) * 100;
				const width = Math.max(4, percentage * 0.3);
				const opacity = 1 - index * 0.15;

				return (
					<span
						className="h-full rounded-sm bg-chart-1"
						key={`step-${index + 1}`}
						style={{
							width: `${width}px`,
							opacity,
						}}
					/>
				);
			})}
		</span>
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
	readOnly = false,
	className,
	children,
}: FunnelItemProps) {
	const conversionRate = analytics?.overall_conversion_rate ?? 0;
	const totalUsers = analytics?.total_users_entered ?? 0;
	const stepsData = analytics?.steps_analytics ?? [];

	return (
		<div className={cn("w-full", className)}>
			<List.Row
				className={cn(
					"gap-0 px-0 py-0",
					isExpanded && "bg-accent/30",
					isLast && "border-b-0"
				)}
			>
				<Button
					className="min-h-15 min-w-0 flex-1 justify-start gap-4 rounded-none bg-transparent px-4 py-3 text-left font-normal text-foreground hover:bg-transparent active:scale-100"
					onClick={() => onToggle(funnel.id)}
					variant="ghost"
				>
					<span className="flex shrink-0 items-center">
						<span
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
						</span>
					</span>

					<span className="flex min-w-0 flex-1 items-center">
						<span className="w-full text-start">
							<span className="wrap-break-word block text-pretty font-medium text-foreground text-sm">
								{funnel.name}
							</span>
							{funnel.description ? (
								<span className="wrap-break-word mt-1 block text-pretty text-muted-foreground text-xs">
									{funnel.description}
								</span>
							) : null}
						</span>
					</span>

					<span className="hidden items-center gap-3 lg:flex">
						{isLoadingAnalytics ? (
							<>
								<Skeleton className="h-5 w-32 rounded lg:w-44" />
								<span className="flex flex-col items-end gap-0.5">
									<Skeleton className="h-4 w-10 rounded" />
									<Skeleton className="h-3 w-8 rounded" />
								</span>
								<span className="flex flex-col items-end gap-0.5">
									<Skeleton className="h-4 w-10 rounded" />
									<Skeleton className="h-3 w-8 rounded" />
								</span>
							</>
						) : (
							<>
								<MiniFunnelPreview steps={stepsData} totalUsers={totalUsers} />
								<span className="flex w-16 flex-col items-end">
									<span className="font-semibold text-sm tabular-nums">
										{formatNumber(totalUsers)}
									</span>
									<span className="text-muted-foreground text-xs">Users</span>
								</span>
								<span className="flex w-16 flex-col items-end">
									<span className="font-semibold text-sm text-success tabular-nums">
										{conversionRate.toFixed(1)}%
									</span>
									<span className="text-muted-foreground text-xs">
										Conversion
									</span>
								</span>
							</>
						)}
					</span>

					<span className="w-14 text-right lg:hidden">
						{isLoadingAnalytics ? (
							<Skeleton className="ms-auto h-4 w-12 rounded" />
						) : (
							<span className="font-semibold text-sm tabular-nums">
								{conversionRate.toFixed(1)}%
							</span>
						)}
					</span>
				</Button>

				{!readOnly && (
					<List.Cell action className="flex items-center pr-4">
						<DropdownMenu>
							<DropdownMenu.Trigger
								aria-label="Funnel actions"
								className="inline-flex size-8 items-center justify-center gap-1.5 rounded-md bg-transparent p-0 font-medium text-muted-foreground opacity-50 transition-all duration-(--duration-quick) ease-(--ease-smooth) hover:bg-interactive-hover hover:text-foreground hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 data-[state=open]:opacity-100"
								data-dropdown-trigger
							>
								<DotsThreeIcon className="size-5" weight="bold" />
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end" className="w-40">
								<DropdownMenu.Item
									className="gap-2"
									onClick={() => onEdit(funnel)}
								>
									<PencilSimpleIcon className="size-4" weight="duotone" />
									Edit
								</DropdownMenu.Item>
								<DropdownMenu.Separator />
								<DropdownMenu.Item
									className="gap-2 text-destructive focus:text-destructive"
									onClick={() => onDelete(funnel.id)}
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
