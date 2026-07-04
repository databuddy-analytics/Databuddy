import type { EChartsOption, SeriesOption } from "echarts";
import type { ChartTheme } from "./themes";

const MAX_SERIES = 5;
const MAX_DISTRIBUTION_SLICES = 5;

export interface ChartComponentPayload {
	rows?: (string | number)[][];
	series?: string[];
	title?: string;
	type: string;
}

export interface ChartFrame {
	height: number;
	subtitle?: string;
	width: number;
}

export function buildChartOption(
	component: ChartComponentPayload,
	theme: ChartTheme,
	frame: ChartFrame
): EChartsOption | null {
	switch (component.type) {
		case "line-chart":
		case "area-chart":
		case "bar-chart":
		case "stacked-bar-chart":
			return buildTimeSeriesOption(component, theme, frame);
		case "pie-chart":
		case "donut-chart":
			return buildDistributionOption(component, theme, frame);
		default:
			return null;
	}
}

function buildTimeSeriesOption(
	component: ChartComponentPayload,
	theme: ChartTheme,
	frame: ChartFrame
): EChartsOption | null {
	const rows = component.rows ?? [];
	const seriesNames = (component.series ?? []).slice(0, MAX_SERIES);
	if (rows.length === 0 || seriesNames.length === 0) {
		return null;
	}

	const labels = rows.map((row) => formatPeriodLabel(row[0]));
	const series = seriesNames.map((name, seriesIndex) =>
		buildCartesianSeries({
			color: theme.palette[seriesIndex % theme.palette.length] as string,
			data: rows.map((row) => toFiniteNumber(row[seriesIndex + 1])),
			name,
			stackTop: seriesIndex === seriesNames.length - 1,
			type: component.type,
		})
	);

	return {
		...baseOption(component, theme, frame),
		legend:
			seriesNames.length > 1 ? legendOption(theme, frame.width) : undefined,
		grid: { left: 64, right: 48, top: 130, bottom: 56 },
		xAxis: {
			type: "category",
			data: labels,
			boundaryGap: component.type !== "line-chart",
			axisLine: { lineStyle: { color: theme.border } },
			axisTick: { show: false },
			axisLabel: {
				color: theme.muted,
				fontSize: 13,
				interval: Math.max(0, Math.ceil(labels.length / 8) - 1),
			},
		},
		yAxis: {
			type: "value",
			splitLine: { lineStyle: { color: theme.border, type: "dashed" } },
			axisLabel: { color: theme.muted, fontSize: 13 },
		},
		series,
	};
}

function buildCartesianSeries({
	color,
	data,
	name,
	stackTop,
	type,
}: {
	color: string;
	data: (number | null)[];
	name: string;
	stackTop: boolean;
	type: string;
}): SeriesOption {
	if (type === "bar-chart" || type === "stacked-bar-chart") {
		const stacked = type === "stacked-bar-chart";
		const rounded = !stacked || stackTop;
		return {
			name,
			type: "bar",
			data,
			itemStyle: {
				color,
				...(rounded ? { borderRadius: [4, 4, 0, 0] } : {}),
			},
			...(stacked ? { stack: "total" } : {}),
		};
	}

	return {
		name,
		type: "line",
		data,
		connectNulls: true,
		smooth: 0.2,
		showSymbol: false,
		lineStyle: { color, width: 2.5 },
		itemStyle: { color },
		...(type === "area-chart"
			? {
					areaStyle: {
						color: {
							type: "linear",
							x: 0,
							y: 0,
							x2: 0,
							y2: 1,
							colorStops: [
								{ offset: 0, color: hexToRgba(color, 0.18) },
								{ offset: 1, color: hexToRgba(color, 0) },
							],
						},
					},
				}
			: {}),
	};
}

function buildDistributionOption(
	component: ChartComponentPayload,
	theme: ChartTheme,
	frame: ChartFrame
): EChartsOption | null {
	const rows = (component.rows ?? []).filter(
		(row) => row.length >= 2 && toFiniteNumber(row[1]) !== null
	);
	if (rows.length === 0) {
		return null;
	}

	const top = rows.slice(0, MAX_DISTRIBUTION_SLICES);
	const rest = rows.slice(MAX_DISTRIBUTION_SLICES);
	const restTotal = rest.reduce(
		(sum, row) => sum + (toFiniteNumber(row[1]) ?? 0),
		0
	);
	const data = top.map((row, index) => ({
		name: String(row[0]),
		value: toFiniteNumber(row[1]) ?? 0,
		itemStyle: { color: theme.palette[index % theme.palette.length] },
	}));
	if (restTotal > 0) {
		data.push({
			name: "Other",
			value: restTotal,
			itemStyle: { color: theme.muted },
		});
	}

	return {
		...baseOption(component, theme, frame),
		legend: {
			orient: "vertical",
			right: 48,
			top: "middle",
			textStyle: { color: theme.muted, fontSize: 14 },
			icon: "circle",
			itemWidth: 10,
			itemHeight: 10,
		},
		series: [
			{
				type: "pie",
				radius:
					component.type === "donut-chart" ? ["48%", "72%"] : ["0%", "72%"],
				center: ["38%", "56%"],
				data,
				label: {
					color: theme.foreground,
					fontSize: 13,
					formatter: "{b}  {d}%",
				},
				labelLine: { lineStyle: { color: theme.border } },
				itemStyle: {
					borderColor: theme.background,
					borderWidth: 2,
				},
			},
		],
	};
}

function baseOption(
	component: ChartComponentPayload,
	theme: ChartTheme,
	frame: ChartFrame
): EChartsOption {
	return {
		backgroundColor: "transparent",
		animation: false,
		textStyle: { fontFamily: "LT Superior" },
		graphic: [
			{
				type: "rect",
				left: 0,
				top: 0,
				z: -100,
				silent: true,
				shape: { width: frame.width, height: frame.height, r: 24 },
				style: { fill: theme.background, stroke: theme.border, lineWidth: 2 },
			},
		],
		title: {
			text: component.title ?? "Databuddy",
			subtext: frame.subtitle,
			left: 40,
			top: 32,
			textStyle: { color: theme.foreground, fontSize: 28, fontWeight: 600 },
			subtextStyle: { color: theme.muted, fontSize: 16 },
		},
	};
}

function legendOption(theme: ChartTheme, width: number) {
	return {
		right: 48,
		top: 44,
		textStyle: { color: theme.muted, fontSize: 14 },
		icon: "roundRect",
		itemWidth: 14,
		itemHeight: 6,
		width: width - 400,
	};
}

function formatPeriodLabel(value: unknown): string {
	const raw = String(value ?? "");
	const date = new Date(`${raw}T00:00:00Z`);
	if (raw.length === 10 && !Number.isNaN(date.getTime())) {
		return date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			timeZone: "UTC",
		});
	}
	return raw;
}

function toFiniteNumber(value: unknown): number | null {
	const parsed = typeof value === "string" ? Number(value) : value;
	return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

function hexToRgba(hex: string, alpha: number): string {
	const value = hex.replace("#", "");
	const red = Number.parseInt(value.slice(0, 2), 16);
	const green = Number.parseInt(value.slice(2, 4), 16);
	const blue = Number.parseInt(value.slice(4, 6), 16);
	return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
