"use client";

import { lazy, Suspense, useState } from "react";
import { CaretDownIcon, ChartActivityIcon } from "../../components/icons";
import { Skeleton } from "../../components/skeleton";
import { usePersistentState } from "../../hooks/use-persistent-state";
import { cn } from "../utils";
import {
	CHART_BLOCK_MIN_PX,
	type ChartDataPoint,
	formatMs,
	METRICS,
} from "./latency-chart-data";

const LatencyAreaChart = lazy(() => import("./latency-area-chart"));

interface LatencyDataPoint {
	avg_response_time?: number;
	date: string;
	p95_response_time?: number;
}

function toChartData(data: LatencyDataPoint[]): ChartDataPoint[] {
	return data
		.filter((d) => d.avg_response_time != null || d.p95_response_time != null)
		.map((d) => ({
			date: d.date,
			avg_response_time:
				d.avg_response_time == null
					? null
					: Math.round(d.avg_response_time * 100) / 100,
			p95_response_time:
				d.p95_response_time == null
					? null
					: Math.round(d.p95_response_time * 100) / 100,
		}));
}

function computeSummary(
	chartData: ChartDataPoint[]
): Record<(typeof METRICS)[number]["key"], number | null> {
	const avgValues = chartData
		.map((d) => d.avg_response_time)
		.filter((v): v is number => v != null);
	return {
		avg_response_time:
			avgValues.length > 0
				? avgValues.reduce((a, b) => a + b, 0) / avgValues.length
				: null,
		p95_response_time: chartData.at(-1)?.p95_response_time ?? null,
	};
}

function SummaryMetric({
	color,
	isLoading,
	label,
	value,
}: {
	color: string;
	isLoading: boolean;
	label: string;
	value: number | null;
}) {
	if (isLoading) {
		return <Skeleton className="h-4 w-16 rounded-full" />;
	}

	if (value == null) {
		return null;
	}

	return (
		<span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs leading-none">
			<span
				aria-hidden
				className="size-1.5 shrink-0 rounded-full"
				style={{ backgroundColor: color }}
			/>
			<span className="hidden sm:inline">{label}</span>
			<span className="font-medium text-foreground tabular-nums">
				{formatMs(value)}
			</span>
		</span>
	);
}

const CHART_SKELETON = (
	<Skeleton
		className="w-full rounded-md"
		style={{ minHeight: CHART_BLOCK_MIN_PX }}
	/>
);

function ChartBody({
	chartData,
	isLoading,
}: {
	chartData: ChartDataPoint[];
	isLoading: boolean;
}) {
	if (isLoading) {
		return CHART_SKELETON;
	}

	if (chartData.length === 0) {
		return (
			<div
				className="flex items-center justify-center"
				style={{ minHeight: CHART_BLOCK_MIN_PX }}
			>
				<span className="text-muted-foreground text-xs">
					No response time data
				</span>
			</div>
		);
	}

	return (
		<Suspense fallback={CHART_SKELETON}>
			<LatencyAreaChart data={chartData} />
		</Suspense>
	);
}

export function LatencyChart({
	data,
	isLoading = false,
	storageKey,
}: {
	data: LatencyDataPoint[];
	isLoading?: boolean;
	storageKey: string;
}) {
	const [isOpen, setIsOpen] = usePersistentState(storageKey, false);
	const [hasEverOpened, setHasEverOpened] = useState(false);
	const chartData = toChartData(data);
	const summary = computeSummary(chartData);
	const shouldRenderChart = isOpen || hasEverOpened;

	return (
		<div className="text-foreground">
			<button
				aria-expanded={isOpen}
				className="mt-1.5 flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left outline-none transition-colors duration-(--duration-quick) ease-(--ease-smooth) hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
				onClick={() => {
					setHasEverOpened(true);
					setIsOpen((prev) => !prev);
				}}
				type="button"
			>
				<ChartActivityIcon className="size-3.5 shrink-0 text-muted-foreground" />

				<span className="min-w-0 flex-1 truncate font-medium text-sm leading-[1.2]">
					Response time
				</span>

				<span className="flex min-w-0 shrink-0 items-center gap-3">
					{METRICS.map((metric) => (
						<SummaryMetric
							color={metric.color}
							isLoading={isLoading}
							key={metric.key}
							label={metric.label}
							value={summary[metric.key]}
						/>
					))}
					{isLoading ||
					summary.avg_response_time != null ||
					summary.p95_response_time != null ? null : (
						<span className="text-muted-foreground text-xs">No data</span>
					)}
				</span>

				<CaretDownIcon
					className={cn(
						"size-3 shrink-0 text-muted-foreground transition-transform duration-(--duration-base) ease-(--expo-out)",
						isOpen && "rotate-180"
					)}
				/>
			</button>

			<div
				aria-hidden={!isOpen}
				className={cn(
					"grid transition-[grid-template-rows,opacity] duration-(--duration-base) ease-(--expo-out) motion-reduce:transition-none",
					isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
				)}
				inert={isOpen ? undefined : true}
			>
				<div className="min-h-0 overflow-hidden">
					<div className="px-2 pt-1 pb-2">
						<div
							className="relative w-full rounded-lg border border-border/60 bg-background/65 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
							style={{ minHeight: CHART_BLOCK_MIN_PX }}
						>
							<div
								aria-hidden
								className="pointer-events-none absolute inset-x-0 top-0 h-px bg-border/70"
							/>
							{shouldRenderChart ? (
								<ChartBody chartData={chartData} isLoading={isLoading} />
							) : null}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
