"use client";

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
import {
	CHART_BLOCK_MIN_PX,
	CHART_HEIGHT_PX,
	type ChartDataPoint,
	detectGranularity,
	formatMs,
	formatTickDate,
	getMetricLabel,
	METRICS,
} from "./latency-chart-data";

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
	if (!(active && payload?.length)) {
		return null;
	}

	return (
		<div className="min-w-44 overflow-hidden rounded-xl border border-border/80 bg-popover text-popover-foreground shadow-[0_24px_80px_-36px_rgba(0,0,0,0.72)]">
			<div className="border-border/60 border-b bg-muted/45 px-3 py-2.5">
				<div className="font-semibold text-xs leading-[1.2]">Response Time</div>
				<div className="mt-1 text-[11px] text-muted-foreground tabular-nums leading-[1.2]">
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

export function LatencyAreaChart({ data }: { data: ChartDataPoint[] }) {
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
							content={({ active, payload, label }) => (
								<LatencyTooltipContent
									active={active}
									granularity={granularity}
									label={label}
									payload={payload}
								/>
							)}
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
								isAnimationActive={false}
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

export default LatencyAreaChart;
