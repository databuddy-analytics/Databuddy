"use client";

import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { safePercentage } from "./events-utils";
import { FunnelIcon, TagIcon } from "@databuddy/ui/icons";
import { Badge } from "@databuddy/ui";

interface PropertyValueCardValue {
	count: number;
	percentage: number;
	property_value: string;
}

interface PropertyValueCardProps {
	className?: string;
	maxVisibleValues?: number;
	onValueSelect?: (value: string) => void;
	title: string;
	typeLabel?: string;
	uniqueCount: number;
	values: PropertyValueCardValue[];
}

export function PropertyValueCard({
	className,
	maxVisibleValues,
	onValueSelect,
	title,
	typeLabel,
	uniqueCount,
	values,
}: PropertyValueCardProps) {
	const visibleValues = maxVisibleValues
		? values.slice(0, maxVisibleValues)
		: values;
	const maxCount = Math.max(...visibleValues.map((value) => value.count), 1);
	const hiddenCount = Math.max(0, values.length - visibleValues.length);
	const isInteractive = Boolean(onValueSelect);

	return (
		<div
			className={cn(
				"flex h-64 flex-col overflow-hidden rounded-lg border border-border/60 bg-card",
				className
			)}
		>
			<div className="flex min-h-11 items-center justify-between gap-3 border-border/60 border-b bg-muted/30 px-3 py-2.5">
				<div className="flex min-w-0 items-center gap-2">
					<TagIcon
						className="size-3.5 shrink-0 text-muted-foreground"
						weight="duotone"
					/>
					<span className="truncate font-medium text-[13px] text-foreground">
						{title}
					</span>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{typeLabel && (
						<Badge size="sm" variant="muted">
							{typeLabel}
						</Badge>
					)}
					<span className="text-muted-foreground text-xs tabular-nums">
						{formatNumber(uniqueCount)} unique
					</span>
				</div>
			</div>

			<div className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto">
				{visibleValues.map((value, index) => {
					const displayValue = value.property_value;
					const percentage = safePercentage(value.percentage);
					const barWidth = (value.count / maxCount) * 100;

					const content = (
						<>
							<div className="min-w-0 flex-1">
								<span
									className="block truncate font-medium text-[13px] text-foreground"
									title={displayValue}
								>
									{displayValue || "(empty)"}
								</span>
								<div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
									<div
										className="h-full rounded-full bg-primary/35 transition-all group-hover:bg-primary/50"
										style={{ width: `${barWidth}%` }}
									/>
								</div>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								<span className="min-w-9 text-right text-muted-foreground text-xs tabular-nums">
									{formatNumber(value.count)}
								</span>
								<span className="w-10 text-right text-muted-foreground/60 text-xs tabular-nums">
									{percentage.toFixed(0)}%
								</span>
								{isInteractive && (
									<FunnelIcon
										aria-hidden="true"
										className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100"
										weight="duotone"
									/>
								)}
							</div>
						</>
					);

					const rowClassName = cn(
						"group flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
						isInteractive &&
							"hover:bg-accent/50 focus:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
					);

					return isInteractive ? (
						<button
							aria-label={`Filter by ${title}: ${displayValue || "empty"}`}
							className={rowClassName}
							key={`${displayValue}-${index}`}
							onClick={() => onValueSelect?.(displayValue)}
							type="button"
						>
							{content}
						</button>
					) : (
						<div className={rowClassName} key={`${displayValue}-${index}`}>
							{content}
						</div>
					);
				})}

				{visibleValues.length === 0 && (
					<div className="px-3 py-6 text-center text-muted-foreground text-xs">
						No values recorded
					</div>
				)}

				{hiddenCount > 0 && (
					<div className="bg-muted/20 px-3 py-2 text-center text-muted-foreground/60 text-xs">
						+{hiddenCount} more value{hiddenCount === 1 ? "" : "s"}
					</div>
				)}
			</div>
		</div>
	);
}
