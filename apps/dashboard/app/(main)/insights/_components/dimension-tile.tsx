"use client";

import type { ElementType, ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/formatters";
import { changePercentChipClassName } from "@/lib/insight-signal-key";
import { cn } from "@/lib/utils";

export interface DimensionRow {
	change: number;
	current: number;
	key: string;
	label: string;
	previous: number;
}

interface DimensionTileProps {
	emptyMessage?: string;
	formatValue?: (value: number) => string;
	icon: ElementType;
	isError?: boolean;
	isLoading?: boolean;
	onRetry?: () => void;
	renderRowIcon?: (row: DimensionRow) => ReactNode;
	rows: DimensionRow[] | undefined;
	title: string;
}

export function DimensionTile({
	title,
	icon: Icon,
	rows,
	isLoading = false,
	isError = false,
	onRetry,
	formatValue = formatNumber,
	emptyMessage = "No data yet",
	renderRowIcon,
}: DimensionTileProps) {
	const hasRows =
		!(isLoading || isError) && rows !== undefined && rows.length > 0;
	const maxValue = hasRows ? Math.max(...rows.map((r) => r.current), 1) : 1;

	return (
		<section
			aria-label={title}
			className="flex flex-col rounded border bg-card"
		>
			<div className="flex items-center gap-2 border-b px-4 py-3">
				<div className="flex size-7 shrink-0 items-center justify-center rounded bg-accent text-muted-foreground">
					<Icon aria-hidden className="size-4" weight="duotone" />
				</div>
				<h3 className="font-semibold text-foreground text-sm">{title}</h3>
			</div>

			<div className="flex-1 px-2 py-2">
				{isError && (
					<div className="flex items-center gap-3 px-2 py-3">
						<p className="text-muted-foreground text-xs">Couldn't load</p>
						{onRetry && (
							<button
								className="inline-flex items-center gap-1 rounded text-primary text-xs transition-colors hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
								onClick={onRetry}
								type="button"
							>
								Retry
							</button>
						)}
					</div>
				)}

				{!isError && isLoading && (
					<ul className="flex flex-col">
						{Array.from({ length: 5 }, (_, i) => (
							<li
								className="flex items-center justify-between gap-3 px-2 py-2"
								key={`dim-skeleton-${i}`}
							>
								<Skeleton className="h-4 w-28 rounded" />
								<Skeleton className="h-4 w-12 rounded" />
							</li>
						))}
					</ul>
				)}

				{hasRows && (
					<ul className="flex flex-col">
						{rows.map((row) => {
							const pct = (row.current / maxValue) * 100;
							return (
								<li
									className="group relative flex items-center gap-3 rounded-sm px-2 py-2 transition-colors"
									key={row.key}
								>
									<div
										aria-hidden
										className="absolute inset-y-1 left-1 rounded-sm bg-primary/[0.08] transition-all group-hover:bg-primary/[0.12]"
										style={{ width: `calc(${pct}% - 0.5rem)` }}
									/>
									<div className="relative flex min-w-0 flex-1 items-center gap-2">
										{renderRowIcon && (
											<span className="flex size-4 shrink-0 items-center justify-center">
												{renderRowIcon(row)}
											</span>
										)}
										<span className="truncate font-medium text-foreground text-sm">
											{row.label}
										</span>
									</div>
									<div className="relative flex shrink-0 items-center gap-2 tabular-nums">
										<span className="font-medium text-foreground text-sm">
											{formatValue(row.current)}
										</span>
										{row.change !== 0 && (
											<span
												className={cn(
													"font-medium text-[11px]",
													changePercentChipClassName(row.change)
												)}
											>
												{row.change > 0 ? "+" : ""}
												{row.change.toFixed(0)}%
											</span>
										)}
									</div>
								</li>
							);
						})}
					</ul>
				)}

				{!(isError || isLoading) && rows !== undefined && rows.length === 0 && (
					<p className="px-2 py-3 text-muted-foreground text-xs">
						{emptyMessage}
					</p>
				)}
			</div>
		</section>
	);
}
