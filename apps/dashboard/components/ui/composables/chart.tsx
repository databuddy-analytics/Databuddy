"use client";

import type { ComponentType, ReactElement, ReactNode } from "react";
import { useMemo } from "react";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	Brush,
	CartesianGrid,
	Cell,
	ComposedChart,
	Customized,
	Line,
	LineChart,
	Pie,
	PieChart,
	Legend as RechartsLegendPrimitive,
	ReferenceArea,
	ReferenceLine,
	ResponsiveContainer,
	Sector,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { ChartErrorBoundary } from "@/components/chart-error-boundary";
import { useDynamicDasharray } from "@/components/charts/use-dynamic-dasharray";
import { EmptyState, type EmptyStateProps } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
	chartAxisTickDefault,
	chartAxisYWidthCompact,
	chartAxisYWidthDefault,
	chartCartesianGridDefault,
	chartLegendInlineItemClassName,
	chartLegendInlineRowClassName,
	chartLegendPillClassName,
	chartLegendPillDotClassName,
	chartLegendPillLabelClassName,
	chartLegendPillRowClassName,
	chartPlotRegionClassName,
	chartRechartsInteractiveLegendLabelClassName,
	chartRechartsLegendIconSize,
	chartRechartsLegendInteractiveWrapperStyle,
	chartRechartsLegendStaticLabelClassName,
	chartRechartsLegendStaticWrapperStyle,
	chartRechartsLegendStaticWrapperStyleMerge,
	chartSeriesColorAtIndex,
	chartSeriesPalette,
	chartSurfaceBorderlessClassName,
	chartSurfaceClassName,
	chartTooltipCustomSurfaceClassName,
	chartTooltipHeaderRowClassName,
	chartTooltipMultiShellClassName,
	chartTooltipSingleShellClassName,
} from "@/lib/chart-presentation";
import type {
	ChartQueryOutcome,
	ChartQuerySlice,
} from "@/lib/chart-query-outcome";
import { chartQueryOutcomeFromQuery } from "@/lib/chart-query-outcome";
import dayjs from "@/lib/dayjs";
import { formatLocaleNumber } from "@/lib/format-locale-number";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";

// ── Tooltip primitives ──────────────────────────────────────────────────

interface TooltipEntry {
	color: string;
	formattedValue?: string;
	key: string;
	label: string;
	value: number;
}

interface ChartTooltipProps {
	active?: boolean;
	className?: string;
	entries?: TooltipEntry[];
	formatLabelAction?: (label: string) => string;
	label?: string;
	singleValue?: {
		value: number;
		formattedValue?: string;
		label?: string;
	};
}

function ChartTooltip({
	active,
	label,
	formatLabelAction,
	entries,
	singleValue,
	className,
}: ChartTooltipProps) {
	if (!active) {
		return null;
	}

	const displayLabel =
		label == null || label === ""
			? undefined
			: formatLabelAction
				? formatLabelAction(label)
				: label;

	if (singleValue) {
		return (
			<div className={cn(chartTooltipSingleShellClassName, className)}>
				{displayLabel && (
					<p className="text-[10px] text-muted-foreground">{displayLabel}</p>
				)}
				<p className="font-semibold text-foreground text-sm tabular-nums">
					{singleValue.formattedValue ?? formatLocaleNumber(singleValue.value)}
					{singleValue.label && (
						<span className="ml-1 font-normal text-muted-foreground text-xs">
							{singleValue.label}
						</span>
					)}
				</p>
			</div>
		);
	}

	if (!entries?.length) {
		return null;
	}

	return (
		<div className={cn(chartTooltipMultiShellClassName, className)}>
			{displayLabel && (
				<div className={chartTooltipHeaderRowClassName}>
					<div className="size-1.5 shrink-0 rounded-full bg-chart-1" />
					<p className="font-medium text-foreground text-xs">{displayLabel}</p>
				</div>
			)}
			<div className="space-y-1">
				{entries.map((entry) => (
					<div
						className="flex items-center justify-between gap-3"
						key={entry.key}
					>
						<div className="flex items-center gap-1.5">
							<div
								className="size-2 rounded-full"
								style={{ backgroundColor: entry.color }}
							/>
							<span className="text-muted-foreground text-xs">
								{entry.label}
							</span>
						</div>
						<span className="font-semibold text-foreground text-xs tabular-nums">
							{entry.formattedValue ?? formatLocaleNumber(entry.value)}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

export interface MetricConfig {
	color?: string;
	formatValue?: (value: number) => string;
	key: string;
	label: string;
}

function createTooltipEntries(
	payload: Array<{ dataKey: string; value: number; color: string }> | undefined,
	metrics: MetricConfig[]
): TooltipEntry[] {
	if (!payload?.length) {
		return [];
	}

	const entries: TooltipEntry[] = [];

	for (const p of payload) {
		const metric = metrics.find((m) => m.key === p.dataKey);
		if (!metric || p.value == null) {
			continue;
		}

		entries.push({
			key: p.dataKey,
			label: metric.label,
			value: p.value,
			color: p.color || metric.color || "var(--color-chart-1)",
			formattedValue: metric.formatValue
				? metric.formatValue(p.value)
				: undefined,
		});
	}

	return entries;
}

function formatTooltipDate(dateStr: string): string {
	const trimmed = dateStr.trim();
	let parsed: dayjs.Dayjs;
	if (/^\d+$/.test(trimmed)) {
		const n = Number(trimmed);
		if (trimmed.length === 13 && n >= 1_000_000_000_000) {
			parsed = dayjs(n);
		} else if (
			trimmed.length === 10 &&
			n >= 1_000_000_000 &&
			n < 100_000_000_000
		) {
			parsed = dayjs.unix(n);
		} else {
			parsed = dayjs(trimmed);
		}
	} else {
		parsed = dayjs(trimmed);
	}
	if (!parsed.isValid()) {
		return dateStr;
	}
	if (trimmed.length > 10 || /\d{1,2}:\d{2}/.test(trimmed)) {
		return parsed.format("MMM D, h:mm A");
	}
	return parsed.format("MMM D");
}

// ── Chart types ─────────────────────────────────────────────────────────

/**
 * Series key → color/label map (e.g. `buildChartConfig` in AI chart renderers).
 * Theme variant uses light/dark CSS color strings.
 */
export type ChartConfig = {
	[k in string]: {
		label?: ReactNode;
		icon?: ComponentType;
	} & (
		| { color?: string; theme?: never }
		| { color?: never; theme: Record<"light" | "dark", string> }
	);
};

export type ChartSeriesKind = "area" | "bar" | "line";

export type ChartCurveType =
	| "monotone"
	| "linear"
	| "step"
	| "stepBefore"
	| "stepAfter";

export function isStepCurve(curveType: ChartCurveType): boolean {
	return (
		curveType === "step" ||
		curveType === "stepBefore" ||
		curveType === "stepAfter"
	);
}

export const chartTooltipCursorLine = {
	stroke: "var(--color-chart-1)",
	strokeOpacity: 0.3,
} as const;

export const chartTooltipCursorBar = {
	fill: "var(--color-chart-1)",
	fillOpacity: 0.12,
} as const;

export interface ChartInteractiveFeatures {
	annotations?: boolean;
	rangeSelection?: boolean;
}

export function mergeChartInteractiveFeatures(
	features?: ChartInteractiveFeatures
): { annotations: boolean; rangeSelection: boolean } {
	return {
		annotations: features?.annotations ?? true,
		rangeSelection: features?.rangeSelection ?? true,
	};
}

export interface RechartsSingleValueTooltipParams {
	/** Overrides default `formatTooltipDate` for the tooltip subtitle line. */
	formatLabelAction?: (label: string) => string;
	formatValue?: (value: number) => string;
	valueSuffixLabel?: string;
}

function toFiniteNumber(v: unknown): number | null {
	if (typeof v === "number") {
		return Number.isFinite(v) ? v : null;
	}
	if (typeof v === "string") {
		const n = Number(v);
		return Number.isFinite(n) ? n : null;
	}
	return null;
}

type RechartsTooltipPayloadEntry = {
	payload?: { date?: unknown; value?: unknown };
	value?: unknown;
};

type ChartTooltipPayloadRow = RechartsTooltipPayloadEntry["payload"];

function firstTooltipPayloadRow(
	payload: RechartsTooltipPayloadEntry[] | undefined
): ChartTooltipPayloadRow {
	return payload?.[0]?.payload;
}

function resolveTooltipDateLabel(
	label: string | number | undefined,
	payloadRow: ChartTooltipPayloadRow,
	dateKey = "date"
): string | undefined {
	if (payloadRow && typeof payloadRow === "object" && dateKey in payloadRow) {
		const d = (payloadRow as Record<string, unknown>)[dateKey];
		if (typeof d === "string" || typeof d === "number") {
			return String(d);
		}
	}
	if (label == null || label === "") {
		return undefined;
	}
	return String(label);
}

function readTooltipNumericValue(
	entry: RechartsTooltipPayloadEntry
): number | null {
	const direct = toFiniteNumber(entry.value);
	if (direct !== null) {
		return direct;
	}
	const nested = toFiniteNumber(entry.payload?.value);
	if (nested !== null) {
		return nested;
	}
	if (Array.isArray(entry.value) && entry.value.length > 0) {
		return toFiniteNumber(entry.value[0]);
	}
	return null;
}

/** Recharts `<Tooltip content={…} />` for single-series charts (`ChartTooltip` + `formatTooltipDate`). */
export function createRechartsSingleValueTooltip(
	params: RechartsSingleValueTooltipParams
) {
	return (props: {
		active?: boolean;
		label?: string | number;
		payload?: RechartsTooltipPayloadEntry[];
	}) => {
		if (props.active === false) {
			return null;
		}
		const entry = props.payload?.[0];
		if (!entry) {
			return null;
		}
		const raw = readTooltipNumericValue(entry);
		if (raw === null) {
			return null;
		}
		const labelFormatter = params.formatLabelAction ?? formatTooltipDate;
		const resolvedLabel = resolveTooltipDateLabel(props.label, entry.payload);
		return (
			<ChartTooltip
				active
				formatLabelAction={labelFormatter}
				label={resolvedLabel}
				singleValue={{
					formattedValue: params.formatValue
						? params.formatValue(raw)
						: formatNumber(raw),
					label: params.valueSuffixLabel,
					value: raw,
				}}
			/>
		);
	};
}

const ZERO_MARGIN = { top: 0, right: 0, left: 0, bottom: 0 } as const;

interface ChartSingleSeriesProps {
	color?: string;
	curveType?: ChartCurveType;
	data: any[];
	dataKey?: string;
	fallbackClassName?: string;
	height: number;
	id: string;
	/** Recharts margin; defaults to `Chart.zeroMargin`. */
	margin?: { bottom?: number; left?: number; right?: number; top?: number };
	partialLastSegment?: boolean;
	seriesKind?: ChartSeriesKind;
	tooltip?: RechartsSingleValueTooltipParams | false;
	/** Passed to `YAxis` `domain` (e.g. mini charts use `dataMin - 5` / `dataMax + 5`). */
	yDomain?: [number | string, number | string];
}

function ChartSingleSeries({
	data,
	dataKey = "value",
	seriesKind = "area",
	curveType = "monotone",
	partialLastSegment = false,
	height,
	id,
	color = "var(--color-chart-1)",
	tooltip,
	fallbackClassName,
	margin,
	yDomain = ["dataMin", "dataMax"],
}: ChartSingleSeriesProps) {
	const chartMargin = margin ?? ZERO_MARGIN;
	const isBar = seriesKind === "bar";

	const [DasharrayCalculator, lineDasharrays] = useDynamicDasharray({
		chartType: curveType,
		curveAdjustment: isStepCurve(curveType) ? 0 : 1,
		splitIndex: partialLastSegment ? data.length - 2 : data.length,
	});

	const strokeDash =
		lineDasharrays.find((l) => l.name === dataKey)?.strokeDasharray || "0 0";

	const tooltipContent = useMemo(() => {
		if (tooltip === false) {
			return undefined;
		}
		return createRechartsSingleValueTooltip(tooltip ?? {});
	}, [tooltip]);

	const gradientId = `gradient-${id}`;

	const gradientDefs = (
		<defs>
			<linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
				<stop offset="0%" stopColor={color} stopOpacity={0.4} />
				<stop offset="100%" stopColor={color} stopOpacity={0} />
			</linearGradient>
		</defs>
	);

	const tooltipEl = tooltipContent ? (
		<Tooltip
			content={tooltipContent}
			cursor={isBar ? chartTooltipCursorBar : chartTooltipCursorLine}
		/>
	) : null;

	const axes = (
		<>
			<XAxis dataKey="date" hide />
			<YAxis domain={yDomain} hide />
		</>
	);

	const chartBody = isBar ? (
		<BarChart data={data} margin={chartMargin}>
			{gradientDefs}
			{axes}
			<Bar
				dataKey={dataKey}
				fill={`url(#${gradientId})`}
				radius={[2, 2, 0, 0]}
			/>
			{tooltipEl}
		</BarChart>
	) : (
		<ComposedChart data={data} margin={chartMargin}>
			{seriesKind === "area" ? gradientDefs : null}
			{axes}
			{seriesKind === "line" ? (
				<Line
					dataKey={dataKey}
					dot={false}
					stroke={color}
					strokeDasharray={strokeDash}
					strokeWidth={1.5}
					type={curveType}
				/>
			) : (
				<Area
					activeDot={{
						r: 2.5,
						fill: color,
						stroke: "var(--color-background)",
						strokeWidth: 1.5,
					}}
					dataKey={dataKey}
					dot={false}
					fill={`url(#${gradientId})`}
					stroke={color}
					strokeDasharray={strokeDash}
					strokeWidth={1.5}
					type={curveType}
				/>
			)}
			<Customized component={DasharrayCalculator} />
			{tooltipEl}
		</ComposedChart>
	);

	return (
		<ChartErrorBoundary fallbackClassName={fallbackClassName}>
			<ResponsiveContainer height={height} width="100%">
				{chartBody}
			</ResponsiveContainer>
		</ChartErrorBoundary>
	);
}

const CARTESIAN_AREA_MARGIN = {
	top: 20,
	right: 20,
	left: 10,
	bottom: 20,
} as const;

interface ChartCartesianAreaProps {
	color?: string;
	data: Array<Record<string, string | number>>;
	dataKey: string;
	dateKey?: string;
	fallbackClassName?: string;
	/** Tooltip title line (formatted date/time). */
	formatTooltipLabel: (label: string) => string;
	height: number;
	id: string;
	margin?: { bottom?: number; left?: number; right?: number; top?: number };
	showGrid?: boolean;
	strokeWidth?: number;
	/** Legend row label in the tooltip (e.g. “Clicks”). */
	valueLabel: string;
	/** X tick labels (e.g. dayjs). */
	xTickFormatter: (value: string) => string;
}

/**
 * Single-series area chart with visible axes, optional horizontal grid, and
 * `Chart.Tooltip` multi-row layout—use instead of hand-rolling `AreaChart` +
 * `CartesianGrid` + `XAxis` + `YAxis` for standard dashboard line/area pages.
 */
function ChartCartesianArea({
	data,
	dataKey,
	dateKey = "date",
	height,
	id,
	color = "var(--color-chart-1)",
	xTickFormatter,
	formatTooltipLabel,
	valueLabel,
	margin = CARTESIAN_AREA_MARGIN,
	showGrid = true,
	strokeWidth = 2.5,
	fallbackClassName,
}: ChartCartesianAreaProps) {
	const gradientId = `cartesian-area-${id}`;
	const metricRow: MetricConfig & { color: string } = {
		color,
		key: dataKey,
		label: valueLabel,
	};

	return (
		<ChartErrorBoundary fallbackClassName={fallbackClassName}>
			<ResponsiveContainer height={height} width="100%">
				<AreaChart data={data} margin={margin}>
					<defs>
						<linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
							<stop offset="0%" stopColor={color} stopOpacity={0.3} />
							<stop offset="100%" stopColor={color} stopOpacity={0.02} />
						</linearGradient>
					</defs>
					{showGrid ? <CartesianGrid {...chartCartesianGridDefault} /> : null}
					<XAxis
						axisLine={false}
						dataKey={dateKey}
						tick={chartAxisTickDefault}
						tickFormatter={(v) => xTickFormatter(String(v))}
						tickLine={false}
					/>
					<YAxis
						allowDecimals={false}
						axisLine={false}
						tick={chartAxisTickDefault}
						tickLine={false}
						width={chartAxisYWidthDefault}
					/>
					<Tooltip
						content={(props) => (
							<ChartTooltip
								active={props.active}
								entries={createTooltipEntries(
									props.payload as Array<{
										dataKey: string;
										value: number;
										color: string;
									}>,
									[metricRow]
								)}
								formatLabelAction={formatTooltipLabel}
								label={resolveTooltipDateLabel(
									props.label,
									firstTooltipPayloadRow(props.payload),
									dateKey
								)}
							/>
						)}
						cursor={chartTooltipCursorLine}
						wrapperStyle={{ outline: "none" }}
					/>
					<Area
						activeDot={{
							r: 4,
							fill: color,
							stroke: "var(--color-background)",
							strokeWidth: 2,
						}}
						dataKey={dataKey}
						dot={false}
						fill={`url(#${gradientId})`}
						stroke={color}
						strokeWidth={strokeWidth}
						type="monotone"
					/>
				</AreaChart>
			</ResponsiveContainer>
		</ChartErrorBoundary>
	);
}

export interface ChartMultiSeriesDataPoint {
	date: string;
	[key: string]: string | number | null | undefined;
}

interface ChartMultiSeriesProps {
	/** Grouped (default) or stacked bars; only applies when `seriesKind` is `bar`. */
	barLayout?: "grouped" | "stacked";
	/** `stackId` for stacked bars (default `"stack"`). */
	barStackId?: string;
	curveType?: ChartCurveType;
	data: ChartMultiSeriesDataPoint[];
	height: number;
	/** When false (default), shows date ticks on the X axis. Mini charts often hide this. */
	hideXAxis?: boolean;
	metrics: Array<MetricConfig & { color: string }>;
	partialLastSegment?: boolean;
	seriesKind?: ChartSeriesKind;
}

function ChartMultiSeries({
	data: points,
	metrics: series,
	height,
	seriesKind = "area",
	curveType = "monotone",
	partialLastSegment = false,
	hideXAxis = false,
	barLayout = "grouped",
	barStackId = "stack",
}: ChartMultiSeriesProps) {
	const seriesUsesDashSplit = seriesKind !== "bar";

	const [DasharrayCalculator, lineDasharrays] = useDynamicDasharray({
		chartType: curveType,
		curveAdjustment: isStepCurve(curveType) ? 0 : 1,
		splitIndex:
			seriesUsesDashSplit && partialLastSegment
				? points.length - 2
				: points.length,
	});

	const hasVariation =
		points.length > 1 &&
		series.some((m) => {
			const values = points
				.map((d) => d[m.key])
				.filter((v): v is number => v != null);
			const first = values[0];
			return (
				values.length > 1 &&
				first !== undefined &&
				values.some((v) => v !== first)
			);
		});

	const sharedAxes = (
		<>
			<XAxis
				axisLine={false}
				dataKey="date"
				hide={hideXAxis}
				tick={hideXAxis ? false : chartAxisTickDefault}
				tickLine={false}
			/>
			<YAxis domain={["dataMin", "dataMax"]} hide />
			<Tooltip
				content={(props) => (
					<ChartTooltip
						active={props.active}
						entries={createTooltipEntries(
							props.payload as Array<{
								dataKey: string;
								value: number;
								color: string;
							}>,
							series
						)}
						formatLabelAction={formatTooltipDate}
						label={resolveTooltipDateLabel(
							props.label,
							firstTooltipPayloadRow(props.payload)
						)}
					/>
				)}
				cursor={
					seriesKind === "bar" ? chartTooltipCursorBar : chartTooltipCursorLine
				}
			/>
		</>
	);

	if (!hasVariation) {
		return (
			<div className="flex items-center px-4" style={{ height }}>
				<div className="h-px w-full bg-chart-1/30" />
			</div>
		);
	}

	return (
		<ChartViewport height={height}>
			{seriesKind === "bar" ? (
				<BarChart data={points} margin={ZERO_MARGIN}>
					{sharedAxes}
					{series.map((metric) => (
						<Bar
							dataKey={metric.key}
							fill={metric.color}
							key={metric.key}
							name={metric.label}
							radius={[2, 2, 0, 0]}
							stackId={barLayout === "stacked" ? barStackId : undefined}
						/>
					))}
				</BarChart>
			) : (
				<ComposedChart data={points} margin={ZERO_MARGIN}>
					{seriesKind === "area" ? (
						<defs>
							{series.map((metric) => (
								<linearGradient
									id={`gradient-${metric.key}`}
									key={metric.key}
									x1="0"
									x2="0"
									y1="0"
									y2="1"
								>
									<stop
										offset="0%"
										stopColor={metric.color}
										stopOpacity={0.4}
									/>
									<stop
										offset="100%"
										stopColor={metric.color}
										stopOpacity={0}
									/>
								</linearGradient>
							))}
						</defs>
					) : null}
					{sharedAxes}
					{seriesKind === "line"
						? series.map((metric) => (
								<Line
									dataKey={metric.key}
									dot={false}
									key={metric.key}
									name={metric.label}
									stroke={metric.color}
									strokeDasharray={
										lineDasharrays.find((line) => line.name === metric.key)
											?.strokeDasharray || "0 0"
									}
									strokeWidth={1.5}
									type={curveType}
								/>
							))
						: series.map((metric) => (
								<Area
									activeDot={{
										r: 2.5,
										fill: metric.color,
										stroke: "var(--color-background)",
										strokeWidth: 1.5,
									}}
									dataKey={metric.key}
									dot={false}
									fill={`url(#gradient-${metric.key})`}
									key={metric.key}
									name={metric.label}
									stroke={metric.color}
									strokeDasharray={
										lineDasharrays.find((line) => line.name === metric.key)
											?.strokeDasharray || "0 0"
									}
									strokeWidth={1.5}
									type={curveType}
								/>
							))}
					{seriesUsesDashSplit ? (
						<Customized component={DasharrayCalculator} />
					) : null}
				</ComposedChart>
			)}
		</ChartViewport>
	);
}

interface ChartLegendProps {
	className?: string;
	metrics: Array<{ color: string; key: string; label: string }>;
}

function ChartLegend({ metrics, className }: ChartLegendProps) {
	return (
		<div className={cn(chartLegendPillRowClassName, className)}>
			{metrics.map((metric) => (
				<div className={chartLegendPillClassName} key={metric.key}>
					<div
						className={chartLegendPillDotClassName}
						style={{ backgroundColor: metric.color }}
					/>
					<span className={chartLegendPillLabelClassName}>{metric.label}</span>
				</div>
			))}
		</div>
	);
}

interface ChartRootProps {
	children: ReactNode;
	className?: string;
	id?: string;
}

function ChartRoot({ children, className, id }: ChartRootProps) {
	return (
		<div
			className={cn(chartSurfaceClassName, className)}
			data-slot="chart"
			id={id}
		>
			{children}
		</div>
	);
}

interface ChartHeaderProps {
	children?: ReactNode;
	className?: string;
	description?: ReactNode;
	descriptionClassName?: string;
	title?: string;
	titleClassName?: string;
}

function ChartHeader({
	title,
	description,
	children,
	className,
	titleClassName,
	descriptionClassName,
}: ChartHeaderProps) {
	return (
		<div
			className={cn(
				"flex items-start justify-between gap-3 border-b px-4 py-3",
				className
			)}
			data-slot="chart-header"
		>
			<div className="min-w-0 flex-1">
				{title ? (
					<h3
						className={cn(
							"text-balance font-medium text-foreground text-sm",
							titleClassName
						)}
					>
						{title}
					</h3>
				) : null}
				{description ? (
					<div
						className={cn(
							"mt-0.5 text-pretty text-muted-foreground text-xs",
							descriptionClassName
						)}
					>
						{description}
					</div>
				) : null}
			</div>
			{children}
		</div>
	);
}

interface ChartPlotProps {
	children: ReactNode;
	className?: string;
}

/** Chart drawing region (e.g. dotted background + ResponsiveContainer). */
function ChartPlot({ children, className }: ChartPlotProps) {
	return (
		<div
			className={cn(chartPlotRegionClassName, className)}
			data-slot="chart-plot"
		>
			{children}
		</div>
	);
}

interface ChartViewportProps {
	children: ReactElement;
	className?: string;
	height: number;
}

/**
 * Fixed-height wrapper + `ResponsiveContainer` so Recharts fills the plot region
 * consistently with `Chart.Plot`.
 */
function ChartViewport({ children, className, height }: ChartViewportProps) {
	return (
		<div
			className={cn("min-h-0 w-full", className)}
			data-slot="chart-viewport"
			style={{ height }}
		>
			<ResponsiveContainer height="100%" width="100%">
				{children}
			</ResponsiveContainer>
		</div>
	);
}

interface ChartFooterProps {
	children: ReactNode;
	className?: string;
}

function ChartFooter({ children, className }: ChartFooterProps) {
	return (
		<div
			className={cn(
				"flex items-center gap-2.5 border-t px-2.5 py-2.5",
				className
			)}
			data-slot="chart-footer"
		>
			{children}
		</div>
	);
}

interface ChartContentBaseProps<T> {
	children: (data: T) => ReactNode;
	empty?: ReactNode;
	emptyProps?: EmptyStateProps;
	error?: ReactNode;
	errorProps?: EmptyStateProps;
	gatePending?: boolean;
	isEmpty?: (data: T) => boolean;
	loading?: ReactNode;
	outcome?: ChartQueryOutcome<T>;
	query?: ChartQuerySlice<T>;
	stateWrapperClassName?: string;
}

type ChartContentProps<T> =
	| (ChartContentBaseProps<T> & {
			gatePending?: never;
			outcome: ChartQueryOutcome<T>;
			query?: never;
	  })
	| (ChartContentBaseProps<T> & {
			gatePending?: boolean;
			outcome?: never;
			query: ChartQuerySlice<T>;
	  });

function ChartDefaultLoading({ height = 140 }: { height?: number }) {
	return (
		<>
			<ChartPlot>
				<div className="pt-2">
					<Skeleton
						className="w-full rounded-none"
						style={{ height: height + 8 }}
					/>
				</div>
			</ChartPlot>
			<ChartFooter>
				<div className="min-w-0 flex-1 space-y-1">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-3 w-32" />
				</div>
				<div className="flex gap-1.5">
					<Skeleton className="h-5 w-12 rounded-full" />
					<Skeleton className="h-5 w-12 rounded-full" />
				</div>
			</ChartFooter>
		</>
	);
}

function ChartContent<T>({
	children,
	empty,
	emptyProps,
	error,
	errorProps,
	gatePending,
	loading,
	outcome: outcomeProp,
	query,
	stateWrapperClassName,
	isEmpty: isEmptyProp,
}: ChartContentProps<T>) {
	const outcome =
		outcomeProp ??
		(query
			? chartQueryOutcomeFromQuery(query, {
					gatePending,
					isEmpty: isEmptyProp,
				})
			: undefined);
	if (!outcome) {
		throw new Error("Chart.Content requires `query` or `outcome`");
	}

	const stateShell = (node: ReactNode) => (
		<div
			className={cn(
				"flex min-h-[120px] flex-1 items-center justify-center py-8",
				stateWrapperClassName
			)}
		>
			{node}
		</div>
	);

	if (outcome.status === "loading") {
		return loading ?? <ChartDefaultLoading />;
	}
	if (outcome.status === "error") {
		if (error !== undefined) {
			return error;
		}
		if (errorProps) {
			return stateShell(
				<EmptyState {...errorProps} variant={errorProps.variant ?? "error"} />
			);
		}
		return null;
	}
	if (outcome.status === "empty") {
		if (empty !== undefined) {
			return empty;
		}
		if (emptyProps) {
			return stateShell(
				<EmptyState {...emptyProps} variant={emptyProps.variant ?? "minimal"} />
			);
		}
		return null;
	}
	return children(outcome.data);
}

ChartRoot.displayName = "Chart";

/**
 * Recharts primitives for custom charts. Prefer `Chart.SingleSeries` / `Chart.MultiSeries`
 * when the use case matches; use these for pie, brush, reference lines, dual axes, etc.
 * `Legend` here is Recharts’ legend; `Chart.Legend` is the dashboard metric pills.
 */
const chartRecharts = {
	Area,
	AreaChart,
	Bar,
	BarChart,
	Brush,
	CartesianGrid,
	Cell,
	ComposedChart,
	Customized,
	Legend: RechartsLegendPrimitive,
	Line,
	LineChart,
	Pie,
	PieChart,
	ReferenceArea,
	ReferenceLine,
	ResponsiveContainer,
	Sector,
	Tooltip,
	XAxis,
	YAxis,
} as const;

const chartMembers = {
	CartesianArea: ChartCartesianArea,
	Content: ChartContent,
	DefaultLoading: ChartDefaultLoading,
	Footer: ChartFooter,
	Header: ChartHeader,
	Legend: ChartLegend,
	MultiSeries: ChartMultiSeries,
	Plot: ChartPlot,
	Recharts: chartRecharts,
	SingleSeries: ChartSingleSeries,
	Tooltip: ChartTooltip,
	Viewport: ChartViewport,
	createRechartsSingleValueTooltip,
	createTooltipEntries,
	formatTooltipDate,
	isStepCurve,
	tooltipCursorBar: chartTooltipCursorBar,
	tooltipCursorLine: chartTooltipCursorLine,
	presentation: {
		axisTick: chartAxisTickDefault,
		axisYWidthCompact: chartAxisYWidthCompact,
		axisYWidthDefault: chartAxisYWidthDefault,
		cartesianGrid: chartCartesianGridDefault,
		legendInlineItemClassName: chartLegendInlineItemClassName,
		legendInlineRowClassName: chartLegendInlineRowClassName,
		legendPillClassName: chartLegendPillClassName,
		legendPillDotClassName: chartLegendPillDotClassName,
		legendPillLabelClassName: chartLegendPillLabelClassName,
		legendPillRowClassName: chartLegendPillRowClassName,
		plotRegionClassName: chartPlotRegionClassName,
		rechartsInteractiveLegendLabelClassName:
			chartRechartsInteractiveLegendLabelClassName,
		rechartsLegendIconSize: chartRechartsLegendIconSize,
		rechartsLegendInteractiveWrapperStyle:
			chartRechartsLegendInteractiveWrapperStyle,
		rechartsLegendStaticLabelClassName: chartRechartsLegendStaticLabelClassName,
		rechartsLegendStaticWrapperMerge:
			chartRechartsLegendStaticWrapperStyleMerge,
		rechartsLegendStaticWrapperStyle: chartRechartsLegendStaticWrapperStyle,
		seriesPalette: chartSeriesPalette,
		seriesColorAtIndex: chartSeriesColorAtIndex,
		surfaceBorderlessClassName: chartSurfaceBorderlessClassName,
		surfaceClassName: chartSurfaceClassName,
		tooltipCustomSurface: chartTooltipCustomSurfaceClassName,
		tooltipHeaderRowClassName: chartTooltipHeaderRowClassName,
		tooltipMultiShellClassName: chartTooltipMultiShellClassName,
		tooltipSingleShellClassName: chartTooltipSingleShellClassName,
	},
	zeroMargin: ZERO_MARGIN,
} as const;

export const Chart: typeof ChartRoot & typeof chartMembers = Object.assign(
	ChartRoot,
	chartMembers
);
