import {
	computeMetricChange,
	formatMetric,
	metricChangeTone,
} from "@/lib/format-insight-metric";
import type { InsightMetric } from "@/lib/insight-types";
import { cn } from "@/lib/utils";
import { ArrowDownIcon, ArrowUpIcon } from "@databuddy/ui/icons";

function MetricItem({ metric }: { metric: InsightMetric }) {
	const change = computeMetricChange(metric);
	const formatted = formatMetric(metric.current, metric.format);
	const hasPrevious = metric.previous !== undefined;
	const tone = metricChangeTone(metric);

	return (
		<div
			className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-border/60 bg-background px-2.5 py-1.5 text-xs"
			title={metric.label}
		>
			<span className="truncate text-muted-foreground">{metric.label}</span>
			<span className="font-medium text-foreground tabular-nums">
				{formatted}
			</span>
			{hasPrevious && change !== null && change !== 0 && (
				<span
					className={cn(
						"inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums leading-none",
						tone === "positive" && "bg-emerald-500/10 text-emerald-600",
						tone === "negative" && "bg-red-500/10 text-red-500",
						tone === "neutral" && "bg-muted text-muted-foreground"
					)}
					title={
						hasPrevious
							? `Was ${formatMetric(metric.previous ?? 0, metric.format)}`
							: undefined
					}
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
	);
}

export function InsightMetrics({ metrics }: { metrics: InsightMetric[] }) {
	if (metrics.length === 0) {
		return null;
	}

	return (
		<div className="flex flex-wrap gap-1.5">
			{metrics.map((metric) => (
				<MetricItem key={metric.label} metric={metric} />
			))}
		</div>
	);
}
