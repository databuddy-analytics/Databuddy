import { ArrowDownIcon } from "@phosphor-icons/react/dist/ssr/ArrowDown";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/ssr/ArrowUp";
import { computeMetricChange, formatMetric } from "@/lib/format-insight-metric";
import type { InsightMetric } from "@/lib/insight-types";
import { cn } from "@/lib/utils";

function MetricItem({ metric }: { metric: InsightMetric }) {
	const change = computeMetricChange(metric);
	const formatted = formatMetric(metric.current, metric.format);
	const hasPrevious = metric.previous !== undefined;

	return (
		<div className="flex min-w-0 flex-col gap-1 rounded-md border border-border/60 bg-card px-3 py-2.5">
			<span className="text-[11px] text-muted-foreground leading-none">
				{metric.label}
			</span>
			<div className="flex items-baseline gap-2">
				<span className="font-semibold text-foreground text-sm tabular-nums leading-none">
					{formatted}
				</span>
				{hasPrevious && change !== null && change !== 0 && (
					<span
						className={cn(
							"inline-flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-[11px] tabular-nums leading-none",
							change > 0 && "bg-emerald-500/10 text-emerald-600",
							change < 0 && "bg-red-500/10 text-red-500"
						)}
					>
						{change > 0 ? (
							<ArrowUpIcon className="size-2.5" weight="fill" />
						) : (
							<ArrowDownIcon className="size-2.5" weight="fill" />
						)}
						{Math.abs(Math.round(change))}%
					</span>
				)}
			</div>
			{hasPrevious && (
				<span className="text-[10px] text-muted-foreground/70 tabular-nums leading-none">
					was {formatMetric(metric.previous ?? 0, metric.format)}
				</span>
			)}
		</div>
	);
}

export function InsightMetrics({ metrics }: { metrics: InsightMetric[] }) {
	if (metrics.length === 0) {
		return null;
	}

	return (
		<div
			className={cn(
				"grid gap-2",
				metrics.length === 1 && "grid-cols-1",
				metrics.length === 2 && "grid-cols-2",
				metrics.length >= 3 && "grid-cols-2 sm:grid-cols-3"
			)}
		>
			{metrics.map((metric) => (
				<MetricItem key={metric.label} metric={metric} />
			))}
		</div>
	);
}
