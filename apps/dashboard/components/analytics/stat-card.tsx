import { MinusIcon, TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import dayjs from "dayjs";
import { type ElementType, memo } from "react";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMetricNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";

type MiniChartDataPoint = {
	date: string;
	value: number;
};

type Trend = {
	change?: number;
	current: number;
	previous: number;
	currentPeriod: { start: string; end: string };
	previousPeriod: { start: string; end: string };
};

export type ChartType = "area" | "bar" | "line";
export type ChartStepType =
	| "monotone"
	| "linear"
	| "step"
	| "stepBefore"
	| "stepAfter";

type StatCardProps = {
	title: string;
	titleExtra?: React.ReactNode;
	value: string | number;
	description?: string;
	icon?: ElementType;
	trend?: Trend | number;
	trendLabel?: string;
	isLoading?: boolean;
	className?: string;
	variant?: "default" | "success" | "info" | "warning" | "danger";
	invertTrend?: boolean;
	id?: string;
	chartData?: MiniChartDataPoint[];
	showChart?: boolean;
	chartType?: ChartType;
	chartStepType?: ChartStepType;
	formatValue?: (value: number) => string;
	formatChartValue?: (value: number) => string;
};

const formatTrendValue = (
	value: string | number,
	formatter?: (v: number) => string
) => {
	if (typeof value === "number") {
		if (formatter) {
			return formatter(value);
		}
		return Number.isInteger(value)
			? formatMetricNumber(value)
			: value.toFixed(1);
	}
	return value;
};

function TrendIndicator({
	value,
	invertColor = false,
	className,
}: {
	value: number;
	invertColor?: boolean;
	className?: string;
}) {
	if (Number.isNaN(value)) {
		return null;
	}

	const isPositive = value > 0;
	const isNegative = value < 0;
	const isNeutral = value === 0;

	const colorClass = isNeutral
		? "text-muted-foreground"
		: isPositive
			? invertColor
				? "text-destructive"
				: "text-success"
			: invertColor
				? "text-success"
				: "text-destructive";

	const Icon = isPositive
		? TrendUpIcon
		: isNegative
			? TrendDownIcon
			: MinusIcon;

	return (
		<span className={cn("flex items-center gap-1", colorClass, className)}>
			<Icon className="size-4" weight={isNeutral ? "regular" : "fill"} />
			<span className="font-semibold text-xs">
				{isPositive ? "+" : ""}
				{Math.abs(value).toFixed(0)}%
			</span>
		</span>
	);
}

const MiniChart = memo(
	({
		data,
		id,
		formatChartValue,
		title,
		chartType = "area",
		chartStepType = "monotone",
	}: {
		data: MiniChartDataPoint[];
		id: string;
		formatChartValue?: (value: number) => string;
		title?: string;
		chartType?: ChartType;
		chartStepType?: ChartStepType;
	}) => {
		const hasData = data && data.length > 0;
		const hasVariation = hasData && data.some((d) => d.value !== data[0].value);

		if (!hasData) {
			return (
				<div className="flex h-24 items-center justify-center pt-2">
					<span className="text-[10px] text-muted opacity-60">No data</span>
				</div>
			);
		}

		if (!hasVariation) {
			return (
				<div className="flex h-24 items-center pt-2">
					<div className="h-px w-full bg-primary opacity-30" />
				</div>
			);
		}

		const chartContent = () => {
			switch (chartType) {
				case "bar":
					return (
						<BarChart
							data={data}
							margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
						>
							<defs>
								<linearGradient
									id={`gradient-${id}`}
									x1="0"
									x2="0"
									y1="0"
									y2="1"
								>
									<stop
										offset="0%"
										stopColor="var(--color-primary)"
										stopOpacity={0.4}
									/>
									<stop
										offset="100%"
										stopColor="var(--color-primary)"
										stopOpacity={0}
									/>
								</linearGradient>
							</defs>
							<XAxis dataKey="date" hide />
							<YAxis domain={["dataMin", "dataMax"]} hide />
							<Tooltip
								content={({ active, payload, label }) =>
									active &&
									payload?.[0] &&
									typeof payload[0].value === "number" ? (
										<div className="rounded border bg-popover px-2 py-1.5 text-[10px] shadow-lg">
											<p className="text-muted-foreground">
												{new Date(label).toLocaleDateString("en-US", {
													month: "short",
													day: "numeric",
												})}
											</p>
											<p className="font-semibold text-foreground">
												{formatChartValue
													? formatChartValue(payload[0].value)
													: formatMetricNumber(payload[0].value)}{" "}
												{title && (
													<span className="font-normal text-muted-foreground">
														{title}
													</span>
												)}
											</p>
										</div>
									) : null
								}
								cursor={{ stroke: "var(--color-primary)", strokeOpacity: 0.3 }}
							/>
							<Bar
								dataKey="value"
								fill={`url(#gradient-${id})`}
								radius={[2, 2, 0, 0]}
							/>
						</BarChart>
					);
				case "line":
					return (
						<LineChart
							data={data}
							margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
						>
							<XAxis dataKey="date" hide />
							<YAxis domain={["dataMin", "dataMax"]} hide />
							<Tooltip
								content={({ active, payload, label }) =>
									active &&
									payload?.[0] &&
									typeof payload[0].value === "number" ? (
										<div className="rounded border bg-popover px-2 py-1.5 text-[10px] shadow-lg">
											<p className="text-muted-foreground">
												{new Date(label).toLocaleDateString("en-US", {
													month: "short",
													day: "numeric",
												})}
											</p>
											<p className="font-semibold text-foreground">
												{formatChartValue
													? formatChartValue(payload[0].value)
													: formatMetricNumber(payload[0].value)}{" "}
												{title && (
													<span className="font-normal text-muted-foreground">
														{title}
													</span>
												)}
											</p>
										</div>
									) : null
								}
								cursor={{ stroke: "var(--color-primary)", strokeOpacity: 0.3 }}
							/>
							<Line
								dataKey="value"
								dot={false}
								stroke="var(--color-primary)"
								strokeWidth={1.5}
								type={chartStepType}
							/>
						</LineChart>
					);
				case "area":
					return (
						<AreaChart
							data={data}
							margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
						>
							<defs>
								<linearGradient
									id={`gradient-${id}`}
									x1="0"
									x2="0"
									y1="0"
									y2="1"
								>
									<stop
										offset="0%"
										stopColor="var(--color-primary)"
										stopOpacity={0.4}
									/>
									<stop
										offset="100%"
										stopColor="var(--color-primary)"
										stopOpacity={0}
									/>
								</linearGradient>
							</defs>
							<XAxis dataKey="date" hide />
							<YAxis domain={["dataMin", "dataMax"]} hide />
							<Tooltip
								content={({ active, payload, label }) =>
									active &&
									payload?.[0] &&
									typeof payload[0].value === "number" ? (
										<div className="rounded border bg-popover px-2 py-1.5 text-[10px] shadow-lg">
											<p className="text-muted-foreground">
												{new Date(label).toLocaleDateString("en-US", {
													month: "short",
													day: "numeric",
												})}
											</p>
											<p className="font-semibold text-foreground">
												{formatChartValue
													? formatChartValue(payload[0].value)
													: formatMetricNumber(payload[0].value)}{" "}
												{title && (
													<span className="font-normal text-muted-foreground">
														{title}
													</span>
												)}
											</p>
										</div>
									) : null
								}
								cursor={{ stroke: "var(--color-primary)", strokeOpacity: 0.3 }}
							/>
							<Area
								activeDot={{
									r: 2.5,
									fill: "var(--color-primary)",
									stroke: "var(--color-background)",
									strokeWidth: 1.5,
								}}
								dataKey="value"
								dot={false}
								fill={`url(#gradient-${id})`}
								stroke="var(--color-primary)"
								strokeWidth={1.5}
								type={chartStepType}
							/>
						</AreaChart>
					);
				default:
					return (
						<AreaChart
							data={data}
							margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
						>
							<defs>
								<linearGradient
									id={`gradient-${id}`}
									x1="0"
									x2="0"
									y1="0"
									y2="1"
								>
									<stop
										offset="0%"
										stopColor="var(--color-primary)"
										stopOpacity={0.4}
									/>
									<stop
										offset="100%"
										stopColor="var(--color-primary)"
										stopOpacity={0}
									/>
								</linearGradient>
							</defs>
							<XAxis dataKey="date" hide />
							<YAxis domain={["dataMin", "dataMax"]} hide />
							<Tooltip
								content={({ active, payload, label }) =>
									active &&
									payload?.[0] &&
									typeof payload[0].value === "number" ? (
										<div className="rounded border bg-popover px-2 py-1.5 text-[10px] shadow-lg">
											<p className="text-muted-foreground">
												{new Date(label).toLocaleDateString("en-US", {
													month: "short",
													day: "numeric",
												})}
											</p>
											<p className="font-semibold text-foreground">
												{formatChartValue
													? formatChartValue(payload[0].value)
													: formatMetricNumber(payload[0].value)}{" "}
												{title && (
													<span className="font-normal text-muted-foreground">
														{title}
													</span>
												)}
											</p>
										</div>
									) : null
								}
								cursor={{ stroke: "var(--color-primary)", strokeOpacity: 0.3 }}
							/>
							<Area
								activeDot={{
									r: 2.5,
									fill: "var(--color-primary)",
									stroke: "var(--color-background)",
									strokeWidth: 1.5,
								}}
								dataKey="value"
								dot={false}
								fill={`url(#gradient-${id})`}
								stroke="var(--color-primary)"
								strokeWidth={1.5}
								type={chartStepType}
							/>
						</AreaChart>
					);
			}
		};

		return (
			<ResponsiveContainer height={100} width="100%">
				{chartContent()}
			</ResponsiveContainer>
		);
	}
);

MiniChart.displayName = "MiniChart";

const DURATION_REGEX = /\d+(\.\d+)?(s|ms)$/;

export function StatCard({
	title,
	titleExtra,
	value,
	description,
	icon: Icon,
	trend,
	trendLabel: _trendLabel,
	isLoading = false,
	className,
	variant: _variant = "default",
	invertTrend = false,
	id,
	chartData,
	showChart = false,
	chartType = "area",
	chartStepType = "monotone",
	formatValue,
	formatChartValue,
}: StatCardProps) {
	const trendValue =
		typeof trend === "object" && trend !== null ? trend.change : trend;
	const hasValidChartData = showChart && chartData && chartData.length > 0;

	if (isLoading) {
		return (
			<Card
				className={cn("gap-0 overflow-hidden border bg-card py-0", className)}
				id={id}
			>
				{showChart && (
					<div className="dotted-bg bg-accent pt-0">
						<Skeleton className="h-26 w-full" />
					</div>
				)}
				<div className="flex items-center gap-2.5 border-t px-2.5 py-2.5">
					{Icon && <Skeleton className="size-7 shrink-0 rounded" />}
					<div className="min-w-0 flex-1 space-y-0.5">
						<Skeleton className="h-5 w-14" />
						<Skeleton className="h-3 w-12" />
					</div>
					<Skeleton className="h-3.5 w-10 shrink-0" />
				</div>
			</Card>
		);
	}

	const isTimeValue = typeof value === "string" && DURATION_REGEX.test(value);
	const displayValue =
		(typeof value === "string" && (value.endsWith("%") || isTimeValue)) ||
		typeof value !== "number"
			? value.toString()
			: formatMetricNumber(value);

	const cardContent = (
		<Card
			className={cn(
				"group gap-0 overflow-hidden border bg-card py-0 hover:border-primary",
				className
			)}
			id={id}
		>
			{hasValidChartData && (
				<div className="dotted-bg bg-accent pt-2">
					<MiniChart
						chartStepType={chartStepType}
						chartType={chartType}
						data={chartData}
						formatChartValue={formatChartValue}
						id={id || `chart-${title.toLowerCase().replace(/\s/g, "-")}`}
						title={title}
					/>
				</div>
			)}
			<div className="flex items-center gap-2.5 px-2.5 py-2.5">
				{Icon && (
					<div className="flex size-7 shrink-0 items-center justify-center rounded bg-accent">
						<Icon className="size-4 text-muted-foreground" />
					</div>
				)}
				<div className="min-w-0 flex-1">
					<p className="truncate font-semibold text-base tabular-nums leading-tight">
						{displayValue}
					</p>
					<p className="truncate text-muted-foreground text-xs">{title}</p>
				</div>
				{titleExtra}
				<div className="shrink-0 text-right">
					{trendValue !== undefined && !Number.isNaN(trendValue) ? (
						<TrendIndicator invertColor={invertTrend} value={trendValue} />
					) : description ? (
						<span className="text-muted-foreground text-xs">{description}</span>
					) : null}
				</div>
			</div>
		</Card>
	);

	if (
		typeof trend === "object" &&
		trend !== null &&
		trend.currentPeriod &&
		trend.previousPeriod
	) {
		return (
			<HoverCard>
				<HoverCardTrigger asChild>{cardContent}</HoverCardTrigger>
				<HoverCardContent className="w-64 p-0" sideOffset={8}>
					{/* Header */}
					<div className="flex items-center gap-2.5 border-b bg-accent px-3 py-2.5">
						{Icon && (
							<div className="flex size-7 items-center justify-center rounded bg-background">
								<Icon className="size-4 text-muted-foreground" />
							</div>
						)}
						<span className="font-semibold text-foreground text-sm">
							{title}
						</span>
					</div>

					{/* Comparison */}
					<div className="grid grid-cols-2 divide-x">
						<div className="p-3">
							<p className="font-medium text-muted-foreground text-xs">
								Previous
							</p>
							<p className="mt-1 font-semibold text-foreground text-lg tabular-nums">
								{formatTrendValue(trend.previous, formatValue)}
							</p>
							<p className="mt-0.5 text-muted-foreground text-xs">
								{dayjs(trend.previousPeriod.start).format("MMM D")} –{" "}
								{dayjs(trend.previousPeriod.end).format("MMM D")}
							</p>
						</div>
						<div className="p-3">
							<p className="font-medium text-muted-foreground text-xs">
								Current
							</p>
							<p className="mt-1 font-semibold text-foreground text-lg tabular-nums">
								{formatTrendValue(trend.current, formatValue)}
							</p>
							<p className="mt-0.5 text-muted-foreground text-xs">
								{dayjs(trend.currentPeriod.start).format("MMM D")} –{" "}
								{dayjs(trend.currentPeriod.end).format("MMM D")}
							</p>
						</div>
					</div>

					{/* Footer */}
					<div className="flex items-center justify-between border-t bg-accent px-3 py-2">
						<span className="text-muted-foreground text-xs">Change</span>
						<TrendIndicator
							className="text-sm"
							invertColor={invertTrend}
							value={trend.change || 0}
						/>
					</div>
				</HoverCardContent>
			</HoverCard>
		);
	}

	return cardContent;
}
