"use client";

import type { ElementType } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { changePercentChipClassName } from "@/lib/insight-signal-key";
import { formatNumber } from "@/lib/formatters";
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
}: DimensionTileProps) {
	const hasRows =
		!(isLoading || isError) && rows !== undefined && rows.length > 0;

	return (
		<section aria-label={title} className="rounded border bg-card p-4">
			<div className="mb-3 flex items-center gap-2">
				<div className="flex size-6 shrink-0 items-center justify-center rounded bg-accent text-muted-foreground">
					<Icon aria-hidden className="size-3.5" weight="duotone" />
				</div>
				<h3 className="font-medium text-foreground text-sm">{title}</h3>
			</div>

			<ul className="divide-y">
				{isError && (
					<li className="flex items-center gap-3 py-2">
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
					</li>
				)}

				{!isError &&
					isLoading &&
					Array.from({ length: 5 }, (_, i) => (
						<li
							className="flex items-center justify-between py-2"
							key={`dim-skeleton-${i}`}
						>
							<Skeleton className="h-4 w-24 rounded" />
							<Skeleton className="h-4 w-10 rounded" />
						</li>
					))}

				{hasRows &&
					rows.map((row) => (
						<li
							className="flex items-center justify-between gap-3 py-2 text-sm"
							key={row.key}
						>
							<span className="min-w-0 flex-1 truncate text-foreground">
								{row.label}
							</span>
							<div className="flex shrink-0 items-center gap-2 tabular-nums">
								<span className="text-muted-foreground">
									{formatValue(row.current)}
								</span>
								{row.change !== 0 && (
									<span
										className={cn(
											"text-[11px]",
											changePercentChipClassName(row.change)
										)}
									>
										{row.change > 0 ? "+" : ""}
										{row.change.toFixed(0)}%
									</span>
								)}
							</div>
						</li>
					))}

				{!(isError || isLoading) && rows !== undefined && rows.length === 0 && (
					<li className="py-2 text-muted-foreground text-xs">{emptyMessage}</li>
				)}
			</ul>
		</section>
	);
}
