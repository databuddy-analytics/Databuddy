"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, useMemo } from "react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Skeleton } from "../../components/skeleton";
import { cn } from "../utils";
import { usePersistentState } from "../../hooks/use-persistent-state";
import { CaretDownIcon, ChartActivityIcon } from "../../components/icons/nucleo";

interface LatencyDataPoint {
	avg_response_time?: number;
	date: string;
	p50_response_time?: number;
	p95_response_time?: number;
}

interface LatencyChartProps {
	data: LatencyDataPoint[];
	isLoading?: boolean;
	storageKey: string;
}

const CHART_HEIGHT_PX = 140;
const CHART_BLOCK_MIN_PX = CHART_HEIGHT_PX;

const METRICS = [
	{
		key: "avg_response_time",
		label: "Avg",
		color: "var(--color-chart-4)",
	},
	{
		key: "p95_response_time",
		label: "P95",
		color: "var(--color-chart-3)",
	},
] as const;

function formatMs(ms: number): string {
	if (ms >= 1000) {
		return `${(ms / 1000).toFixed(1)}s`;
	}
	return `${Math.round(ms)}ms`;
}

interface ChartDataPoint {
	avg_response_time: number | null;
	date: string;
	p95_response_time: number | null;
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

function computeSummary(chartData: ChartDataPoint[]) {
	if (chartData.length === 0) {
		return { avg: null, p95: null };
	}
	const latest = chartData.at(-1);
	const avgValues = chartData
		.map((d) => d.avg_response_time)
		.filter((v): v is number => v != null);
	return {
		avg:
			avgValues.length > 0
				? avgValues.reduce((a, b) => a + b, 0) / avgValues.length
				: null,
		p95: latest?.p95_response_time ?? null,
	};
}

function detectGranularity(data: ChartDataPoint[]): "hourly" | "daily" {
	if (data.length < 2) {
		return "daily";
	}
	const first = new Date(data.at(0)?.date ?? "").getTime();
	const second = new Date(data.at(1)?.date ?? "").getTime();
	return (second - first) / (1000 * 60 * 60) < 20 ? "hourly" : "daily";
}

function formatTickDate(
	dateStr: string,
	granularity: "hourly" | "daily"
): string {
	const d = new Date(dateStr);
	if (Number.isNaN(d.getTime())) {
		return dateStr;
	}
	if (granularity === "hourly") {
		return d.toLocaleString("en-US", {
			hour: "numeric",
			minute: "2-digit",
		});
	}
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getMetricLabel(dataKey: unknown) {
	if (typeof dataKey !== "string" && typeof dataKey !== "number") {
		return "";
	}

	return METRICS.find((metric) => metric.key === dataKey)?.label ?? String(dataKey);
}

function getSummaryValue(
	summary: { avg: number | null; p95: number | null },
	key: (typeof METRICS)[number]["key"]
) {
	return key === "avg_response_time" ? summary.avg : summary.p95;
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
		<span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-2 py-1 text-muted-foreground text-xs leading-none">
			<span
				aria-hidden
				className="size-1.5 shrink-0 rounded-full"
				style={{ backgroundColor: color }}
			/>
			<span className="hidden font-medium sm:inline">{label}</span>
			<span className="font-semibold text-foreground tabular-nums">
				{formatMs(value)}
			</span>
		</span>
	);
}

interface LatencyTooltipEntry {
	color?: string;
	dataKey?: unknown;
	value?: unknown;
}

function LatencyTooltipContent({
	active,
	payload,
	label,
	granularity,
}: {
	active?: boolean;
	granularity: "hourly" | "daily";
	label?: unknown;
	payload?: readonly LatencyTooltipEntry[];
}) {
	if (!active || !payload?.length) {
		return null;
	}

	return (
		<div className="min-w-44 overflow-hidden rounded-xl border border-border/80 bg-popover text-popover-foreground shadow-[0_24px_80px_-36px_rgba(0,0,0,0.72)]">
			<div className="border-border/60 border-b bg-muted/45 px-3 py-2.5">
				<div className="font-semibold text-xs leading-[1.2]">
					Response Time
				</div>
				<div className="mt-1 text-muted-foreground text-[11px] tabular-nums leading-[1.2]">
					{formatTickDate(String(label ?? ""), granularity)}
				</div>
			</div>
			<div className="space-y-1.5 px-3 py-2.5">
				{payload.map((entry) => (
					<div
						className="flex items-center gap-2 text-xs leading-none"
						key={String(entry.dataKey)}
					>
						<span
							aria-hidden
							className="inline-block size-1.5 rounded-full"
							style={{ backgroundColor: entry.color }}
						/>
						<span className="font-medium text-muted-foreground">
							{getMetricLabel(entry.dataKey)}
						</span>
						<span className="ml-auto font-semibold tabular-nums">
							{typeof entry.value === "number" ? formatMs(entry.value) : "—"}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

export function LatencyChart({
	data,
	isLoading = false,
	storageKey,
}: LatencyChartProps) {
	const [isOpen, setIsOpen] = usePersistentState(storageKey, false);
	const chartData = useMemo(() => toChartData(data), [data]);
	const summary = useMemo(() => computeSummary(chartData), [chartData]);

	return (
		<div className="text-foreground">
			<button
				className="mt-1.5 flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left outline-none transition-colors hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
				onClick={() => setIsOpen((prev) => !prev)}
				type="button"
			>
				<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-background/70 text-muted-foreground ring-1 ring-border/60">
					<ChartActivityIcon className="size-3.5" />
				</span>

				<span className="min-w-0 flex-1 truncate font-semibold text-sm leading-[1.2]">
					Response time
				</span>

				<span className="flex min-w-0 shrink-0 items-center gap-1.5">
					{METRICS.map((metric) => (
						<SummaryMetric
							color={metric.color}
							isLoading={isLoading}
							key={metric.key}
							label={metric.label}
							value={getSummaryValue(summary, metric.key)}
						/>
					))}
					{!(isLoading || summary.avg != null || summary.p95 != null) ? (
						<span className="text-muted-foreground text-xs">No data</span>
					) : null}
				</span>

				<CaretDownIcon
					className={cn(
						"size-3 shrink-0 text-muted-foreground transition-transform duration-150",
						isOpen && "rotate-180"
					)}
					weight="fill"
				/>
			</button>

			<AnimatePresence initial={false}>
				{isOpen && (
					<motion.div
						animate={{ height: "auto", opacity: 1 }}
						className="overflow-hidden"
						exit={{ height: 0, opacity: 0 }}
						initial={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: "easeOut" }}
					>
						<div className="px-2 pt-1 pb-2">
							<div
								className="relative w-full rounded-lg border border-border/60 bg-background/65 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
								style={{ minHeight: CHART_BLOCK_MIN_PX }}
							>
								<div
									aria-hidden
									className="pointer-events-none absolute inset-x-0 top-0 h-px bg-border/70"
								/>
								{isLoading ? (
									<Skeleton
										className="w-full rounded-md"
										style={{ minHeight: CHART_BLOCK_MIN_PX }}
									/>
								) : chartData.length === 0 ? (
									<div
										className="flex items-center justify-center"
										style={{ minHeight: CHART_BLOCK_MIN_PX }}
									>
										<span className="text-muted-foreground text-xs">
											No response time data
										</span>
									</div>
								) : (
									<LatencyAreaChart data={chartData} />
								)}
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

const AXIS_TICK = {
	fontSize: 10,
	fill: "var(--muted-foreground)",
} as const;

const GRID = {
	stroke: "var(--border)",
	strokeDasharray: "1 5",
	strokeOpacity: 0.32,
	vertical: false,
} as const;

function LatencyAreaChart({ data }: { data: ChartDataPoint[] }) {
	const chartId = useId().replaceAll(":", "");
	const granularity = useMemo(() => detectGranularity(data), [data]);
	const gradientId = (key: (typeof METRICS)[number]["key"]) =>
		`latency-g-${chartId}-${key}`;

	const hasVariation = METRICS.some((m) => {
		const values = data
			.map((d) => d[m.key as keyof ChartDataPoint])
			.filter((v) => v != null) as number[];
		return values.length > 1 && values.some((v) => v !== values.at(0));
	});

	if (!hasVariation) {
		return (
			<div
				className="flex items-center px-3"
				style={{ minHeight: CHART_BLOCK_MIN_PX }}
			>
				<div className="h-1 w-full rounded-full bg-chart-4/35" />
			</div>
		);
	}

	return (
		<div className="relative w-full" style={{ minHeight: CHART_BLOCK_MIN_PX }}>
			<div className="h-[140px] w-full min-w-0">
				<ResponsiveContainer height={CHART_HEIGHT_PX} width="100%">
					<AreaChart
						data={data}
						margin={{ top: 8, right: 6, left: 0, bottom: 18 }}
					>
						<defs>
							{METRICS.map((m) => (
								<linearGradient
									id={gradientId(m.key)}
									key={m.key}
									x1="0"
									x2="0"
									y1="0"
									y2="1"
								>
									<stop offset="0%" stopColor={m.color} stopOpacity={0.16} />
									<stop offset="95%" stopColor={m.color} stopOpacity={0} />
								</linearGradient>
							))}
						</defs>

						<CartesianGrid {...GRID} />

						<XAxis
							axisLine={false}
							dataKey="date"
							interval="preserveStartEnd"
							minTickGap={46}
							tick={AXIS_TICK}
							tickFormatter={(v: string) => formatTickDate(v, granularity)}
							tickLine={false}
							tickMargin={10}
						/>

						<YAxis
							axisLine={false}
							domain={["dataMin", "auto"]}
							tick={AXIS_TICK}
							tickFormatter={formatMs}
							tickLine={false}
							width={46}
						/>

						<Tooltip
							content={({ active, payload, label }) =>
								<LatencyTooltipContent
									active={active}
									granularity={granularity}
									label={label}
									payload={payload}
								/>
							}
							cursor={{
								stroke: "var(--border)",
								strokeWidth: 1,
								strokeDasharray: "2 4",
							}}
							wrapperStyle={{ outline: "none", zIndex: 10 }}
						/>

						{METRICS.map((m) => (
							<Area
								activeDot={{
									r: 2.5,
									fill: m.color,
									stroke: "var(--color-background)",
									strokeWidth: 1.75,
								}}
								connectNulls
								dataKey={m.key}
								dot={false}
								fill={`url(#${gradientId(m.key)})`}
								key={m.key}
								name={m.label}
								stroke={m.color}
								strokeWidth={1.75}
								type="monotone"
							/>
						))}
					</AreaChart>
				</ResponsiveContainer>
			</div>

		</div>
	);
}
